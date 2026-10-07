// 只渲染本机隔离样例，不登录或修改真实比赛。
const { chromium } = require('C:/Users/24175/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const out = path.resolve('artifacts/bingo-cell-style-20261007');
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, serviceWorkers: 'block' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('http://127.0.0.1:3000/');
    const source = await (await page.request.get('http://127.0.0.1:3000/src/player/PlayerApp.tsx')).text();
    const main = await (await page.request.get('http://127.0.0.1:3000/src/main.tsx')).text();
    const index = await (await page.request.get('http://127.0.0.1:3000/')).text();
    const preamble = [...index.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map(match => match[0]).find(script => script.includes('$RefreshReg$')) ?? '';
    const react = source.match(/from "([^"]*\/react\.js[^\"]*)"/)[1];
    const reactDOM = main.match(/from "([^"]*react-dom_client\.js[^\"]*)"/)[1];
    await page.route('**/__bingo-cell-style?mode=*', route => {
      const mode = new URL(route.request().url()).searchParams.get('mode');
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="zh-CN"><head>${preamble}<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css"><link rel="stylesheet" href="/src/redesign.css"><link rel="stylesheet" href="/src/player/photoBoard.css"><link rel="stylesheet" href="/src/ability/ability.css"></head><body><div id="root"></div><script type="module">
        import React from ${JSON.stringify(react)}; import ReactDOM from ${JSON.stringify(reactDOM)};
        import {PlayerApp} from '/src/player/PlayerApp.tsx'; import {LiveTaskBoard} from '/src/ability/LiveTaskBoard.tsx';
        import {initialSharedBingoTasks} from '/src/data/sharedBingoTasks.ts'; import {teams} from '/src/data/mock.ts';
        function Test(){const [done,setDone]=React.useState([]);window.__done=setDone;window.__fixtureTasks=initialSharedBingoTasks;
          const tasks=initialSharedBingoTasks.map(task=>({...task,state:done.includes(task.id)?'awarded':'available'}));const noop=()=>{};
          return ${JSON.stringify(mode)}==='demo'?React.createElement(PlayerApp,{team:teams[0],tasks,approvedRegionId:'stage-b',photoFinds:{P01:{status:'approved'}},cards:[],messages:[],onLogout:noop,onSubmitTask:noop,onUseCard:noop,onReadMessage:noop}):React.createElement('main',{className:'ability-app'},React.createElement(LiveTaskBoard,{team:{id:'team-1',name:'Phigros队',regionId:'stage-b'},tasks:tasks.map(task=>({...task,difficulty:task.scoreDifficulty,completed:done.includes(task.id),awarded:done.includes(task.id),taskUnlocked:task.sharedSlot.startsWith('D')||task.sharedSlot==='P01',photoStatus:task.sharedSlot==='P01'?'approved':'locked'})),status:'RUNNING',busy:false,blocked:false,submissions:[],submit:async()=>{}}));}
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Test));
      </script></body></html>` });
    });
    let layouts = 0;
    for (const mode of ['demo', 'live']) {
      await page.goto(`http://127.0.0.1:3000/__bingo-cell-style?mode=${mode}`);
      await page.locator('.tb-cell').first().waitFor();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(document.getAnimations().filter(animation => animation.playState === 'running' && Number(animation.effect?.getComputedTiming().endTime) < 2000).map(animation => animation.finished.catch(() => {})));
      });
      for (const viewport of [{ width: 375, height: 812 }, { width: 320, height: 700 }, { width: 812, height: 375 }, { width: 1440, height: 1100 }]) {
        await page.setViewportSize(viewport);
        const cells = await page.locator('.tb-cell').evaluateAll(nodes => nodes.map(node => {
          const style = getComputedStyle(node), glow = getComputedStyle(node, '::before'), wash = getComputedStyle(node, '::after'), rect = node.getBoundingClientRect();
          return { level: style.getPropertyValue('--cell-level'), tint: style.getPropertyValue('--cell-tint').trim(), glowSize: parseFloat(style.getPropertyValue('--cell-glow-size')), border: style.borderLeftColor, borderWidth: style.borderLeftWidth, glow: glow.boxShadow, wash: Number(wash.opacity), width: rect.width, height: rect.height };
        }));
        assert.equal(cells.length, 25);
        assert.equal(await page.locator('.tb-cell .bingo-cell__number,.tb-cell .tb-difficulty').count(), 0);
        assert.equal(await page.locator('.bingo-peek__cell').filter({ hasText: /^[PD]\d/ }).count(), 0);
        assert.equal(new Set(cells.map(cell => cell.level)).size, 4);
        assert(cells.every(cell => cell.border === 'rgba(0, 0, 0, 0)' && cell.borderWidth === '1px' && cell.glow.includes('inset') && cell.wash === 0));
        assert(cells.every(cell => parseInt(cell.tint.slice(-2), 16) / 255 >= .75 && cell.glowSize >= 12 && cell.glow.split('inset').length === 3), '难度色必须有足够浓度且由两层内渐变呈现');
        assert(cells.every(cell => cell.width >= 44 && cell.height >= 44));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        layouts++;
      }
      const ids = await page.evaluate(() => ['team-1:P02', 'team-1:D01', 'team-2:D03'].map(key => window.__fixtureTasks.find(task => `${task.boardId}:${task.sharedSlot}` === key).id));
      await page.setViewportSize({ width: 375, height: 812 });
      await page.evaluate(ids => window.__done(ids), ids);
      await page.waitForFunction(id => Number(getComputedStyle(document.querySelector(`.tb-cell[data-task-id="${id}"]`), '::after').opacity) === 1, ids[0]);
      assert.equal(await page.locator('.tb-cell[data-completed=true]').count(), 2);
      assert.equal(await page.locator('.bingo-peek__cell[data-completed=true]').count(), 1);
      assert.equal(await page.locator('.tb-cell[data-completed=true] .lucide-check').count(), 2);
      await page.locator('.bingo-deck__viewport').screenshot({ path: path.join(out, `${mode}-mobile-completed.png`), animations: 'disabled' });
      await page.setViewportSize({ width: 1440, height: 1100 });
      await page.locator('.bingo-deck__viewport').screenshot({ path: path.join(out, `${mode}-desktop-completed.png`), animations: 'disabled' });
      await page.locator(`.tb-cell[data-task-id="${ids[0]}"]`).click();
      assert.equal(await page.getByRole('dialog').locator('[data-task-details]').count(), 0, '完成色不能绕过本队图寻');
      await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: '下一张 Bingo', exact: true }).click();
      await page.locator(`.tb-cell[data-task-id="${ids[2]}"][data-completed=true]`).waitFor();
      assert.equal(await page.locator('.bingo-peek__cell[data-completed=true]').count(), 2);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await page.locator('.tb-cell').first().evaluate(node => getComputedStyle(node, '::after').transitionDuration), '0s');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ layouts, cornerLabelsRemoved: true, insetDifficultyGlow: true, approvedCompletionRed: true, sideCardsSynchronized: true, photoGatePreserved: true, reducedMotion: true, browserErrors: errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
