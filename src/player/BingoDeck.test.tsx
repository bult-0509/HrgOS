import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BingoDeck } from './BingoDeck';

describe('共享 Bingo 切换入口', () => {
  it('只显示上一张和下一张两个切换按钮，不再显示底部五队入口', () => {
    const html = renderToStaticMarkup(<BingoDeck
      actorTeamId="team-1" approvedRegionId="stage-a" onSelect={() => {}}
      boards={Array.from({ length: 5 }, (_, index) => ({ id: `team-${index + 1}`, name: `队伍${index + 1}`, items: [] }))}
    />);
    const controls = html.match(/<nav[^>]*aria-label="切换任务棋盘"[\s\S]*?<\/nav>/)?.[0] ?? '';
    expect((controls.match(/<button /g) ?? [])).toHaveLength(2);
    expect(controls).toContain('aria-label="上一张 Bingo"');
    expect(controls).toContain('aria-label="下一张 Bingo"');
    expect(controls).not.toContain('队伍1');
    expect(controls).not.toContain('<img');
  });
});
