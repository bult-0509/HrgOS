import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createTestServer } from './app.mjs';

function fixtureStore() {
  const rows = new Map();
  return { driver: 'fixture', health: async () => 'fixture', create: async state => { const id = randomUUID(); rows.set(id, structuredClone(state)); return id; }, read: async id => rows.get(id) ?? null, gamesDueAbilityWave: async () => [] };
}
const key = 'fixture-proxy-admin-key-abcdefghijklmnopqrstuvwxyz';
const salt = 'fixture-salt';
const password = 'fixture-password';
const liveAccounts = ['first','second'].map((username, i) => ({ username, role: 'player', teamId: `team-${i+1}`, salt, passwordHash: createHash('sha256').update(`${salt}:${password}`).digest('hex') }));

test('formal and test login throttles isolate accounts sharing one IP', async () => {
  const app = await createTestServer({ store: fixtureStore(), gameAdminKey: key, testKey: key, liveAccounts, enabled: true });
  try {
    const formal = (await app.inject({ method: 'POST', url: '/api/games', headers: { authorization: `Bearer ${key}` }, payload: {} })).json();
    const training = (await app.inject({ method: 'POST', url: '/api/testing/runs', headers: { authorization: `Bearer ${key}` }, payload: { teamCount: 2 } })).json();
    for (const [url, first, second] of [[`/api/games/${formal.id}/login`, { username: 'first', role: 'player', password }, { username: 'second', role: 'player', password }], [`/api/testing/runs/${training.id}/login`, training.credentials.player, training.credentials.opponent]]) {
      for (let i=0; i<5; i++) assert.equal((await app.inject({ method: 'POST', url, payload: { ...first, password: 'wrong' } })).statusCode, 401);
      assert.equal((await app.inject({ method: 'POST', url, payload: first })).statusCode, 429);
      const valid = await app.inject({ method: 'POST', url, payload: second });
      assert.equal(valid.statusCode, 200, valid.body);
    }
  } finally { await app.close(); }
});

test('forwarded client IP is honored only from the configured immediate proxy', async () => {
  const previous = process.env.HRG_TRUSTED_PROXY_CIDRS;
  try {
    for (const [cidr, peer, expected] of [['', '127.0.0.1', '127.0.0.1'], ['127.0.0.1/32','10.0.0.8','10.0.0.8'], ['127.0.0.1/32','127.0.0.1','203.0.113.9']]) {
      process.env.HRG_TRUSTED_PROXY_CIDRS = cidr;
      const app = await createTestServer({ store: fixtureStore() });
      app.get('/fixture/ip', request => ({ ip: request.ip }));
      try { const response = await app.inject({ url: '/fixture/ip', remoteAddress: peer, headers: { 'x-forwarded-for': '203.0.113.9' } }); assert.equal(response.json().ip, expected); }
      finally { await app.close(); }
    }
  } finally { if (previous === undefined) delete process.env.HRG_TRUSTED_PROXY_CIDRS; else process.env.HRG_TRUSTED_PROXY_CIDRS = previous; }
});
