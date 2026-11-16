import { bounds, sites, graph, nearestNode } from './world.js';
import { WEAPONS, UTILITIES } from './weapons.js';
const money=n=>'$'+Math.round(n||0).toLocaleString('en-US');
const clock=n=>`${Math.floor(Math.ceil(n)/60)}:${String(Math.ceil(n)%60).padStart(2,'0')}`;
export class HUD{
 constructor(rounds,weapons,bots,{onStart=null}={}){
  Object.assign(this,{r:rounds,w:weapons,p:rounds.player,onStart,started:false,buyOpen:false,tab:false,mapAt:0,hitUntil:0,damageUntil:0,selected:'kestrel'});
  this.t=this.t.bind(this);this.h=this.h.bind(this);this.e={};for(const n of document.querySelectorAll('[id]'))this.e[n.id]=n;
  this.cards=[...this.e['buy-grid'].children];this.feed=[];this.log=[];
  this.rows=new Map([...document.querySelectorAll('#scoreboard tbody tr')].map(n=>[n.dataset.player,n]));
  this.loads=[...this.e['team-loadout'].children];this.slots=[...this.e['weapon-slots'].children];
  this.ctx=this.e.minimap.getContext('2d');
  this.fightCover=new URLSearchParams(location.search).get('shot')==='fight';
  // Generate a one-pixel gold ICO locally before the browser requests a favicon.
  const ico=new Uint8Array(70);ico.set([0,0,1,0,1,0,1,1,0,0,1,0,32,0,48,0,0,0,22]);ico.set([40,0,0,0,1,0,0,0,2,0,0,0,1,0,32],22);ico.set([129,207,255,255],62);
  const icon=document.createElement('link');icon.rel='icon';icon.href=URL.createObjectURL(new Blob([ico],{type:'image/x-icon'}));document.head.append(icon);
  this.e['start-button'].onclick=()=>{if(!this.started){this.started=true;this.onStart?.();}void this.p.input.lock();};
  this.e['buy-close'].onclick=()=>this.openBuy(false);
  this.e['buy-grid'].onclick=e=>{const card=e.target.closest('[data-buy]');if(card){this.selected=card.dataset.buy;rounds.buy(this.p,this.selected);}};
  document.addEventListener('keydown',e=>{
   if(e.code==='Tab'){e.preventDefault();this.tab=true;}
   if(e.repeat)return;
   if(e.code==='KeyB'&&rounds.state.phase==='BUY'){e.preventDefault();this.openBuy(!this.buyOpen);}
   if(e.code==='Escape')this.openBuy(false,false);
   if(this.buyOpen){const card=this.cards.find(n=>n.dataset.buyKey===e.key);if(card)rounds.buy(this.p,card.dataset.buy);}
  });
  document.addEventListener('keyup',e=>{if(e.code==='Tab')this.tab=false;});window.addEventListener('blur',()=>{this.tab=false;});
  const previous=rounds.onEvent;rounds.onEvent=(kind,data)=>{previous?.(kind,data);this.event(kind,data);};
  this.e.scoreboard.querySelector('.scoreboard-foot span').textContent='FIRST TO 7 · 5v5 · FRIENDLY FIRE OFF';
 }
 t(id,value){const n=this.e[id],s=String(value);if(n.textContent!==s)n.textContent=s;}
 h(id,value){this.e[id].hidden=!value;}
 openBuy(open,lock=true){this.buyOpen=open&&this.r.state.phase==='BUY';if(this.buyOpen)this.p.input.unlock();else if(lock&&this.started)void this.p.input.lock();}
 hit(head=false){this.hitUntil=this.r.state.time+0.14;this.e.hitmarker.classList.toggle('headshot',head);}
 damage(){this.damageUntil=this.r.state.time+0.4;}
 event(kind,data){
  if(kind==='kill'){
   const li=document.createElement('li');li.className='kill';li.textContent=`${data.killer?.name||'Charge'} → ${data.victim.name} · ${WEAPONS[data.weapon]?.name||data.weapon}${data.head?' ◇ HS':''}`;
   this.e['kill-feed'].append(li);this.feed.push({li,until:this.r.state.time+7});if(this.feed.length>5)this.feed.shift().li.remove();
  }
  if(kind==='round')this.buyOpen=false;
 }
 radio(name,text,team='solstice'){
  if(team!==this.p.team)return;
  const li=document.createElement('li');li.className='radio-line';li.textContent=`[${name}] ${text}`;
  this.e['radio-log'].append(li);this.log.push({li,until:this.r.state.time+9});if(this.log.length>3)this.log.shift().li.remove();
 }
 update(){
  if(this.fightCover){this.fightCover=false;this.stageFight();}
  const t=this.t,h=this.h,e=this.e;
  const s=this.r.snapshot,p=this.p,c=s.charge,l=p.loadout,g=this.w.current(p),utility=UTILITIES[l.selected],end=s.phase==='END';
  if(s.phase!=='BUY')this.buyOpen=false;
  h('start-overlay',!this.buyOpen&&(!this.started||!p.input.locked));h('buy-menu',this.buyOpen);
  t('score-solstice',s.scores.solstice);t('score-umbra',s.scores.umbra);t('round-number',`ROUND ${s.round}`);
  const seconds=c.planted&&!end?c.timer:s.timer;
  t('timer',clock(seconds));t('phase-label',c.planted&&!end?'CHARGE ACTIVE':s.phase);
  e['round-clock'].classList.toggle('urgent',seconds<10);e['round-clock'].classList.toggle('planted',c.planted&&!end);
  t('health-value',Math.ceil(p.health));t('armour-value',Math.ceil(p.armour));t('cash',money(p.cash));
  for(const key of ['health','armour'])e[key+'-bar'].style.width=Math.max(0,p[key])+'%';
  t('cash-change',p.cashUntil>s.time?(p.cashDelta>0?'+':'−')+money(Math.abs(p.cashDelta)):'');e['cash-change'].classList.toggle('loss',p.cashDelta<0);
  t('weapon-name',utility?.name||g.def.name);t('weapon-mode',utility?'THROWABLE':g.reloadUntil?'RELOADING':g.def.auto?'FULL-AUTO':'SEMI-AUTO');
  t('ammo-mag',utility?l.utilities[l.selected]:g.mag);t('ammo-reserve',utility?'—':g.reserve);h('reload-hint',!g.mag&&!utility);
  t('utility-he',l.utilities.shard);t('utility-flash',l.utilities.flare);t('utility-smoke',l.utilities.veil);h('charge-status',c.carrier===p);
  const labels=[WEAPONS[l.sidearm].name,l.primary?WEAPONS[l.primary].name:'Primary',c.carrier===p?'Charge':'—',utility?.name||'Utility'];
  this.slots.forEach((n,i)=>{n.lastElementChild.textContent=labels[i];n.classList.toggle('active',i===(utility?3:l.active===l.sidearm?0:1));});
  e.crosshair.style.setProperty('--gap',Math.max(3,this.w.spread(p)*400)+'px');h('crosshair',p.alive&&!this.buyOpen);h('hitmarker',this.hitUntil>s.time);
  e['damage-vignette'].style.opacity=Math.max(0,(this.damageUntil-s.time)/0.4);e['flash-overlay'].style.opacity=Math.min(1,p.flash/2);
  h('interaction',!!c.channelActor);t('interaction-label',(c.kind==='DEFUSE'?'DEFUSING':'PLANTING THE CHARGE')+(c.channelActor?' · '+c.channelActor.name:''));e['interaction-progress'].value=c.progress/c.duration;
  h('charge-banner',c.planted&&!end);h('spectator-label',!p.alive);
  h('round-banner',end);t('round-winner',(s.winner||'solstice').toUpperCase()+(s.matchWinner?' WINS MATCH':' WINS'));t('round-reason',s.reason);
  h('scoreboard',this.tab||end);if(this.tab||end)this.board(s);
  for(const list of [this.feed,this.log])for(let i=list.length-1;i>=0;i--){const n=list[i];n.li.style.opacity=Math.min(1,(n.until-s.time)/2);if(n.until<=s.time){n.li.remove();list.splice(i,1);}}
  if(this.buyOpen)this.buy(s);if(s.time>=this.mapAt){this.mapAt=s.time+0.1;this.map(s);}
 }
 stageFight(){
  // Re-stage the existing frozen cover with real shots through the combat path.
  const w=this.w,p=this.p,[sable,kite,juno]=['Sable','Kite','Juno'].map(n=>this.r.state.actors.find(a=>a.name===n));
  w.resetEffects();p.ads=0;p.syncCamera();w.update(0,false);
  const shoot=(a,b)=>{
   const d=b.position.clone();d.y+=1.1;d.sub(w.eye(a,a.position.clone())).normalize();
   if(a.body){a.yaw=Math.atan2(-d.x,-d.z);a.body.rotation.y=a.yaw;a.arms.rotation.x=Math.atan2(d.y,Math.hypot(d.x,d.z));}
   w.fire(a,d);
  };
  const far={position:kite.position.clone().set(45,2,35)};
  shoot(p,kite);shoot(sable,far);w.update(0.18,false);shoot(p,kite);shoot(sable,far);shoot(juno,sable);w.updateEffects(0.025);
 }
 buy(s){
  const p=this.p,l=p.loadout;this.t('buy-cash',money(p.cash));this.t('buy-timer',clock(s.timer));this.t('buy-feedback',s.notice);
  for(const n of this.cards){const id=n.dataset.buy,owned=!!l.guns[id];n.disabled=!this.r.canBuy(p,id);n.classList.toggle('owned',owned);n.classList.toggle('selected',id===this.selected);n.querySelector('.card-state').textContent=owned?'OWNED':UTILITIES[id]?'OWNED '+l.utilities[id]:n.disabled?'UNAVAILABLE':'AVAILABLE';}
  this.loads.forEach((n,i)=>{n.lastElementChild.textContent=this.w.current(s.actors[i]).def.name;});
 }
 board(s){
  this.t('scoreboard-phase',`ROUND ${s.round} · ${s.phase}`);
  for(const team of ['solstice','umbra'])this.t('board-score-'+team,s.scores[team]);
  for(const a of s.actors){const r=this.rows.get(a.name),values=[this.w.current(a).def.name,a.kills,a.deaths,money(a.cash)];for(let i=0;i<4;i++)r.children[i+1].textContent=values[i];}
 }
 map(s){
  const c=this.ctx,w=c.canvas.width,h=c.canvas.height,X=x=>16+(x-bounds.minX)/(bounds.maxX-bounds.minX)*(w-32),Y=z=>16+(z-bounds.minZ)/(bounds.maxZ-bounds.minZ)*(h-32);
  c.fillStyle='#10232c';c.fillRect(0,0,w,h);c.strokeStyle='#bd9275';c.lineWidth=3;c.strokeRect(16,16,w-32,h-32);
  c.strokeStyle='#43646a';c.lineWidth=13;
  c.beginPath();for(const id in graph){const p=graph[id].position;for(const edge of graph[id].edges){const q=graph[edge].position;c.moveTo(X(p.x),Y(p.z));c.lineTo(X(q.x),Y(q.z));}}c.stroke();
  c.font='bold 20px Arial';c.textAlign='center';
  for(const id in sites){const p=sites[id].center;c.strokeStyle=c.fillStyle='#f5a05d';c.beginPath();c.arc(X(p.x),Y(p.z),17,0,Math.PI*2);c.stroke();c.fillText(id,X(p.x),Y(p.z)+7);}
  for(const a of s.actors){if(!a.alive)continue;if(a.team!==this.p.team&&!(a.firedUntil>s.time)&&!s.actors.some(b=>b.alive&&b.team===this.p.team&&b.target===a))continue;
   c.fillStyle=a.team===this.p.team?'#65dcc9':'#fa737a';c.beginPath();c.arc(X(a.position.x),Y(a.position.z),5,0,Math.PI*2);c.fill();}
  const p=this.p;c.save();c.translate(X(p.position.x),Y(p.position.z));c.rotate(-p.yaw);c.fillStyle='#fff4dc';c.beginPath();c.moveTo(0,-10);c.lineTo(-6,7);c.lineTo(6,7);c.closePath();c.fill();c.restore();
  if(s.charge.planted){c.fillStyle='#ffb966';c.fillRect(X(s.charge.position.x)-5,Y(s.charge.position.z)-5,10,10);}
  this.t('location-label',nearestNode(p.position).lane.toUpperCase());
 }
}
