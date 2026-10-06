import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { seedState, executeCommand, stateView, exportBackup, restoreBackup, RuleError } from './rules.mjs';
import { officialScoring } from './scoring.mjs';
import { normalizeBingoTasks } from './bingoBoards.mjs';

const staff = { id: 'staff', role: 'staff', manage: true, review: true };
const player = n => ({ id: `player-${n}`, role: 'player', teamId: `team-${n}`, nickname: `昵称${n}` });
const invoke = (state, actor, body, key = randomUUID()) => executeCommand(state, actor, body, key);
const media = { name: 'evidence.png', mime: 'image/png', base64: (await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer()).toString('base64') };
async function fixture() {
  const state = seedState([staff, ...Array.from({ length: 5 }, (_, i) => player(i + 1))]); state.mode = 'live';
  state.teams = Array.from({ length: 5 }, (_, i) => ({ id: `team-${i + 1}`, name: `队${i + 1}`, regionId: 'stage-a', regionVersion: 1, finishedAt: null }));
  await invoke(state, staff, { type: 'scoring_preset', reason: '载入正式规则' });
  await invoke(state, staff, { type: 'transition', status: 'RUNNING' });
  return state;
}
async function submit(state, n, taskId) {
  await invoke(state, player(n), { type: 'submit', kind: 'task', taskId, regionId: state.teams[n - 1].regionId, media });
  return state.submissions.at(-1).id;
}
const review = (state, id, extra = {}, key) => invoke(state, staff, { type: 'review', submissionId: id, result: 'approve', reason: '现场证据核验', ...extra }, key);
const total = (state, n) => state.ledger.filter(x => x.teamId === `team-${n}`).reduce((a, x) => a + x.points, 0);
const finish = (state, ids, key) => invoke(state, staff, { type: 'finish_team', teamIds: ids.map(n => `team-${n}`), reason: '终点现场确认', }, key);

test('125项分值与固定格位：五个4000分主题，中心极难400，19图寻+6直接', () => {
  const tasks = normalizeBingoTasks(officialScoring.tasks, (valid, code) => { if (!valid) throw new RuleError(code); });
  assert.equal(new Set(tasks.map(x => x.id)).size, 125);
  for (let n = 1; n <= 5; n++) {
    const board = tasks.filter(x => x.boardId === `team-${n}`);
    assert.equal(board.length, 25); assert.equal(board.reduce((a, x) => a + x.points, 0), 4000);
    assert.equal(board.filter(x => x.sharedSlot.startsWith('P')).length, 19);
    assert.equal(board.filter(x => x.sharedSlot.startsWith('D')).length, 6);
    assert.equal(board[12].sharedSlot, 'D03'); assert.equal(board[12].difficulty, '极难'); assert.equal(board[12].points, 400);
  }
  assert.deepEqual(tasks.find(x => x.id === 'PHI21').bonus, { points: 50, threshold: 2990000, comparison: 'gte' });
  assert.equal(tasks.find(x => x.id === 'ARC04').failurePenalty, 50);
  const duplicate = tasks.map(x => ({ ...x })); duplicate[1].sharedSlot = duplicate[0].sharedSlot;
  assert.throws(() => normalizeBingoTasks(duplicate, (ok, code) => { if (!ok) throw new RuleError(code); }), /BINGO_SLOT_CONFIG_INVALID/);
});

test('跨棋盘最早有效提交者领取基础分与2990000含等号的+50，重试和后提交不重复', async () => {
  const state = await fixture(), first = await submit(state, 2, 'PHI21'), second = await submit(state, 1, 'PHI21'), key = randomUUID();
  await review(state, first, { performanceScore: 2990000 }, key);
  await review(state, first, { performanceScore: 2990000 }, key);
  await review(state, second, { performanceScore: 3000000 });
  assert.equal(state.awards.PHI21.teamId, 'team-2');
  assert.equal(total(state, 2), officialScoring.tasks.find(x => x.id === 'PHI21').points + 50);
  assert.equal(total(state, 1), 0); assert.equal(state.ledger.filter(x => x.category === 'TASK_BONUS').length, 1);
});

test('未达到阈值或未录入核验成绩，不发额外奖励', async () => {
  for (const extra of [{ performanceScore: 2989999 }, {}]) {
    const state = await fixture(); await review(state, await submit(state, 1, 'PHI21'), extra);
    assert.equal(total(state, 1), officialScoring.tasks.find(x => x.id === 'PHI21').points);
  }
});

test('实际失败独立逐次扣分，业务ID和HTTP重试均防重，非工作人员不能扣分', async () => {
  const state = await fixture();
  const command = { type: 'task_failure', teamId: 'team-1', taskId: 'ARC04', count: 3, attemptId: randomUUID(), reason: '现场三次失败；证据编号A' };
  await invoke(state, staff, command); await invoke(state, staff, command);
  assert.equal(total(state, 1), -150); assert.equal(state.ledger.length, 1);
  await assert.rejects(invoke(state, staff, { ...command, count: 4 }), /IDEMPOTENCY_CONFLICT/);
  await assert.rejects(invoke(state, player(1), { ...command, attemptId: randomUUID() }), /FORBIDDEN/);
  await review(state, await submit(state, 1, 'ARC04'));
  assert.equal(total(state, 1), officialScoring.tasks.find(x => x.id === 'ARC04').points - 150);
});

test('证据打回不自动扣分，审核中显式新增失败才扣分', async () => {
  const state = await fixture(), id = await submit(state, 1, 'ARC11');
  await review(state, id, { result: 'reject' }); assert.equal(total(state, 1), 0);
  await review(state, await submit(state, 1, 'ARC11'), { failedAttempts: 2 });
  assert.equal(total(state, 1), officialScoring.tasks.find(x => x.id === 'ARC11').points - 100);
});

test('每区域最多五个基础奖励，全局taskID跨区域不重发', async () => {
  const state = await fixture(), tasks = officialScoring.tasks.filter(x => x.boardId === 'team-1').slice(0, 6);
  for (const task of tasks) await review(state, await submit(state, 1, task.id));
  assert.equal(state.ledger.filter(x => x.category === 'TASK').length, 5);
  state.teams[0].regionId = 'stage-b'; state.teams[0].regionVersion++;
  await review(state, await submit(state, 1, tasks[0].id));
  assert.equal(state.ledger.filter(x => x.category === 'TASK').length, 5);
});

test('完赛800/600/400/250/100按确认顺序，只记一次，备份保留名次与奖励', async () => {
  const state = await fixture(); state.teams.forEach(x => { x.regionId = 'stage-c'; });
  const key = randomUUID(); await finish(state, [1], key); await finish(state, [1], key);
  for (let n = 2; n <= 5; n++) await finish(state, [n]);
  assert.deepEqual(state.teams.map(x => x.finishPoints), [800, 600, 400, 250, 100]);
  assert.deepEqual(state.teams.map(x => x.finishRank), [1, 2, 3, 4, 5]);
  assert.equal(state.ledger.filter(x => x.category === 'FINISH').length, 5);
  const restored = restoreBackup(exportBackup(state)); assert.deepEqual(restored.teams, state.teams);
});

test('显式同时抵达平分占用名次奖励，下一个名次跳位', async () => {
  const state = await fixture(); state.teams.forEach(x => { x.regionId = 'stage-c'; });
  await finish(state, [1]); await finish(state, [2, 3]); await finish(state, [4]);
  assert.deepEqual(state.teams.slice(0, 4).map(x => x.finishPoints), [800, 500, 500, 250]);
  assert.deepEqual(state.teams.slice(0, 4).map(x => x.finishRank), [1, 2, 2, 4]);
});

test('非末区域、有待审证据不能完赛；非法数值不抢占任务归属', async () => {
  const state = await fixture(); await assert.rejects(finish(state, [1]), /FINISH_REGION_REQUIRED/);
  state.teams[0].regionId = 'stage-c'; const id = await submit(state, 1, 'PHI21');
  await assert.rejects(finish(state, [1]), /FINISH_TASKS_PENDING/);
  await assert.rejects(review(state, id, { performanceScore: -1 }), /TASK_PERFORMANCE_INVALID/);
  assert.equal(state.awards.PHI21, undefined); assert.equal(state.submissions[0].status, 'QUEUED');
});

test('PHI24仅修改当前玩家昵称并持久化，锁定区域不泄露任务题面', async () => {
  const state = await fixture(); await invoke(state, { ...player(1) }, { type: 'task_nickname' });
  assert.equal(state.accounts.find(x => x.id === 'player-1').nickname, '零零五');
  assert.equal(state.accounts.find(x => x.id === 'player-2').nickname, '昵称2');
  state.teams[0].regionId = null;
  const view = stateView(state, player(1)); assert.equal(view.taskCatalog, undefined);
  assert(view.tasks.every(x => x.title == null && x.brief == null && x.points == null));
});
