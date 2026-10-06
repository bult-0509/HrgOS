import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestServer } from './app.mjs';
import { createLocalStore } from './store.mjs';
import { runGlobalCardGrantCheck } from '../src/testing/globalCardGrantCheck.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const key = 'ability-tests-control-key-abcdefghijklmnopqrstuvwxyz';
const image = { name: 'proof.png', mime: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' };
async function fixture(action, teamCount = 2) {
  const store = await createLocalStore(); const app = await createTestServer({ store, testKey: key, enabled: true });
  try {
    const run = (await app.inject({ method: 'POST', url: '/api/testing/runs', headers: { authorization: `Bearer ${key}` }, payload: { teamCount } })).json();
    const tokens = {};
    for (const [name, credentials] of Object.entries(run.credentials)) tokens[name] = (await app.inject({ method: 'POST', url: `/api/testing/runs/${run.id}/login`, payload: credentials })).json().token;
    const call = async (role, command, status = 200, idempotencyKey = crypto.randomUUID()) => {
      const response = await app.inject({ method: 'POST', url: `/api/testing/runs/${run.id}/commands`, headers: { authorization: `Bearer ${tokens[role]}`, 'idempotency-key': idempotencyKey }, payload: command });
      assert.equal(response.statusCode, status, response.body); return response.json();
    };
    const state = async (role = 'host') => (await app.inject({ url: `/api/testing/runs/${run.id}/state`, headers: { authorization: `Bearer ${tokens[role]}` } })).json();
    const clock = async milliseconds => {
      const response = await app.inject({ method: 'POST', url: `/api/testing/runs/${run.id}/clock`, headers: { authorization: `Bearer ${key}` }, payload: { milliseconds } });
      assert.equal(response.statusCode, 200, response.body);
    };
    await call('host', { type: 'transition', status: 'RUNNING' });
    await action({ app, run, tokens, call, state, clock, store });
  } finally { await app.close(); await store.close(); }
}

test('24 张能力卡目录可见，停用卡不能使用，发放权限仅属于工作人员', async () => fixture(async ({ call, state }) => {
  const staff = await state(); assert.equal(staff.abilityCatalog.length, 24);
  assert.equal(staff.abilityCatalog.find(card => card.number === 19).ready, true);
  await call('player', { type: 'ability_grant', number: 3, teamId: 'team-1', reason: '测试' }, 403);
  const granted = await call('host', { type: 'ability_grant', number: 19, teamId: 'team-1', reason: '测试' });
  await call('host', { type: 'ability_configure', number: 19, patch: { enabled: false }, reason: '暂停发放此卡' });
  await call('player', { type: 'ability_use', instanceId: granted.card.id }, 409);
  assert.equal((await state('player')).abilityCards.length, 1);
}));

test('现场卡由目标接收后计时，证据隔离、工作人员结算；下蹲按成员缺少数量扣分', async () => fixture(async ({ call, state, clock }) => {
  const granted = await call('host', { type: 'ability_grant', number: 6, teamId: 'team-2', reason: '现场发放' });
  const { use } = await call('opponent', { type: 'ability_use', instanceId: granted.card.id, targetTeamId: 'team-1' });
  await call('host', { type: 'ability_confirm', useId: use.id, result: 'approve' });
  await clock(60000); assert.equal((await state('player')).abilityUses[0].startedAt, null);
  await call('opponent', { type: 'ability_ack', useId: use.id }, 403);
  await call('player', { type: 'ability_ack', useId: use.id });
  const proof = await call('player', { type: 'ability_submit', useId: use.id, text: '两位成员完成记录', media: image });
  assert(proof.evidence.mediaId);
  assert.equal((await state('opponent')).abilityUses[0].evidence.length, 0);
  await call('player', { type: 'ability_review', useId: use.id, teamId: 'team-1', result: 'approve', counts: { player: 20, member: 18 }, reason: '现场确认' }, 403);
  await call('host', { type: 'ability_review', useId: use.id, teamId: 'team-1', result: 'approve', counts: { player: 20, member: 18 }, reason: '现场确认' });
  assert.equal((await state('player')).team.score, -50);
  await call('host', { type: 'ability_review', useId: use.id, teamId: 'team-1', result: 'approve', counts: { player: 20, member: 18 }, reason: '重复' }, 409);
  const poem = (await call('host', { type: 'ability_grant', number: 4, teamId: 'team-2', reason: '现场发放' })).card;
  const second = (await call('opponent', { type: 'ability_use', instanceId: poem.id, targetTeamId: 'team-1' })).use;
  await call('host', { type: 'ability_confirm', useId: second.id, result: 'approve' }); await call('player', { type: 'ability_ack', useId: second.id });
  await call('host', { type: 'ability_review', useId: second.id, teamId: 'team-1', result: 'reject', reason: '未完成微笑朗诵' });
  assert.equal((await state('player')).team.score, -150);
}));

test('排名透视十分钟到期撤权，暂停冻结计时；榜首转分必须确认且只结算一次', async () => fixture(async ({ app, run, tokens, call, state, clock }) => {
  const grant = async number => (await call('host', { type: 'ability_grant', number, teamId: 'team-1', reason: '现场发放' })).card.id;
  const scan = await call('player', { type: 'ability_use', instanceId: await grant(3) });
  assert.equal(scan.use.status, 'ACTIVE'); assert.equal((await state('player')).liveRanking.length, 2);
  const scoreUrl = `/api/testing/runs/${run.id}/scores/team-2`;
  const readScore = () => app.inject({ url: scoreUrl, headers: { authorization: `Bearer ${tokens.player}` } });
  assert.equal((await readScore()).statusCode, 200);
  await clock(9 * 60000); await call('host', { type: 'transition', status: 'PAUSED' }); await clock(5 * 60000);
  assert.equal((await readScore()).statusCode, 200);
  await call('host', { type: 'transition', status: 'RUNNING' }); await clock(60000);
  assert.equal((await readScore()).statusCode, 403); assert.equal((await state('player')).liveRanking, null);
  await call('host', { type: 'correct_score', teamId: 'team-2', points: 150, reason: '现场基础积分' });
  const use = (await call('player', { type: 'ability_use', instanceId: await grant(5) })).use;
  assert.equal((await state('player')).team.score, 0);
  await call('player', { type: 'ability_confirm', useId: use.id, result: 'approve' }, 403);
  const confirmKey = crypto.randomUUID();
  await call('host', { type: 'ability_confirm', useId: use.id, result: 'approve' }, 200, confirmKey);
  await call('host', { type: 'ability_confirm', useId: use.id, result: 'approve' }, 200, confirmKey);
  await call('host', { type: 'ability_confirm', useId: use.id, result: 'approve' }, 409);
  assert.equal((await state('player')).team.score, 100); assert.equal((await state('opponent')).team.score, 50);
}));

test('时空回返要求真实历史点，冻结保留真实轨迹并产生移动提醒', async () => fixture(async ({ call, state, clock }) => {
  const grant = async number => (await call('host', { type: 'ability_grant', number, teamId: 'team-2', reason: '现场发放' })).card.id;
  const back = await grant(14);
  await call('opponent', { type: 'ability_use', instanceId: back, targetTeamId: 'team-1' }, 409);
  const location = (latitude, longitude) => call('player', { type: 'location', latitude, longitude, accuracy: 3, capturedAt: Date.now(), foreground: true });
  await location(30, 120); await clock(10 * 60000); await location(30.01, 120.01);
  const use = (await call('opponent', { type: 'ability_use', instanceId: back, targetTeamId: 'team-1' })).use;
  assert.equal((await state('player')).abilityUses.find(item => item.id === use.id).returnPosition.latitude, 30);
  assert.equal(use.returnPosition, undefined);
  await call('host', { type: 'ability_confirm', useId: use.id, result: 'approve' }); await call('player', { type: 'ability_ack', useId: use.id });
  await call('host', { type: 'ability_review', useId: use.id, teamId: 'team-1', result: 'approve', reason: '工作人员现场确认实际返回' });
  assert.equal((await state('player')).location.latitude, 30.01);
  const freeze = (await call('opponent', { type: 'ability_use', instanceId: await grant(2), targetTeamId: 'team-1' })).use;
  await call('host', { type: 'ability_confirm', useId: freeze.id, result: 'approve' }); await call('player', { type: 'ability_ack', useId: freeze.id });
  await clock(3000); await location(30.02, 120.01);
  assert.equal((await state('player')).location.latitude, 30.02);
  assert((await state()).abilityUses.find(item => item.id === freeze.id).movementAlerts.length > 0);
}));

test('密钥竞速按服务端接收顺序结算，英文大小写/中英文标点归一，中文语义人工确认', async () => fixture(async ({ call, state, clock, run }) => {
  const grant = (await call('host', { type: 'ability_grant', number: 22, teamId: 'team-1', reason: '竞速测试' })).card;
  const { use } = await call('player', { type: 'ability_use', instanceId: grant.id });
  await call('host', { type: 'ability_confirm', useId: use.id, result: 'approve' }); await call('player', { type: 'ability_ack', useId: use.id });
  await call('player', { type: 'ability_submit', useId: use.id, text: run.abilityAnswer }, 409);
  await call('opponent', { type: 'ability_ack', useId: use.id });
  await call('player', { type: 'ability_submit', useId: use.id, text: 'wrong key' }, 400);
  await call('player', { type: 'ability_submit', useId: use.id, text: run.abilityAnswer.toUpperCase().replace('-', '， — ') });
  await clock(1000);
  const proof = (await call('opponent', { type: 'ability_submit', useId: use.id, text: '倒退，回到前世的领域，向后返回。' })).evidence;
  await call('host', { type: 'ability_settle', useId: use.id, reason: '结算竞速' }, 409);
  await call('host', { type: 'ability_review', useId: use.id, teamId: 'team-2', evidenceId: proof.id, result: 'approve', reason: '现场确认中文语义与标准密钥一致' });
  await call('host', { type: 'ability_settle', useId: use.id, reason: '结算竞速' });
  assert.equal((await state('player')).team.score, 5); assert.equal((await state('opponent')).team.score, -5);
  await call('host', { type: 'ability_settle', useId: use.id, reason: '重复结算' }, 409);
  assert.equal((await state('opponent')).abilityUses[0].evidence.length, 1);
}));

test('隐匿追逐仅在十五分钟有效期内公开位置，成功加五分；圆周率以工作人员确认的小数位计分', async () => fixture(async ({ call, state, clock }) => {
  const grant = async number => (await call('host', { type: 'ability_grant', number, teamId: 'team-1', reason: '现场' })).card.id;
  const hunt = (await call('player', { type: 'ability_use', instanceId: await grant(19) })).use;
  await call('host', { type: 'ability_confirm', useId: hunt.id, result: 'approve' }); await call('player', { type: 'ability_ack', useId: hunt.id });
  await call('player', { type: 'location', foreground: true, latitude: 30, longitude: 120, accuracy: 3, capturedAt: Date.now() });
  assert.equal((await state('opponent')).huntLocations[0].latitude, 30);
  await call('host', { type: 'ability_review', useId: hunt.id, teamId: 'team-1', result: 'approve', reason: '未碰到' }, 409);
  await clock(15 * 60000); assert.equal((await state('opponent')).huntLocations.length, 0);
  await call('host', { type: 'ability_review', useId: hunt.id, teamId: 'team-1', result: 'approve', reason: '现场确认十五分钟未被其他队伍触碰' });
  assert.equal((await state('player')).team.score, 5);
  const pi = (await call('player', { type: 'ability_use', instanceId: await grant(21) })).use;
  await call('host', { type: 'ability_confirm', useId: pi.id, result: 'approve' }); await call('player', { type: 'ability_ack', useId: pi.id }); await call('opponent', { type: 'ability_ack', useId: pi.id });
  await call('player', { type: 'ability_submit', useId: pi.id, text: '三人接力背诵录像，工作人员确认十位' });
  await call('host', { type: 'ability_review', useId: pi.id, teamId: 'team-1', result: 'approve', verifiedDigits: 10, reason: '现场逐位核对' });
  assert.equal((await state('player')).team.score, 15);
}));

test('双手许可随下个审核通过任务消耗，任务重演奖励半分，交换的是待执行任务', async () => fixture(async ({ call, state }) => {
  const grant = async number => (await call('host', { type: 'ability_grant', number, teamId: 'team-1', reason: '现场发放' })).card.id;
  const submitTask = async (taskId, role = 'player') => (await call(role, { type: 'submit', kind: 'task', taskId, regionId: 'stage-a', media: image })).submission;
  const review = async submission => call('host', { type: 'review', submissionId: submission.id, result: 'approve' });
  for (const role of ['player', 'opponent']) await review((await call(role, { type: 'submit', kind: 'arrival', regionId: 'stage-a', media: image })).submission);
  const hands = (await call('player', { type: 'ability_use', instanceId: await grant(8) })).use;
  assert.equal((await state('player')).taskPermissions.twoHands, true);
  await review(await submitTask('T01')); assert.equal((await state('player')).taskPermissions.twoHands, false);
  const redoCard = await grant(12);
  await call('player', { type: 'ability_use', instanceId: redoCard, targetTeamId: 'team-2' }, 409);
  await review(await submitTask('T02', 'opponent'));
  const redo = (await call('player', { type: 'ability_use', instanceId: redoCard, targetTeamId: 'team-2' })).use;
  assert.equal(redo.redoTask.taskId, 'T02');
  await call('host', { type: 'ability_confirm', useId: redo.id, result: 'approve' }); await call('opponent', { type: 'ability_ack', useId: redo.id });
  await call('opponent', { type: 'ability_submit', useId: redo.id, text: '重新完成 T02 的现场证据', media: image });
  await call('host', { type: 'ability_review', useId: redo.id, teamId: 'team-2', result: 'approve', reason: '完成重演' });
  assert.equal((await state('opponent')).team.score, 7.5);
  const swap = (await call('player', { type: 'ability_use', instanceId: await grant(15), targetTeamId: 'team-2' })).use;
  await call('host', { type: 'ability_confirm', useId: swap.id, result: 'approve' }); await call('opponent', { type: 'ability_ack', useId: swap.id });
  await call('opponent', { type: 'ability_swap', useId: swap.id, peerTeamId: 'team-1', ownTaskId: 'T03', peerTaskId: 'T04' });
  assert.equal((await state('player')).activeAssignment.taskId, 'T03');
  await call('player', { type: 'submit', kind: 'task', taskId: 'T05', regionId: 'stage-a', media: image }, 409);
  await review(await submitTask('T03')); assert.equal((await state('player')).activeAssignment, null);
}));

test('合照换分对称记账；其余行为限制按明确时限和默认罚分结算，未到期不能提前通过', async () => fixture(async ({ call, state, clock }) => {
  const grant = async number => (await call('host', { type: 'ability_grant', number, teamId: 'team-1', reason: '现场发放' })).card.id;
  await call('host', { type: 'correct_score', teamId: 'team-1', points: 20, reason: '初始分数' }); await call('host', { type: 'correct_score', teamId: 'team-2', points: 80, reason: '初始分数' });
  const photo = (await call('player', { type: 'ability_use', instanceId: await grant(1), targetTeamId: 'team-2' })).use;
  await call('host', { type: 'ability_confirm', useId: photo.id, result: 'approve' }); await call('opponent', { type: 'ability_ack', useId: photo.id });
  await call('host', { type: 'ability_review', useId: photo.id, teamId: 'team-2', result: 'approve', reason: '未提交照片' }, 409);
  await call('player', { type: 'ability_submit', useId: photo.id, text: '双方队伍现场合照', media: image });
  await call('host', { type: 'ability_review', useId: photo.id, teamId: 'team-2', result: 'approve', reason: '确认双方已碰面合照' });
  assert.equal((await state('player')).team.score, 80); assert.equal((await state('opponent')).team.score, 20);
  for (const [number, minutes, penalty] of [[7, 5, 5], [9, 2, 50], [10, 5, 5], [11, 5, 5], [13, 3, 50], [16, 10, 5], [17, 10, 5], [18, 10, 5]]) {
    const use = (await call('player', { type: 'ability_use', instanceId: await grant(number), targetTeamId: 'team-2' })).use;
    await call('host', { type: 'ability_confirm', useId: use.id, result: 'approve' }); await call('opponent', { type: 'ability_ack', useId: use.id });
    assert.equal(use.definition.durationMs, minutes * 60000);
    if ([7, 9, 10, 16, 17, 18].includes(number)) await call('host', { type: 'ability_review', useId: use.id, teamId: 'team-2', result: 'approve', reason: '提前结束' }, 409);
    const before = (await state('opponent')).team.score; await clock(minutes * 60000);
    await call('host', { type: 'ability_review', useId: use.id, teamId: 'team-2', result: 'reject', reason: '现场确认未遵守' });
    assert.equal((await state('opponent')).team.score, before - penalty);
  }
}));

test('旧赛局补入23/24卡且保留停用配置，备用任务池仅工作人员可改且不可混入棋盘任务', async () => fixture(async ({ call, state, store, run }) => {
  await store.update(run.id, state => { state.abilityCatalog = state.abilityCatalog.filter(card => card.number <= 22); state.abilityCatalog[0].enabled = false; return {}; });
  const migrated = await state(); assert.equal(migrated.abilityCatalog.length, 24); assert.equal(migrated.abilityCatalog[0].enabled, false);
  const tasks = [{ id: 'EXTRA01', title: '备用任务', brief: '完成另一项现场挑战', points: 5 }];
  await call('player', { type: 'ability_reserve_configure', tasks, reason: '越权' }, 403);
  await call('host', { type: 'ability_reserve_configure', tasks: [{ ...tasks[0], id: 'T01' }], reason: '重复棋盘' }, 400);
  await call('host', { type: 'ability_reserve_configure', tasks: [tasks[0], tasks[0]], reason: '重复编号' }, 400);
  await call('host', { type: 'ability_reserve_configure', tasks: [{ ...tasks[0], points: 0 }], reason: '无效分值' }, 400);
  await call('host', { type: 'ability_reserve_configure', tasks, reason: '现场备用池' });
  assert.deepEqual((await state()).reserveTasks, tasks); assert.equal((await state('player')).reserveTasks, undefined);
  assert.equal((await state('player')).tasks.length, 25);
}));

test('无中生有确认后只抽未领取的备用任务，固定快照、证据隔离、审核后解除且不能重复结算', async () => fixture(async ({ call, state, store, run }) => {
  const grant = async () => (await call('host', { type: 'ability_grant', number: 23, teamId: 'team-1', reason: '现场发放' })).card;
  const card = await grant();
  await call('player', { type: 'ability_use', instanceId: card.id, targetTeamId: 'team-2' }, 409);
  assert.equal((await state('player')).abilityCards[0].status, 'AVAILABLE');
  const tasks = [{ id: 'EXTRA01', title: '备用挑战一', brief: '现场完成要求一', points: 7 }, { id: 'EXTRA02', title: '备用挑战二', brief: '现场完成要求二', points: 9 }];
  await call('host', { type: 'ability_reserve_configure', tasks, reason: '配置备用池' });
  const { use } = await call('player', { type: 'ability_use', instanceId: card.id, targetTeamId: 'team-2', taskId: 'T01' });
  assert.equal(use.extraTask, undefined);
  const confirmationKey = crypto.randomUUID();
  const confirmed = await call('host', { type: 'ability_confirm', useId: use.id, result: 'approve' }, 200, confirmationKey);
  assert(tasks.some(task => task.id === confirmed.use.extraTask.id));
  assert.deepEqual((await call('host', { type: 'ability_confirm', useId: use.id, result: 'approve' }, 200, confirmationKey)).use.extraTask, confirmed.use.extraTask);
  await call('host', { type: 'ability_reserve_configure', tasks: tasks.map(task => ({ ...task, brief: '改过的说明' })), reason: '修改未来任务池' });
  assert.equal((await state('opponent')).abilityUses[0].extraTask.brief, confirmed.use.extraTask.brief);
  const second = await grant();
  await call('player', { type: 'ability_use', instanceId: second.id, targetTeamId: 'team-2' }, 409);
  await call('opponent', { type: 'ability_ack', useId: use.id });
  await call('opponent', { type: 'submit', kind: 'arrival', regionId: 'stage-a', media: image }, 409);
  await call('opponent', { type: 'ability_submit', useId: use.id, text: '只有文字' });
  await call('host', { type: 'ability_review', useId: use.id, teamId: 'team-2', result: 'approve', reason: '尚无媒体证据' }, 409);
  await call('opponent', { type: 'ability_submit', useId: use.id, text: '完成额外任务', media: image });
  assert.equal((await state('player')).abilityUses[0].evidence.length, 0);
  await call('host', { type: 'ability_review', useId: use.id, teamId: 'team-2', result: 'approve', reason: '现场核实' });
  assert.equal((await state('opponent')).activeAssignment, null); assert.equal((await state('opponent')).team.score, 0);
  assert.deepEqual((await state()).awards, {});
  await call('host', { type: 'ability_review', useId: use.id, teamId: 'team-2', result: 'approve', reason: '重复审核' }, 409);
  const next = (await call('player', { type: 'ability_use', instanceId: second.id, targetTeamId: 'team-2' })).use;
  await call('host', { type: 'ability_confirm', useId: next.id, result: 'approve' });
  const latest = (await state('opponent')).abilityUses.find(item => item.id === next.id);
  assert.notEqual(latest.extraTask.id, confirmed.use.extraTask.id);
  await call('host', { type: 'ability_abort', useId: next.id, reason: '现场无法执行' });
  assert.equal((await state('opponent')).activeAssignment, null);
  const third = await grant(); await call('player', { type: 'ability_use', instanceId: third.id, targetTeamId: 'team-2' }, 409);
  assert.equal((await store.read(run.id)).abilityExtraDraws.length, 2);
}));

test('无中生有到期禁止新增证据，未完成扣5分并解除任务；禁言5分钟暂停冻结、不能提前成功、到期解除', async () => fixture(async ({ call, state, clock }) => {
  const activate = async number => {
    const card = (await call('host', { type: 'ability_grant', number, teamId: 'team-1', reason: '现场发放' })).card;
    const { use } = await call('player', { type: 'ability_use', instanceId: card.id, targetTeamId: 'team-2' });
    await call('host', { type: 'ability_confirm', useId: use.id, result: 'approve' }); await call('opponent', { type: 'ability_ack', useId: use.id }); return use;
  };
  await call('host', { type: 'ability_reserve_configure', tasks: [{ id: 'EXTRA01', title: '备用挑战', brief: '完成现场任务', points: 5 }], reason: '备用池' });
  const extra = await activate(23); await clock(900000);
  await call('opponent', { type: 'ability_submit', useId: extra.id, text: '超时补交', media: image }, 409);
  await call('host', { type: 'ability_review', useId: extra.id, teamId: 'team-2', result: 'reject', reason: '未完成' });
  assert.equal((await state('opponent')).activeAssignment, null); assert.equal((await state('opponent')).team.score, -5);
  const silent = await activate(24);
  assert.equal((await state('opponent')).taskPermissions.phoneTextOnly, true);
  assert.equal((await state('player')).taskPermissions.phoneTextOnly, false);
  await call('host', { type: 'ability_review', useId: silent.id, teamId: 'team-2', result: 'approve', reason: '过早' }, 409);
  await clock(240000); await call('host', { type: 'transition', status: 'PAUSED' }); await clock(600000);
  assert.equal((await state('opponent')).taskPermissions.phoneTextOnly, true);
  await call('host', { type: 'transition', status: 'RUNNING' }); await clock(59999);
  assert.equal((await state('opponent')).taskPermissions.phoneTextOnly, true); await clock(1);
  assert.equal((await state('opponent')).taskPermissions.phoneTextOnly, false);
  await call('opponent', { type: 'ability_submit', useId: silent.id, text: '到期后说明' }, 409);
  await call('host', { type: 'ability_review', useId: silent.id, teamId: 'team-2', result: 'reject', reason: '工作人员确认有成员开口交流' });
  assert.equal((await state('opponent')).team.score, -10);
  await call('host', { type: 'ability_review', useId: silent.id, teamId: 'team-2', result: 'reject', reason: '重复' }, 409);
}));

test('五队真实 HTTP 验证10/20任务全队发卡、重复审核幂等以及共享库存并发消费', async () => {
  const store = await createLocalStore(); const app = await createTestServer({ store, testKey: key, enabled: true });
  try {
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const result = await runGlobalCardGrantCheck({ baseUrl: address, key }); assert.equal(result.status, 'passed', result.detail);
  } finally { await app.close(); await store.close(); }
});

test('发卡轮次、卡牌ID和完成任务去重在数据库重启后保留，旧区域奖励不再触发', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hrgos-card-grants-'));
  let store = await createLocalStore(directory); let app = await createTestServer({ store, testKey: key, enabled: true });
  try {
    const run = (await app.inject({ method: 'POST', url: '/api/testing/runs', headers: { authorization: `Bearer ${key}` }, payload: { teamCount: 5 } })).json();
    const tokens = {};
    for (const role of ['host', 'player', 'member']) tokens[role] = (await app.inject({ method: 'POST', url: `/api/testing/runs/${run.id}/login`, payload: run.credentials[role] })).json().token;
    const command = async (role, payload) => {
      const response = await app.inject({ method: 'POST', url: `/api/testing/runs/${run.id}/commands`, headers: { authorization: `Bearer ${tokens[role]}`, 'idempotency-key': crypto.randomUUID() }, payload });
      assert.equal(response.statusCode, 200, response.body); return response.json();
    };
    const view = async role => (await app.inject({ url: `/api/testing/runs/${run.id}/state`, headers: { authorization: `Bearer ${tokens[role]}` } })).json();
    await command('host', { type: 'transition', status: 'RUNNING' });
    const arrival = await command('player', { type: 'submit', kind: 'arrival', regionId: 'stage-a', media: image });
    await command('host', { type: 'review', submissionId: arrival.submission.id, result: 'approve' });
    // 模拟升级前已有9项通过审核的持久记录；新规则不依赖任务计分归属。
    await store.update(run.id, state => {
      state.submissions.push(...Array.from({ length: 9 }, (_, index) => ({ id: `historic-${index}`, teamId: index < 5 ? 'team-1' : 'team-2', kind: 'task', taskId: `T${String(index + 1).padStart(2, '0')}`, status: 'APPROVED_NON_SCORING' })));
      state.abilityRegionGrants = ['team-1:stage-a']; delete state.abilityTaskGrants; return {};
    });
    const complete = async (role, taskId) => {
      const item = await command(role, { type: 'submit', kind: 'task', taskId, regionId: 'stage-a', media: image });
      await command('host', { type: 'review', submissionId: item.submission.id, result: 'approve', reason: '现场确认' });
    };
    await complete('player', 'T10'); const first = await view('host');
    assert.equal(first.abilityProgress.completedTasks, 10); assert.equal(first.abilityCards.length, 5);
    const cardIds = first.abilityCards.map(card => card.id).sort();
    await app.close(); await store.close(); store = await createLocalStore(directory); app = await createTestServer({ store, testKey: key, enabled: true });
    assert.deepEqual((await view('host')).abilityCards.map(card => card.id).sort(), cardIds);
    await complete('member', 'T10'); const after = await view('host');
    assert.equal(after.abilityProgress.completedTasks, 10); assert.equal(after.abilityProgress.distributedRounds, 1); assert.equal(after.abilityCards.length, 5);
    assert.deepEqual((await view('player')).abilityCards.map(card => card.id), (await view('member')).abilityCards.map(card => card.id));
    assert.equal((await store.read(run.id)).abilityTaskGrants.length, 1);
  } finally {
    await app.close(); await store.close();
    if (resolve(directory).startsWith(resolve(tmpdir()) + '\\') && directory.includes('hrgos-card-grants-')) await rm(directory, { recursive: true, force: true });
  }
});
