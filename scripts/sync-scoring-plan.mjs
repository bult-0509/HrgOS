import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const plan = JSON.parse(await fs.readFile(new URL('../outputs/task-integration-20261006/bingo-score-plan.json', import.meta.url), 'utf8'));
const boardIds = ['team-1', 'team-2', 'team-3', 'team-4', 'team-5'];
if (plan.tasks.length !== 125 || new Set(plan.tasks.map(task => task.taskId)).size !== 125) throw new Error('必须有125个不同任务');
const tasks = boardIds.flatMap(boardId => {
  const board = plan.tasks.filter(task => task.teamId === boardId).sort((a, b) => a.cellIndex - b.cellIndex);
  if (board.length !== 25 || new Set(board.map(task => task.slot)).size !== 25 || board.reduce((total, task) => total + task.score, 0) !== 4000) throw new Error(`棋盘预算或格位错误：${boardId}`);
  return board.map(task => ({
    id: task.taskId, boardId, sharedSlot: task.slot, title: task.name, brief: task.text,
    points: task.score, difficulty: task.difficulty,
    ...(task.bonus ? { bonus: { points: task.bonus, threshold: 2990000, comparison: 'gte' } } : {}),
    ...(task.penalty ? { failurePenalty: task.penalty } : {})
  }));
});
const catalog = {
  version: 'hrg-20261007-v1', boardBudget: 4000, extremePoints: 400,
  taskLimit: 5, finishRewards: plan.rules.finishRewards, boardRewards: [], tasks
};
const target = new URL('../src/data/scoringRules.json', import.meta.url);
await fs.writeFile(target, JSON.stringify(catalog, null, 2) + '\n');
console.log(`已同步 ${tasks.length} 项正式规则到 ${fileURLToPath(target)}`);
