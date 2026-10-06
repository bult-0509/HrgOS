const {chromium}=require('C:/Users/24175/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sharp=require('C:/Users/24175/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const out=path.resolve('artifacts/team-frames-20261006');await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1050},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
 await page.goto('http://127.0.0.1:3000/previews/team-bingo-event-v3/index.html');
 await page.evaluate(()=>document.fonts.ready);
 const ids=['phigros','arcaea','paradigm','maimai','community'],results=[];
 await page.locator('#motion-toggle').click();
 for(const viewport of [{width:1440,height:1050},{width:375,height:812},{width:768,height:1024},{width:812,height:375}]){
  await page.setViewportSize(viewport);
  for(let i=0;i<ids.length;i++){
   await page.locator('.team-tab').nth(i).click();
   await page.evaluate(async()=>{await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})));});
   const state=await page.evaluate(()=>{
    const frame=document.querySelector('.edge-art'),cells=[...document.querySelectorAll('.cell')];
    const rect=el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height}};
    return {team:document.querySelector('#event-page').dataset.team,frame:rect(frame),src:frame.getAttribute('src'),pointerEvents:getComputedStyle(frame).pointerEvents,cells:cells.map(rect),overflow:document.documentElement.scrollWidth>innerWidth,hit:cells.every(c=>{const b=c.getBoundingClientRect(),y=b.y+b.height/2;if(y<0||y>=innerHeight)return true;return document.elementFromPoint(b.x+b.width/2,y)?.closest('.cell')===c})};
   });
   assert.equal(state.team,ids[i]);assert.equal(state.src,`assets/frame-${ids[i]}.svg`);
   assert.equal(state.pointerEvents,'none');assert.equal(state.cells.length,25);assert.equal(state.overflow,false);assert(state.hit,'格子点击被装饰覆盖');
   assert(state.cells.every(c=>c.width>=44&&c.height>=44),'手机格子过小');
   // 将 SVG 在当前布局尺寸下栅格化，逐像素检查格子内没有边饰。
   const w=Math.round(state.frame.width),h=Math.round(state.frame.height);
   const {data,info}=await sharp(path.resolve(`previews/team-bingo-event-v3/assets/frame-${ids[i]}.svg`)).resize(w,h,{fit:'fill'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   let occupied=0,samples=0;
   for(const c of state.cells){
    const x0=Math.ceil((c.x-state.frame.x)*w/state.frame.width)+1,x1=Math.floor((c.x+c.width-state.frame.x)*w/state.frame.width)-1;
    const y0=Math.ceil((c.y-state.frame.y)*h/state.frame.height)+1,y1=Math.floor((c.y+c.height-state.frame.y)*h/state.frame.height)-1;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){samples++;if(data[(y*info.width+x)*4+3]>12)occupied++;}
   }
   assert.equal(occupied,0,`${ids[i]} ${viewport.width}: 边缘图案侵入了 ${occupied} 个格子像素`);
   for(const index of [0,4,20,24])await page.locator('.cell').nth(index).click({trial:true});
   await page.evaluate(()=>scrollTo(0,0));
   await page.screenshot({path:path.join(out,`${viewport.width}-${ids[i]}.png`),fullPage:true});
   results.push({team:ids[i],viewport:viewport.width,frame:state.src,bounds:state.frame,minCellWidth:Math.min(...state.cells.map(c=>c.width)),minCellHeight:Math.min(...state.cells.map(c=>c.height)),decorationPixelsInCells:occupied,samples});
  }
 }
 await page.setViewportSize({width:1440,height:1050});
 await page.locator('.cell[data-slot=P01]').click();assert(await page.locator('#clue-dialog').evaluate(d=>d.open));
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.dataset.slot),'P01');
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.team-tab').first().click();
 assert.equal(await page.locator('.edge-art').evaluate(el=>getComputedStyle(el).animationName),'none');
 assert.deepEqual(errors,[]);
 const hashes=await Promise.all(ids.map(async id=>require('node:crypto').createHash('sha256').update(await fs.readFile(`previews/team-bingo-event-v3/assets/frame-${id}.svg`)).digest('hex')));
 assert.equal(new Set(hashes).size,5);
 await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({independentFrames:5,checks:results,modalFocusReturn:true,reducedMotion:true,errors},null,2));
 console.log(JSON.stringify({independentFrames:5,viewports:4,checks:results.length,decorationPixelsInCells:0,modalFocusReturn:true,reducedMotion:true,errors}));
 // 自有页面截图的对照图；不改动源照片或角色文件。
 const crops=await Promise.all(ids.map(async id=>{
  const b=results.find(result=>result.team===id&&result.viewport===1440).bounds;
  const input=await sharp(path.join(out,`1440-${id}.png`)).extract({left:Math.max(0,Math.floor(b.x)-10),top:Math.max(0,Math.floor(b.y-b.height*.23)),width:Math.ceil(b.width)+20,height:Math.ceil(b.height*1.23)+10}).resize(600,600,{fit:'contain',background:'#101424'}).png().toBuffer();
  await fs.writeFile(path.join(out,`board-${id}.png`),input);return input;
 }));
 await sharp({create:{width:1800,height:390,channels:4,background:'#101424'}}).composite(await Promise.all(crops.map(async(input,i)=>({input:await sharp(input).resize(350,350).png().toBuffer(),left:15+i*358,top:20})))).png().toFile(path.join(out,'five-frames-contact-sheet.png'));
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
