import catalog from './scoringRules.json';
import type { Task } from '../types';
// 与正式后端共用一份125项分值与图片格位，按既有棋盘顺序排列。
export const initialSharedBingoTasks: Task[] = catalog.tasks.map(item => ({
  id: item.id,
  boardId: item.boardId,
  sharedSlot: item.sharedSlot,
  regionId: 'stage-b',
  title: item.title,
  brief: item.brief,
  points: item.points,
  pointsConfigured: true,
  scoreDifficulty: item.difficulty as Task['scoreDifficulty'],
  bonus: item.bonus,
  failurePenalty: item.failurePenalty,
  configured: true,
  difficulty: item.difficulty === '易' ? '轻松' : item.difficulty === '中' ? '标准' : '挑战',
  state: 'available',
  imageTone: 'tone-cyan'
}));
