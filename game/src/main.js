import * as THREE from 'three';
import './palette.js';
import { AudioSynth } from './audio.js';
import { Input } from './input.js';
import { createWorld, sites } from './world.js';
import { Player } from './player.js';
import { Weapons } from './weapons.js';
import { Bots } from './bots.js';
import { Rounds } from './rounds.js';
import { HUD } from './hud.js';

const canvas=document.getElementById('game-canvas'),renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=false;
const world=createWorld(),camera=new THREE.PerspectiveCamera(75,1,0.06,260),audio=new AudioSynth(),input=new Input(canvas);
const player=new Player(camera,input),weapons=new Weapons(world.scene,camera,player),bots=new Bots(world.scene,player,weapons);
weapons.getActors=()=>bots.actors;
const rounds=new Rounds(player,bots,weapons),hud=new HUD(rounds,weapons,bots,{onStart:()=>{void audio.resume().catch(()=>{});}});
player.onSound=weapons.onSound=e=>{if(e.type==='shot')e.actor.firedUntil=rounds.state.time+3;bots.bus.emit(e.position,e.radius,e.type,e.actor);};
bots.bus.listen(e=>{
 const dx=e.position.x-player.position.x,dz=e.position.z-player.position.z,d=Math.hypot(dx,dz);
 audio.play(e.kind,e.source?.loadout?.active,1/(1+d*0.06),(dx*Math.cos(player.yaw)-dz*Math.sin(player.yaw))/(d||1));
});
weapons.onHit=head=>{hud.hit(head);audio.play('hit');};player.onDamage=()=>hud.damage();
weapons.onKill=(...args)=>rounds.recordKill(...args);bots.onRadio=rounds.onRadio=(...args)=>hud.radio(...args);
const notify=rounds.onEvent;rounds.onEvent=(kind,data)=>{notify(kind,data);if(kind==='end')audio.play(data.winner==='solstice'?'win':'lose');};
function resize(){renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
addEventListener('resize',resize);resize();
window.__helioworks={world,camera,renderer,player,weapons,bots,rounds,hud};
const query=new URLSearchParams(location.search).get('shot');
const shot=['fight','buy','plant','end'].includes(query)?query:null;
let last=performance.now(),accumulator=0,beep=-1;
function frame(now){
 const elapsed=Math.min(0.1,(now-last)/1000);last=now;
 if(hud.started&&(rounds.state.phase!=='LIVE'||input.locked)){
  accumulator+=elapsed;
  while(accumulator>=1/120){
   const live=rounds.state.phase==='LIVE';player.update(1/120,live);weapons.update(1/120,live);
   if(live)bots.update(1/120);
   if(live&&player.team==='umbra'){const c=rounds.state.charge;player.channel=c.planted&&input.down('KeyE')&&player.position.distanceToSquared(c.position)<4.84?'DEFUSE':null;if(player.channel)bots.defuser=player;else if(bots.defuser===player)bots.defuser=null;}
   rounds.update(1/120);input.endFrame();accumulator-=1/120;
   const c=rounds.state.charge,n=c.planted?Math.ceil(c.timer):-1;if(n!==beep&&n>=0)audio.play('plant');beep=n;
  }
 }else{accumulator=0;input.endFrame();}
 hud.update();renderer.render(world.scene,camera);requestAnimationFrame(frame);
}
function stage(){
 const s=rounds.state,c=s.charge,v=(x,y,z)=>new THREE.Vector3(x,y,z);
 const named=name=>bots.bots.find(a=>a.name===name);
 const pose=(a,x,z)=>{a.position.set(x,0,z);a.alive=true;if(a.body){a.body.visible=true;a.body.position.copy(a.position);a.body.rotation.y=a.yaw;}};
 const look=(x,y,z)=>{const dx=x-player.position.x,dz=z-player.position.z;player.yaw=Math.atan2(-dx,-dz);player.pitch=Math.atan2(y-player.eyeHeight,Math.hypot(dx,dz));player.syncCamera();};
 hud.started=true;s.round=7;s.scores.solstice=3;s.scores.umbra=2;s.phase='LIVE';s.timer=43;
 if(shot==='fight'){
  for(const a of bots.bots)a.body.visible=false;
  pose(player,-10,4);weapons.give(player,'kestrel');player.cash=2450;player.ads=1;look(5,1.4,-5);
  const kite=named('Kite'),sable=named('Sable'),juno=named('Juno');
  pose(kite,5,-5);sable.yaw=-1.47;pose(sable,-7,-1);pose(juno,13,-3);weapons.give(sable,'dart');player.target=kite;sable.target=juno;
  const g=weapons.current();g.mag=17;g.reserve=75;
  const cloud=weapons.smokes[0];cloud.life=8;cloud.age=1;cloud.radius=3.5;cloud.mesh.visible=true;cloud.mesh.position.set(11,1.8,-12);cloud.mesh.scale.setScalar(3.5);
  weapons.update(0,false);camera.updateMatrixWorld(true);
  const muzzle=weapons.models.kestrel.userData.muzzle.getWorldPosition(v(0,0,0));weapons.muzzleFlash(muzzle,v(1,0,-0.5).normalize());
  weapons.sparks(v(5,1.35,-5),v(-1,0,0));weapons.tracer(v(-6.8,1.3,-1.3),v(13,1.3,-3));weapons.muzzleFlash(v(-6.8,1.3,-1.3),v(1,0,-0.1).normalize());weapons.updateEffects(0.025);
  named('Odo').alive=false;hud.hit();hud.radio('Sable','Contact Court — two pushing mid');hud.event('kill',{killer:named('Rook'),victim:named('Odo'),weapon:'kestrel'});
 }else if(shot==='buy'){
  s.phase='BUY';s.timer=9;player.cash=4100;look(-25,1.5,0);hud.buyOpen=true;
  ['kestrel','dart','kestrel','longbow'].forEach((id,i)=>weapons.give(bots.attackers[i],id));
 }
 if(shot==='plant'){
  for(const a of bots.bots)a.body.visible=false;
  pose(player,17,-16);weapons.give(player,'longbow');look(28,9,-26);
  const ferro=named('Ferro');pose(ferro,25,-23);ferro.state=ferro.channel='PLANT';ferro.site='A';
  c.carrier=ferro;c.channelActor=ferro;c.kind='PLANT';c.site='A';c.progress=1.8;c.duration=3;c.position.copy(sites.A.center);
  named('Vesper').firedUntil=3;pose(named('Vesper'),39,-16);named('Vesper').body.visible=false;hud.radio('Ferro','Planting at Tower A');
 }else if(shot==='end'){
  pose(player,7,13);look(28,2.5,24);s.phase='END';s.timer=4;s.scores.solstice=4;s.winner='solstice';s.reason='Charge detonated';
  s.actors.forEach((a,i)=>{a.kills=12-i;a.deaths=3+i%4;a.cash=4100-i*175;});
 }
 weapons.update(0,false);hud.update();document.getElementById('start-overlay').hidden=true;
}
if(shot){
 window.__shotReady=false;stage();
 requestAnimationFrame(()=>{renderer.render(world.scene,camera);requestAnimationFrame(()=>{renderer.render(world.scene,camera);window.__shotReady=true;});});
}else requestAnimationFrame(frame);
