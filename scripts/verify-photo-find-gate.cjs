// 独立内存赛局 + 拦截请求，绝不写入真实比赛。
const { chromium } = require('C:/Users/24175/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { pathToFileURL } = require('node:url');
(async () => {
  const { seedState, stateView, executeCommand } = await import(pathToFileURL(path.resolve('server/rules.mjs')));
  const { officialScoring } = await import(pathToFileURL(path.resolve('server/scoring.mjs')));
  const out = path.resolve('artifacts/photo-find-gate-20261007'); await fs.mkdir(out,{recursive:true});
  const actor={id:'fixture-player',role:'player',teamId:'team-1'},staff={id:'fixture-staff',role:'staff',manage:true,review:true};
  const create=()=>{const state=seedState([actor,staff]);state.mode='live';state.configured=true;state.status='RUNNING';state.runningSince=state.now;state.config.tasks=structuredClone(officialScoring.tasks);state.teams[0].name='Phigros队';state.teams[0].regionId='stage-b';state.teams[0].regionVersion=2;return state;};
  let state=create(),reject=false;
  const bytes=await sharp({create:{width:8,height:8,channels:3,background:'#fff'}}).png().toBuffer();
  const media={name:'replica.png',mime:'image/png',base64:bytes.toString('base64')};
  const errors=[];const browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:375,height:812},serviceWorkers:'block'});page.on('pageerror',error=>errors.push(error.message));
  const settle=async()=>page.evaluate(async()=>{
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(animation=>Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation=>animation.finished.catch(()=>{})));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
  const screenshot=async options=>{await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('.modal-card,.modal-backdrop')].flatMap(el=>el.getAnimations()).map(a=>a.finished.catch(()=>{})));});await page.screenshot(options);};
  try{
    await page.goto('http://127.0.0.1:3000/');
    const player=await(await page.request.get('http://127.0.0.1:3000/src/player/PlayerApp.tsx')).text();
    const main=await(await page.request.get('http://127.0.0.1:3000/src/main.tsx')).text();
    const index=await(await page.request.get('http://127.0.0.1:3000/')).text();
    const preamble=[...index.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map(m=>m[0]).find(s=>s.includes('$RefreshReg$'))??'';
    const react=player.match(/from "([^"]*\/react\.js[^\"]*)"/)[1],reactDOM=main.match(/from "([^"]*react-dom_client\.js[^\"]*)"/)[1];
    await page.route('**/__photo-find-state',route=>route.fulfill({json:stateView(state,actor)}));
    await page.route('**/__photo-find-submit',async route=>{
      if(reject)return route.fulfill({status:409,json:{error:'测试上传失败，请重试'}});
      try{const body=route.request().postDataJSON();const result=await executeCommand(state,actor,{...body,media:body.media??media},crypto.randomUUID());await route.fulfill({json:result});}
      catch(error){await route.fulfill({status:error.statusCode??409,json:{error:error.message}});}
    });
    await page.route('**/__photo-find-test?mode=*',route=>{
      const mode=new URL(route.request().url()).searchParams.get('mode');
      const html=`<!doctype html><html lang="zh-CN"><head>${preamble}<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css"><link rel="stylesheet" href="/src/redesign.css"><link rel="stylesheet" href="/src/player/photoBoard.css"><link rel="stylesheet" href="/src/ability/ability.css"></head><body><div id="root"></div><script type="module">
        import React from ${JSON.stringify(react)};import ReactDOM from ${JSON.stringify(reactDOM)};
        import {LiveTaskBoard} from '/src/ability/LiveTaskBoard.tsx';import {PlayerApp} from '/src/player/PlayerApp.tsx';import {initialSharedBingoTasks} from '/src/data/sharedBingoTasks.ts';import {teams} from '/src/data/mock.ts';
        function Test(){const[view,setView]=React.useState(null);const[progress,setProgress]=React.useState({});const refresh=async()=>{const data=await(await fetch('/__photo-find-state')).json();setView(data);setProgress(Object.fromEntries(data.tasks.filter(t=>t.photoStatus).map(t=>[t.sharedSlot,{status:t.photoStatus}])));};window.__refresh=refresh;React.useEffect(()=>{refresh();},[]);const submit=async body=>{const response=await fetch('/__photo-find-submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error);await refresh();};if(!view)return null;
        return ${JSON.stringify(mode)}==='live'?React.createElement('main',{className:'ability-app'},React.createElement(LiveTaskBoard,{team:view.team,tasks:view.tasks,status:view.status,busy:false,blocked:false,submissions:view.submissions,submit})):React.createElement(PlayerApp,{team:teams[0],tasks:initialSharedBingoTasks,approvedRegionId:view.team.regionId,photoFinds:progress,cards:[],messages:[],onLogout:()=>{},onUseCard:()=>{},onReadMessage:()=>{},onSubmitPhotoFind:(photoSlot)=>{submit({type:'submit',kind:'photo',photoSlot,regionId:view.team.regionId});},onSubmitTask:(taskId)=>{submit({type:'submit',kind:'task',taskId,regionId:view.team.regionId});}});}
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Test));</script></body></html>`;
      return route.fulfill({contentType:'text/html',body:html});
    });
    let layouts=0;
    for(const mode of ['demo','live']){
      state=create();await page.goto(`http://127.0.0.1:3000/__photo-find-test?mode=${mode}`);await page.locator('.tb-cell').first().waitFor();
      for(const viewport of [{width:375,height:812},{width:320,height:700},{width:1440,height:1000},{width:812,height:375}]){
        await page.setViewportSize(viewport);await settle();
        assert.equal(await page.locator('.tb-cell').count(),25);assert.equal(await page.locator('.tb-cell[data-photo-state=locked]').count(),19);
        assert.equal(await page.locator('[data-task-details]').count(),0);
        const colors=await page.locator('.tb-cell[data-difficulty]').evaluateAll(cells=>Object.fromEntries(cells.map(cell=>[cell.dataset.difficulty,getComputedStyle(cell).borderLeftColor])));
        assert.equal(new Set(Object.values(colors)).size,4);
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
        if(overflow)console.log(JSON.stringify({mode,viewport,wide:await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,inner:innerWidth,viewport:[...document.querySelectorAll('.bingo-deck__viewport,.bingo-deck,.app-shell,.player-game-layout,.mission-column,.card-hand')].map(el=>({class:el.className,x:el.getBoundingClientRect().x,width:el.getBoundingClientRect().width,scroll:el.scrollWidth,overflow:getComputedStyle(el).overflowX})),outside:[...document.querySelectorAll('body *')].filter(el=>!el.closest('.bingo-deck__viewport')&&el.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(el=>({class:el.className,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width}))}))}));
        assert.equal(overflow,false,`${mode} ${viewport.width}: 横向溢出`);
        assert(await page.locator('.tb-cell').evaluateAll(cells=>cells.every(cell=>{const r=cell.getBoundingClientRect();return r.width>=44&&r.height>=44;})));
        if(viewport.width===375)await screenshot({path:path.join(out,`${mode}-locked-375.png`),fullPage:true});layouts++;
      }
      await page.setViewportSize({width:375,height:812});await page.locator('.tb-cell[data-slot=P01]').click();
      const dialog=page.getByRole('dialog');const title=state.config.tasks.find(t=>t.boardId==='team-1'&&t.sharedSlot==='P01').title;
      assert(!(await dialog.innerText()).includes(title));assert.equal(await dialog.locator('[data-task-details]').count(),0);
      assert((await dialog.innerText()).includes('拍摄角度'));assert(!(await dialog.innerText()).includes('拍摄要求'));
      await screenshot({path:path.join(out,`${mode}-clue-375.png`),fullPage:true});
      await dialog.locator('input[type=file]').setInputFiles({name:'replica.png',mimeType:'image/png',buffer:bytes});
      if(mode==='live'){
        reject=true;await page.getByRole('button',{name:'提交图寻审核',exact:true}).click();await dialog.getByRole('alert').waitFor();
        assert.equal(await dialog.locator('input[type=file]').evaluate(input=>input.files.length),1);reject=false;
      }
      await page.getByRole('button',{name:'提交图寻审核',exact:true}).click();await dialog.waitFor({state:'hidden'});
      await page.locator('.tb-cell[data-slot=P01][data-photo-state=pending]').waitFor();
      await page.locator('.tb-cell[data-slot=P01]').click();await page.getByText('图寻审核中',{exact:true}).waitFor();
      assert.equal(await page.locator('[data-task-details]').count(),0);
      const photo=state.submissions.find(t=>t.kind==='photo'&&t.status==='QUEUED');
      await executeCommand(state,staff,{type:'review',submissionId:photo.id,result:'approve'},crypto.randomUUID());await page.evaluate(()=>window.__refresh());
      await page.locator('[data-task-details]').waitFor();assert.equal(stateView(state,actor).tasks.filter(t=>t.sharedSlot==='P01'&&t.title).length,5);
      assert((await dialog.innerText()).includes(title));assert(!(await dialog.innerText()).includes('拍摄要求'));
      assert.equal(await dialog.locator('input[type=file]').evaluate(input=>input.files.length),0);
      await screenshot({path:path.join(out,`${mode}-task-unlocked-375.png`),fullPage:true});
      await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();await dialog.waitFor({state:'hidden'});
      await page.getByRole('button',{name:'下一张 Bingo',exact:true}).click();await page.locator('.bingo-deck__card[data-board-id=team-2][data-offset="0"]').waitFor();
      await page.locator('.tb-cell[data-slot=P01]').click();await page.locator('[data-task-details]').waitFor();
      const peerTitle=state.config.tasks.find(t=>t.boardId==='team-2'&&t.sharedSlot==='P01').title;assert((await page.getByRole('dialog').innerText()).includes(peerTitle));
      await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
      await page.locator('.tb-cell[data-slot=D01]').click();await page.locator('[data-task-details]').waitFor();
    }
    assert.deepEqual(errors,[]);console.log(JSON.stringify({layouts,photoGate:'pass',sharedFiveTaskUnlock:'pass',pendingDoesNotReveal:'pass',difficultyColors:'pass',directTasks:'pass',photoUploadRetry:'pass',browserErrors:errors}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
