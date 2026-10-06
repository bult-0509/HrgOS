import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { bingoBoardDefinitions, cyclicBoardOffset, groupBingoTasks } from './bingoBoards';
import { initialSharedBingoTasks } from './sharedBingoTasks';
import { PlayerApp } from '../player/PlayerApp';
import { teams } from './mock';

describe('五张共享 Bingo 与身份解耦', () => {
  it('已有任务来源提供125个独立ID，每张25项和19+6共享图片格位', () => {
    expect(initialSharedBingoTasks).toHaveLength(125);
    expect(new Set(initialSharedBingoTasks.map(task => task.id)).size).toBe(125);
    const boards = groupBingoTasks(initialSharedBingoTasks, 'team-1', 'Phigros队');
    expect(boards).toHaveLength(5);
    for (const board of boards) {
      expect(board.tasks).toHaveLength(25);
      expect(board.tasks.filter(task => task.sharedSlot?.startsWith('P'))).toHaveLength(19);
      expect(board.tasks.filter(task => task.sharedSlot?.startsWith('D'))).toHaveLength(6);
      expect(board.tasks.every(task => task.title && task.brief && task.pointsConfigured && task.points > 0)).toBe(true);
      expect(board.tasks.reduce((total, task) => total + task.points, 0)).toBe(4000);
    }
  });
  it('所有身份均可获得五套任务，登录身份不成为任务过滤条件', () => {
    const all = bingoBoardDefinitions.map(board => board.id);
    for (const team of teams) expect(groupBingoTasks(initialSharedBingoTasks, team.id, team.name).map(board => board.id)).toEqual(all);
  });
  it('循环偏移始终为-2到2，每次选择只有一张中心卡', () => {
    for (let active = 0; active < 5; active++) expect(Array.from({ length: 5 }, (_, i) => cyclicBoardOffset(i, active, 5)).sort()).toEqual([-1, -2, 0, 1, 2].sort());
  });
  it('侧卡不会出现隐藏任务按钮或详情，也不伪造分数', () => {
    const noop = () => {};
    const html = renderToStaticMarkup(<PlayerApp team={teams[0]} tasks={initialSharedBingoTasks} approvedRegionId="stage-b" cards={[]} messages={[]} onLogout={noop} onSubmitTask={noop} onUseCard={noop} onReadMessage={noop} />);
    expect((html.match(/class="bingo-cell bingo-cell--/g) ?? [])).toHaveLength(25);
    expect((html.match(/class="bingo-deck__card"/g) ?? [])).toHaveLength(5);
    expect(html).toContain('下一张 Bingo');
    expect(html).not.toContain('板子别动！');
    expect(html).not.toContain('不转板ap inferior');
    expect(html).not.toContain('<b>0</b>');
  });
});
