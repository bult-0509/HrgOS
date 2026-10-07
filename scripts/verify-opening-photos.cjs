// 隔离浏览器与内存赛局：不登录、不写入实际比赛。
const { chromium } = require('C:/Users/24175/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const sharp = require('sharp');

(async () => {
  const origin = 'http://127.0.0.1:3000';
  const out = path.resolve('artifacts/opening-photos-20261007');
  await fs.mkdir(out, { recursive: true });
  const { seedState, executeCommand, stateView, visibleMedia } = await import(pathToFileURL(path.resolve('server/rules.mjs')));
  const { officialScoring } = await import(pathToFileURL(path.resolve('server/scoring.mjs')));
  const player = { id: 'opening-fixture-player', role: 'player', teamId: 'team-1' };
  const staff = { id: 'opening-fixture-staff', role: 'staff', manage: true, review: true };
  const state = seedState([player, staff]);
  state.config.tasks = structuredClone(officialScoring.tasks);
  state.status = 'RUNNING'; state.runningSince = state.now;
  const originalTasks = JSON.stringify(state.config.tasks);
  const proof = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer();
  const media = { name: 'fixture-replica.png', mime: 'image/png', base64: proof.toString('base64') };
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, serviceWorkers: 'block' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const view = () => {
    const result = stateView(state, player);
    if (result.openingPuzzle?.configured) result.openingPuzzle.imageSrc = `/__opening-media/${result.openingPuzzle.mediaId}`;
    return { ...result, openingPuzzles: stateView(state, staff).openingPuzzles };
  };
  try {
    await page.route('**/__opening-state', route => route.fulfill({ json: view() }));
    await page.route('**/__opening-media/*', async route => {
      try {
        const item = visibleMedia(state, player, new URL(route.request().url()).pathname.split('/').at(-1));
        await route.fulfill({ contentType: item.mime, body: Buffer.from(item.base64, 'base64') });
      } catch (error) { await route.fulfill({ status: error.statusCode ?? 403, body: error.message }); }
    });
    await page.route('**/__opening-command', async route => {
      try {
        const body = route.request().postDataJSON();
        await executeCommand(state, body.type === 'opening_puzzle_preset' ? staff : player, { ...body, ...(body.kind === 'arrival' ? { media } : {}) }, crypto.randomUUID());
        await route.fulfill({ json: view() });
      } catch (error) { await route.fulfill({ status: error.statusCode ?? 409, json: { error: error.message } }); }
    });
    const source = await (await page.request.get(`${origin}/src/player/PlayerApp.tsx`)).text();
    const main = await (await page.request.get(`${origin}/src/main.tsx`)).text();
    const index = await (await page.request.get(origin)).text();
    const react = source.match(/from "([^"]*\/react\.js[^\"]*)"/)[1];
    const reactDOM = main.match(/from "([^"]*react-dom_client\.js[^\"]*)"/)[1];
    const preamble = [...index.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map(match => match[0]).find(script => script.includes('$RefreshReg$')) ?? '';
    await page.route('**/__opening-photo-test*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="zh-CN"><head>${preamble}<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css"><link rel="stylesheet" href="/src/redesign.css"><link rel="stylesheet" href="/src/player/photoBoard.css"><link rel="stylesheet" href="/src/ability/ability.css"></head><body><div id="root"></div><script type="module">
      import React from ${JSON.stringify(react)};import ReactDOM from ${JSON.stringify(reactDOM)};
      import {LiveTaskBoard} from '/src/ability/LiveTaskBoard.tsx';import {OpeningPuzzleEditor} from '/src/ability/OpeningPuzzleEditor.tsx';
      import {RegionTaskArea} from '/src/player/RegionTaskArea.tsx';import {getOpeningPuzzle} from '/src/data/openingPuzzles.ts';
      import DemoApp from '/src/DemoApp.tsx';
      function Test(){const[view,setView]=React.useState(null);const refresh=async()=>setView(await(await fetch('/__opening-state')).json());window.__refresh=refresh;React.useEffect(()=>{refresh();},[]);const command=async(body)=>{const response=await fetch('/__opening-command',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const next=await response.json();if(!response.ok)throw new Error(next.error);setView(next);};if(!view)return null;
      const query=new URLSearchParams(location.search);if(query.get('mode')==='app')return React.createElement(DemoApp,{mode:'player',account:{username:'opening-fixture-'+query.get('team'),role:'player',teamId:query.get('team')},onLogout:()=>{}});if(query.get('mode')==='editor')return React.createElement('main',{className:'ability-app'},React.createElement(OpeningPuzzleEditor,{puzzles:view.openingPuzzles,busy:false,finished:view.status==='FINISHED',run:command,renderImage:()=>null}));
      if(query.get('mode')==='demo')return React.createElement('main',{className:'ability-app'},React.createElement(RegionTaskArea,{teamId:view.team.id,approvedRegionId:view.team.regionId,journey:view.regionJourney,puzzle:getOpeningPuzzle(view.regionJourney.targetRegionId),onSubmit:async()=>{}},'不应显示旧任务'));
      return React.createElement('main',{className:'ability-app'},React.createElement(LiveTaskBoard,{team:view.team,tasks:view.tasks,status:view.status,busy:false,blocked:false,submissions:view.submissions,regionJourney:view.regionJourney,openingPuzzle:view.openingPuzzle,openingReference:view.openingPuzzle?.configured?React.createElement('a',{href:view.openingPuzzle.imageSrc,target:'_blank'},React.createElement('img',{className:'ability-proof',src:view.openingPuzzle.imageSrc,width:view.openingPuzzle.width,height:view.openingPuzzle.height,alt:'开场参考照片'})):null,submit:command}));}
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Test));
      </script></body></html>` }));

    await page.goto(`${origin}/__opening-photo-test?mode=editor`);
    await page.getByRole('button', { name: '载入本次确认的三张开场图', exact: true }).click();
    await page.getByText('01 · 西湖文化广场 · 已配置', { exact: true }).waitFor();
    assert.deepEqual(Object.values(state.config.openingPuzzles).map(item => item.assetId), ['opening-region-1', 'opening-region-2', 'opening-region-3']);
    assert.equal(JSON.stringify(state.config.tasks), originalTasks, '载入照片不能修改任务格位与分值');
    assert.equal(state.ledger.length, 0);
    assert(state.audit.some(item => item.type === 'opening_puzzle_preset' || item.command?.type === 'opening_puzzle_preset'), '载入须留痕');

    let layouts = 0;
    for (const [regionId, width, height] of [['stage-a', 1448, 1086], ['stage-b', 1448, 1086], ['stage-c', 1853, 849]]) {
      if (state.teams[0].regionId) {
        await page.goto(`${origin}/__opening-photo-test`);
        await page.getByRole('button', { name: '进入下一区域' }).click();
      } else await page.goto(`${origin}/__opening-photo-test`);
      const opening = page.getByRole('region', { name: '区域开场谜题' });
      await opening.waitFor();
      assert.equal(await opening.getAttribute('data-region-target'), regionId);
      const beforeRegion = state.teams[0].regionId;
      for (const viewport of [{ width: 375, height: 812 }, { width: 812, height: 375 }, { width: 1440, height: 1000 }]) {
        await page.setViewportSize(viewport);
        await opening.locator('img').evaluate(img => img.decode());
        await page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {}))); });
        const geometry = await opening.locator('img').evaluate(img => ({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, fit: getComputedStyle(img).objectFit, overflow: document.documentElement.scrollWidth > innerWidth, rect: { width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height } }));
        assert.deepEqual([geometry.naturalWidth, geometry.naturalHeight], [width, height]);
        assert.equal(geometry.fit, 'contain', '参考照片不能裁掉招牌或建筑线索');
        assert.equal(geometry.overflow, false, `${regionId}/${viewport.width}px 横向溢出`);
        assert.equal(await opening.locator('input[type=file]').isDisabled(), false);
        assert.equal(await page.locator('.tb-cell').count(), 0);
        await page.screenshot({ path: path.join(out, `${regionId}-${viewport.width}.png`), fullPage: true });
        layouts++;
      }
      // 演示与正式玩家组件使用相同区域对应关系。
      await page.goto(`${origin}/__opening-photo-test?mode=demo`);
      const demo = page.getByRole('region', { name: '区域开场谜题' });
      await demo.locator('img').evaluate(img => img.decode());
      assert((await demo.locator('img').getAttribute('src')).includes(`region-${['stage-a', 'stage-b', 'stage-c'].indexOf(regionId) + 1}.webp`));
      await page.goto(`${origin}/__opening-photo-test`);
      await opening.locator('input[type=file]').setInputFiles({ name: 'fixture-replica.png', mimeType: 'image/png', buffer: proof });
      await opening.getByRole('button', { name: '提交开场谜题审核', exact: true }).click();
      await opening.getByText('等待工作人员审核', { exact: true }).waitFor();
      const submitted = state.submissions.at(-1);
      assert.equal(submitted.regionId, regionId);
      assert.equal(submitted.openingPuzzle.assetId, `opening-region-${['stage-a', 'stage-b', 'stage-c'].indexOf(regionId) + 1}`);
      assert.equal(state.teams[0].regionId, beforeRegion, '提交不能提前换区');
      assert.equal(state.ledger.length, 0, '开场不计任务分');
      await page.reload(); await opening.waitFor();
      assert.equal(await page.locator('.tb-cell').count(), 0, '刷新不能跳过审核');
      if (regionId === 'stage-b') {
        const snapshot = structuredClone(submitted.openingPuzzle);
        await page.goto(`${origin}/__opening-photo-test?mode=editor`);
        await page.getByRole('button', { name: '载入本次确认的三张开场图', exact: true }).click();
        await page.waitForFunction(() => window.document.querySelector('button')?.disabled === false);
        assert.deepEqual(submitted.openingPuzzle, snapshot, '重新载入不得更改待审参考图快照');
        assert.equal(visibleMedia(state, staff, snapshot.mediaId).openingRegionId, 'stage-b');
        assert.notEqual(state.config.openingPuzzles['stage-b'].mediaId, snapshot.mediaId);
      }
      await executeCommand(state, staff, { type: 'review', submissionId: submitted.id, result: 'approve' }, crypto.randomUUID());
      await page.goto(`${origin}/__opening-photo-test`);
      await page.locator('.tb-cell').first().waitFor();
      assert.equal(state.teams[0].regionId, regionId);
      assert.equal(stateView(state, player).regionJourney.completed, 0, '开场不得占用每区任务名额');
      assert.equal(state.ledger.length, 0);
      if (regionId === 'stage-b') {
        for (let board = 0; board < 5; board++) {
          const active = page.locator('.bingo-deck__card[data-offset="0"]');
          assert.equal(await active.locator('.tb-cell[data-slot^=P]').count(), 19);
          assert.equal(await active.locator('.tb-cell[data-slot^=D]').count(), 6);
          assert((await active.locator('.tb-cell[data-slot=P01] img').first().getAttribute('src')).includes('/region-2/01-skii-v1-preview.webp'));
          assert.equal(await active.locator('img[src*="/region-2/01-preview.webp"]').count(), 0, '展览馆不能继续作为普通任务图');
          await page.getByRole('button', { name: '下一张 Bingo', exact: true }).click();
          await page.waitForTimeout(350);
        }
      }
    }
    assert.equal(JSON.stringify(state.config.tasks), originalTasks);
    for (const [teamId, target, image] of [['team-3', 'stage-b', 'region-2.webp'], ['team-1', 'stage-c', 'region-3.webp']]) {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`${origin}/__opening-photo-test?mode=app&team=${teamId}`);
      await page.getByRole('dialog', { name: '开场引导' }).getByRole('button', { name: '了解规则，开始探索' }).click();
      await page.getByRole('button', { name: '进入下一区域' }).click();
      const opening = page.getByRole('region', { name: '区域开场谜题' });
      await opening.locator('img').evaluate(img => img.decode());
      assert.equal(await opening.getAttribute('data-region-target'), target);
      assert((await opening.locator('img').getAttribute('src')).includes(image));
      assert.equal(await page.locator('.tb-cell').count(), 0);
      await page.screenshot({ path: path.join(out, `integrated-${teamId}-375.png`), fullPage: true });
      await page.reload(); await opening.waitFor();
      assert.equal(await opening.getAttribute('data-region-target'), target, '整合页面刷新不能调换区域');
    }
    state.status = 'FINISHED';
    await page.goto(`${origin}/__opening-photo-test?mode=editor`);
    assert.equal(await page.getByRole('button', { name: '载入本次确认的三张开场图' }).isDisabled(), true);
    assert.deepEqual(errors, []);
    const result = { layouts, regionOrder: [1, 2, 3], attachmentOrder: [3, 1, 2], allFiveBoards: '19图寻 + 6直接任务；区域2/P01为SK-II', scoreAndQuota: '开场审核均为0', pendingSnapshot: '重新载入后保留', errors };
    await fs.writeFile(path.join(out, 'verification.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
