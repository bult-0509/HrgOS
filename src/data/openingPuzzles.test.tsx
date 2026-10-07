import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { getOpeningPuzzle } from './openingPuzzles';
import { RegionTaskArea } from '../player/RegionTaskArea';

it('三张开场参考图按区域1、2、3呈现，不按附件顺序或P编号展示', () => {
  for (const [regionId, attachment, imageName, width, height] of [
    ['stage-a', 3, 'region-1.webp', 1448, 1086],
    ['stage-b', 1, 'region-2.webp', 1448, 1086],
    ['stage-c', 2, 'region-3.webp', 1853, 849]
  ] as const) {
    const puzzle = getOpeningPuzzle(regionId);
    expect(puzzle?.configured).toBe(true);
    expect(puzzle?.attachmentOrder).toBe(attachment);
    expect(puzzle?.imageSrc).toContain(imageName);
    const html = renderToStaticMarkup(<RegionTaskArea teamId="team-1" approvedRegionId={null} journey={{ required: true, targetRegionId: regionId, reason: 'first', completed: 0, limit: 5 }} puzzle={puzzle}><div>旧棋盘</div></RegionTaskArea>);
    expect(html).toContain(`width="${width}" height="${height}"`);
    expect(html).not.toContain('开场照片待确认');
    expect(html).not.toContain('旧棋盘');
    expect(html).not.toContain('photo-clues/');
  }
  expect(getOpeningPuzzle('unknown')).toBeNull();
  expect(getOpeningPuzzle(null)).toBeNull();
});
