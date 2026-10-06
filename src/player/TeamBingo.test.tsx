import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { bingoSlots } from '../data/photoClues';
import { TeamBingo, photoSlotFor } from './TeamBingo';
import { teamBingoThemes, getTeamBingoTheme } from './teamBingoThemes';

const items = bingoSlots.map((slot, index) => ({ id: `T${index + 1}`, slot, state: 'available' as const, points: 5 }));
const markup = (teamId: string, regionId: string | null) => renderToStaticMarkup(<TeamBingo teamId={teamId} teamName="本队" approvedRegionId={regionId} items={items} onSelect={() => {}} />);

describe('共享队伍棋盘美术', () => {
  it('五队分别使用自己的角色和独立边框，角色 DOM 在棋盘底板之前', () => {
    const frames = new Set<string>();
    for (const [teamId, theme] of Object.entries(teamBingoThemes)) {
      const html = markup(teamId, 'stage-b');
      expect(html).toContain(`data-bingo-theme="${theme.id}"`);
      expect(html).toContain(`/images/team-bingo/${theme.mascot}.webp`);
      expect(html).toContain(`/images/team-bingo/frame-${theme.id}.svg`);
      expect(html.indexOf('class="tb-mascot"')).toBeLessThan(html.indexOf('class="tb-board-surface"'));
      frames.add(theme.id);
    }
    expect(frames.size).toBe(5);
  });
  it('不将未知队伍误配为某个游戏队', () => {
    expect(getTeamBingoTheme('unknown')).toBeUndefined();
    expect(markup('unknown', 'stage-a')).toContain('data-bingo-theme="neutral"');
    expect(markup('unknown', 'stage-a')).not.toContain('class="tb-mascot"');
  });
  it('后端任务编号与图寻格位解耦，19 张图加6项直接任务', () => {
    expect(photoSlotFor({ slot: 'P01' }, 0)).toBe('P01');
    expect(photoSlotFor({ slot: 'T01' }, 0)).toBe(bingoSlots[0]);
    expect(photoSlotFor({}, 2)).toBe(bingoSlots[2]);
    const html = markup('team-1', 'stage-c');
    expect((html.match(/class="photo-preview /g) ?? []).length).toBe(19);
    expect((html.match(/bingo-cell--direct tb-cell/g) ?? []).length).toBe(6);
    expect(html).not.toContain('/region-2/');
  });
  it('未经审核的区域不加载图寻资产，也没有换区控件', () => {
    const html = markup('team-1', null);
    expect(html).not.toContain('/images/photo-clues/region-');
    const progress = html.match(/<ol[\s\S]*?<\/ol>/)?.[0];
    expect(progress).toBeDefined();
    expect(progress).not.toContain('<button');
  });
});
