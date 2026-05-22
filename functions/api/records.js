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
        `SELECT created_at FROM cash_records WHERE id = ?`
      ).bind(id).first();

      const createdAt =
        text(record.createdAt || record.created_at || existing?.created_at) ||
        nowIso();

      const updatedAt = nowIso();

      const savedRecord = {
        ...record,
        id,
        date: workDate,
        createdAt,
        updatedAt
      };

      await env.DB.prepare(
        `INSERT INTO cash_records (id, work_date, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           work_date = excluded.work_date,
           payload = excluded.payload,
           updated_at = excluded.updated_at`
      ).bind(
        id,
        workDate,
        JSON.stringify(savedRecord),
        createdAt,
        updatedAt
      ).run();

      return json({
        ok: true,
        record: savedRecord
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
