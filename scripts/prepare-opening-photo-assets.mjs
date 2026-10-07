import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const directory = path.resolve('assets/opening-photo-set');
const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'));
const records = [];
for (const photo of manifest.photos) {
  const source = path.join(directory, photo.master);
  const metadata = await sharp(source).metadata();
  if (metadata.width !== photo.width || metadata.height !== photo.height) throw new Error(`开场图尺寸不符：${photo.regionId}`);
  // 只制作不裁切的交付格式；美术化处理已由 imagegen 完成。
  await sharp(source).webp({ quality: 94 }).toFile(path.join(directory, photo.file));
  const master = await fs.readFile(source), display = await fs.readFile(path.join(directory, photo.file));
  records.push({ ...photo, masterBytes: master.length, displayBytes: display.length, masterSha256: createHash('sha256').update(master).digest('hex'), displaySha256: createHash('sha256').update(display).digest('hex') });
}
const out = path.resolve('outputs/opening-photos-20261007');
await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, '交付校验.json'), JSON.stringify({ version: manifest.version, crop: false, records }, null, 2));
console.log(JSON.stringify({ openings: records.length, regionOrder: records.map(photo => photo.region), attachmentOrder: records.map(photo => photo.attachmentOrder), displayBytes: records.reduce((sum, photo) => sum + photo.displayBytes, 0) }));
