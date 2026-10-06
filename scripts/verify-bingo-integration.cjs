// 本机浏览器测试：API 被拦截，不创建或修改任何真实比赛。
const { chromium } = require('C:/Users/24175/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');

(async () => {
  const out = path.resolve('artifacts/bingo-integration-20261007');
  await fs.mkdir(out, { recursive: true });
  const { seedState, stateView } = await import(pathToFileURL(path.resolve('server/rules.mjs')));
  const fixture = seedState([]);
  fixture.teams = ['Phigros队', 'Arcaea队', '范式起源队', 'maimai队', '全能队'].map((name, i) => ({ id: `team-${i + 1}`, name, regionId: 'stage-b', regionVersion: 2, finishedAt: null }));
  fixture.status = 'RUNNING'; fixture.runningSince = fixture.now;
  fixture.config.tasks = fixture.teams.flatMap(board => Array.from({ length: 25 }, (_, i) => ({ id: `${board.id}-T${i + 1}`, boardId: board.id, title: `${board.name}真实测试任务${i + 1}`, brief: '测试要求', points: 5 })));
  let liveTeam = 'team-1', rejectSubmission = false;
  const commands = [], errors = [], results = [];
  const themes = ['phigros', 'arcaea', 'paradigm', 'maimai', 'community'];
  const mascots = ['geopelia', 'hikari', 'para', 'salt', 'iro'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, serviceWorkers: 'block' });
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('http://127.0.0.1:3000/');
    const player = await (await page.request.get('http://127.0.0.1:3000/src/player/PlayerApp.tsx')).text();
    const main = await (await page.request.get('http://127.0.0.1:3000/src/main.tsx')).text();
    const index = await (await page.request.get('http://127.0.0.1:3000/')).text();
    const preamble = [...index.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map(m => m[0]).find(s => s.includes('$RefreshReg$')) ?? '';
    const react = player.match(/from "([^"]*\/react\.js[^\"]*)"/)[1];
    const reactDOM = main.match(/from "([^"]*react-dom_client\.js[^\"]*)"/)[1];
    const html = `<!doctype html><html lang="zh-CN"><head>${preamble}<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css"><link rel="stylesheet" href="/src/redesign.css"><link rel="stylesheet" href="/src/player/photoBoard.css"></head><body><div id="root"></div><script type="module">
      import React from ${JSON.stringify(react)};import ReactDOM from ${JSON.stringify(reactDOM)};
      import {PlayerApp} from '/src/player/PlayerApp.tsx';import {teams} from '/src/data/mock.ts';import {initialSharedBingoTasks} from '/src/data/sharedBingoTasks.ts';
      function Test(){const [team,setTeam]=React.useState(0);window.__setTeam=setTeam;const noop=()=>{};return React.createElement(PlayerApp,{team:teams[team],tasks:initialSharedBingoTasks,approvedRegionId:'stage-b',cards:[],messages:[],onLogout:noop,onSubmitTask:noop,onUseCard:noop,onReadMessage:noop});}
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Test));
    </script></body></html>`;
    await page.route('**/__bingo-integration-test', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.route('**/api/games/bingo-ui-fixture/**', async route => {
      const url = route.request().url();
      if (url.endsWith('/login')) return route.fulfill({ json: { token: 'browser-fixture-only', role: 'player', teamId: liveTeam, leader: false, accountId: liveTeam } });
      if (url.endsWith('/state')) return route.fulfill({ json: stateView(fixture, { id: liveTeam, role: 'player', teamId: liveTeam }) });
      if (url.endsWith('/messages')) return route.fulfill({ json: { messages: [] } });
      if (url.endsWith('/commands')) {
        if (rejectSubmission) return route.fulfill({ status: 409, json: { message: '测试打回：保留上传草稿' } });
        commands.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({ status: 404, json: {} });
    });
    const loginLive = async () => {
      await page.goto('http://127.0.0.1:3000/?live=cards&game=bingo-ui-fixture');
      await page.getByRole('button', { name: '进入账号登录', exact: true }).click();
      await page.getByPlaceholder('请输入账号').fill('browser-fixture');
      await page.getByPlaceholder('请输入密码').fill('fixture-only');
      await page.getByRole('button', { name: '登录', exact: true }).click();
      await page.locator('.tb-cell').first().waitFor();
    };
    const check = async (mode, index, viewport) => {
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.querySelectorAll('.team-bingo:not(.bingo-peek) img')].map(img => img.decode())); await Promise.all([...document.querySelectorAll('.bingo-deck__card')].flatMap(card => card.getAnimations()).map(animation => animation.finished.catch(() => {}))); });
      const state = await page.locator('.team-bingo:not(.bingo-peek)').evaluate(root => {
        const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
        const mascot = root.querySelector('.tb-mascot'), frame = root.querySelector('.tb-frame'), surface = root.querySelector('.tb-board-surface'), core = root.querySelector('.tb-core');
        const cells = [...root.querySelectorAll('.tb-cell')];
        return { theme: root.dataset.bingoTheme, mascot: { ...rect(mascot), src: mascot.getAttribute('src'), z: +getComputedStyle(mascot).zIndex, hit: getComputedStyle(mascot).pointerEvents }, frame: { ...rect(frame), src: frame.getAttribute('src'), z: +getComputedStyle(frame).zIndex, hit: getComputedStyle(frame).pointerEvents }, surface: { ...rect(surface), z: +getComputedStyle(surface).zIndex }, coreZ: +getComputedStyle(core).zIndex, cells: cells.map(rect), images: root.querySelectorAll('.photo-preview__base').length, direct: root.querySelectorAll('.bingo-cell--direct').length, columns: getComputedStyle(root.querySelector('.tb-grid')).gridTemplateColumns.split(' ').length, overflow: document.documentElement.scrollWidth > innerWidth, regionButtons: root.querySelectorAll('.bingo-regions button').length };
      });
      assert.equal(state.theme, themes[index]);
      assert(state.mascot.src.endsWith(`${mascots[index]}.webp`));
      assert(state.frame.src.endsWith(`frame-${themes[index]}.svg`));
      assert(state.mascot.x < state.surface.x && state.mascot.y < state.surface.y, '角色必须在左上方');
      assert(state.mascot.y + state.mascot.height > state.surface.y, '棋盘需遮住角色下半部');
      assert(state.mascot.z < state.surface.z && state.surface.z < state.frame.z && state.frame.z < state.coreZ);
      assert.equal(state.mascot.hit, 'none'); assert.equal(state.frame.hit, 'none');
      if (state.overflow) console.log(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1; }).slice(0, 12).map(el => ({ element: el.tagName, class: el.className, right: el.getBoundingClientRect().right, width: el.getBoundingClientRect().width }))));
      assert.equal(state.cells.length, 25); assert.equal(state.images, 19); assert.equal(state.direct, 6);
      assert.equal(state.columns, 5); assert.equal(state.regionButtons, 0); assert.equal(state.overflow, false, `${mode} ${themes[index]} ${viewport.width}: 页面横向溢出`);
      assert(state.cells.every(cell => cell.width >= 44 && cell.height >= 44), `${mode} ${viewport.width}: 格子触控区域过小 ${Math.min(...state.cells.map(c=>c.width))}×${Math.min(...state.cells.map(c=>c.height))}`);
      for (const n of [0, 4, 20, 24]) await page.locator('.tb-cell').nth(n).click({ trial: true });
      const w = Math.round(state.frame.width), h = Math.round(state.frame.height);
      const { data, info } = await sharp(path.resolve(`public/images/team-bingo/frame-${themes[index]}.svg`)).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let occupied = 0;
      for (const c of state.cells) {
        for (let y = Math.ceil(c.y - state.frame.y) + 1; y < Math.floor(c.y + c.height - state.frame.y) - 1; y++)
          for (let x = Math.ceil(c.x - state.frame.x) + 1; x < Math.floor(c.x + c.width - state.frame.x) - 1; x++) if (data[(y * info.width + x) * 4 + 3] > 12) occupied++;
      }
      assert.equal(occupied, 0, '边框装饰不得侵入任务格');
      if ([375, 1440].includes(viewport.width)) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: path.join(out, `${mode}-${viewport.width}-${themes[index]}.png`), fullPage: true }); }
      results.push({ mode, team: themes[index], viewport: viewport.width, minWidth: Math.min(...state.cells.map(c => c.width)), minHeight: Math.min(...state.cells.map(c => c.height)), layers: [state.mascot.z, state.surface.z, state.frame.z, state.coreZ], decorationPixelsInCells: occupied });
    };
    const viewports = [{ width: 1440, height: 1100 }, { width: 375, height: 812 }, { width: 320, height: 700 }, { width: 768, height: 1024 }, { width: 812, height: 375 }];
    await page.goto('http://127.0.0.1:3000/__bingo-integration-test');
    await page.locator('.tb-cell').first().waitFor();
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (let i = 0; i < 5; i++) { await page.evaluate(i => window.__setTeam(i), i); await page.locator(`.bingo-deck__card[data-board-id=team-${i+1}][data-offset="0"]`).waitFor(); await check('demo', i, viewport); }
    }
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (let i = 0; i < 5; i++) { liveTeam = `team-${i + 1}`; await loginLive(); await check('live', i, viewport); }
    }
    await page.setViewportSize({ width: 375, height: 812 });
    liveTeam = 'team-1'; await loginLive();
    assert.equal(await page.locator('.bingo-deck__tabs button').count(), 5);
    await page.getByRole('button', { name: '下一张 Bingo', exact: true }).click();
    await page.locator('.bingo-deck__card[data-board-id=team-2][data-offset="0"]').waitFor();
    assert((await page.locator('.ability-header h1').innerText()).includes('Phigros队'), '切换Bingo不能改登录身份');
    assert((await page.locator('.photo-preview__base').evaluateAll(images => images.map(img => img.src))).every(url => url.includes('/region-2/')));
    await page.locator('.tb-cell[data-slot=P01]').click();
    await page.locator('.task-photo-detail img').evaluate(img => img.decode());
    assert((await page.locator('.task-photo-detail img').getAttribute('src')).includes('/region-2/01.webp'));
    assert.equal(await page.locator('.task-photo-detail img').evaluate(img => getComputedStyle(img).filter), 'none');
    const taskUpload = page.locator('[role=dialog] input[type=file]');
    await taskUpload.setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer() });
    rejectSubmission = true;
    await page.getByRole('button', { name: '提交任务审核', exact: true }).click();
    await page.locator('[role=dialog] [role=alert]').waitFor();
    assert.equal(await taskUpload.evaluate(input => input.files.length), 1, '失败必须保留上传草稿');
    rejectSubmission = false;
    await page.getByRole('button', { name: '提交任务审核', exact: true }).click();
    await page.locator('[role=dialog]').waitFor({ state: 'hidden' });
    assert.equal(commands.at(-1).kind, 'task'); assert.equal(commands.at(-1).regionId, 'stage-b'); assert.equal(commands.at(-1).taskId, 'team-2-T10'); assert.equal(commands.at(-1).teamId, undefined);
    const selectedTab = page.locator('.bingo-deck__tabs button[aria-pressed=true]'); await selectedTab.focus();
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    await page.locator('.bingo-deck__card[data-board-id=team-1][data-offset="0"]').waitFor();
    assert.equal(await page.locator('.bingo-deck__tabs button[aria-pressed=true]').count(), 1);
    await page.getByRole('button', { name: '上一张 Bingo', exact: true }).click();
    await page.locator('.bingo-deck__card[data-board-id=team-5][data-offset="0"]').waitFor();
    await page.locator('.tb-cell').nth(12).scrollIntoViewIfNeeded();
    const touch = await page.context().newCDPSession(page);
    const swipe = async (dx, dy = 0) => {
      // 在固定视口内起手，不能用正在横移的卡片位置作为下一次手势起点。
      const box = await page.locator('.bingo-deck__viewport').boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      const point = (x, y) => [{ x, y, radiusX: 3, radiusY: 3, force: 1, id: 1 }];
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(x, y) });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(x + dx, y + dy) });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await swipe(-90);
    await page.locator('.bingo-deck__card[data-board-id=team-1][data-offset="0"]').waitFor();
    assert.equal(await page.locator('[role=dialog]').count(), 0, '横滑不得顺手打开任务');
    await swipe(90);
    await page.locator('.bingo-deck__card[data-board-id=team-5][data-offset="0"]').waitFor();
    await swipe(8, -80);
    assert.equal(await page.locator('.bingo-deck__card[data-board-id=team-5][data-offset="0"]').count(), 1, '纵向滚动不得切卡');
    await touch.detach();
    const before = await page.locator('.photo-preview__base').evaluateAll(images => images.map(img => img.src));
    await page.locator('.live-arrival summary').click();
    await page.locator('.live-arrival input[type=file]').setInputFiles({ name: 'arrival.png', mimeType: 'image/png', buffer: await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer() });
    await page.getByRole('button', { name: '提交到达审核', exact: true }).click();
    await page.getByText('已提交，等待工作人员审核。', { exact: true }).waitFor();
    assert.equal(commands.at(-1).kind, 'arrival'); assert.equal(commands.at(-1).regionId, 'stage-c');
    assert.deepEqual(await page.locator('.photo-preview__base').evaluateAll(images => images.map(img => img.src)), before, '提交入口不能立即换区');
    fixture.teams[0].regionId = 'stage-c'; fixture.teams[0].regionVersion++;
    await page.waitForFunction(() => [...document.querySelectorAll('.photo-preview__base')].every(img => img.src.includes('/region-3/')));
    await page.getByRole('button', { name: '暂停动效', exact: true }).click();
    assert(await page.locator('.team-bingo:not(.bingo-peek)').evaluate(root => root.classList.contains('tb-paused')));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.photo-preview__haze').first().evaluate(img => getComputedStyle(img).animationName), 'none');
    assert.deepEqual(errors, []);
    const report = { checks: results, crossBoardSubmission: true, sameActorAndApprovedRegionAcrossBoards: true, rapidKeyboardAndCyclicNavigation: true, touchSwipeAndScrollIsolation: true, clearDetailOnlyOnClick: true, taskSubmitUsesApprovedRegion: true, submissionFailurePreservesDraft: true, arrivalDoesNotSwitchBeforeApproval: true, approvalChangesAll19: true, pauseAndReducedMotion: true, browserErrors: errors };
    await fs.writeFile(path.join(out, 'verification.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ layoutsChecked: results.length, modes: ['demo', 'live'], boards: 5, tasks: 125, viewports: 5, crossBoardSubmission: 'pass', rapidCyclicKeyboardNavigation: 'pass', touchSwipeAndScrollIsolation: 'pass', rearUpperLeftMascots: true, decorationPixelsInCells: 0, clearDetailAndSubmission: 'pass', approvedRegionSync: 'pass', browserErrors: errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
