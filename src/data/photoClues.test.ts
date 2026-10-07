import { describe, expect, it } from 'vitest';
import { bingoSlots, getPhotoClue, photoRegions } from './photoClues';

describe('共享图寻资源', () => {
  it('既定5×5布局包含19张图寻及6项直接任务', () => {
    expect(bingoSlots).toHaveLength(25);
    expect(bingoSlots.filter(slot => slot.startsWith('D'))).toEqual(['D01','D02','D03','D04','D05','D06']);
    expect(bingoSlots.filter(slot => slot.startsWith('P')).map(slot => Number(slot.slice(1))).sort((a,b) => a-b)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19]);
    expect(bingoSlots[9]).toBe('P01');
    expect(bingoSlots[24]).toBe('P09');
  });
  it('同一编号随区域切换，预览、清晰图和原尺寸分别加载', () => {
    expect(getPhotoClue('stage-a','P19')?.original).toBe('/images/photo-clues/region-1/19.png');
    expect(getPhotoClue('stage-b','P19')?.preview).toBe('/images/photo-clues/region-2/19-preview.webp');
    expect(getPhotoClue('stage-c','P19')?.detail).toBe('/images/photo-clues/region-3/19.webp');
    expect(photoRegions).toHaveLength(3);
  });
  it('直接任务、越界编号和未知区域不会错误映射到照片', () => {
    for(const slot of ['D01','P00','P20','P1','P99','']) expect(getPhotoClue('stage-b',slot)).toBeNull();
    expect(getPhotoClue('unknown','P01')).toBeNull();
  });
  it('区域2的P01改用备用SK-II照片，三个层级都不再引用开场展览馆照片', () => {
    const photo = getPhotoClue('stage-b', 'P01');
    expect(photo?.preview).toBe('/images/photo-clues/region-2/01-skii-v1-preview.webp');
    expect(photo?.detail).toBe('/images/photo-clues/region-2/01-skii-v1.webp');
    expect(photo?.original).toBe('/images/photo-clues/region-2/01-skii-v1.png');
    expect(photo?.number).toBe(1);
    expect(getPhotoClue('stage-a', 'P01')?.original).toBe('/images/photo-clues/region-1/01.png');
    expect(getPhotoClue('stage-c', 'P01')?.original).toBe('/images/photo-clues/region-3/01.png');
  });
});
