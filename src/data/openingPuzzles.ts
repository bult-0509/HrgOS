import type { OpeningPuzzle } from '../player/RegionTaskArea';
import manifest from '../../assets/opening-photo-set/manifest.json';
import regionOne from '../../assets/opening-photo-set/region-1.webp';
import regionTwo from '../../assets/opening-photo-set/region-2.webp';
import regionThree from '../../assets/opening-photo-set/region-3.webp';

export type ConfirmedOpeningPuzzle = OpeningPuzzle & { width: number; height: number; attachmentOrder: number };

const sources: Record<string, string> = { 'stage-a': regionOne, 'stage-b': regionTwo, 'stage-c': regionThree };

/** 仅供本地演示；正式比赛的题图由已鉴权的后台media接口返回。 */
export function getOpeningPuzzle(regionId: string | null): ConfirmedOpeningPuzzle | null {
  const photo = manifest.photos.find(item => item.regionId === regionId);
  return photo ? { regionId: photo.regionId, configured: true, title: '开场谜题', prompt: photo.prompt, imageSrc: sources[photo.regionId], width: photo.width, height: photo.height, attachmentOrder: photo.attachmentOrder, assetId: photo.assetId, sourceVersion: manifest.version } : null;
}
