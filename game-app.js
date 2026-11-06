(function () {
  'use strict';
  const C = RollCore, levels = RollLevels.map(C.compile), chapters = ['石牢密室', '炼金密室', '机械监牢'];
  const $ = id => document.getElementById(id), clone = C.clone;
  const thresholds = [7,13,10,13,14,21,7,11,17,26];
  levels.forEach((level,i)=>{level.threeStar=thresholds[i]+(i<4?2:4);level.twoStar=thresholds[i]+Math.max(6,Math.ceil(thresholds[i]*.55));});
  const SAVE_KEY='rolling-square-ten-rooms';
  const VERSION='1-'+RollLevels.reduce((hash,l)=>{for(const char of JSON.stringify(l))hash=(Math.imul(hash,31)+char.charCodeAt(0))|0;return hash;},7);
  const defaults=()=>({version:VERSION,unlocked:1,bests:Array(10).fill(null),settings:{sound:false,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,dpad:matchMedia('(pointer: coarse)').matches},journey:{completions:Array(10).fill(null),flips:0,attempts:Array(10).fill(0)},current:null});
  let profile=defaults(),storageAvailable=true,storageMessage='';
  try{
    const saved=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');
    if(saved&&Array.isArray(saved.bests)&&saved.bests.length===10&&Array.isArray(saved.journey?.completions)&&saved.journey.completions.length===10){
      profile={...profile,...saved,settings:{...profile.settings,...saved.settings}};profile.unlocked=Math.max(1,Math.min(10,Number(profile.unlocked)||1));
      if(saved.version!==VERSION){profile.current=null;profile.version=VERSION;storageMessage='关卡已更新，本关从起点开始；已解锁关卡和成绩保留。';}
      if(profile.current&&(!levels[profile.current.index]||!Array.isArray(profile.current.state?.rotation)||profile.current.state.rotation.length!==9)){profile.current=null;}
    }
  }catch(error){storageAvailable=false;storageMessage='本地保存暂不可用，本次仍可游玩。';}
  let index=profile.current?.index||0,state=profile.current?clone(profile.current.state):C.initial(levels[index]);
  let history=profile.current?.history||[],usedGuide=Boolean(profile.current?.usedGuide),attempt=profile.current?.attempt||1;
  let running=false,busy=false,token=0,modal='home',toastTimer=null,worker=null,hintSerial=0,audio=null;
  const container=$('game-container'),panel=$('modal-panel'),layer=$('modal-layer');
  let renderer;
  try{renderer=document.body.dataset.renderer==='three'&&window.THREE?new RollRenderers.ThreeRenderer(container,profile.settings):new RollRenderers.CanvasRenderer(container,profile.settings);}
  catch(error){container.querySelector('#game-canvas')?.remove();container.querySelector('#environment-background')?.remove();renderer=new RollRenderers.CanvasRenderer(container,profile.settings);}
  $('edition').textContent=renderer instanceof RollRenderers.ThreeRenderer?'3D · 十层密室':'Canvas · 十层密室';
  renderer.build(levels[index],state);

  function save(){
    if(running)profile.current={index,state:clone(state),history:clone(history),usedGuide,attempt};
    try{localStorage.setItem(SAVE_KEY,JSON.stringify(profile));}
    catch(error){if(storageAvailable){storageAvailable=false;toast('保存空间不可用，本次进度暂时保留在页面中。');}}
  }
  function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3600);}
  function update(){
    const level=levels[index];$('chapter-display').textContent=chapters[level.chapter];$('level-display').textContent=String(index+1).padStart(2,'0')+' / 10';$('level-name').textContent=level.name;$('moves-display').textContent=state.moves;
    const ends={head:'☀ 头端朝下',feet:'☾ 脚端朝下',side:'横躺 · 占据两格'};$('pose-display').textContent=ends[C.downEnd(state)];
    const symbols=level.mechanisms.filter(m=>m.kind==='head'||m.kind==='feet');$('seal-display').hidden=!symbols.length;$('seal-display').textContent=symbols.map(m=>(state.activated&(1<<level.bySymbol[m.symbol].index)?'✓ ':'')+(m.kind==='head'?'☀ 日':'☾ 月')).join('  /  ');
    const pressing=C.pressed(level,state);$('echo-display').hidden=!state.echo&&!pressing;$('echo-display').textContent=pressing?'◇ 真人压住回声台':state.echo?'◇ '+('●'.repeat(state.echo.remaining)+'○'.repeat(3-state.echo.remaining))+' 再走 '+state.echo.remaining+' 步桥收起':'';
    $('lesson-text').textContent=level.lesson;$('btn-undo').disabled=!running||!history.length||busy||state.status==='won';$('btn-restart').disabled=!running;$('btn-hint').disabled=!running||busy||state.status!=='playing';
    $('dpad').hidden=!profile.settings.dpad;$('dpad').querySelectorAll('button').forEach(b=>b.disabled=!running||busy||modal!==null||state.status!=='playing');
  }
  function open(type,html,wide=false){if(type!=='won')stopConfetti();modal=type;container.classList.add('with-panel');layer.hidden=false;layer.classList.toggle('home',type==='home');panel.className='modal'+(wide?' wide':'');panel.innerHTML=html;layer.setAttribute('aria-label',type==='home'?'游戏首页':type==='levels'?'关卡选择':'游戏面板');update();const focus=panel.querySelector('button:not(:disabled),input,a');focus?.focus({preventScroll:true});}
  function close(){hintSerial++;modal=null;container.classList.remove('with-panel');layer.hidden=true;stopConfetti();update();$('game-container').focus({preventScroll:true});}
  function actions(items){return '<div class="modal-actions">'+items.map(([label,action,style])=>'<button data-action="'+action+'" class="'+(style||'')+'">'+label+'</button>').join('')+'</div>';}
  function home(){
    if(busy){token++;renderer.stop();renderer.sync(state);busy=false;}
    stopConfetti();const completed=profile.bests.filter(Boolean).length,stars=profile.bests.reduce((n,b)=>n+(b?.stars||0),0);
    open('home','<div class="eyebrow">A JOURNEY THROUGH TEN ROOMS</div><div class="hero-mark">◇</div><h1>滚动方块</h1><h2 style="font-size:18px;color:#a9bdcf;font-weight:400">十层密室</h2><p>翻滚，改变身体的方向。<br>解开日月符文，留下一道回声，找到向上的路。</p><div class="hero-meta"><div><strong>10</strong>空间谜题</div><div><strong>'+completed+'/10</strong>已完成</div><div><strong>'+stars+'/30</strong>已获星数</div></div>'+actions([...(profile.current?[['继续游戏','continue','primary']]:[]),['开始新旅程','new',profile.current?'':'primary'],['关卡选择','levels','quiet']])+'<div style="margin-top:15px">'+actions([['设置','settings','quiet']])+'</div>');
  }
  function levelMenu(){
    const html=chapters.map((name,ch)=>'<div class="chapter"><div class="chapter-title">'+String(ch+1).padStart(2,'0')+' / '+name+'</div><div class="level-grid">'+levels.map((level,i)=>{
      if(level.chapter!==ch)return '';const best=profile.bests[i],locked=i>=profile.unlocked;
      return '<button class="level-card" data-action="level" data-index="'+i+'" '+(locked?'disabled aria-label="第 '+(i+1)+' 关，先完成上一关"':'')+'><span class="number">'+String(i+1).padStart(2,'0')+(locked?' · 未解锁':'')+'</span><strong>'+level.name+'</strong><span class="stars">'+(locked?'—':starString(best?.stars||0))+'</span><small>'+(best?'最佳 '+best.moves+' 步':locked?'完成上一关解锁':'尚未完成')+'</small></button>';
    }).join('')+'</div></div>').join('');
    open('levels','<div class="eyebrow">TEN ROOMS / THREE CHAPTERS</div><h2>选择一道门</h2>'+html+actions(running?[['返回游戏','back','primary'],['首页','home','quiet']]:[['返回首页','home','quiet']]),true);
  }
  function settings(){open('settings','<div class="eyebrow">SETTINGS</div><h2>按你的节奏游玩</h2><label class="settings-row"><div>操作音效<span>默认关闭，可随时开启</span></div><input type="checkbox" data-setting="sound" '+(profile.settings.sound?'checked':'')+'></label><label class="settings-row"><div>减少动态效果<span>简化翻滚、上升效果，关闭彩带</span></div><input type="checkbox" data-setting="reduced" '+(profile.settings.reduced?'checked':'')+'></label><label class="settings-row"><div>屏幕方向按钮<span>手机也可在棋盘区域滑动</span></div><input type="checkbox" data-setting="dpad" '+(profile.settings.dpad?'checked':'')+'></label><div class="settings-row"><div>画面版本<span>两种版本共用进度和玩法</span></div><a href="'+(document.body.dataset.renderer==='three'?'index.html':'three.html')+'">切换'+(document.body.dataset.renderer==='three'?' Canvas':' 3D')+'</a></div><p class="hint-fine" style="margin-top:15px">进度保存在当前浏览器。清除浏览器数据会清除进度。</p>'+actions([['完成','back','primary'],['清除全部进度','clear-confirm','quiet']]));}
  function startLevel(next,restored=null){
    token++;renderer.stop();stopConfetti();busy=false;index=next;state=restored?clone(restored.state):C.initial(levels[index]);history=restored?clone(restored.history||[]):[];usedGuide=restored?Boolean(restored.usedGuide):false;
    running=true;attempt=restored?restored.attempt:++profile.journey.attempts[index];renderer.build(levels[index],state);close();save();update();
    if(state.status==='failed'){renderer.hiddenPlayer=true;if(renderer.player)renderer.player.visible=false;failure();}else if(state.status==='won'){renderer.floorOpacity=0;renderer.hiddenPlayer=true;renderer.player&&(renderer.player.visible=false);result();}else if(!restored)toast(levels[index].lesson);
  }
  function newJourney(){profile.journey={completions:Array(10).fill(null),flips:0,attempts:Array(10).fill(0)};profile.current=null;startLevel(0);}
  function continueGame(){if(!profile.current)return newJourney();startLevel(profile.current.index,clone(profile.current));}
  function retry(){startLevel(index);}
  function undo(){
    if(!running||!history.length||busy||state.status==='won')return;token++;renderer.stop();state=history.pop();renderer.sync(state);close();save();update();sound('undo');
  }
  function failure(){const reasons={void:'横躺时需要两个格子都有支撑。',bridge:'桥还没有展开。先找到与它相连的机关。',ice:'薄冰不能承受竖立。先准备横躺的姿态。',echo:'回声消失了，桥已经收起。最后一步要完全落在石台上。'};open('failed','<div class="eyebrow">TRY ANOTHER PATH</div><h2>再想一步</h2><p>'+reasons[state.reason]+'</p>'+actions([['撤销这一步','undo','primary'],['重试本关','retry','quiet'],['关卡选择','levels','quiet']]));}
  async function move(screenDirection){
    if(!running||busy||modal!==null||state.status!=='playing')return;
    const dir=mapDirection(screenDirection),before=clone(state),after=C.step(levels[index],before,dir),thisToken=++token;
    busy=true;profile.journey.flips++;save();update();sound('roll');
    if(!await renderer.move(before,after,dir,profile.settings.reduced?45:165)||thisToken!==token)return;
    state=after;history.push(before);busy=false;save();update();
    if(state.activated!==before.activated){sound('activate');toast('机关已点亮，通路发生了变化。');}
    else if(state.pose==='V'){
      const mechanism=levels[index].bySymbol[levels[index].tiles[state.r]?.[state.c]];
      if(mechanism&&(mechanism.kind==='head'||mechanism.kind==='feet')&&mechanism.kind!==C.downEnd(state))toast(mechanism.kind==='head'?'☀ 需要头端接触。绕行可以改变头脚。':'☾ 需要脚端接触。');
      if(levels[index].tiles[state.r]?.[state.c]==='E'&&state.status==='playing')toast('出口仍有封印，请点亮日月符文。');
    }
    if(state.echo?.remaining===1&&state.status==='playing')toast('下一步桥将收起，请完全落在石台上。');
    if(state.status==='failed'){
      busy=true;update();sound('fail');await renderer.effect('fall',profile.settings.reduced?100:650);if(thisToken!==token)return;busy=false;renderer.hiddenPlayer=true;if(renderer.player)renderer.player.visible=false;failure();
    }else if(state.status==='won'){
      commitScore();busy=true;update();sound('win');await renderer.effect('win',profile.settings.reduced?200:2000);if(thisToken!==token)return;busy=false;renderer.hiddenPlayer=true;if(renderer.player)renderer.player.visible=false;result();
    }
  }
  function commitScore(){
    const level=levels[index],stars=state.moves<=level.threeStar&&!usedGuide?3:state.moves<=level.twoStar?2:1;
    const score={moves:state.moves,stars,usedGuide};const old=profile.bests[index];
    profile.bests[index]={moves:Math.min(old?.moves??Infinity,score.moves),stars:Math.max(old?.stars||0,stars),usedGuide:!old||score.moves<old.moves?usedGuide:old.usedGuide};
    profile.journey.completions[index]=score;profile.unlocked=Math.max(profile.unlocked,Math.min(10,index+2));save();
  }
  function starString(stars){return '★'.repeat(stars)+'☆'.repeat(3-stars);}
  function result(){
    const score=profile.journey.completions[index]||{moves:state.moves,stars:1},final=index===9,complete=profile.journey.completions.filter(Boolean).length;
    const total=profile.journey.completions.reduce((sum,item)=>sum+(item?.moves||0),0),stars=profile.bests.reduce((sum,item)=>sum+(item?.stars||0),0);
    if(final){open('won','<div class="eyebrow">THE LAST DOOR IS OPEN</div><h2>🎉 完美通关！</h2><p>你已抵达竖井之巅。<br>日月点亮，回声散去，旅程留在这里。</p><div class="score-grid"><div><b>'+profile.bests.filter(Boolean).length+' / 10</b><span>已完成关卡</span></div><div><b>'+stars+' / 30</b><span>总星数</span></div><div><b>'+total+'</b><span>本轮 '+complete+' 关路线合计</span></div><div><b>'+profile.journey.flips+'</b><span>本轮累计翻滚次数</span></div></div>'+actions([['返回关卡','levels','primary'],['再玩一轮','new','quiet']]));if(!profile.settings.reduced)startConfetti();}
    else{open('won','<div class="eyebrow">ROOM '+String(index+1).padStart(2,'0')+' / COMPLETE</div><h2>'+levels[index].name+' · 已通过</h2><div class="score-stars">'+starString(score.stars)+'</div><div class="score-grid"><div><b>'+score.moves+'</b><span>本次路线步数</span></div><div><b>'+profile.bests[index].moves+'</b><span>已保存最佳步数</span></div></div><p class="hint-fine">三星目标：'+levels[index].threeStar+' 步内，不使用下一步指导。</p>'+actions([['下一关','next','primary'],['再试一次','retry','quiet'],['关卡选择','levels','quiet']]));}
  }
  function hint(level=1){
    const buttons='<div class="hint-stack">'+[1,2,3].map((n)=>'<button data-action="hint" data-tier="'+n+'" class="'+(level===n?'active':'')+'">'+['规则提醒','路线思路','下一步指导'][n-1]+'</button>').join('')+'</div>';
    const text=level===1?levels[index].lesson:level===2?levels[index].idea:'正在从当前姿态寻找安全路线…';
    open('hint','<div class="eyebrow">A LITTLE HELP</div><h2>停下来想一想</h2>'+buttons+'<div class="hint-content" id="hint-content">'+text+'</div><p class="hint-fine">规则和思路不影响星级。使用“下一步指导”，本次最高可得两星；重试可重新争取三星。</p>'+actions([['继续游戏','back','primary']]));
    if(level===3){usedGuide=true;save();requestHint();}
  }
  function requestHint(){
    const id=++hintSerial,current=clone(state),level=levels[index];
    function receive(result){if(id!==hintSerial||modal!=='hint'||!$('hint-content'))return;if(result.route?.length){const screen=inverseDirection(result.route[0]),names={UP:'↑ 上',DOWN:'↓ 下',LEFT:'← 左',RIGHT:'→ 右'};renderer.highlight(result.route[0]);$('hint-content').innerHTML='下一步：<strong>'+names[screen]+'</strong><br><span class="muted">从当前状态还需 '+result.route.length+' 步可通关。继续游戏后查看高亮落点。</span>';}
      else $('hint-content').textContent=result.exhausted?'当前机关状态无法继续到达出口。先撤销回到安全决策点，或重试本关。':'这条路线暂时未能算出。先在安全石台调整，或撤销重试。';}
    try{if(!worker){worker=new Worker('hint-worker.js');worker.onmessage=e=>{if(e.data.id===hintSerial)receive(e.data);};worker.onerror=()=>{$('hint-content')&&($('hint-content').textContent='提示暂不可用，请参考路线思路。');worker.terminate();worker=null;};}
      // Each request receives its own callback; stale worker results are ignored by the serial.
      worker.onmessage=e=>{if(e.data.id===id)receive(e.data);};worker.postMessage({id,level,state:current});
    }catch(error){setTimeout(()=>receive(C.solve(level,current,120000)),30);}
  }
  function mapDirection(input){return {UP:'DOWN',RIGHT:'LEFT',DOWN:'UP',LEFT:'RIGHT'}[input];}
  function inverseDirection(input){return mapDirection(input);}
  function back(){if(running){close();if(state.status==='failed')failure();else if(state.status==='won')result();}else home();}
  function sound(kind){if(!profile.settings.sound)return;try{audio ||= new (window.AudioContext||window.webkitAudioContext)();audio.resume();const osc=audio.createOscillator(),gain=audio.createGain();const t=audio.currentTime;osc.type='sine';osc.frequency.setValueAtTime({roll:150,undo:240,fail:110,activate:580,win:740}[kind]||300,t);gain.gain.setValueAtTime(.035,t);gain.gain.exponentialRampToValueAtTime(.001,t+.13);osc.connect(gain);gain.connect(audio.destination);osc.start(t);osc.stop(t+.15);}catch(error){}}
  function handle(action,button){
    if(action==='continue')continueGame();else if(action==='home')home();else if(action==='levels')levelMenu();else if(action==='settings')settings();else if(action==='back')back();else if(action==='level')startLevel(Number(button.dataset.index));else if(action==='new'){
      if(profile.current&&profile.journey.flips>0)open('confirm','<h2>开始新的旅程？</h2><p>本轮路线和累计翻滚会重新统计，已解锁关卡与最佳成绩保留。</p>'+actions([['开始新旅程','new-confirm','primary'],['返回','home','quiet']]));else newJourney();
    }else if(action==='new-confirm')newJourney();else if(action==='undo')undo();else if(action==='retry')retry();else if(action==='next')startLevel(index+1);else if(action==='hint')hint(Number(button.dataset.tier)||1);
    else if(action==='clear-confirm')open('confirm','<h2>清除全部本地进度？</h2><p>关卡解锁、最佳成绩和本轮旅程都会清除。</p>'+actions([['清除进度','clear','primary'],['保留进度','settings','quiet']]));
    else if(action==='clear'){token++;renderer.stop();running=false;busy=false;profile=defaults();renderer.settings=profile.settings;index=0;state=C.initial(levels[0]);history=[];renderer.build(levels[0],state);save();home();}
  }
  document.addEventListener('click',e=>{const button=e.target.closest('[data-action]');if(button&&!button.disabled)handle(button.dataset.action,button);});
  panel.addEventListener('change',e=>{if(e.target.dataset.setting){profile.settings[e.target.dataset.setting]=e.target.checked;save();update();}});
  $('btn-undo').addEventListener('click',undo);$('btn-restart').addEventListener('click',retry);$('btn-hint').addEventListener('click',()=>hint());$('btn-levels').addEventListener('click',()=>{if(busy){token++;renderer.stop();renderer.sync(state);busy=false;}levelMenu();});$('btn-home').addEventListener('click',home);
  $('dpad').addEventListener('click',e=>{const button=e.target.closest('[data-direction]');if(button)move(button.dataset.direction);});
  window.addEventListener('keydown',e=>{
    if(e.target instanceof HTMLInputElement)return;
    if(running&&modal==='failed'&&e.code==='KeyR'){e.preventDefault();retry();return;}
    if(running&&modal==='failed'&&e.code==='KeyZ'){e.preventDefault();undo();return;}
    if(modal!==null){if(e.key==='Escape'&&running&&['hint','settings','levels'].includes(modal))back();if(e.key==='Tab'){const focusable=[...panel.querySelectorAll('button:not(:disabled),input,a')];const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}return;}
    if(e.repeat)return;const dir={ArrowUp:'UP',KeyW:'UP',ArrowDown:'DOWN',KeyS:'DOWN',ArrowLeft:'LEFT',KeyA:'LEFT',ArrowRight:'RIGHT',KeyD:'RIGHT'}[e.code];
    if(dir){e.preventDefault();move(dir);}else if(e.code==='KeyZ')undo();else if(e.code==='KeyR'&&running)retry();else if(e.code==='Escape')levelMenu();
  });
  let pointer=null;
  container.addEventListener('pointerdown',e=>{if(modal!==null||busy||e.target.closest('button'))return;pointer={x:e.clientX,y:e.clientY,id:e.pointerId};container.setPointerCapture(e.pointerId);});
  container.addEventListener('pointerup',e=>{if(!pointer||pointer.id!==e.pointerId)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;pointer=null;if(Math.max(Math.abs(dx),Math.abs(dy))>=25)move(Math.abs(dx)>Math.abs(dy)?dx>0?'RIGHT':'LEFT':dy>0?'DOWN':'UP');});container.addEventListener('pointercancel',()=>pointer=null);
  window.addEventListener('pagehide',save);

  let confettiFrame=null,confetti=[];const confettiCanvas=$('confetti-canvas'),confettiContext=confettiCanvas.getContext('2d');
  function stopConfetti(){if(confettiFrame!==null)cancelAnimationFrame(confettiFrame);confettiFrame=null;confetti=[];confettiContext.setTransform(1,0,0,1,0,0);confettiContext.clearRect(0,0,confettiCanvas.width,confettiCanvas.height);}
  function startConfetti(){stopConfetti();let start=nowTime(),previous=start,spawn=0;const colors=['#38bdf8','#a78bfa','#f472b6','#facc15','#34d399','#fb7185'];
    function frame(t){const dt=Math.min((t-previous)/1000,.05);previous=t;const w=container.clientWidth,h=container.clientHeight,ratio=Math.min(devicePixelRatio||1,2);if(confettiCanvas.width!==Math.round(w*ratio)||confettiCanvas.height!==Math.round(h*ratio)){confettiCanvas.width=Math.round(w*ratio);confettiCanvas.height=Math.round(h*ratio);}confettiContext.setTransform(ratio,0,0,ratio,0,0);confettiContext.clearRect(0,0,w,h);
      if(t-start<3000){spawn+=dt*58;while(spawn>=1){spawn--;confetti.push({x:Math.random()*w,y:-20,vx:(Math.random()-.5)*65,vy:35+Math.random()*60,g:50+Math.random()*40,angle:Math.random()*6,spin:(Math.random()-.5)*5,width:5+Math.random()*5,height:10+Math.random()*9,color:colors[Math.floor(Math.random()*colors.length)]});}}
      for(const p of confetti){p.x+=(p.vx+Math.sin(t*.003+p.angle)*15)*dt;p.y+=p.vy*dt;p.vy+=p.g*dt;p.angle+=p.spin*dt;confettiContext.save();confettiContext.translate(p.x,p.y);confettiContext.rotate(p.angle);confettiContext.fillStyle=p.color;confettiContext.fillRect(-p.width/2,-p.height/2,p.width,p.height);confettiContext.restore();}confetti=confetti.filter(p=>p.y<h+25);
      if(t-start<3000||confetti.length&&t-start<10000)confettiFrame=requestAnimationFrame(frame);else stopConfetti();
    }confettiFrame=requestAnimationFrame(frame);
  }
  function nowTime(){return performance.now();}
  home();update();if(storageMessage)toast(storageMessage);
})();
