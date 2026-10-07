// 隔离挂载登录组件，使用虚构输入，只验证回调，绝不提交真实登录请求。
const { chromium } = require('C:/Users/24175/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const origin = process.env.LOGIN_PREVIEW_URL || 'http://127.0.0.1:3000';
  const out = path.resolve('artifacts/login-poster-20261007');
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ serviceWorkers: 'block' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const settle = () => page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(img => img.decode().catch(() => {})));
    await Promise.all(document.getAnimations()
      .filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime))
      .map(animation => animation.finished.catch(() => {})));
  });

  try {
    const component = await (await page.request.get(`${origin}/src/components/LoginScreen.tsx`)).text();
    const main = await (await page.request.get(`${origin}/src/main.tsx`)).text();
    const index = await (await page.request.get(origin)).text();
    const preamble = [...index.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)]
      .map(match => match[0]).find(script => script.includes('$RefreshReg$')) ?? '';
    const react = component.match(/from "([^"]*\/react\.js[^\"]*)"/)[1];
    const reactDOM = main.match(/from "([^"]*react-dom_client\.js[^\"]*)"/)[1];
    await page.route('**/__login-poster-test', route => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="zh-CN"><head>${preamble}
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <link rel="stylesheet" href="/src/styles.css"><link rel="stylesheet" href="/src/redesign.css">
        </head><body><div id="root"></div><script type="module">
        import React from ${JSON.stringify(react)};import ReactDOM from ${JSON.stringify(reactDOM)};
        import {LoginScreen} from '/src/components/LoginScreen.tsx';
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(LoginScreen,
          {onLogin:(mode,username,password)=>{window.__login={mode,username,password};}}));
        </script></body></html>`,
    }));
    await page.goto(`${origin}/__login-poster-test`);
    await page.getByRole('heading', { name: /失序\s*重奏/ }).waitFor();
    assert.equal(await page.locator('.login-panel .device-note').count(), 0);
    assert(!(await page.locator('.login-panel').innerText()).includes('正式活动需安装 PWA'));
    const viewports = [
      { width: 1440, height: 900 }, { width: 2048, height: 1113 },
      { width: 375, height: 812 }, { width: 320, height: 700 },
      { width: 768, height: 1024 }, { width: 812, height: 375 },
    ];
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await settle();
      assert.equal((await page.locator('.login-hero').innerText()).replace(/\s/g, ''), '失序重奏');
      const layout = await page.evaluate(() => {
        const hero = document.querySelector('.login-hero').getBoundingClientRect();
        const title = document.querySelector('#login-title').getBoundingClientRect();
        const img = document.querySelector('.login-event-art img');
        const crop = document.querySelector('.login-event-art__window').getBoundingClientRect();
        const imageRect = img.getBoundingClientRect();
        const sourceTop = (crop.top - imageRect.top) / imageRect.width * img.naturalWidth;
        const sourceBottom = (crop.bottom - imageRect.top) / imageRect.width * img.naturalWidth;
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          titleInside: title.left >= hero.left && title.right <= hero.right && title.top >= hero.top && title.bottom <= hero.bottom,
          imageLoaded: img.naturalWidth === 724 && img.naturalHeight === 2172,
          sourceTop, sourceBottom,
          controlsInside: [...document.querySelectorAll('.login-panel input,.login-panel button')].every(el => {
            const rect = el.getBoundingClientRect();
            return rect.left >= 0 && rect.right <= innerWidth && rect.height >= 44;
          }),
          font: getComputedStyle(document.querySelector('#login-title')).fontFamily,
        };
      });
      assert.equal(layout.overflow, false, `${viewport.width}px：页面横向溢出`);
      assert.equal(layout.titleInside, true, `${viewport.width}px：标题越界`);
      assert.equal(layout.controlsInside, true, `${viewport.width}px：登录控件越界或小于44px`);
      assert.equal(layout.imageLoaded, true);
      assert(layout.sourceTop > 315 && layout.sourceBottom < 1040, '可视窗口不得露出海报文字');
      assert(layout.font.includes('Alimama FangYuanTi VF'));
      if (viewport.width === 1440 || viewport.width === 375) {
        await page.screenshot({ path: path.join(out, viewport.width === 1440 ? 'login-desktop.png' : 'login-mobile.png'), fullPage: true });
      }
    }

    await page.getByRole('tab', { name: '工作人员' }).click();
    assert.equal(await page.getByRole('tab', { name: '工作人员' }).getAttribute('aria-selected'), 'true');
    await page.getByPlaceholder('请输入账号').fill('fixture-user');
    await page.getByPlaceholder('请输入密码').fill('fixture-password');
    await page.getByRole('button', { name: '显示密码', exact: true }).click();
    assert.equal(await page.getByPlaceholder('请输入密码').getAttribute('type'), 'text');
    await page.getByRole('button', { name: '隐藏密码', exact: true }).click();
    assert.equal(await page.getByPlaceholder('请输入密码').getAttribute('type'), 'password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__login), { mode: 'staff', username: 'fixture-user', password: 'fixture-password' });
    await page.getByRole('tab', { name: '玩家账号' }).click();
    await page.getByRole('button', { name: '登录', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__login.mode), 'player');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert(await page.locator('.login-event-title,.login-event-art').evaluateAll(elements => elements.every(el => getComputedStyle(el).animationName === 'none')));
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ layouts: viewports.length, onlyProjectTitle: 'pass', posterCrop: 'pass', loginControls: 'pass', reducedMotion: 'pass', browserErrors: errors }));
  } catch (error) {
    console.error(JSON.stringify({ browserErrors: errors, visibleText: await page.locator('body').innerText() }));
    throw error;
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
