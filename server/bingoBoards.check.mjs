import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { seedState, executeCommand, stateView, RuleError } from './rules.mjs';
import { normalizeBingoTasks, bingoBoardDefinitions } from './bingoBoards.mjs';

const requireRule = (valid, code) => { if (!valid) throw new RuleError(code); };
const tasks = bingoBoardDefinitions.flatMap(board => Array.from({ length: 25 }, (_, n) => ({ id: `${board.id}-T${n + 1}`, boardId: board.id, title: `${board.name}任务${n + 1}`, brief: '真实测试要求', points: 5 })));

test('125项独立任务完整覆盖五个棋盘；拒绝缺板、重复ID、局部格位', () => {
  assert.equal(normalizeBingoTasks(tasks, requireRule).length, 125);
  assert.throws(() => normalizeBingoTasks(tasks.map(task => ({ ...task, boardId: 'team-1' })), requireRule), /BINGO_BOARD_CONFIG_INVALID/);
  assert.throws(() => normalizeBingoTasks(tasks.map(() => tasks[0]), requireRule), /TASK_CONFIG_INVALID/);
  assert.throws(() => normalizeBingoTasks(tasks.map((task, n) => n === 0 ? { ...task, sharedSlot: 'P01' } : task), requireRule), /BINGO_SLOT_CONFIG_INVALID/);
  const legacy = tasks.slice(0, 25).map(({ boardId, ...task }) => task);
  assert.equal(normalizeBingoTasks(legacy, requireRule).length, 25);
});

test('Phigros身份可以做其他四张棋盘任务，区域和积分属于提交队而非棋盘主题', async () => {
  const state = seedState([]); state.mode = 'live';
  const staff = { id: 'staff', role: 'staff', manage: true, review: true };
  const player = { id: 'player', role: 'player', teamId: 'team-1' };
  await executeCommand(state, staff, { type: 'game_configure', tasks, reason: '测试五张共享棋盘' }, crypto.randomUUID());
  await executeCommand(state, staff, { type: 'transition', status: 'RUNNING' }, crypto.randomUUID());
  state.teams[0].regionId = 'stage-b'; state.teams[0].regionVersion = 2;
  // 其他队伍进度不同，不能借观看其他Bingo越过本队区域。
  state.teams[1].regionId = 'stage-c'; state.teams[1].regionVersion = 3;
  const base64 = (await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer()).toString('base64');
  const media = { name: 'test.png', mime: 'image/png', base64 };
  for (const board of bingoBoardDefinitions) {
    const taskId = `${board.id}-T1`;
    await executeCommand(state, player, { type: 'submit', kind: 'task', regionId: 'stage-b', taskId, teamId: board.id, media }, crypto.randomUUID());
    const item = state.submissions.at(-1); assert.equal(item.teamId, player.teamId);
    await executeCommand(state, staff, { type: 'review', submissionId: item.id, result: 'approve' }, crypto.randomUUID());
    assert.equal(state.awards[taskId].teamId, player.teamId);
  }
  const view = stateView(state, player);
  assert.equal(view.tasks.length, 125); assert.equal(view.team.regionId, 'stage-b'); assert.equal(view.team.score, 25);
  assert.equal(stateView(state, { id: 'other', role: 'player', teamId: 'team-2' }).team.score, 0);
  await assert.rejects(executeCommand(state, player, { type: 'submit', kind: 'task', regionId: 'stage-c', taskId: 'team-2-T2', media }, crypto.randomUUID()), /REGION_NOT_UNLOCKED/);
  assert.equal(view.tasks.filter(task => task.boardId === 'team-2').length, 25);
  const hidden = stateView({ ...state, teams: state.teams.map(team => ({ ...team, regionId: null })) }, player);
  assert(hidden.tasks.filter(task => task.sharedSlot.startsWith('P')).every(task => task.title == null && task.brief == null));
  assert.equal(hidden.tasks.filter(task => task.sharedSlot.startsWith('D') && task.title).length, 30);
});
