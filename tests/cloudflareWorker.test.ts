import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../cloudflare-worker.js';

const token = 'test-token';
const encryptedPayload = {
  encrypted: true,
  algorithm: 'AES-GCM',
  kdf: 'PBKDF2-SHA-256',
  iterations: 210000,
  salt: 'salt',
  iv: 'iv',
  ciphertext: 'ciphertext'
};

const createBucket = () => {
  const objects = new Map<string, string>();
  return {
    objects,
    async put(key: string, value: string) {
      objects.set(key, value);
    },
    async get(key: string) {
      const value = objects.get(key);
      return value === undefined ? null : { text: async () => value };
    }
  };
};

const post = (path: string, body: unknown, authorization = `Bearer ${token}`) => new Request(`https://backup.example.com${path}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: authorization
  },
  body: JSON.stringify(body)
});

test('Worker 拒绝没有正确 Token 的上传', async () => {
  const bucket = createBucket();
  const response = await worker.fetch(post('/backup', {}, 'Bearer wrong'), {
    BACKUP_TOKEN: token,
    BACKUP_BUCKET: bucket
  });

  assert.equal(response.status, 401);
  assert.equal(bucket.objects.size, 0);
});

test('普通备份可作为第一次云端同步的初始数据', async () => {
  const bucket = createBucket();
  const env = { BACKUP_TOKEN: token, BACKUP_BUCKET: bucket };
  const backupResponse = await worker.fetch(post('/backup', {
    app: 'DentalClinicManager',
    generatedAt: '2026-08-10T00:00:00.000Z',
    encryptedPayload
  }), env);

  assert.equal(backupResponse.status, 200);
  assert.ok(bucket.objects.has('latest.json'));

  const pullResponse = await worker.fetch(post('/sync', {
    app: 'DentalClinicManager',
    action: 'pull'
  }), env);
  const pullBody = await pullResponse.json() as { payload: typeof encryptedPayload };

  assert.equal(pullResponse.status, 200);
  assert.deepEqual(pullBody.payload, encryptedPayload);
});

test('同步上传写入独立 latest，并可原样拉取', async () => {
  const bucket = createBucket();
  const env = { BACKUP_TOKEN: token, BACKUP_BUCKET: bucket };
  const pushResponse = await worker.fetch(post('/sync', {
    app: 'DentalClinicManager',
    action: 'push',
    payload: encryptedPayload
  }), env);

  assert.equal(pushResponse.status, 200);
  assert.ok(bucket.objects.has('sync/latest.json'));

  const pullResponse = await worker.fetch(post('/sync', {
    app: 'DentalClinicManager',
    action: 'pull'
  }), env);
  const pullBody = await pullResponse.json() as { payload: typeof encryptedPayload };

  assert.equal(pullResponse.status, 200);
  assert.deepEqual(pullBody.payload, encryptedPayload);
});
