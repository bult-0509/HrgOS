/** 区域目标仅由顺序、后台状态与队伍的主动出发请求产生。 */
export function regionJourney(state, team) {
  const next = state.config.regions[state.config.regions.indexOf(team.regionId) + 1] ?? null;
  const completed = Object.values(state.awards).filter(award => award.teamId === team.id && award.regionId === team.regionId).length;
  const limitReached = completed >= state.config.taskLimit;
  const pending = new Set(state.submissions.filter(item => item.kind === 'task' && item.teamId === team.id && item.regionId === team.regionId && item.status === 'QUEUED' && !state.awards[item.taskId]).map(item => item.taskId)).size;
  const required = !team.finishedAt && (!team.regionId || limitReached || !!team.openingRegionId && team.openingRegionId === next);
  return { required, targetRegionId: next, reason: !team.regionId ? 'first' : limitReached ? next ? 'limit' : 'finish' : team.openingRegionId ? 'manual' : null, completed, pending, limit: state.config.taskLimit };
}
