import { taskScoreRules } from './scoring.mjs';

const slots = ['D01','P02','P19','P05','P11','P04','P17','D02','P12','P01','P13','P14','D03','P16','D04','P18','D05','P06','P08','P10','P07','P03','P15','D06','P09'];
export function bingoSlotForTask(state, task) {
  if (task.sharedSlot) return task.sharedSlot;
  const board = state.config.tasks.filter(item => item.boardId === task.boardId);
  return slots[board.indexOf(task)];
}
export const bingoBoardDefinitions = [
  { id: 'team-1', name: 'Phigros队' }, { id: 'team-2', name: 'Arcaea队' },
  { id: 'team-3', name: '范式起源队' }, { id: 'team-4', name: 'maimai队' }, { id: 'team-5', name: '全能队' }
];

// boardId只是分类，不用于验证参赛队伍；旧版单棋盘赛局继续可用。
export function normalizeBingoTasks(tasks, requireRule) {
  requireRule(Array.isArray(tasks) && [25, 125].includes(tasks.length) && new Set(tasks.map(task => task?.id)).size === tasks.length && tasks.every(task => task && typeof task.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(task.id) && typeof task.title === 'string' && task.title.trim() && task.title.length <= 100 && typeof task.brief === 'string' && task.brief.trim() && task.brief.length <= 2000 && Number.isSafeInteger(task.points) && task.points > 0 && task.points <= 10000), 'TASK_CONFIG_INVALID', 400);
  const fiveBoards = tasks.length === 125;
  requireRule(!fiveBoards || tasks.every(task => bingoBoardDefinitions.some(board => board.id === task.boardId)) && bingoBoardDefinitions.every(board => tasks.filter(task => task.boardId === board.id).length === 25), 'BINGO_BOARD_CONFIG_INVALID', 400);
  // 不允许把25项旧任务标成多个残缺棋盘，或通过未知分类伪造五张卡。
  requireRule(fiveBoards || tasks.every(task => task.boardId == null), 'BINGO_BOARD_CONFIG_INVALID', 400);
  requireRule(tasks.every(task => task.sharedSlot == null || /^(P(0[1-9]|1[0-9])|D0[1-6])$/.test(task.sharedSlot)), 'BINGO_SLOT_CONFIG_INVALID', 400);
  for (const group of fiveBoards ? bingoBoardDefinitions.map(board => tasks.filter(task => task.boardId === board.id)) : [tasks]) {
    const explicitSlots = group.filter(task => task.sharedSlot != null);
    // 指定格位时必须完整定义25格，否则无法保证19+6及图像对应关系。
    requireRule(!explicitSlots.length || explicitSlots.length === 25 && new Set(explicitSlots.map(task => task.sharedSlot)).size === 25, 'BINGO_SLOT_CONFIG_INVALID', 400);
  }
  const normalized = tasks.map(task => {
    const { id, title, brief, points, boardId, sharedSlot } = task;
    return { id, title, brief, points, ...taskScoreRules(task, requireRule), ...(fiveBoards ? { boardId } : {}), ...(sharedSlot ? { sharedSlot } : {}), image: '/hrg-mark.svg' };
  });
  return fiveBoards ? bingoBoardDefinitions.flatMap(board => {
    const items = normalized.filter(task => task.boardId === board.id);
    return items.every(task => task.sharedSlot) ? items.sort((a, b) => slots.indexOf(a.sharedSlot) - slots.indexOf(b.sharedSlot)) : items;
  }) : normalized;
}
