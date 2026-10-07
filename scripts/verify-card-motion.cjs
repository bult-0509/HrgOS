// 所有库存和请求都在内存中；不创建、不发卡、不修改真实比赛。
const { chromium } = require('C:/Users/24175/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const { abilityCatalog } = await import(pathToFileURL(path.resolve('server/abilityCards.mjs')));
  const out = path.resolve('artifacts/card-motion'); await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const errors = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  const check = (name, value = true) => { assert(value, name); checks.push(name); };
  try {
    const origin = 'http://127.0.0.1:3000';
    const player = await (await page.request.get(`${origin}/src/player/PlayerApp.tsx`)).text();
    const main = await (await page.request.get(`${origin}/src/main.tsx`)).text();
    const index = await (await page.request.get(origin)).text();
    const preamble = [...index.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map(m => m[0]).find(s => s.includes('$RefreshReg$')) ?? '';
    const react = player.match(/from "([^"]*\/react\.js[^\"]*)"/)[1];
    const reactDOM = main.match(/from "([^"]*react-dom_client\.js[^\"]*)"/)[1];
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8">${preamble}<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css"><link rel="stylesheet" href="/src/redesign.css"><link rel="stylesheet" href="/src/ability/ability.css"></head><body><div id="root"></div><script type="module">
      import React from ${JSON.stringify(react)}; import ReactDOM from ${JSON.stringify(reactDOM)};
      import CardRewards from '/src/ability/CardRewards.tsx'; import {CardInventory} from '/src/ability/CardInventory.tsx';
      import {CardDeckDock} from '/src/cards/TacticCard.tsx'; import {Modal} from '/src/components/ui.tsx';
      import {PlayerApp} from '/src/player/PlayerApp.tsx'; import {initialCards,teams} from '/src/data/mock.ts';
      import {initialSharedBingoTasks} from '/src/data/sharedBingoTasks.ts';
      const catalog=${JSON.stringify(abilityCatalog)};
      window.__commands=[]; window.__confirmMode='ok'; window.__uses=[];
      function Test(){
        const [cards,setCards]=React.useState([{id:'held',number:3,status:'AVAILABLE',revealedBy:['me']}]);
        const [preview,setPreview]=React.useState(null); const [blocking,setBlocking]=React.useState(false);
        const [busy,setBusy]=React.useState(false); const [revision,setRevision]=React.useState(0);
        const [demoCards,setDemoCards]=React.useState(initialCards);
        window.__grant=(number,id)=>setCards(c=>[...c,{id,number,status:'AVAILABLE',revealedBy:[]}]);
        window.__preview=number=>setPreview({id:crypto.randomUUID(),number,source:'preview'});
        window.__rerender=()=>setRevision(x=>x+1);
        window.__addDemoCard=()=>setDemoCards(c=>[...c,{...initialCards[1],id:'new-demo'}]);
        const client={command:async(body)=>{window.__commands.push(body);if(window.__confirmMode==='fail')throw new Error('测试网络故障');if(window.__confirmMode==='wait')await new Promise(resolve=>window.__releaseConfirm=resolve);setCards(c=>c.map(card=>card.id===body.instanceId?{...card,revealedBy:['me']}:card));return {ok:true};}};
        if(location.search.includes('player'))return React.createElement(PlayerApp,{team:teams[0],tasks:initialSharedBingoTasks,approvedRegionId:'stage-b',cards:demoCards,messages:[],onLogout:()=>{},onSubmitTask:()=>{},onUseCard:(id,target)=>{window.__uses.push({id,target});setDemoCards(c=>c.filter(card=>card.id!==id));},onReadMessage:()=>{}});
        return React.createElement('main',{className:'ability-app'},React.createElement('h1',null,'卡牌交互验收'),
          React.createElement('button',{id:'open-task',onClick:()=>setBlocking(true)},'打开已有任务'),
          React.createElement('span',{'data-revision':revision},revision),
          React.createElement(CardDeckDock,{count:cards.filter(c=>c.status==='AVAILABLE').length,onClick:()=>{}}),
          React.createElement(CardInventory,{cards,catalog,teams,teamId:'team-1',staff:false,busy,running:true,onUse:async(id,target)=>{setBusy(true);try{window.__uses.push({id,target});if(window.__useFail)throw new Error('测试出牌失败');setCards(c=>c.map(card=>card.id===id?{...card,status:'USED'}:card));}finally{setBusy(false);}}}),
          React.createElement(CardRewards,{view:{abilityCards:cards,abilityCatalog:catalog},accountId:'me',staff:!!preview,client,refresh:async()=>setRevision(x=>x+1),preview,closePreview:()=>setPreview(null)}),
          blocking?React.createElement(Modal,{title:'已有任务',onClose:()=>setBlocking(false)},React.createElement('input',{'aria-label':'未提交草稿',defaultValue:'保留草稿'})):null);
      }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(Test)));
    </script></body></html>`;
    await page.route('**/__card-motion-test*', route => route.fulfill({ contentType: 'text/html', body: html }));
    // 防止测试意外访问真实比赛端点。
    await page.route('**/api/**', route => route.abort());
    const load = async (mode = '') => { await page.goto(`${origin}/__card-motion-test${mode ? '?'+mode : ''}`); await page.locator('.hrg-hand-card').first().waitFor(); await page.evaluate(() => document.fonts.ready); };
    const ready = async () => { await page.locator('.hrg-receipt[data-phase="ready"]').waitFor(); };
    const claim = async () => { await ready(); await page.getByRole('button', { name: '收入牌库', exact: true }).click(); await page.locator('.hrg-receipt').waitFor({ state: 'hidden' }); };
    const visibleModalCount = () => page.locator('dialog[open]').count();

    await load();
    check('初始持有卡不重复弹出', await page.locator('.hrg-receipt').count() === 0);
    // 同一个输入框在父组件刷新后不丢焦点，新卡也不覆盖它。
    await page.locator('#open-task').click();
    await page.getByRole('textbox', { name: '未提交草稿' }).fill('正在编辑');
    await page.evaluate(() => { window.__rerender(); window.__grant(8,'queued-1'); window.__grant(22,'queued-2'); });
    check('刷新保留输入焦点', await page.getByRole('textbox', { name: '未提交草稿' }).evaluate(el => el === document.activeElement));
    check('任务操作期间延后收卡', await page.locator('.hrg-receipt').count() === 0);
    await page.keyboard.press('Escape'); await ready();
    check('关闭任务后只展示一张奖励', await visibleModalCount() === 1);
    await page.getByRole('button', { name: '收入牌库', exact: true }).click();
    await page.locator('.hrg-receipt [data-card-face="queued-2"]').waitFor(); await ready();
    check('多张补给按顺序依次展示');
    await claim();
    check('收卡不扣库存', await page.locator('.hrg-hand-card').count() === 3);
    check('只发送展示确认', (await page.evaluate(() => window.__commands)).every(command => command.type === 'ability_reveal'));
    await page.evaluate(() => window.__rerender());
    check('刷新不重播已展示卡', await page.locator('.hrg-receipt').count() === 0);

    await page.evaluate(() => { window.__confirmMode='fail'; window.__grant(9,'retry'); }); await ready();
    await page.getByRole('button', { name: '收入牌库', exact: true }).click();
    await page.getByRole('alert').waitFor(); check('确认失败保留卡面和重试按钮', await page.getByRole('button', { name: '收入牌库', exact: true }).isEnabled());
    await page.evaluate(() => window.__confirmMode='wait');
    await page.getByRole('button', { name: '收入牌库', exact: true }).click();
    await page.locator('.hrg-receipt[data-phase="saving"]').waitFor();
    await page.evaluate(() => { document.querySelector('.hrg-receipt__claim').click(); document.querySelector('.hrg-receipt__claim').click(); });
    check('防止重复确认', (await page.evaluate(() => window.__commands.filter(c=>c.instanceId==='retry').length)) === 2);
    check('确认过程中有明确等待状态', await page.getByRole('button', { name:'确认中…', exact:true }).isDisabled());
    await page.evaluate(() => window.__releaseConfirm());
    await page.locator('.hrg-receipt[data-phase="flight"]').waitFor();
    await page.evaluate(() => document.querySelector('.hrg-receipt__flight').getAnimations().forEach(animation=>animation.cancel()));
    await page.locator('.hrg-receipt').waitFor({state:'hidden'});
    check('飞行动画中断不回滚已确认卡');
    check('关闭后恢复背景滚动', await page.evaluate(() => document.body.style.overflow) === '');

    // 桌面、窄屏、标准手机、横屏都能读完整规则并触及按钮。
    for (const [width,height] of [[1440,1000],[320,640],[375,812],[812,375]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(() => window.__preview(9)); await ready();
      const layout = await page.evaluate(() => {
        const dialog=document.querySelector('.hrg-receipt'), card=dialog.querySelector('.hrg-tactic-card'), action=dialog.querySelector('.hrg-receipt__claim'), rules=dialog.querySelector('.hrg-tactic-card__rules');
        const r=card.getBoundingClientRect(), a=action.getBoundingClientRect(), dock=dialog.querySelector('.hrg-receipt__dock').getBoundingClientRect(), real=document.querySelector('[data-card-deck]').getBoundingClientRect();
        return { overflow:dialog.scrollWidth>innerWidth+1, card:[r.left,r.right], action:[a.top,a.bottom], font:getComputedStyle(rules).fontSize, dockMatch:Math.abs(dock.left-real.left)<1&&Math.abs(dock.top-real.top)<1 };
      });
      check(`${width}×${height}无横向溢出且卡面完整`, !layout.overflow && layout.card[0]>=0 && layout.card[1]<=width);
      check(`${width}×${height}可触及收卡按钮`, layout.action[0]>=0 && layout.action[1]<=height);
      check(`${width}×${height}完整规则不缩成小字`, +layout.font.replace('px','')>=16);
      check(`${width}×${height}飞入锚点与真实牌库对齐`, layout.dockMatch);
      await page.screenshot({path:path.join(out,`receipt-${width}x${height}.png`)});
      await claim();
    }
    check('工作人员预览不发送确认', (await page.evaluate(()=>window.__commands.length))===4);

    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(() => { window.__confirmMode='ok'; window.__grant(8,'reduced'); }); await ready();
    check('减弱动态跳过入场动画', await page.locator('.hrg-receipt__turn').evaluate(el=>getComputedStyle(el).animationName)==='none');
    await claim(); check('减弱动态仍正常确认收卡');
    await page.emulateMedia({reducedMotion:'no-preference'});

    await load(); await page.evaluate(()=>{window.__confirmMode='wait';window.__grant(8,'early');});
    await page.locator('.hrg-receipt[data-phase="enter"]').waitFor();
    await page.getByRole('button',{name:'收入牌库',exact:true}).click();
    await page.waitForTimeout(750); // 覆盖入场定时器触发的真实边界，不是业务等待。
    check('提前收卡后入场计时器不覆盖确认状态',await page.locator('.hrg-receipt[data-phase="saving"]').count()===1);
    await page.evaluate(()=>window.__releaseConfirm()); await page.locator('.hrg-receipt[data-phase="flight"]').waitFor();
    await page.emulateMedia({reducedMotion:'reduce'}); await page.locator('.hrg-receipt').waitFor({state:'hidden'});
    check('飞行期间切换减弱动态可立即完成'); await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>window.__preview(3)); await ready(); const commandsBefore=await page.evaluate(()=>window.__commands.length);
    await page.keyboard.press('Escape'); await page.locator('.hrg-receipt').waitFor({state:'hidden'});
    check('Escape稍后查看不发送展示确认',await page.evaluate(()=>window.__commands.length)===commandsBefore);

    await page.setViewportSize({width:1440,height:1000}); await load('player');
    await page.locator('.hand-section').scrollIntoViewIfNeeded();
    await page.evaluate(async()=>Promise.all(document.querySelector('.hrg-card-hand').getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{}))));
    const first=page.locator('.hrg-hand-card').first();
    const before=await first.boundingBox(); await first.hover();
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.hrg-hand-card')).zIndex==='100');
    await page.evaluate(async()=>Promise.all(document.querySelector('.hrg-card-hand').getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{}))));
    const after=await first.boundingBox();
    check('发牌结束后仍可抬牌并置顶', after.y<before.y-15);
    check('抬牌不被手牌容器裁切', await first.evaluate(el=>{const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom;}));
    await page.screenshot({path:path.join(out,'hand-desktop-hover.png')});
    await first.click(); await page.locator('dialog.modal-backdrop[open]').waitFor();
    check('详情在原生顶层且统一卡面', await page.locator('dialog.modal-backdrop[open] [data-card-face="C-01"]').count()===1);
    await page.keyboard.press('Tab'); check('焦点留在详情层',await page.locator('dialog.modal-backdrop').evaluate(el=>el.contains(document.activeElement)));
    await page.evaluate(()=>window.__addDemoCard());
    check('演示新卡也不打断详情', await page.locator('.hrg-receipt').count()===0);
    await page.getByRole('button',{name:'关闭弹窗',exact:true}).click(); await ready(); await claim();
    check('演示新卡接入同一收卡流程');
    await first.click(); await page.getByRole('button',{name:'打出这张牌',exact:true}).click();
    await page.locator('.hrg-card-cast').waitFor(); check('出牌与奖励不叠加',await visibleModalCount()===1);
    await page.locator('.hrg-card-cast').waitFor({state:'hidden'});
    check('出牌只调用一次', (await page.evaluate(()=>window.__uses.length))===1);
    check('出牌后恢复滚动',await page.evaluate(()=>document.body.style.overflow)==='');
    check('出牌后焦点回到可操作控件',await page.evaluate(()=>document.activeElement?.matches('button')));

    await page.setViewportSize({width:375,height:812}); await load('player');
    await page.locator('.hand-section').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(out,'hand-mobile.png')});
    check('手机手牌横滑而不撑开页面',await page.evaluate(()=>{const hand=document.querySelector('.hrg-card-hand');return hand.scrollWidth>hand.clientWidth&&document.documentElement.scrollWidth<=innerWidth;}));
    await page.locator('.hrg-hand-card').last().click(); await page.locator('dialog.modal-backdrop[open]').waitFor();
    check('触屏尺寸可选最右手牌并读完整规则',await page.locator('dialog[open] [data-card-face="C-03"]').count()===1);
    await page.keyboard.press('Escape'); await page.locator('dialog').waitFor({state:'hidden'});

    // 正式牌库的操作使用相同入口，失败时不耗卡、不关闭详情。
    await load(); await page.locator('.hrg-hand-card').first().click();
    await page.evaluate(()=>window.__useFail=true); await page.getByRole('button',{name:'打出这张牌',exact:true}).click();
    await page.getByRole('alert').waitFor();
    check('正式出牌失败保留目标选择与卡牌详情', await page.locator('dialog[open] .hrg-card-use-form').count()===1);
    await page.evaluate(()=>window.__useFail=false); await page.getByRole('button',{name:'打出这张牌',exact:true}).click();
    await page.locator('.hrg-card-cast').waitFor(); await page.locator('.hrg-card-cast').waitFor({state:'hidden'});
    check('正式出牌成功播放统一动效');

    // 实际用户打开的预览：逐张读取真实目录，不增加持有数量或虚构卡面。
    await page.goto(`${origin}/?preview=player&rev=named-ability-cards`);
    await page.locator('.hrg-card-hand').waitFor();
    const selector=page.getByRole('combobox',{name:'选择功能卡预览',exact:true});
    const names=await selector.locator('option').allTextContents();
    check('真实预览逐张显示既有编号和卡名',names.length===abilityCatalog.length&&names.every((name,index)=>name===`${String(index+1).padStart(2,'0')} · ${abilityCatalog[index].title}`));
    check('预览前三张是真实功能卡',await page.locator('.hrg-hand-card').count()===3&&!await page.locator('.hand-section').innerText().then(text=>/SCORE SCAN|OVERDRIVE|INPUT JAM/.test(text)));
    await page.emulateMedia({reducedMotion:'reduce'});
    for(const definition of abilityCatalog){
      await selector.selectOption(`catalog-${definition.number}`);
      await page.getByRole('button',{name:'收卡动效预览',exact:true}).click();await ready();
      const face=page.locator(`.hrg-receipt [data-card-face="catalog-${definition.number}"]`);
      check(`卡${definition.number}名称和规则不变`,await face.locator('.hrg-tactic-card__title').innerText()===definition.title&&await face.locator('.hrg-tactic-card__rules').innerText()===definition.description);
      await claim();
    }
    check('查看完整卡池不增加或消耗持有库存',await page.locator('.hrg-hand-card').count()===3);
    await page.locator('.hrg-hand-card').nth(2).click();
    check('排名透视明确作用于本队且不误选对手',await page.locator('dialog[open] .hrg-card-target-note').innerText()==='作用目标：Phigros队'&&await page.locator('dialog[open] select').count()===0);
    await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'hidden'});
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.locator('.hand-section').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'real-card-names-mobile.png')});
    check('无浏览器异常', errors.length===0);
    console.log(JSON.stringify({checks:checks.length,results:checks,errors,screenshots:out},null,2));
  } catch (error) {
    console.error(JSON.stringify({errors,dialogs:await page.locator('dialog').evaluateAll(elements=>elements.map(el=>({open:el.open,display:getComputedStyle(el).display,html:el.outerHTML.slice(0,1200)})))},null,2));
    await page.screenshot({path:path.join(out,'failure.png')});
    throw error;
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
