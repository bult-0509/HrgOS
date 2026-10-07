import { readFile } from 'node:fs/promises';

/** 固定项目素材，不接受客户端提供的文件路径；正式页面通过鉴权后的media接口读取。 */
export async function loadOpeningPhotoPreset() {
  const directory = new URL('../assets/opening-photo-set/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
  const ids = ['stage-a', 'stage-b', 'stage-c'];
  if (manifest.photos.length !== 3 || manifest.photos.some((photo, index) => photo.regionId !== ids[index] || photo.file !== `region-${index + 1}.webp`)) throw new Error('开场照片区域顺序不符');
  const photos = await Promise.all(manifest.photos.map(async photo => ({
    ...photo,
    media: { name: photo.file, mime: 'image/webp', base64: (await readFile(new URL(photo.file, directory))).toString('base64') }
  })));
  return { version: manifest.version, photos };
}
