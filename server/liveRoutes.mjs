import { loginAccounts } from '../src/data/loginAccounts.ts';
import { readSession, secureEqual, signSession, verifyPassword } from './auth.mjs';
import { allowedScore, executeCommand, exportBackup, seedState, stateView, visibleMedia, visibleMessages } from './rules.mjs';
import { officialScoring } from './scoring.mjs';

export async function registerLiveRoutes(app, store, adminKey, accountRoster = loginAccounts) {
  if (adminKey && adminKey.length < 32) throw new Error('GAME_ADMIN_KEY 至少需要 32 个字符');
  const enabled = !!adminKey;
  const bearer = request => String(request.headers.authorization ?? '').replace(/^Bearer /, '');
  const guard = () => { if (!enabled) throw Object.assign(new Error('正式比赛接口未配置'), { statusCode: 404 }); };
  const control = request => { guard(); if (!secureEqual(bearer(request), adminKey)) throw Object.assign(new Error('需要比赛管理密钥'), { statusCode: 401 }); };
  const session = async request => {
    guard(); const parsed = readSession(bearer(request), `game:${request.params.runId}`, adminKey);
    const state = parsed ? await store.read(request.params.runId, true) : null;
    const actor = state?.accounts.find(account => account.id === parsed.accountId);
    if (!actor) throw Object.assign(new Error('需要比赛会话'), { statusCode: 401 }); return { actor, state };
  };
  app.post('/api/games', async (request, reply) => {
    control(request); const leaders = new Set();
    const accounts = accountRoster.map(account => {
      const leader = !!account.teamId && !leaders.has(account.teamId); if (account.teamId) leaders.add(account.teamId);
      return { ...account, id: account.username, algorithm: 'sha256-salted', nickname: account.username, leader, manage: account.role === 'staff', review: account.role === 'staff', locations: account.username === 'hrg-staff-01' };
    });
    const state = seedState(accounts); state.virtualTime = null; state.cards = []; state.mode = 'live'; state.configured = false;
    const names = ['Phigros队', 'Arcaea队', '范式起源队', 'maimai队', '全能队'];
    state.teams = [...leaders].map((id, index) => ({ id, name: names[index] ?? id, regionId: null, regionVersion: 0, finishedAt: null }));
    // 正式赛局不能沿用自动化测试的任务和事件分值。
    state.config.tasks = []; state.config.boardRewards = []; state.config.eventTemplates = [];
    if (request.body?.preset !== 'custom') {
      state.config.tasks = structuredClone(officialScoring.tasks).map(task => ({ ...task, image: '/hrg-mark.svg' }));
      state.config.finishRewards = [...officialScoring.finishRewards]; state.config.taskLimit = officialScoring.taskLimit;
      state.config.scoringVersion = officialScoring.version; state.configured = true;
    }
    return reply.code(201).send({ id: await store.create(state, true), mode: 'live', configured: state.configured, scoringVersion: state.config.scoringVersion });
  });
  const attempts = new Map();
  app.post('/api/games/:runId/login', async request => {
    guard(); const source = JSON.stringify([request.ip, request.params.runId, String(request.body?.username ?? '').slice(0, 200)]); const attempt = attempts.get(source);
    if (attempt?.blockedUntil > Date.now()) throw Object.assign(new Error('登录暂时受限'), { statusCode: 429 });
    if (attempts.size > 10000) attempts.clear();
    const state = await store.read(request.params.runId, true); const { username, password, role } = request.body ?? {};
    const account = state?.accounts.find(account => account.username === username && account.role === role);
    if (!verifyPassword(account, password)) { const count = (attempt?.count ?? 0) + 1; attempts.set(source, { count, blockedUntil: count >= 5 ? Date.now() + 300000 : 0 }); throw Object.assign(new Error('请等待游戏开始'), { statusCode: 401 }); }
    attempts.delete(source); return { token: signSession(`game:${request.params.runId}`, account.id, adminKey, 12 * 3600000), role: account.role, teamId: account.teamId, leader: account.leader, accountId: account.id };
  });
  app.get('/api/games/:runId/state', async request => { const { actor } = await session(request); return store.update(request.params.runId, state => stateView(state, actor), true); });
  app.post('/api/games/:runId/commands', async request => { const { actor } = await session(request); return store.update(request.params.runId, state => executeCommand(state, actor, request.body, request.headers['idempotency-key']), true); });
  app.get('/api/games/:runId/messages', async request => { const { actor, state } = await session(request); return { messages: visibleMessages(state, actor) }; });
  app.get('/api/games/:runId/scores/:teamId', async request => { const { actor, state } = await session(request); return allowedScore(state, actor, request.params.teamId); });
  app.get('/api/games/:runId/media/:mediaId', async (request, reply) => { const { actor, state } = await session(request); const media = visibleMedia(state, actor, request.params.mediaId); reply.type(media.mime); reply.header('X-Original-SHA256', media.sha256); return Buffer.from(media.base64, 'base64'); });
  app.get('/api/games/:runId/backup', async request => { control(request); const state = await store.read(request.params.runId, true); if (!state) throw Object.assign(new Error('比赛不存在'), { statusCode: 404 }); return exportBackup(state); });
}
