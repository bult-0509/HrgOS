import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PhotoFindNotice } from './TaskChallenge';

describe('图寻锁定提示', () => {
  it.each(['locked', 'pending', 'rejected'] as const)('%s只展示统一的简短提示，保留审核状态', status => {
    const html = renderToStaticMarkup(<PhotoFindNotice status={status} />);
    expect(html).toContain('<strong>任务锁定中，请先完成图寻。</strong>');
    expect(html).toContain(`data-status="${status}"`);
    expect(html).toContain('role="status"');
    expect(html).not.toContain('<p>');
    expect(html).not.toContain('复刻参考图所在地点与拍摄角度');
    expect(html).not.toContain('<strong>先完成图寻</strong>');
    expect(html).not.toContain('<strong>重新提交图寻</strong>');
  });
});
