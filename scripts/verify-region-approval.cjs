// 临时浏览器验证页面由 Playwright 拦截提供，不向项目增加玩家权限入口。
const {chromium}=require('C:/Users/24175/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const out=path.resolve('artifacts/region-approval-20261006');await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1100},serviceWorkers:'block'});
 const errors=[];page.on('pageerror',e=>errors.push(e.stack??e.message));
 try {
  await page.goto('http://127.0.0.1:3000/');
  const playerModule=await (await page.request.get('http://127.0.0.1:3000/src/player/PlayerApp.tsx')).text();
  const mainModule=await (await page.request.get('http://127.0.0.1:3000/src/main.tsx')).text();
  const indexHtml=await (await page.request.get('http://127.0.0.1:3000/')).text();
  const preamble=[...indexHtml.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map(m=>m[0]).find(s=>s.includes('$RefreshReg$'))??'';
  const reactUrl=playerModule.match(/from "([^"]*\/react\.js[^\"]*)"/)[1];
  const rootUrl=mainModule.match(/from "([^"]*react-dom_client\.js[^\"]*)"/)[1];
  const html=`<!doctype html><html lang="zh-CN"><head>${preamble}<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css"><link rel="stylesheet" href="/src/redesign.css"><link rel="stylesheet" href="/src/player/photoBoard.css"></head><body><div id="test-root"></div><script type="module">
   import React from ${JSON.stringify(reactUrl)};import ReactDOM from ${JSON.stringify(rootUrl)};
   import {PlayerApp} from '/src/player/PlayerApp.tsx';import {StaffApp} from '/src/staff/StaffApp.tsx';
   import {initialBingoTasks,initialAuditQueue,teams} from '/src/data/mock.ts';import {reviewAudit} from '/src/domain/regionProgress.ts';
   const e=React.createElement,noop=()=>{};
   function Test(){
    const [mode,setMode]=React.useState('player');
    const [state,setState]=React.useState({teams,auditQueue:[{...initialAuditQueue[1],teamId:'team-1',team:'Phigros队',targetRegionId:'stage-c'}],regionProgress:{'team-1':{currentRegionId:'stage-b',version:2}},regionAuditLog:[]});
    const review=(itemId,result)=>setState(s=>reviewAudit(s,{itemId,result,actor:mode,operatorId:'staff-test',reviewedAt:'2026-10-06T00:00:00Z'}));
    return e(React.Fragment,null,e('button',{id:'test-mode',style:{position:'fixed',right:16,bottom:16,zIndex:99999},onClick:()=>setMode(m=>m==='player'?'staff':'player')},'测试角色切换'),
     mode==='player'?e(PlayerApp,{team:state.teams[0],tasks:initialBingoTasks,approvedRegionId:state.regionProgress['team-1'].currentRegionId,cards:[],messages:[],onLogout:noop,onSubmitTask:noop,onUseCard:noop,onReadMessage:noop}):e(StaffApp,{teams:state.teams,auditQueue:state.auditQueue,regionAuditLog:state.regionAuditLog,onReview:review,onFinishTeam:noop,onLogout:noop}));
   }
   ReactDOM.createRoot(document.getElementById('test-root')).render(e(Test));
  </script></body></html>`;
  await page.route('http://127.0.0.1:3000/__region-approval-test',r=>r.fulfill({status:200,contentType:'text/html',body:html}));
  await page.goto('http://127.0.0.1:3000/__region-approval-test');
  await page.locator('.bingo-cell').first().waitFor({timeout:10000}).catch(e=>{throw new Error(`${e.message}; browser errors: ${errors.join('; ')}`)});
  const fingerprint=()=>page.locator('.bingo-cell').evaluateAll(cells=>cells.map(c=>({state:c.className,number:c.querySelector('.bingo-cell__number')?.textContent,footer:c.querySelector('.bingo-cell__footer')?.textContent})));
  const before=await fingerprint();
  assert.equal(await page.locator('.bingo-regions button').count(),0);
  assert((await page.locator('.photo-preview__base').evaluateAll(imgs=>imgs.map(i=>i.src))).every(s=>s.includes('/region-2/')));
  await page.screenshot({path:path.join(out,'before-staff-approval.png'),fullPage:true});
  await page.locator('#test-mode').click();
  await page.locator('.staff-sidebar').getByRole('button',{name:/^审核/}).click();
  await page.locator('.review-detail').getByRole('button',{name:'审核通过',exact:true}).click();
  await page.getByText('审核队列已清空',{exact:true}).waitFor();
  await page.locator('#test-mode').click();await page.locator('.bingo-cell').first().waitFor();
  const urls=await page.locator('.photo-preview__base').evaluateAll(imgs=>imgs.map(i=>i.src));
  assert.equal(urls.length,19);assert(urls.every(s=>s.includes('/region-3/')));assert.deepEqual(await fingerprint(),before);
  await page.locator('.bingo-cell--photo[data-slot=P01]').click();
  assert((await page.locator('.task-photo img').getAttribute('src')).includes('/region-3/01.webp'));
  await page.keyboard.press('Escape');await page.locator('[role=dialog]').waitFor({state:'hidden'});
  await page.screenshot({path:path.join(out,'after-staff-approval.png'),fullPage:true});
  await page.goto('http://127.0.0.1:3000/previews/team-bingo-event-v3/index.html');
  assert.equal(await page.locator('.region-tabs button').count(),0);assert.equal(await page.locator('.region-step').count(),3);
  const previewUrls=await page.locator('.cell-preview:not(.cell-haze)').evaluateAll(imgs=>imgs.map(i=>i.src));
  await page.locator('.region-step').last().click();
  assert.deepEqual(await page.locator('.cell-preview:not(.cell-haze)').evaluateAll(imgs=>imgs.map(i=>i.src)),previewUrls);
  assert.deepEqual(errors,[]);
  const result={staffApprovalUpdatesAll19:true,taskIdentityScoreAndStatePreserved:true,directTasksPreserved:6,playerRegionButtons:0,previewRegionButtons:0,clearDetailsUseApprovedRegion:true,errors};
  await fs.writeFile(path.join(out,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
