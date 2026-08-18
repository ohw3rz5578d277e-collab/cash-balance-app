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

function mergeAppendOnlyItems(serverItems, incomingItems) {
  const out = [];
  const index = new Map();

  for (const item of Array.isArray(serverItems) ? serverItems : []) {
    const key = itemKey(item);
    if (!key || index.has(key)) continue;
    index.set(key, out.length);
    out.push(item);
  }

  for (const item of Array.isArray(incomingItems) ? incomingItems : []) {
    const key = itemKey(item);
    if (!key) continue;
    if (index.has(key)) {
      out[index.get(key)] = item;
    } else {
      index.set(key, out.length);
      out.push(item);
    }
  }

  return out;
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
      const limit = Math.min(
        Math.max(Number(url.searchParams.get("limit") || 500), 1),
        1000
      );

      const result = await env.DB.prepare(
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

      const existing = await env.DB.prepare(
        `SELECT created_at, updated_at, payload
         FROM cash_records
         WHERE id = ?`
      ).bind(id).first();

      const existingPayload = existing
        ? safeParsePayload(existing.payload)
        : {};
      const staleClient = isOlderClientRecord(record, existing);

      const createdAt =
        text(record.createdAt || record.created_at || existing?.created_at) ||
        nowIso();

      const updatedAt = nowIso();

      let savedRecord;
      let staleMerge = false;

      if (staleClient) {
        staleMerge = true;
        savedRecord = {
          ...existingPayload,
          id,
          date: text(existingPayload.date || workDate) || workDate,
          createdAt: text(existingPayload.createdAt || existingPayload.created_at || existing?.created_at) || createdAt,
          updatedAt,
          posItems: mergeAppendOnlyItems(existingPayload.posItems, record.posItems),
          gasItems: mergeAppendOnlyItems(existingPayload.gasItems, record.gasItems)
        };
      } else {
        savedRecord = {
          ...record,
          id,
          date: workDate,
          createdAt,
          updatedAt
        };
      }

      const savedWorkDate = text(savedRecord.date || workDate) || workDate;

      await env.DB.prepare(
        `INSERT INTO cash_records (id, work_date, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           work_date = excluded.work_date,
           payload = excluded.payload,
           updated_at = excluded.updated_at`
      ).bind(
        id,
        savedWorkDate,
        JSON.stringify(savedRecord),
        createdAt,
        updatedAt
      ).run();

      return json({
        ok: true,
        record: savedRecord,
        staleMerge,
        protection: staleMerge
          ? "stale_client_preserved_server_and_merged_items"
          : "normal_save"
      });
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
