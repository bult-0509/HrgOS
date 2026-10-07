export const photoRegions = [
  { id: 'stage-a', number: 1, letter: 'A', name: '西湖文化广场' },
  { id: 'stage-b', number: 2, letter: 'B', name: '武林广场' },
  { id: 'stage-c', number: 3, letter: 'C', name: '龙翔桥' }
] as const;

// Existing balanced shared-slot layout. D slots are the six non-photo tasks.
export const bingoSlots = [
  'D01', 'P02', 'P19', 'P05', 'P11',
  'P04', 'P17', 'D02', 'P12', 'P01',
  'P13', 'P14', 'D03', 'P16', 'D04',
  'P18', 'D05', 'P06', 'P08', 'P10',
  'P07', 'P03', 'P15', 'D06', 'P09'
] as const;

export interface PhotoClue {
  number: number;
  slot: string;
  regionId: string;
  preview: string;
  detail: string;
  original: string;
}

// Shared photo lookup is independent of task IDs, teams, ownership and audit state.
export function getPhotoClue(regionId: string, slot: string): PhotoClue | null {
  const region = photoRegions.find(item => item.id === regionId);
  if (!region || !/^P(0[1-9]|1[0-9])$/.test(slot)) return null;
  const number = Number(slot.slice(1));
  // 展览馆已移至区域2开场；P01改用原备用46号照片，版本化地址避免旧预览缓存。
  const filename = regionId === 'stage-b' && slot === 'P01' ? '01-skii-v1' : slot.slice(1);
  const base = `${import.meta.env.BASE_URL}images/photo-clues/region-${region.number}/${filename}`;
  return { number, slot, regionId, preview: `${base}-preview.webp`, detail: `${base}.webp`, original: `${base}.png` };
}
