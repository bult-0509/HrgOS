import { bingoSlotForTask } from './bingoBoards.mjs';

// 旧版纯任务测试赛局无照片目录；正式五卡及显式照片格位一律启用图寻门槛。
export const photoFindsEnabled = state => state.config.tasks.some(task => task.boardId || /^P\d{2}$/.test(task.sharedSlot ?? ''));
export const validPhotoSlot = slot => /^P(0[1-9]|1[0-9])$/.test(slot ?? '');

export function photoFindStatus(state, teamId, regionId, slot) {
  if (!regionId || !validPhotoSlot(slot)) return 'locked';
  if (state.photoFinds?.[teamId]?.[regionId]?.[slot]?.status === 'approved') return 'approved';
  const items = state.submissions.filter(item => item.kind === 'photo' && item.teamId === teamId && item.regionId === regionId && item.photoSlot === slot);
  if (items.some(item => item.status === 'QUEUED')) return 'pending';
  return items.at(-1)?.status === 'REJECTED_RESUBMIT' ? 'rejected' : 'locked';
}

export function taskIsRevealed(state, team, task) {
  if (!photoFindsEnabled(state)) return !!team.regionId;
  const slot = bingoSlotForTask(state, task);
  return !validPhotoSlot(slot) || photoFindStatus(state, team.id, team.regionId, slot) === 'approved';
}

export function approvePhotoFind(state, item, actor) {
  state.photoFinds ??= {};
  state.photoFinds[item.teamId] ??= {};
  state.photoFinds[item.teamId][item.regionId] ??= {};
  state.photoFinds[item.teamId][item.regionId][item.photoSlot] ??= {
    status: 'approved', submissionId: item.id, approvedAt: state.now, operatorId: actor.id
  };
  item.status = 'APPROVED';
}
