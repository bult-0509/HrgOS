import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { randomBytes, createHash } from 'node:crypto';
import { registerLiveRoutes } from './liveRoutes.mjs';
import { registerLiveClock } from './liveClock.mjs';
import { createAccounts, readSession, secureEqual, signSession, verifyPassword } from './auth.mjs';
import { advanceClock, allowedScore, executeCommand, exportBackup, restoreBackup, seedState, stateView, visibleMedia, visibleMessages } from './rules.mjs';

export async function createTestServer({ store, testKey, gameAdminKey, liveAccounts, enabled = false, origins = ['http://127.0.0.1:3000', 'http://localhost:3000'] }) {
  if (enabled && (!testKey || testKey.length < 32)) throw new Error('TEST_API_KEY 至少需要 32 个字符');
  const app = Fastify({ logger: false, bodyLimit: 12 * 1024 * 1024 });
  await app.register(cors, { origin: origins, methods: ['GET', 'POST', 'DELETE'], allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'] });
  await app.register(websocket);
  const connections = new Set();
  app.addHook('preClose', async () => { for (const connection of connections) connection.socket.close(); });
  app.addHook('onSend', async (_request, reply) => { reply.header('Cache-Control', 'no-store'); reply.header('X-Content-Type-Options', 'nosniff'); });
  app.setErrorHandler((error, _request, reply) => reply.code(error.statusCode ?? 500).send({ code: error.code ?? 'ERROR', message: error.statusCode ? error.message : '后端处理失败' }));
  app.get('/api/health', async () => ({ status: 'ok', database: await store.health(), environment: 'hrg-game-api', testApiEnabled: enabled, liveApiEnabled: !!gameAdminKey }));
  const bearer = request => String(request.headers.authorization ?? '').replace(/^Bearer /, '');
  const control = request => {
    if (!enabled) throw Object.assign(new Error('测试接口未启用'), { statusCode: 404 });
    if (!secureEqual(bearer(request), testKey)) throw Object.assign(new Error('需要测试访问密钥'), { statusCode: 401 });
  };
  const session = async request => {
    if (!enabled) throw Object.assign(new Error('测试接口未启用'), { statusCode: 404 });
    const parsed = readSession(bearer(request), request.params.runId, testKey);
    const state = parsed ? await store.read(request.params.runId) : null;
    const account = state?.accounts.find(candidate => candidate.id === parsed.accountId);
    if (!account) throw Object.assign(new Error('需要有效测试会话'), { statusCode: 401 });
    return { account, state };
  };
  app.post('/api/testing/runs', async (request, reply) => {
    control(request); const teamCount = request.body?.teamCount ?? 2;
    if (!Number.isSafeInteger(teamCount) || teamCount < 2 || teamCount > 5) throw Object.assign(new Error('测试队伍数量应为 2–5'), { statusCode: 400 });
    const { accounts, credentials } = createAccounts(teamCount); const state = seedState(accounts);
    const abilityAnswer = `testonly-${randomBytes(20).toString('hex')}`;
    state.abilityTestHash = createHash('sha256').update(abilityAnswer.replace(/[^a-z0-9]/g, '')).digest('hex');
    if (teamCount > 2) state.teams = Array.from({ length: teamCount }, (_, i) => ({ id: `team-${i + 1}`, name: `测试${i + 1}队`, regionId: null, regionVersion: 0, finishedAt: null }));
    const id = await store.create(state);
    return reply.code(201).send({ id, credentials, abilityAnswer });
  });
  const attempts = new Map();
  app.post('/api/testing/runs/:runId/login', async request => {
    if (!enabled) throw Object.assign(new Error('测试接口未启用'), { statusCode: 404 });
    const source = `${request.ip}:${request.params.runId}`;
    const previous = attempts.get(source);
    if (previous?.blockedUntil > Date.now()) throw Object.assign(new Error('登录暂时受限'), { statusCode: 429 });
    if (attempts.size > 10000) attempts.clear();
    const state = await store.read(request.params.runId);
    const { username, password, role } = request.body ?? {};
    const account = state?.accounts.find(candidate => candidate.username === username && candidate.role === role);
    if (!verifyPassword(account, password)) {
      const count = (previous?.count ?? 0) + 1;
      attempts.set(source, { count, blockedUntil: count >= 5 ? Date.now() + 300000 : 0 });
      throw Object.assign(new Error('请等待游戏开始'), { statusCode: 401 });
    }
    attempts.delete(source);
    return { token: signSession(request.params.runId, account.id, testKey), role: account.role, teamId: account.teamId, leader: account.leader ?? false, accountId: account.id };
  });
  app.get('/api/testing/runs/:runId/state', async request => {
    const { account } = await session(request);
    return store.update(request.params.runId, state => stateView(state, account));
  });
  const broadcast = async runId => {
    const targets = [...connections].filter(connection => connection.runId === runId && connection.socket.readyState === 1);
    if (!targets.length) return;
    const payloads = await store.update(runId, state => targets.map(connection => ({ type: 'state', state: stateView(state, connection.account), sequence: state.sequence, messages: visibleMessages(state, connection.account) })));
    targets.forEach((connection, index) => { if (connection.socket.readyState === 1) connection.socket.send(JSON.stringify(payloads[index])); });
  };
  app.post('/api/testing/runs/:runId/commands', async request => {
    const { account } = await session(request);
    const response = await store.update(request.params.runId, state => executeCommand(state, account, request.body, request.headers['idempotency-key']));
    await broadcast(request.params.runId); return response;
  });
  app.post('/api/testing/runs/:runId/clock', async request => {
    control(request); const response = await store.update(request.params.runId, state => advanceClock(state, request.body?.milliseconds));
    await broadcast(request.params.runId); return response;
  });
  app.get('/api/testing/runs/:runId/scores/:teamId', async request => {
    const { account, state } = await session(request); return allowedScore(state, account, request.params.teamId);
  });
  app.get('/api/testing/runs/:runId/messages', async request => {
    const { account, state } = await session(request); return { messages: visibleMessages(state, account, Number(request.query.after) || 0).map(item => ({ ...item, played: state.messages.find(original => original.id === item.id)?.playedBy.includes(String(request.query.deviceId)) ?? false })) };
  });
  app.get('/api/testing/runs/:runId/media/:mediaId', async (request, reply) => {
    const { account, state } = await session(request); const media = visibleMedia(state, account, request.params.mediaId);
    reply.type(request.query.thumbnail === '1' ? 'image/webp' : media.mime); reply.header('X-Original-SHA256', media.sha256);
    return Buffer.from(request.query.thumbnail === '1' ? media.thumbnail : media.base64, 'base64');
  });
  app.get('/api/testing/runs/:runId/backup', async request => { control(request); const state = await store.read(request.params.runId); if (!state) throw Object.assign(new Error('测试赛局不存在'), { statusCode: 404 }); return exportBackup(state); });
  app.post('/api/testing/restore', async request => { control(request); const state = restoreBackup(request.body); const id = await store.create(state); return { id }; });
  app.get('/api/testing/runs/:runId/ws', { websocket: true }, (socket, request) => {
    request.headers.authorization = `Bearer ${String(request.headers['sec-websocket-protocol'] ?? '').split(',').map(value => value.trim())[1] ?? ''}`;
    // 立即安装消息/关闭监听，避免异步鉴权期间丢失事件。
    let connection;
    socket.on('error', () => {});
    socket.on('close', () => { if (connection) connections.delete(connection); });
    socket.on('message', () => { if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'notice', message: '写操作使用已鉴权 HTTPS commands 接口；此连接接收状态更新。' })); });
    session(request).then(async ({ account }) => {
      if (socket.readyState !== 1) return;
      connection = { socket, runId: request.params.runId, account }; connections.add(connection);
      const payload = await store.update(request.params.runId, state => ({ type: 'ready', state: stateView(state, account), sequence: state.sequence }));
      if (socket.readyState === 1) socket.send(JSON.stringify(payload));
    }).catch(() => socket.close(1008, 'AUTH_REQUIRED'));
  });
  app.delete('/api/testing/runs/:runId', async request => { control(request); await store.remove(request.params.runId); return { removed: true }; });
  await registerLiveRoutes(app, store, gameAdminKey, liveAccounts);
  if (gameAdminKey) registerLiveClock(app, store);
  return app;
}
