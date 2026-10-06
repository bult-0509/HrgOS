import catalog from '../../outputs/task-integration-20261006/integrated-data.json';
import { bingoSlots } from './photoClues';
import { bingoBoardDefinitions } from './bingoBoards';
import type { Task } from '../types';

// 五套真正独立的任务，棋盘名称不决定哪支队伍可以提交。
const games = ['Phigros', 'Arcaea', '范式起源', 'maimai', '通用'];
export const initialSharedBingoTasks: Task[] = bingoBoardDefinitions.flatMap((board, index) =>
  catalog.filter(item => item.game === games[index]).map(item => ({
    id: board.id + '-T' + String(item.n).padStart(2, '0'),
    boardId: board.id,
    sharedSlot: bingoSlots[item.n - 1],
    regionId: 'stage-b',
    title: item.name,
    brief: item.text,
    points: 0,
    pointsConfigured: false,
    configured: true,
    difficulty: item.difficulty === '易' ? '轻松' : item.difficulty === '中' ? '标准' : '挑战',
    state: 'available',
    imageTone: 'tone-cyan'
  }))
);
