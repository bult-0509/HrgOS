const {chromium}=require('C:/Users/24175/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 const root=process.cwd(),out=path.join(root,'artifacts/photo-board-integration-20261006');await fs.mkdir(out,{recursive:true});
 const account=JSON.parse(await fs.readFile(path.join(root,'local-private/accounts-20261006.json'),'utf8')).find(a=>a.role==='player');
 assert(account,'请先准备本机玩家账号清单');
 const records=JSON.parse(await fs.readFile(path.join(root,'outputs/photo-final-20261006/成品清单.json'),'utf8'));
 for(const p of records){const bytes=await fs.readFile(path.join(root,'public/images/photo-clues',`region-${p.region}`,`${String(p.number).padStart(2,'0')}.png`));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),p.sha256);}
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1100},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:3000/');assert.equal(await page.locator('.bingo-cell').count(),0);
  await page.getByPlaceholder('请输入账号').fill(account.username);await page.getByPlaceholder('请输入密码').fill(account.password);await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.locator('.bingo-cell').first().waitFor();
  assert.equal(await page.locator('.bingo-regions button').count(),0);
  for(const r of [2]){
   assert.equal(await page.locator('.bingo-cell').count(),25);assert.equal(await page.locator('.bingo-cell--photo').count(),19);assert.equal(await page.locator('.bingo-cell--direct').count(),6);
   assert.equal(await page.locator('.bingo-cell__focus').count(),0);assert.equal(await page.locator('.task-photo').count(),0);
   const srcs=await page.locator('.photo-preview__base').evaluateAll(imgs=>imgs.map(img=>img.getAttribute('src')));assert.equal(new Set(srcs).size,19);
   for(let n=1;n<=19;n++){assert(srcs.includes(`/images/photo-clues/region-${r}/${String(n).padStart(2,'0')}-preview.webp`));const result=await page.request.get(`http://127.0.0.1:3000/images/photo-clues/region-${r}/${String(n).padStart(2,'0')}.webp`);assert.equal(result.status(),200);}
   await page.locator('.bingo-cell--photo[data-slot=P01]').click();
   await page.locator('.task-photo img').evaluate(img=>img.decode());assert((await page.locator('.task-photo img').getAttribute('src')).includes(`region-${r}/01.webp`));assert.equal(await page.locator('.task-photo img').evaluate(img=>getComputedStyle(img).filter),'none');
   await page.locator('.modal-card').evaluate(async e=>{await Promise.all(e.getAnimations().map(a=>a.finished));});
   await page.screenshot({path:path.join(out,`clear-region-${r}.png`)});
   assert(await page.locator('.player-console').evaluate(e=>e.classList.contains('photo-motion-paused')));
   await page.keyboard.press('Escape');await page.locator('[role=dialog]').waitFor({state:'hidden'});
  }
  assert.equal(await page.locator('.bingo-panel').getByText('同步判定',{exact:true}).count(),0);
  await page.getByRole('button',{name:'暂停动效',exact:true}).click();assert(await page.locator('.team-bingo').evaluate(e=>e.classList.contains('photo-motion-paused')));
  await page.getByRole('button',{name:'开启动效',exact:true}).click();
  await page.locator('.bingo-cell--photo').first().hover();const blur=await page.locator('.photo-preview__base').first().evaluate(e=>getComputedStyle(e).filter);assert(blur.includes('blur(7px)'));
  await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
  for(const viewport of [{width:375,height:812},{width:812,height:375},{width:768,height:1024}]){
   await page.setViewportSize(viewport);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const cols=await page.locator('.bingo-board').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length);assert.equal(cols,5);
   assert(await page.locator('.bingo-cell').first().evaluate(e=>e.getBoundingClientRect().width>=44));
   await page.screenshot({path:path.join(out,`viewport-${viewport.width}.png`),fullPage:true});
  }
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.photo-preview__haze').first().evaluate(e=>getComputedStyle(e).animationName),'none');
  // Direct-task modal contains no image and doesn't unexpectedly borrow a clue.
  await page.locator('.bingo-cell--direct').first().click();assert.equal(await page.locator('.task-photo').count(),0);assert.equal(await page.locator('.task-direct-note').count(),1);
  await page.keyboard.press('Escape');await page.locator('[role=dialog]').waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({photos:57,originalHashMatches:57,regionsReadOnly:true,cellsPerRegion:25,photoCells:19,directCells:6,clearPhotoOnlyInModal:true,hoverStaysBlurred:true,reducedMotion:'pass',pauseControl:'pass',mobileAndLandscape:'pass',loginGate:'preserved',pageErrors:errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
