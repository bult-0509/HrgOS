const {chromium}=require('C:/Users/24175/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const sharp=require('C:/Users/24175/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
(async()=>{
 const root=process.cwd(),out=path.join(root,'artifacts/event-team-art-20261006');await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1050},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
 await page.goto('http://127.0.0.1:3000/previews/team-bingo-event-v3/index.html');await page.locator('.cell').first().waitFor();
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('.edge-art,.team-mascot,.cell-preview,.team-tab img')].map(img=>img.decode().catch(()=>{})));});
 assert.equal(await page.locator('.cell').count(),25);assert.equal(await page.locator('.cell-direct-icon').count(),6);assert.equal(await page.locator('.team-tab').count(),5);
 const assets=['geopelia','hikari','para','salt','iro'];
 for(let i=0;i<5;i++){
  await page.locator('.team-tab').nth(i).click();await page.locator('#team-mascot').evaluate(img=>img.decode());await page.locator('.board-scene').evaluate(async el=>await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));
  assert((await page.locator('#team-mascot').getAttribute('src')).includes(assets[i]));
  assert.equal(await page.locator('.team-tab[aria-pressed=true]').count(),1);
  await page.screenshot({path:path.join(out,`${String(i+1).padStart(2,'0')}-${assets[i]}.png`),fullPage:true});
 }
 await page.locator('.team-tab').first().click();
 assert.equal(await page.locator('.region-tabs button').count(),0);
 for(const r of [2]){
  assert.equal(await page.locator('.cell-preview:not(.cell-haze)').count(),19);
  const urls=await page.locator('.cell-preview:not(.cell-haze)').evaluateAll(imgs=>imgs.map(i=>i.src));assert.equal(new Set(urls).size,19);assert(urls.every(url=>url.includes(`region-${r}/`)));
 }
 await page.locator('.cell[data-slot=P01]').click();await page.locator('.clear-clue').evaluate(img=>img.decode());assert.equal(await page.locator('.clear-clue').evaluate(img=>getComputedStyle(img).filter),'none');
 assert.equal(await page.locator('#clue-dialog').evaluate(d=>d.open),true);
 await page.screenshot({path:path.join(out,'clear-clue.png'),fullPage:true});
 await page.keyboard.press('Escape');assert.equal(await page.locator('#clue-dialog').evaluate(d=>d.open),false);assert.equal(await page.evaluate(()=>document.activeElement.dataset.slot),'P01');
 await page.locator('.cell[data-slot=D01]').click();assert.equal(await page.locator('.clear-clue').count(),0);await page.locator('#close-clue').click();
 await page.locator('#motion-toggle').click();assert(await page.locator('#event-page').evaluate(p=>p.classList.contains('motion-paused')));
 const mobileResults=[];
 for(const viewport of [{width:375,height:812},{width:768,height:1024},{width:812,height:375}]){
  await page.setViewportSize(viewport);await page.evaluate(()=>document.fonts.ready);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'页面横向溢出');
  const rect=await page.locator('.cell').first().boundingBox();assert(rect.width>=44,`点击宽度 ${rect.width}`);assert(rect.height>=44,`点击高度 ${rect.height}`);
  const grid=await page.locator('.board-grid').boundingBox(),mascot=await page.locator('.team-mascot').boundingBox();
  assert(mascot.x<grid.x&&mascot.y<grid.y,'角色不在棋盘左上方');
  assert(await page.evaluate(()=>Number(getComputedStyle(document.querySelector('.team-mascot')).zIndex)<Number(getComputedStyle(document.querySelector('.board-shell')).zIndex)),'角色必须在棋盘壳体下面');
  assert.equal(await page.locator('.team-mascot').evaluate(img=>getComputedStyle(img).pointerEvents),'none');
  assert.equal(await page.locator('.edge-art').evaluate(img=>getComputedStyle(img).pointerEvents),'none');
  await page.screenshot({path:path.join(out,`viewport-${viewport.width}.png`),fullPage:true});mobileResults.push({...viewport,cell:rect});
 }
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.cell-haze').first().evaluate(img=>getComputedStyle(img).animationName),'none');
 await page.setViewportSize({width:1440,height:1050});await page.locator('.team-tab').last().click();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#team-counter').innerText(),'01');await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('#team-counter').innerText(),'05');
 for(const id of assets){const p=path.join(root,'outputs/event-team-art-20261006/chibi',`${id}.png`);assert((await sharp(p).metadata()).hasAlpha);}
 assert.deepEqual(errors,[]);
 const result={teamMascots:5,regionsReadOnly:true,cells:25,photoSlots:19,directSlots:6,transparentAssets:true,keyboardNavigation:true,modalFocusReturn:true,clearPhotoOnlyInModal:true,reducedMotion:true,artNonInteractive:true,viewports:mobileResults,errors};
 await page.goto('http://127.0.0.1:3000/outputs/event-team-art-20261006/'+encodeURIComponent('五队角色审阅.html'));
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode()));});
 assert.equal(await page.locator('.sprite img').count(),5);
 await page.screenshot({path:path.join(out,'five-mascots-review.png'),fullPage:true});
 const cutout=await page.request.get('http://127.0.0.1:3000/outputs/event-team-art-20261006/cutouts/geopelia-final.png');assert.equal(cutout.status(),200);
 await page.setContent('<main style="width:800px;height:900px;display:grid;place-items:center;background:#a0bedb"><img src="http://127.0.0.1:3000/outputs/event-team-art-20261006/cutouts/geopelia-final.png" style="width:550px;height:860px;object-fit:contain" alt="鸠的透明抠图实际合成效果"></main>');
 await page.locator('img').evaluate(img=>img.decode());await page.locator('main').screenshot({path:path.join(out,'geopelia-cutout-alpha-check.png')});
 console.log(JSON.stringify(result,null,2));await fs.writeFile(path.join(out,'verification.json'),JSON.stringify(result,null,2));
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
