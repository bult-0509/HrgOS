import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { OpeningPuzzleEditor } from './OpeningPuzzleEditor';

it('工作人员可明确载入按区域顺序确认的三张开场图，比赛结束后不再更换', () => {
  const props = { puzzles: {}, busy: false, finished: false, run: async () => {}, renderImage: () => null };
  const html = renderToStaticMarkup(<OpeningPuzzleEditor {...props} />);
  expect(html).toContain('载入本次确认的三张开场图');
  expect(html).toContain('01 西湖文化广场外立面 → 02 浙江展览馆 → 03 工联招牌');
  expect(html).toContain('待审提交仍使用提交时的参考图');
  expect(html).not.toContain('具体图片待确认');
  const finished = renderToStaticMarkup(<OpeningPuzzleEditor {...props} finished />);
  expect(finished).toMatch(/<button[^>]*disabled=""[^>]*>载入本次确认的三张开场图<\/button>/);
});
