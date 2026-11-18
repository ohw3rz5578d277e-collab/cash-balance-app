const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-App-Pin, Authorization"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store"
    }
  });
}

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function getPin(request) {
  const url = new URL(request.url);
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";

  return (
    text(request.headers.get("x-app-pin")) ||
    text(url.searchParams.get("pin")) ||
    bearer
  );
}

function safeParsePayload(payload) {
  try {
    return JSON.parse(payload || "{}");
  } catch (_) {
    return {};
  }
}

function itemKey(item) {
  if (!item || typeof item !== "object") return "";
  if (text(item.id)) return `id:${text(item.id)}`;
  return [
    "legacy",
    item.sale ?? "",
    item.paid ?? "",
    item.change ?? "",
    item.tip ?? "",
    item.cost ?? "",
    item.memo ?? "",
    item.time ?? "",
    item.createdAt ?? ""
  ].join("|");
}

function mergeConcurrentItems(serverItems, incomingItems, clientUpdatedAt, preserveServerMatches) {
  const server = Array.isArray(serverItems) ? serverItems : [];
  const incoming = Array.isArray(incomingItems) ? incomingItems : [];
  const incomingByKey = new Map();
  const out = [];
  const clientTime = Date.parse(text(clientUpdatedAt));

  for (const item of incoming) {
    const key = itemKey(item);
    if (!key || incomingByKey.has(key)) continue;
    incomingByKey.set(key, item);
  }

  for (const serverItem of server) {
    const key = itemKey(serverItem);
    if (!key) continue;

    if (incomingByKey.has(key)) {
      out.push(preserveServerMatches ? serverItem : incomingByKey.get(key));
      incomingByKey.delete(key);
      continue;
    }

    const itemCreatedAt = Date.parse(text(serverItem.createdAt || serverItem.created_at));
    const definitelyNewerThanClient =
      Number.isFinite(clientTime) &&
      Number.isFinite(itemCreatedAt) &&
      itemCreatedAt > clientTime;

    const cannotProveClientHadItem =
      !Number.isFinite(clientTime) ||
      !Number.isFinite(itemCreatedAt);

    if (definitelyNewerThanClient || cannotProveClientHadItem) {
      out.push(serverItem);
    }
  }

  for (const item of incomingByKey.values()) {
    out.push(item);
  }

  return out;
}

// Attendance is shared by multiple devices. An omitted log is not proof of deletion.
// Only explicit tombstones may remove an existing punch.
function mergeAttendanceLogs(serverItems, incomingItems, deletedIds, keepServerOnConflict) {
  const deleted = new Set((deletedIds || []).map(text).filter(Boolean));
  const merged = new Map();
  for (const log of Array.isArray(serverItems) ? serverItems : []) {
    const key = itemKey(log);
    if (key && !deleted.has(text(log.id))) merged.set(key, log);
  }
  for (const log of Array.isArray(incomingItems) ? incomingItems : []) {
    const key = itemKey(log);
    if (!key || deleted.has(text(log.id))) continue;
    if (keepServerOnConflict && merged.has(key)) continue;
    merged.set(key, log);
  }
  return [...merged.values()];
}

function mergePosItems(serverItems, incomingItems, deletedKeys) {
  const deleted = new Set(deletedKeys);
  const merged = new Map();
  // POS items are immutable once registered. Only an explicit deletion removes one.
  for (const rows of [serverItems, incomingItems]) {
    for (const item of Array.isArray(rows) ? rows : []) {
      const key = itemKey(item);
      if (key && !deleted.has(key) && !merged.has(key)) merged.set(key, item);
    }
  }
  return [...merged.values()].sort((a, b) =>
    text(a.createdAt || a.created_at || a.time).localeCompare(text(b.createdAt || b.created_at || b.time)) ||
    itemKey(a).localeCompare(itemKey(b))
  );
}

function isOlderClientRecord(record, existing) {
  if (!existing) return false;
  const serverUpdatedAt = Date.parse(text(existing.updated_at));
  const clientUpdatedAt = Date.parse(text(record.updatedAt || record.updated_at));
  if (!Number.isFinite(serverUpdatedAt)) return false;
  if (!Number.isFinite(clientUpdatedAt)) return true;
  return clientUpdatedAt < serverUpdatedAt;
}

async function ensureAuthorized(request, env) {
  if (!env.DB) {
    return {
      ok: false,
      response: json({
        ok: false,
        error: "Cloudflare Pages の D1 Binding 'DB' が未設定です。"
      }, 500)
    };
  }

  if (!env.APP_PIN) {
    return {
      ok: false,
      response: json({
        ok: false,
        error: "Cloudflare Pages の環境変数 APP_PIN が未設定です。"
      }, 500)
    };
  }

  if (getPin(request) !== env.APP_PIN) {
    return {
      ok: false,
      response: json({
        ok: false,
        error: "PINが違います。"
      }, 401)
    };
  }

  return { ok: true };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const auth = await ensureAuthorized(request, env);
  if (!auth.ok) return auth.response;

  try {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const recordId = text(url.searchParams.get("id"));
      const startDate = text(url.searchParams.get("start")).slice(0, 10);
      const endDate = text(url.searchParams.get("end")).slice(0, 10);
      const limit = Math.min(
        Math.max(Number(url.searchParams.get("limit") || 100), 1),
        1000
      );
      const overlapStart = text(url.searchParams.get("bank_overlap_start")).slice(0, 10);
      const overlapEnd = text(url.searchParams.get("bank_overlap_end")).slice(0, 10);
      const excludeId = text(url.searchParams.get("exclude_id"));

      const result = overlapStart && overlapEnd
        ? await env.DB.prepare(
            `SELECT id, work_date, payload, created_at, updated_at
             FROM cash_records
             WHERE (? = '' OR id <> ?)
               AND json_extract(payload, '$.bankDepositPeriodStart') IS NOT NULL
               AND json_extract(payload, '$.bankDepositPeriodEnd') IS NOT NULL
               AND json_extract(payload, '$.bankDepositActual') IS NOT NULL
               AND json_extract(payload, '$.bankDepositPeriodStart') <= ?
               AND json_extract(payload, '$.bankDepositPeriodEnd') >= ?
             ORDER BY work_date DESC, updated_at DESC
             LIMIT 1`
          ).bind(excludeId, excludeId, overlapEnd, overlapStart).all()
        : recordId
        ? await env.DB.prepare(
            `SELECT id, work_date, payload, created_at, updated_at
             FROM cash_records
             WHERE id = ?
             LIMIT 1`
          ).bind(recordId).all()
        : startDate && endDate
        ? await env.DB.prepare(
            `SELECT id, work_date, payload, created_at, updated_at
             FROM cash_records
             WHERE work_date BETWEEN ? AND ?
             ORDER BY work_date DESC, updated_at DESC
             LIMIT ?`
          ).bind(startDate, endDate, limit).all()
        : await env.DB.prepare(
            `SELECT id, work_date, payload, created_at, updated_at
             FROM cash_records
             ORDER BY work_date DESC, updated_at DESC
             LIMIT ?`
          ).bind(limit).all();

      const records = (result.results || []).map((row) => {
        const payload = safeParsePayload(row.payload);
        return {
          ...payload,
          id: row.id,
          date: row.work_date,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      });

      return json({
        ok: true,
        records,
        count: records.length,
        serverTime: nowIso()
      });
    }

    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const record = body.record || body;

      const id =
        text(record.id) ||
        `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const workDate = text(record.date || record.work_date);

      if (!workDate) {
        return json({
          ok: false,
          error: "日付がありません。"
        }, 400);
      }

      const posOnly = body.posOnly === true;
      for (let attempt = 0; attempt < 5; attempt++) {
        const existing = await env.DB.prepare(
          `SELECT work_date, created_at, updated_at, payload
           FROM cash_records
           WHERE id = ?`
        ).bind(id).first();

        if (posOnly && (!existing || existing.work_date !== workDate)) {
          return json({ ok: false, error: "元の明細の記録が見つかりません。" }, 404);
        }
        const previous = existing ? safeParsePayload(existing.payload) : {};
        const staleMerge = !posOnly && isOlderClientRecord(record, existing);
        const updatedAt = nowIso();
        const createdAt = posOnly ? existing.created_at :
          text(record.createdAt || record.created_at || existing?.created_at) || updatedAt;
        const posDeletedKeys = [...new Set([
          ...(Array.isArray(previous.posDeletedKeys) ? previous.posDeletedKeys : []),
          ...(Array.isArray(record.posDeletedKeys) ? record.posDeletedKeys : [])
        ].map(text).filter(Boolean))].sort();
        const savedRecord = {
          ...(posOnly ? previous : staleMerge ? { ...previous, ...record } : record),
          id, date: workDate, createdAt, updatedAt, posDeletedKeys,
          posItems: mergePosItems(previous.posItems, record.posItems, posDeletedKeys)
        };

        if (!posOnly) {
          const attendanceDeletedIds = [...new Set([
            ...(Array.isArray(previous.attendanceDeletedIds) ? previous.attendanceDeletedIds : []),
            ...(Array.isArray(record.attendanceDeletedIds) ? record.attendanceDeletedIds : [])
          ].map(text).filter(Boolean))];
          savedRecord.attendanceDeletedIds = attendanceDeletedIds;
          savedRecord.attendanceLogs = mergeAttendanceLogs(
            previous.attendanceLogs, record.attendanceLogs, attendanceDeletedIds, staleMerge
          );
          if (staleMerge) {
            savedRecord.gasItems = mergeConcurrentItems(previous.gasItems, record.gasItems, record.updatedAt || record.updated_at);
          }
        }

        const payload = JSON.stringify(savedRecord);
        const written = existing
          ? await env.DB.prepare(
              `UPDATE cash_records SET work_date = ?, payload = ?, updated_at = ?
               WHERE id = ? AND work_date = ? AND updated_at = ? AND payload = ?`
            ).bind(workDate, payload, updatedAt, id, existing.work_date, existing.updated_at, existing.payload).run()
          : await env.DB.prepare(
              `INSERT INTO cash_records (id, work_date, payload, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`
            ).bind(id, workDate, payload, createdAt, updatedAt).run();
        if (!written.meta?.changes) continue;

        return json({
          ok: true, record: savedRecord, staleMerge,
          attendanceProtection: 'retained_existing_logs',
          posProtection: 'retained_existing_items',
          protection: staleMerge
            ? "stale_client_preserved_concurrent_items_and_honored_known_deletions"
            : "normal_save"
        });
      }

      return json({ ok: false, error: "別端末の保存と重なりました。もう一度お試しください。" }, 409);
    }

    if (request.method === "DELETE") {
      const url = new URL(request.url);
      const id = text(url.searchParams.get("id"));

      if (!id) {
        return json({
          ok: false,
          error: "削除するIDがありません。"
        }, 400);
      }

      await env.DB.prepare(
        `DELETE FROM cash_records WHERE id = ?`
      ).bind(id).run();

      return json({
        ok: true,
        deletedId: id
      });
    }

    return json({
      ok: false,
      error: "Method not allowed"
    }, 405);
  } catch (error) {
    return json({
      ok: false,
      error: error?.message || String(error),
      hint: "D1テーブル cash_records が作成済みか、Binding名が DB になっているか確認してください。"
    }, 500);
  }
}
