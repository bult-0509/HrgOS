/* 美术演示；不接管正式比赛状态、登录权限或任务提交。 */
(() => {
  const teams = [
    { id:'phigros', name:'Phigros队', character:'鸠', asset:'geopelia', accent:'#a9dfff', shade:'#182936' },
    { id:'arcaea', name:'Arcaea队', character:'光光', asset:'hikari', accent:'#d5c1ff', shade:'#25203b' },
    { id:'paradigm', name:'范式起源队', character:'Para', asset:'para', accent:'#aebdff', shade:'#1b2444' },
    { id:'maimai', name:'maimai队', character:'莎露朵', asset:'salt', accent:'#ffe7a4', shade:'#302936' },
    { id:'community', name:'全能队', character:'伊洛', asset:'iro', accent:'#f5c8e1', shade:'#30223d' }
  ];
  // 与正式共享图片格位保持一致，每区域 19 图寻 + 6 直接任务。
  const slots = ['D01','P02','P19','P05','P11','P04','P17','D02','P12','P01','P13','P14','D03','P16','D04','P18','D05','P06','P08','P10','P07','P03','P15','D06','P09'];
  const done = new Set([2,7,11,16,20,24]), review = new Set([5,14]);
  const regions = ['西湖文化广场','武林广场','龙翔桥'];
  const paths = {
    trophy:'<path d="M8 21h8m-4-5v5M7 4h10v6a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m21 16-5-5L5 21"/>',
    zap:'<path d="m13 2-9 11h7l-1 9 10-12h-7V2Z"/>',
    left:'<path d="m15 6-6 6 6 6"/>', right:'<path d="m9 6 6 6-6 6"/>',
    pause:'<path d="M8 5v14M16 5v14"/>', play:'<path d="m8 5 11 7-11 7V5Z"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  const pad = n => String(n).padStart(2,'0');
  const photoRoot = location.protocol === 'file:' ? '../../public/images/photo-clues/' : '../../images/photo-clues/';
  const imageUrl = (n, suffix='.webp') => `${photoRoot}region-${region}/${pad(n)}${suffix}`;
  const page = document.getElementById('event-page'), scene = document.getElementById('board-scene'), board = document.getElementById('board');
  const dialog = document.getElementById('clue-dialog'), mascot = document.getElementById('team-mascot');
  const frame = document.getElementById('team-frame');
  // 独立轮廓资源提前加载，切换棋盘时不重新生成装饰或触碰比赛身份。
  teams.forEach(team => { const img=new Image(); img.src=`assets/frame-${team.id}.svg`; });
  // 本页只显示一个已审核区域的美术快照，不提供玩家换区入口。
  const region=2;
  let active=0, paused=false, lastFocus=null, pointerStart=null;
  let entranceTimer;
  let deckCards=[];
  function buildDeck(){
    const stage=document.querySelector('.event-stage');stage.classList.add('preview-deck');
    deckCards=teams.map((team,i)=>{
      const holder=document.createElement('div');holder.className='preview-deck__card';holder.dataset.team=team.id;
      const peek=document.createElement('div');peek.className='board-preview';peek.setAttribute('aria-hidden','true');
      peek.style.setProperty('--preview-shade',team.shade);
      peek.innerHTML=`<div class="board-shell"><img class="frame-preview" src="assets/frame-${team.id}.svg" alt="" width="1000" height="1000"><div class="board-preview__core"><div class="board-preview__head">${pad(i+1)} / 05</div><div class="board-preview__grid">${slots.map(slot=>`<span class="board-preview__cell">${slot[0]==='P'?`<img src="${imageUrl(Number(slot.slice(1)),'-preview.webp')}" alt="" width="480" height="480" loading="lazy">`:''}<b>${slot}</b></span>`).join('')}</div><div class="board-preview__foot">19 / 06</div></div></div><img class="mascot-preview" src="assets/${team.asset}.webp" alt="" width="700" height="700">`;
      const target=document.createElement('button');target.className='preview-deck__peek-target';target.type='button';target.tabIndex=-1;target.setAttribute('aria-label',`切换到${team.name} Bingo`);target.addEventListener('click',()=>selectTeam(i));
      holder.append(peek,target);stage.append(holder);return {holder,peek,target};
    });
    deckCards[0].holder.append(scene);
  }
  function positionDeck(){
    deckCards.forEach(({holder,peek,target},i)=>{
      let offset=(i-active+teams.length)%teams.length;if(offset>2)offset-=teams.length;
      const previous=holder.dataset.offset;
      holder.classList.remove('is-teleporting');
      if(previous!==undefined&&Math.abs(Number(previous)-offset)>2){holder.classList.add('is-teleporting');requestAnimationFrame(()=>requestAnimationFrame(()=>holder.classList.remove('is-teleporting')));}
      holder.dataset.offset=String(offset);peek.hidden=offset===0;target.hidden=offset===0;
    });
    deckCards[active]?.holder.append(scene);
  }
  document.getElementById('prev').innerHTML=icon('left');
  document.getElementById('next').innerHTML=icon('right');
  document.getElementById('motion-toggle').innerHTML=icon('pause');
  document.getElementById('close-clue').innerHTML=icon('close');
  document.getElementById('progress-icon').innerHTML=icon('check');
  document.getElementById('photo-count').innerHTML=icon('image');
  document.getElementById('direct-count').innerHTML=icon('zap');
  document.getElementById('hud-metrics').innerHTML=`<span class="hud-metric" aria-label="演示积分 126">${icon('trophy')}<b>126</b></span><span class="hud-metric" aria-label="演示排名第 2">${icon('trophy')}<b>#02</b></span><span class="hud-metric" aria-label="演示公开时刻 18 点 04 分">${icon('clock')}<b>18:04</b></span>`;
  const tabs=document.getElementById('team-tabs');
  tabs.innerHTML=teams.map((t,i)=>`<button class="team-tab" type="button" data-team="${i}" aria-label="${t.name}，队娘${t.character}" aria-pressed="${i===0}" style="--tab-accent:${t.accent}"><img src="assets/${t.asset}.webp" alt="" width="58" height="70" decoding="async"><b>${pad(i+1)}</b><span>${t.name}</span></button>`).join('');
  const regionTabs=document.querySelector('.region-tabs');
  regionTabs.innerHTML=regions.map((name,i)=>`<li class="region-step ${i+1===region?'is-current':i+1<region?'is-passed':'is-locked'}" ${i+1===region?'aria-current="step"':''} aria-label="${name}，区域 ${i+1}，${i+1===region?'当前区域':i+1<region?'已通过':'待工作人员审核'}">${pad(i+1)}${i+1>region?icon('lock'):''}</li>`).join('');
  function renderBoard(){
    board.setAttribute('aria-label',`${teams[active].name}，${regions[region-1]}，5乘5任务棋盘`);
    board.innerHTML=slots.map((slot,i)=>{
      const photo=slot[0]==='P', n=Number(slot.slice(1)), state=done.has(i+1)?'done':review.has(i+1)?'review':'available';
      const score=8+((i+1)*7)%15;
      const stateLabel=state==='done'?'已完成':state==='review'?'待审核':'未完成';
      return `<button class="cell is-${state}" type="button" data-slot="${slot}" style="--order:${i}" aria-label="第${i+1}格，${photo?`图寻图片编号${n}`:`直接任务编号${n}`}，演示分值${score}，${stateLabel}，打开详情">${photo?`<img class="cell-preview" src="${imageUrl(n,'-preview.webp')}" alt="" width="480" height="480" ${i<5?'fetchpriority="high"':'loading="lazy"'} decoding="async"><img class="cell-preview cell-haze" src="${imageUrl(n,'-preview.webp')}" alt="" aria-hidden="true" width="480" height="480" loading="lazy" decoding="async">`:`<span class="cell-direct-icon">${icon('zap')}</span>`}<span class="cell-number">${photo?'#':''}${pad(n)}</span>${state==='available'?'':`<span class="cell-state">${icon(state==='done'?'check':'clock')}</span>`}<b class="cell-score">${score}</b></button>`;
    }).join('');
    board.querySelectorAll('.cell').forEach(button=>button.addEventListener('click',()=>openClue(button)));
  }
  function openClue(button){
    const slot=button.dataset.slot, n=Number(slot.slice(1));
    lastFocus=button;
    document.getElementById('clue-title').textContent=slot[0]==='P'?`#${pad(n)}`:`${pad(n)} / 06`;
    document.getElementById('clue-body').innerHTML=slot[0]==='P'?`<img class="clear-clue" src="${imageUrl(n)}" alt="${regions[region-1]}图寻题图片${n}，清晰图" width="1200" height="1200"><a href="${imageUrl(n,'.png')}" target="_blank" rel="noopener">查看原尺寸图片</a>`:`<div class="direct-detail">${icon('zap')}<p>无需图寻 · 正式任务待配置</p></div>`;
    dialog.showModal();
    document.getElementById('close-clue').focus();
  }
  dialog.addEventListener('close',()=>{document.getElementById('clue-body').replaceChildren();lastFocus?.focus({preventScroll:true});});
  document.getElementById('close-clue').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  function selectTeam(index,direction=1){
    const next=(index+teams.length)%teams.length;
    if(dialog.open) return;
    if(next===active && mascot.dataset.ready) return;
    active=next;
    positionDeck();
    const team=teams[active];
    page.dataset.team=team.id;
    frame.src=`assets/frame-${team.id}.svg`;
    frame.dataset.design=team.id;
    document.documentElement.style.setProperty('--accent',team.accent);
    document.documentElement.style.setProperty('--shade',team.shade);
    scene.style.setProperty('--direction',direction);
    document.getElementById('team-counter').textContent=pad(active+1);
    mascot.src=`assets/${team.asset}.webp`;
    mascot.alt=`${team.name}的${team.character}，统一二头身形象`;
    mascot.dataset.ready='true';
    tabs.querySelectorAll('button').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===active)));
    document.getElementById('team-announcement').textContent=`${team.name} Bingo，队娘${team.character}，第${active+1}张，共5张。任何队伍都可做这张棋盘的任务。本页数据为美术演示。`;
    board.setAttribute('aria-label',`${team.name}，${regions[region-1]}，5乘5任务棋盘`);
    clearTimeout(entranceTimer);
    scene.classList.remove('is-entering');
    // 单次入场，不自动轮播，不在任务详情打开时切换。
    requestAnimationFrame(()=>{scene.classList.add('is-entering');entranceTimer=setTimeout(()=>scene.classList.remove('is-entering'),500);});
  }
  tabs.querySelectorAll('button').forEach((button,i)=>button.addEventListener('click',()=>selectTeam(i,i<active?-1:1)));
  document.getElementById('prev').addEventListener('click',()=>selectTeam(active-1,-1));
  document.getElementById('next').addEventListener('click',()=>selectTeam(active+1,1));
  document.addEventListener('keydown',event=>{if(dialog.open||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();selectTeam(active+(event.key==='ArrowRight'?1:-1),event.key==='ArrowRight'?1:-1);}});
  document.querySelector('.event-stage').addEventListener('pointerdown',event=>{pointerStart={x:event.clientX,y:event.clientY,id:event.pointerId};});
  document.querySelector('.event-stage').addEventListener('pointerup',event=>{if(!pointerStart||pointerStart.id!==event.pointerId)return;const dx=event.clientX-pointerStart.x,dy=event.clientY-pointerStart.y;pointerStart=null;if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.5){selectTeam(active+(dx<0?1:-1),dx<0?1:-1);}});
  document.querySelector('.event-stage').addEventListener('pointercancel',()=>{pointerStart=null;});
  function applyMotion(){page.classList.toggle('motion-paused',paused||document.visibilityState==='hidden');}
  document.getElementById('motion-toggle').addEventListener('click',event=>{paused=!paused;const button=event.currentTarget;button.innerHTML=icon(paused?'play':'pause');button.setAttribute('aria-label',paused?'开启动效':'暂停动效');button.setAttribute('aria-pressed',String(paused));applyMotion();});
  document.addEventListener('visibilitychange',applyMotion);
  renderBoard();buildDeck();selectTeam(0);applyMotion();
  const requestedTeam=new URLSearchParams(location.search).get('team');
  const index=teams.findIndex(t=>t.id===requestedTeam);
  if(index>=0)selectTeam(index);
})();
