const MAX_BODY_BYTES = 10 * 1024 * 1024;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Content-Type': 'application/json; charset=utf-8'
};

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: corsHeaders
});

const isEncryptedPayload = value => (
  Boolean(value)
  && typeof value === 'object'
  && value.encrypted === true
  && value.algorithm === 'AES-GCM'
  && typeof value.salt === 'string'
  && typeof value.iv === 'string'
  && typeof value.ciphertext === 'string'
);

const createHistoryKey = prefix => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `${prefix}/history/${date}/${stamp}-${crypto.randomUUID()}.json`;
};

const putJson = (bucket, key, value) => bucket.put(key, JSON.stringify(value), {
  httpMetadata: { contentType: 'application/json; charset=utf-8' }
});

const handleBackup = async (body, env) => {
  if (body?.app !== 'DentalClinicManager' || !isEncryptedPayload(body?.encryptedPayload)) {
    return json({ ok: false, error: 'Invalid backup format' }, 400);
  }

  const historyKey = createHistoryKey('backup');
  await putJson(env.BACKUP_BUCKET, historyKey, body);
  await putJson(env.BACKUP_BUCKET, 'latest.json', body);
  return json({ ok: true, storedAt: new Date().toISOString(), historyKey });
};

const readInitialSyncPayload = async bucket => {
  const syncObject = await bucket.get('sync/latest.json');
  if (syncObject) {
    const payload = JSON.parse(await syncObject.text());
    return isEncryptedPayload(payload) ? payload : null;
  }

  // 兼容启用同步前由 /backup 写入的最新备份。
  const backupObject = await bucket.get('latest.json');
  if (!backupObject) return null;
  const backup = JSON.parse(await backupObject.text());
  return isEncryptedPayload(backup?.encryptedPayload) ? backup.encryptedPayload : null;
};

const handleSync = async (body, env) => {
  if (body?.app !== 'DentalClinicManager') {
    return json({ ok: false, error: 'Invalid sync format' }, 400);
  }

  if (body.action === 'pull') {
    const payload = await readInitialSyncPayload(env.BACKUP_BUCKET);
    if (!payload) return json({ ok: false, error: 'No cloud data' }, 404);
    return json({ ok: true, payload });
  }

  if (body.action === 'push') {
    if (!isEncryptedPayload(body.payload)) {
      return json({ ok: false, error: 'Invalid encrypted payload' }, 400);
    }
    const historyKey = createHistoryKey('sync');
    await putJson(env.BACKUP_BUCKET, historyKey, body.payload);
    await putJson(env.BACKUP_BUCKET, 'sync/latest.json', body.payload);
    return json({ ok: true, storedAt: new Date().toISOString(), historyKey });
  }

  return json({ ok: false, error: 'Unknown sync action' }, 400);
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true });
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed' }, 405);
    }

    if (request.headers.get('Authorization') !== `Bearer ${env.BACKUP_TOKEN}`) {
      return json({ ok: false, error: 'Unauthorized' }, 401);
    }

    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
        return json({ ok: false, error: 'Request too large' }, 413);
      }
      const body = JSON.parse(raw);
      if (url.pathname === '/backup') return await handleBackup(body, env);
      if (url.pathname === '/sync') return await handleSync(body, env);
      return json({ ok: false, error: 'Not found' }, 404);
    } catch (error) {
      const message = error instanceof SyntaxError ? 'Invalid JSON' : 'Storage operation failed';
      return json({ ok: false, error: message }, error instanceof SyntaxError ? 400 : 500);
    }
  }
};
