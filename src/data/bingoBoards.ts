export const bingoBoardDefinitions = [
  { id: 'team-1', name: 'Phigros队' },
  { id: 'team-2', name: 'Arcaea队' },
  { id: 'team-3', name: '范式起源队' },
  { id: 'team-4', name: 'maimai队' },
  { id: 'team-5', name: '全能队' }
] as const;

/** 棋盘分类和参赛身份独立。旧25项赛局只显示真实的一套任务，不复制为125项。 */
export function groupBingoTasks<T extends { boardId?: string }>(tasks: T[], actorTeamId: string, actorTeamName: string) {
  if (!tasks.some(task => task.boardId)) return [{ id: actorTeamId, name: actorTeamName, tasks }];
  return bingoBoardDefinitions.map(board => ({ ...board, tasks: tasks.filter(task => task.boardId === board.id) }));
}

export function cyclicBoardOffset(index: number, active: number, count: number) {
  const offset = (index - active + count) % count;
  return offset > Math.floor(count / 2) ? offset - count : offset;
}
