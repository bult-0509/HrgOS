import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { bingoSlots } from '../data/photoClues';
import { TeamBingo, photoSlotFor } from './TeamBingo';
import { teamBingoThemes, getTeamBingoTheme } from './teamBingoThemes';
import { LiveTaskBoard } from '../ability/LiveTaskBoard';

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
    const directCells = html.match(/<button[^>]*bingo-cell--direct[^>]*>[\s\S]*?<\/button>/g) ?? [];
    expect(directCells).toHaveLength(6);
    for (const cell of directCells) {
      expect(cell).not.toContain('<svg');
      expect(cell).not.toContain('bingo-cell__direct-art');
      expect(cell).not.toContain('bingo-cell__number');
      expect(cell).toContain('bingo-cell__footer');
    }
    expect(html).not.toContain('/region-2/');
  });
  it('未经审核的区域不加载图寻资产，也没有换区控件', () => {
    const html = markup('team-1', null);
    expect(html).not.toContain('/images/photo-clues/region-');
    const progress = html.match(/<ol[\s\S]*?<\/ol>/)?.[0];
    expect(progress).toBeDefined();
    expect(progress).not.toContain('<button');
  });
  it('格子删除可见编号和难度徽标，仍保留分数、图号与难度的读屏标签', () => {
    const html = renderToStaticMarkup(<TeamBingo teamId="team-1" teamName="本队" approvedRegionId="stage-b" items={items.map(item => ({...item,difficulty:'中'}))} onSelect={() => {}} />);
    expect(html).not.toContain('class="bingo-cell__number"');
    expect(html).not.toContain('class="tb-difficulty"');
    expect(html).toContain('图寻图片 #1');
    expect(html).toContain('，中，5分');
    expect(html).toContain('bingo-cell__footer');
  });
  it('图寻通过或待审不标记完成，已完成格即使图寻仍锁定也保留完成状态', () => {
    const statuses = items.map((item,index) => ({...item,state:'locked' as const,photoStatus:index===1?'pending' as const:'approved' as const,completed:index===2}));
    const html = renderToStaticMarkup(<TeamBingo teamId="team-1" teamName="本队" approvedRegionId="stage-b" items={statuses} onSelect={() => {}} />);
    expect((html.match(/data-completed="true"/g) ?? []).length).toBe(1);
    const completed = html.match(/<button[^>]*data-task-id="T3"[\s\S]*?<\/button>/)?.[0];
    expect(completed).toContain('bingo-cell--locked');
    expect(completed).toContain('任务已完成');
    expect(completed).toContain('lucide-check');
    expect(completed).not.toContain('lucide-lock-keyhole');
  });
  it('正式页面未解锁题面不妨碍展示后台的完成状态', () => {
    const html = renderToStaticMarkup(<LiveTaskBoard team={{id:'team-1',name:'本队',regionId:'stage-b'}} tasks={[{id:'secret',sharedSlot:'P01',title:'不能泄露的题面',points:5,difficulty:'易',completed:true,awarded:false,taskUnlocked:false,photoStatus:'locked'}]} status="RUNNING" busy={false} blocked={false} submissions={[]} submit={async()=>{}} />);
    expect(html).toContain('data-completed="true"');
    expect(html).toContain('任务已完成');
    expect(html).not.toContain('不能泄露的题面');
    expect(html).toContain('bingo-cell--locked');
  });
});
