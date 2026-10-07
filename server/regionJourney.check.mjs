import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { seedState, executeCommand, stateView, exportBackup, restoreBackup, visibleMedia } from './rules.mjs';

const staff = { id: 'journey-staff', role: 'staff', manage: true, review: true };
const player = { id: 'journey-player', role: 'player', teamId: 'team-1' };
const call = (state, actor, body) => executeCommand(state, actor, body, randomUUID());
const media = { name: 'opening.png', mime: 'image/png', base64: (await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer()).toString('base64') };
async function fixture() {
  const state = seedState([staff, player]);
  await call(state, staff, { type: 'transition', status: 'RUNNING' });
  const arrival = await call(state, player, { type: 'submit', kind: 'arrival', regionId: 'stage-a', media });
  await call(state, staff, { type: 'review', submissionId: arrival.submission.id, result: 'approve' });
  return state;
}

test('主动前往下一区域后必须进入开场谜题，重载仍保持，只有工作人员审核才换区', async () => {
  const state = await fixture();
  await call(state, player, { type: 'begin_region_opening', regionId: 'stage-b' });
  assert.equal(stateView(state, player).regionJourney.targetRegionId, 'stage-b');
  assert.equal(stateView(state, player).team.regionId, 'stage-a');
  const restored = restoreBackup(exportBackup(state));
  assert.equal(stateView(restored, player).regionJourney.required, true);
  await assert.rejects(call(restored, player, { type: 'submit', kind: 'task', regionId: 'stage-a', taskId: 'T01', media }), /REGION_OPENING_REQUIRED/);
  const next = await call(restored, player, { type: 'submit', kind: 'arrival', regionId: 'stage-b', media });
  assert.equal(stateView(restored, player).team.regionId, 'stage-a');
  await call(restored, staff, { type: 'review', submissionId: next.submission.id, result: 'approve' });
  assert.equal(stateView(restored, player).team.regionId, 'stage-b');
  assert.equal(stateView(restored, player).regionJourney.required, false);
});

test('第五项任务审核通过后自动进入下一区域开场谜题，第六项不能继续提交', async () => {
  const state = await fixture();
  for (const taskId of ['T01', 'T02', 'T03', 'T04', 'T05']) {
    const item = await call(state, player, { type: 'submit', kind: 'task', regionId: 'stage-a', taskId, media });
    await call(state, staff, { type: 'review', submissionId: item.submission.id, result: 'approve' });
  }
  const view = stateView(state, player);
  assert.equal(view.regionJourney.required, true);
  assert.equal(view.regionJourney.completed, 5);
  assert.equal(view.regionJourney.targetRegionId, 'stage-b');
  assert.equal(view.team.regionId, 'stage-a');
  await assert.rejects(call(state, player, { type: 'submit', kind: 'task', regionId: 'stage-a', taskId: 'T06', media }), /REGION_OPENING_REQUIRED/);
});

test('工作人员配置独立开场照片，玩家只在进入该谜题时读取，原图与审核快照保留', async () => {
  const state = await fixture();
  await call(state, staff, { type: 'opening_puzzle_configure', regionId: 'stage-b', title: '开场谜题', prompt: '复刻入口参考照片的地点与角度。', media, reason: '确认区域入口照片' });
  const configured = stateView(state, staff).openingPuzzles['stage-b'];
  assert.equal(configured.configured, true);
  assert.equal(stateView(state, player).openingPuzzle, null);
  assert.throws(() => visibleMedia(state, player, configured.mediaId), /FORBIDDEN/);
  await call(state, player, { type: 'begin_region_opening', regionId: 'stage-b' });
  assert.equal(stateView(state, player).openingPuzzle.mediaId, configured.mediaId);
  assert.equal(visibleMedia(state, player, configured.mediaId).base64, media.base64);
  const arrival = await call(state, player, { type: 'submit', kind: 'arrival', regionId: 'stage-b', media });
  assert.equal(arrival.submission.openingPuzzle.mediaId, configured.mediaId);
  await assert.rejects(call(state, player, { type: 'opening_puzzle_configure', regionId: 'stage-b', media, reason: '伪造配置' }), /FORBIDDEN/);
});

test('第五项待审不提前换区，但禁止挤入第六项；打回后释放提交名额', async () => {
  const state = await fixture();
  for (const taskId of ['T01', 'T02', 'T03', 'T04']) {
    const item = await call(state, player, { type: 'submit', kind: 'task', regionId: 'stage-a', taskId, media });
    await call(state, staff, { type: 'review', submissionId: item.submission.id, result: 'approve' });
  }
  const fifth = await call(state, player, { type: 'submit', kind: 'task', regionId: 'stage-a', taskId: 'T05', media });
  assert.equal(stateView(state, player).regionJourney.required, false);
  assert.equal(stateView(state, player).regionJourney.pending, 1);
  await assert.rejects(call(state, player, { type: 'submit', kind: 'task', regionId: 'stage-a', taskId: 'T06', media }), /REGION_TASKS_PENDING/);
  await call(state, staff, { type: 'review', submissionId: fifth.submission.id, result: 'reject', reason: '需重交' });
  await call(state, player, { type: 'submit', kind: 'task', regionId: 'stage-a', taskId: 'T06', media });
});

test('开场待审不能重复提交，打回后仍停留在开场流程而非回到旧区域任务', async () => {
  const state = await fixture();
  const next = await call(state, player, { type: 'submit', kind: 'arrival', regionId: 'stage-b', media });
  await assert.rejects(call(state, player, { type: 'submit', kind: 'arrival', regionId: 'stage-b', media }), /ARRIVAL_REVIEW_PENDING/);
  await call(state, staff, { type: 'review', submissionId: next.submission.id, result: 'reject', reason: '角度不符' });
  assert.equal(stateView(state, player).regionJourney.required, true);
  assert.equal(stateView(state, player).team.regionId, 'stage-a');
  await call(state, player, { type: 'submit', kind: 'arrival', regionId: 'stage-b', media });
});
