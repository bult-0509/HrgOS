import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LiveTaskBoard } from './LiveTaskBoard';

describe('区域流程的完赛状态', () => {
  it('工作人员确认完赛后显示已完赛，而不是再次引导前往终点', () => {
    const html = renderToStaticMarkup(<LiveTaskBoard team={{ id: 'team-1', name: 'Phigros队', regionId: 'stage-c', finishedAt: 1 }} tasks={[]} status="RUNNING" busy={false} blocked={false} submissions={[]} submit={async () => {}} />);
    expect(html).toContain('已完赛');
    expect(html).not.toContain('前往终点</h2>');
  });
});
