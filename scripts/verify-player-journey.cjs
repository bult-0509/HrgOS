// 独立浏览器与内存数据；不登录、不修改真实比赛。
const { chromium } = require('C:/Users/24175/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const sharp = require('sharp');

(async () => {
  const origin = 'http://127.0.0.1:3000';
  const out = path.resolve('artifacts/player-journey-20261007');
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, serviceWorkers: 'block' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const { seedState, executeCommand, stateView } = await import(pathToFileURL(path.resolve('server/rules.mjs')));
    const { officialScoring } = await import(pathToFileURL(path.resolve('server/scoring.mjs')));
    const player = { id: 'fixture-player', role: 'player', teamId: 'team-1' };
    const staff = { id: 'fixture-staff', role: 'staff', manage: true, review: true };
    const state = seedState([player, staff]);
    state.config.tasks = structuredClone(officialScoring.tasks);
    state.status = 'RUNNING'; state.runningSince = state.now; state.teams[0].regionId = 'stage-a'; state.teams[0].name = 'Phigros队';
    const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer();
    const media = { name: 'fixture.png', mime: 'image/png', base64: bytes.toString('base64') };
    await executeCommand(state, staff, { type: 'opening_puzzle_configure', regionId: 'stage-b', media, title: '开场谜题', prompt: '复刻参考照片的位置与角度。', reason: '测试照片' }, crypto.randomUUID());
    const view = () => { const result = stateView(state, player); if (result.openingPuzzle?.configured) result.openingPuzzle.imageSrc = '/__opening-reference'; return result; };
    await page.route('**/__journey-state', route => route.fulfill({ json: view() }));
    await page.route('**/__opening-reference', route => route.fulfill({ contentType: 'image/png', body: bytes }));
    await page.route('**/__journey-command', async route => {
      try { await executeCommand(state, player, { ...route.request().postDataJSON(), ...(route.request().postDataJSON().kind === 'arrival' ? { media } : {}) }, crypto.randomUUID()); await route.fulfill({ json: view() }); }
      catch (error) { await route.fulfill({ status: error.statusCode ?? 409, json: { error: error.message } }); }
    });
    const source = await (await page.request.get(`${origin}/src/player/PlayerApp.tsx`)).text();
    const main = await (await page.request.get(`${origin}/src/main.tsx`)).text();
    const index = await (await page.request.get(origin)).text();
    const react = source.match(/from "([^"]*\/react\.js[^\"]*)"/)[1];
    const reactDOM = main.match(/from "([^"]*react-dom_client\.js[^\"]*)"/)[1];
    const preamble = [...index.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map(match => match[0]).find(script => script.includes('$RefreshReg$')) ?? '';
    await page.route('**/__player-journey-test*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="zh-CN"><head>${preamble}<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css"><link rel="stylesheet" href="/src/redesign.css"><link rel="stylesheet" href="/src/player/photoBoard.css"><link rel="stylesheet" href="/src/ability/ability.css"></head><body><div id="root"></div><script type="module">
      import React from ${JSON.stringify(react)};import ReactDOM from ${JSON.stringify(reactDOM)};
      import {PlayerApp} from '/src/player/PlayerApp.tsx';import {teams} from '/src/data/mock.ts';import {initialSharedBingoTasks} from '/src/data/sharedBingoTasks.ts';
      import {LiveTaskBoard} from '/src/ability/LiveTaskBoard.tsx';
      function Test(){const[view,setView]=React.useState(null);const refresh=async()=>setView(await(await fetch('/__journey-state')).json());window.__refresh=refresh;React.useEffect(()=>{refresh();},[]);const command=async(body)=>{const response=await fetch('/__journey-command',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const next=await response.json();if(!response.ok)throw new Error(next.error);setView(next);};if(!view)return null;
      if(new URLSearchParams(location.search).get('mode')==='live')return React.createElement('main',{className:'ability-app'},React.createElement(LiveTaskBoard,{team:view.team,tasks:view.tasks,status:view.status,busy:false,blocked:false,regionJourney:view.regionJourney,openingPuzzle:view.openingPuzzle,openingReference:view.openingPuzzle?.configured?React.createElement('img',{src:'/__opening-reference',alt:'测试开场参考照片'}):null,submissions:view.submissions,submit:command}));
      return React.createElement(PlayerApp,{team:teams[0],tasks:initialSharedBingoTasks,approvedRegionId:view.team.regionId,regionJourney:view.regionJourney,openingPuzzle:view.openingPuzzle,arrivalSubmissions:view.submissions,onBeginRegionOpening:(regionId)=>command({type:'begin_region_opening',regionId}),onSubmitRegionOpening:(regionId)=>command({type:'submit',kind:'arrival',regionId}),cards:[],messages:[],onboardingKey:'fixture-journey-player',onLogout:()=>{},onSubmitTask:()=>{},onUseCard:()=>{},onReadMessage:()=>{}});}
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Test));
      </script></body></html>` }));
    await page.goto(`${origin}/__player-journey-test`);
    await page.locator('.tb-cell').first().waitFor();
    // 首次进入必须完整呈现给定规则，确认后刷新不重复打断。
    const guide = page.getByRole('dialog', { name: '开场引导' });
    assert.equal(await guide.count(), 1, '首次进入未显示规则引导');
    const copy = await guide.innerText();
    for (const text of ['探索者以队伍为单位', '终点将根据到达位次', '5 个不同的棋盘', '每盘 25 项任务', '另外 6 项任务可以直接完成', '可以使用 AI 或任意工具', '先到先得', '连成一条线', '最多完成 5 项任务', '每30分钟或全体队伍每完成10项任务']) assert(copy.includes(text), `缺少规则：${text}`);
    await page.keyboard.press('Escape'); assert.equal(await guide.count(), 1);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(out, 'first-entry-rules-375.png'), fullPage: true });
    await guide.getByRole('button', { name: '了解规则，开始探索' }).click();
    await guide.waitFor({ state: 'hidden' });
    await page.reload();
    await page.locator('.tb-cell').first().waitFor();
    assert.equal(await page.getByRole('dialog', { name: '开场引导' }).count(), 0);
    await page.getByRole('button', { name: '查看活动规则' }).click();
    await page.getByRole('dialog', { name: '开场引导' }).waitFor();
    await page.getByRole('button', { name: '了解规则，开始探索' }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    let layouts = 0;
    const settle = () => page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {}))); });
    for (const viewport of [{ width: 375, height: 812 }, { width: 320, height: 700 }, { width: 768, height: 1024 }, { width: 812, height: 375 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport); await settle();
      assert.equal(await page.locator('.bingo-deck__controls button').count(), 2);
      assert.equal(await page.locator('.bingo-deck__tabs').count(), 0);
      const geometry = await page.evaluate(() => {
        const arrows = [...document.querySelectorAll('.bingo-deck__arrow')].map(el => el.getBoundingClientRect());
        const active = document.querySelector('.bingo-deck__card[data-offset="0"]');
        const stage = active.querySelector('.tb-stage').getBoundingClientRect();
        const targets = [...active.querySelectorAll('button')].map(el => el.getBoundingClientRect());
        const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        return { overflow: document.documentElement.scrollWidth > innerWidth, touch: arrows.every(r => r.width >= 44 && r.height >= 44), inside: arrows.every(r => r.left >= 0 && r.right <= innerWidth), clear: arrows.every(a => targets.every(b => !overlaps(a, b))), flanking: arrows[0].x + arrows[0].width / 2 < stage.x + stage.width * .102 && arrows[1].x + arrows[1].width / 2 > stage.right - stage.width * .102 };
      });
      assert.equal(geometry.overflow, false, `${viewport.width}px 横向溢出`);
      assert.equal(geometry.touch && geometry.inside && geometry.clear && geometry.flanking, true, `${viewport.width}px 箭头必须位于两侧且不遮挡任何按钮：${JSON.stringify(geometry)}`);
      if (viewport.width === 375 || viewport.width === 1440) await page.screenshot({ path: path.join(out, `bingo-arrows-${viewport.width}.png`), fullPage: true });
      layouts++;
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator('.tb-cell').first().focus(); await page.keyboard.press('ArrowRight');
    await page.locator('.bingo-deck__card[data-board-id=team-2][data-offset="0"]').waitFor();
    assert.equal(await page.getByRole('button', { name: '下一张 Bingo', exact: true }).evaluate(el => el === document.activeElement), true);
    await page.getByRole('button', { name: '上一张 Bingo', exact: true }).click();
    await page.locator('.bingo-deck__card[data-board-id=team-1][data-offset="0"]').waitFor();
    assert.equal(await page.getByRole('button', { name: '进入下一区域' }).count(), 1, '缺少主动进入下一开场谜题的入口');
    await page.getByRole('button', { name: '进入下一区域' }).click();
    const opening = page.getByRole('region', { name: '区域开场谜题' });
    await opening.waitFor();
    assert.equal(await page.locator('.tb-cell').count(), 0, '进入谜题后不能继续做旧区域任务');
    await page.reload(); await opening.waitFor();
    assert.equal(await page.locator('.tb-cell').count(), 0, '刷新不能跳过开场谜题');
    await opening.locator('input[type=file]').setInputFiles({ name: 'replica.png', mimeType: 'image/png', buffer: bytes });
    await opening.getByRole('button', { name: '提交开场谜题审核' }).click();
    await opening.getByText('等待工作人员审核', { exact: true }).waitFor();
    assert.equal(state.teams[0].regionId, 'stage-a');
    await executeCommand(state, staff, { type: 'review', submissionId: state.submissions.at(-1).id, result: 'reject', reason: '参考角度不符' }, crypto.randomUUID());
    await page.evaluate(() => window.__refresh()); await opening.getByRole('alert').waitFor();
    assert.equal(await page.locator('.tb-cell').count(), 0);
    await opening.locator('input[type=file]').setInputFiles({ name: 'replica.png', mimeType: 'image/png', buffer: bytes });
    await opening.getByRole('button', { name: '提交开场谜题审核' }).click();
    await opening.getByText('等待工作人员审核', { exact: true }).waitFor();
    await executeCommand(state, staff, { type: 'review', submissionId: state.submissions.at(-1).id, result: 'approve' }, crypto.randomUUID());
    await page.evaluate(() => window.__refresh());
    await page.locator('.tb-cell').first().waitFor();
    assert.equal(await opening.count(), 0);
    assert((await page.locator('.tb-cell[data-slot=P01] img').first().getAttribute('src')).includes('/region-2/'));
    await page.goto(`${origin}/__player-journey-test?mode=live`); await page.locator('.tb-cell').first().waitFor();
    assert.equal(await page.getByRole('button', { name: '进入下一区域' }).count(), 1, '正式比赛也必须接入新的开场谜题入口');
    const directIds = state.config.tasks.filter(task => task.sharedSlot.startsWith('D'));
    for (const task of directIds.slice(0, 4)) { const item = await executeCommand(state, player, { type: 'submit', kind: 'task', regionId: 'stage-b', taskId: task.id, media }, crypto.randomUUID()); await executeCommand(state, staff, { type: 'review', submissionId: item.submission.id, result: 'approve' }, crypto.randomUUID()); }
    const fifth = await executeCommand(state, player, { type: 'submit', kind: 'task', regionId: 'stage-b', taskId: directIds[4].id, media }, crypto.randomUUID());
    await page.evaluate(() => window.__refresh()); assert.equal(await page.locator('.tb-cell').count(), 25);
    await page.goto(`${origin}/__player-journey-test`); await page.locator('.tb-cell').first().waitFor();
    await page.locator('.tb-cell[data-slot=D01]').click();
    await page.getByRole('dialog').locator('input[type=file]').setInputFiles({ name: 'replica.png', mimeType: 'image/png', buffer: bytes });
    assert.equal(await page.getByRole('button', { name: '提交任务审核', exact: true }).isDisabled(), true, '预览也应明确禁用待审已占满的名额');
    await page.getByRole('dialog').getByText('本区任务名额待审核，请等待结果或进入下一区域。', { exact: true }).waitFor();
    await page.goto(`${origin}/__player-journey-test?mode=live`); await page.locator('.tb-cell').first().waitFor();
    await executeCommand(state, staff, { type: 'review', submissionId: fifth.submission.id, result: 'approve' }, crypto.randomUUID());
    await page.evaluate(() => window.__refresh()); await opening.waitFor();
    assert.equal(await page.locator('.tb-cell').count(), 0); assert.equal(await opening.getAttribute('data-region-target'), 'stage-c');
    await opening.getByText('开场照片待确认', { exact: true }).waitFor();
    assert.equal(await opening.getByRole('button', { name: '提交开场谜题审核' }).isDisabled(), true);
    await settle(); await page.screenshot({ path: path.join(out, 'opening-photo-pending-375.png'), fullPage: true });
    await page.reload(); await opening.waitFor(); assert.equal(await page.locator('.tb-cell').count(), 0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await opening.evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ layouts, firstEntryRules: 'pass', acknowledgedRefresh: 'pass', rulesCanReopen: 'pass', flankingArrows: 'pass', keyboardSwitch: 'pass', manualOpening: 'pass', rejectedStillForced: 'pass', fifthApprovalOpening: 'pass', pendingPhotosNotInvented: 'pass', browserErrors: errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
