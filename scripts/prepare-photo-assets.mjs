import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const sharp=require('C:/Users/24175/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root=process.cwd();
const records=JSON.parse(await fs.readFile(path.join(root,'outputs/photo-final-20261006/成品清单.json'),'utf8'));
const overrides=JSON.parse(await fs.readFile(path.join(root,'assets/photo-clue-overrides.json'),'utf8'));
let bytes=0;
for(const item of records){
 const override=overrides.find(patch=>patch.region===item.region&&patch.sharedSlot===item.sharedSlot);
 const source=override?path.join(root,override.source):path.join(root,'outputs/photo-final-20261006',item.output),folder=path.join(root,'public/images/photo-clues',`region-${item.region}`),number=override?.basename??String(item.number).padStart(2,'0');
 await fs.mkdir(folder,{recursive:true});
 // Delivery derivatives only: no crop, restyle, redaction or change to the numbered artwork.
 await sharp(source).resize({width:480,height:480,fit:'inside',withoutEnlargement:true}).webp({quality:78}).toFile(path.join(folder,`${number}-preview.webp`));
 await sharp(source).resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).webp({quality:94}).toFile(path.join(folder,`${number}.webp`));
 await fs.copyFile(source,path.join(folder,`${number}.png`));
 bytes+=(await fs.stat(path.join(folder,`${number}-preview.webp`))).size;
}
console.log(JSON.stringify({photos:records.length,previewBytes:bytes,sourceArtwork:'unchanged PNG copies'},null,2));
