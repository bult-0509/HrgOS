import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlayerApp } from './PlayerApp';
import { initialTasks, initialBingoTasks, initialAuditQueue, teams } from '../data/mock';
import { reviewAudit, type ReviewState } from '../domain/regionProgress';

const noop = () => {};
const markup = (regionId: string | null) => renderToStaticMarkup(<PlayerApp team={teams[0]} tasks={initialBingoTasks} approvedRegionId={regionId} cards={[]} messages={[]} onLogout={noop} onSubmitTask={noop} onUseCard={noop} onReadMessage={noop} />);

describe('玩家照片棋盘', () => {
  it('玩家页面展示传入队伍的队名、分数、排名和定位标记，不固定为 Phigros队', () => {
    for (const team of teams) {
      const html = renderToStaticMarkup(<PlayerApp team={team} tasks={initialBingoTasks} approvedRegionId="stage-b" cards={[]} messages={[]} onLogout={noop} onSubmitTask={noop} onUseCard={noop} onReadMessage={noop} />);
      expect(html).toContain(`${team.name}当前信息`);
      expect(html).toContain(`<b>${team.score}</b> PTS`);
      expect(html).toContain(`#${String(team.rank).padStart(2, '0')}`);
      expect(html).toContain(`<i>${team.shortName}</i>`);
      if (team.id !== 'team-1') expect(html).not.toContain('Phigros队');
    }
  });
  it('默认区域展示25格，但任务名称与清晰照片只在点开后出现', () => {
    const html = markup('stage-b');
    expect((html.match(/class="bingo-cell bingo-cell--/g) ?? [])).toHaveLength(25);
    expect(html).toContain('/images/photo-clues/region-2/01-preview.webp');
    expect(html).not.toContain('/images/photo-clues/region-2/01.webp');
    expect(html).not.toContain('同步判定');
    expect(html).not.toContain('Crosshair');
    expect(html).toContain('暂停动效');
  });
  it('区域进度为只读标记，玩家没有区域切换按钮', () => {
    const html=markup('stage-b');
    const indicators=html.match(/<ol class="bingo-regions[^\"]*"[\s\S]*?<\/ol>/)?.[0];
    expect(indicators).toBeDefined();
    expect(indicators).not.toContain('<button');
    expect(indicators).toContain('aria-current="step"');
    expect(indicators).toContain('待工作人员审核');
    expect(html).not.toContain('区域任务浏览');
  });
  it('审核批准后19张图一起换区，25项任务及分数、审核状态保持一致', () => {
    const state: ReviewState={teams,auditQueue:[{...initialAuditQueue[1],teamId:'team-1',targetRegionId:'stage-c'}],regionProgress:{'team-1':{currentRegionId:'stage-b',version:2}},regionAuditLog:[]};
    const next=reviewAudit(state,{itemId:'A-109',result:'approve',actor:'staff',operatorId:'staff',reviewedAt:'2026-10-06T00:00:00Z'});
    const before=markup(state.regionProgress['team-1'].currentRegionId),after=markup(next.regionProgress['team-1'].currentRegionId);
    expect(after).not.toContain('/region-2/');
    expect((after.match(/class="photo-preview /g) ?? [])).toHaveLength(19);
    expect(after).toContain('/region-3/01-preview.webp');
    expect((after.match(/class="bingo-cell bingo-cell--/g) ?? [])).toHaveLength(25);
    for(const status of ['pending','awarded','direct']) expect((after.match(new RegExp(`bingo-cell--${status}`,'g'))??[]).length).toBe((before.match(new RegExp(`bingo-cell--${status}`,'g'))??[]).length);
    expect(initialBingoTasks.find(t=>t.id==='T-202')?.pendingCount).toBe(2);
  });
  it('没有有效后台区域时不猜测区域，也不加载后续图片', () => {
    for(const id of [null,'invalid']) {
      const html=markup(id);
      expect(html).not.toContain('/images/photo-clues/region-');
      expect(html).toContain('等待工作人员审核区域入口');
    }
  });
  it('扩展的演示格不会杜撰正式任务文案或分值', () => {
    const missing = initialTasks.find(task => task.regionId === 'stage-b' && task.sharedSlot === 'P10');
    expect(missing?.configured).toBe(false);
    expect(missing?.brief).toBe('正式任务内容待工作人员配置。');
    expect(initialTasks.find(task => task.id === 'T-202')?.pendingCount).toBe(2);
  });
});
