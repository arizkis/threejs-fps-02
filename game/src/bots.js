import * as THREE from 'three';
import { PALETTE as P, material, signTexture } from './palette.js';
import { graph, holdSpots, sites, spawns, findPath, nearestNode, move, collide } from './world.js';
import { Player } from './player.js';

export const STATES=Object.freeze(['ROUTE','HOLD','ENGAGE','INVESTIGATE','PLANT','DEFUSE','REGROUP']);
export class SoundBus{
 constructor(){this.listeners=new Set();this.event={position:new THREE.Vector3(),radius:0,kind:'',source:null};}
 listen(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
 emit(position,radius,kind,source=null){
  const e=this.event;e.position.copy(position);e.radius=radius;e.kind=kind;e.source=source;
  for(const fn of this.listeners)fn(e);
 }
}

export class Bot{
 constructor(system,name,team,spawn,index){
  Object.assign(this,{system,name,team,index,spawn,state:'ROUTE',health:100,alive:true,height:1.75,radius:0.32,headRadius:0.18,
   armour:index%3===0?100:0,helmet:false,grounded:true,crouched:false,walking:false,ads:0,flash:0,speed:0,yaw:team==='solstice'?-Math.PI/2:Math.PI/2,pitch:0,
   target:null,channel:null,carrier:false,lane:'mid',site:'A',step:0,think:0,burst:0,fireAt:0,holdUntil:0,stuck:0,phase:index,fall:0});
  this.position=spawn.clone();this.velocity=new THREE.Vector3();this.goal=spawn.clone();this.memory=spawn.clone();
  for(const key of ['eye','aim','dir','delta'])this[key]=new THREE.Vector3();
  this.path=[];this.motion={grounded:true,hitX:false,hitY:false,hitZ:false,stepped:false};this.stride=0;
  this.buildBody();system.weapons.ensure(this);
 }
 buildBody(){
  const s=this.system,m=s.mats[this.team].clone(),root=new THREE.Group(),rig=new THREE.Group();
  this.hitMats=[m,s.mats.dark.clone(),s.mats.skin.clone()];this.hitGlow=0;
  root.add(rig);s.scene.add(root);this.body=root;this.rig=rig;
  const box=(mat,x,y,z,w,h,d)=>{if(mat===s.mats.dark)mat=this.hitMats[1];if(mat===s.mats.skin)mat=this.hitMats[2];const mesh=new THREE.Mesh(s.cube,mat);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);rig.add(mesh);return mesh;};
  box(m,0,1.05,0,0.56,0.67,0.32);box(s.mats.dark,0,1.04,-0.18,0.43,0.45,0.08);
  this.head=box(s.mats.skin,0,1.57,0,0.32,0.34,0.32);box(m,0,1.73,0,0.35,0.12,0.35);
  this.legs=[box(s.mats.dark,-0.15,0.37,0,0.21,0.74,0.24),box(s.mats.dark,0.15,0.37,0,0.21,0.74,0.24)];
  this.arms=new THREE.Group();this.arms.position.y=1.25;rig.add(this.arms);
  for(const x of [-0.34,0.34])this.arms.attach(box(m,x,1.1,-0.1,0.16,0.45,0.18));
  this.arms.attach(box(s.mats.dark,0.23,1.18,-0.38,0.12,0.13,0.64));
  this.muzzle=new THREE.Object3D();this.muzzle.position.set(0.23,-0.07,-0.72);this.arms.add(this.muzzle);
  const map=signTexture(this.name,{width:256,height:64,accent:this.team==='solstice'?P.orange:P.solstice});
  this.tag=new THREE.Sprite(new THREE.SpriteMaterial({map,depthWrite:false}));this.tag.scale.set(1.6,0.4,1);this.tag.position.y=2.15;root.add(this.tag);root.position.copy(this.position);
  this.tag.onBeforeRender=(_,__,camera)=>{const k=Math.min(1,this.tag.getWorldPosition(this.eye).distanceTo(camera.position)*0.23/camera.projectionMatrix.elements[5]);this.tag.scale.set(1.6*k,0.4*k,1);this.tag.updateMatrixWorld();};
 }
 getEye(out){out.copy(this.position);out.y+=this.height-0.15;return out;}
 shake(){} // Damage uses the human armour rule.
 takeDamage(amount,source=null,part='torso'){
  const dealt=Player.prototype.takeDamage.call(this,amount,source,part);
  if(dealt>0){this.hitGlow=0.12;this.updateHit(0);}return dealt;
 }
 updateHit(dt){this.hitGlow=Math.max(0,this.hitGlow-dt);for(const m of this.hitMats){m.emissive.setHex(P.tracerGold);m.emissiveIntensity=this.hitGlow/0.12*0.8;}}
 onDeath(self,source,part){
  this.stopChannel();this.state='DOWN';this.target=null;this.tag.visible=false;
  this.system.onKill?.(source,this,part==='head');
 }
 respawn(){
  this.stopChannel();this.position.copy(this.spawn);this.velocity.set(0,0,0);
  this.health=100;this.alive=true;this.height=1.75;this.grounded=true;this.flash=this.ads=this.fall=this.stride=0;
  this.updateHit(1);
  this.target=null;this.crouched=false;this.path.length=0;this.body.position.copy(this.position);this.body.rotation.set(0,0,0);this.tag.visible=true;
 }
 go(position,state='ROUTE'){
  this.stopChannel();this.goal.copy(position);this.state=state;this.step=0;this.stuck=0;
  findPath(nearestNode(this.position),nearestNode(position),this.path);
  if(this.path.length>1)this.step=1;
 }
 startChannel(kind,site){
  if(this.channel===kind&&this.site===site)return;
  this.stopChannel();this.channel=kind;this.site=site;this.state=kind;this.velocity.x=this.velocity.z=0;
  this.system.onChannel?.(this,kind,true,site);
  this.system.radio(this,kind==='PLANT'?`Planting at ${sites[site].name}`:'Defusing — cover me');
 }
 stopChannel(){
  if(this.channel){this.system.onChannel?.(this,this.channel,false,this.site);this.channel=null;}
 }
 hear(e){
  if(!this.alive||e.source===this||e.source?.team===this.team||this.target||this.channel)return;
  if(this.position.distanceToSquared(e.position)>e.radius*e.radius)return;
  this.memory.copy(e.position);this.go(this.memory,'INVESTIGATE');this.holdUntil=this.system.time+2.2;
 }
 perceive(){
  const s=this.system,old=this.target,p=this.position;this.target=null;this.getEye(this.eye);
  let best=42*42,friends=0,foes=0,ally=null,near=Infinity;
  for(const a of s.actors){
   if(!a.alive)continue;
   const distance=p.distanceToSquared(a.position);
   if(a.team===this.team){
    if(distance<196)friends++;
    if(a!==this&&distance<near){near=distance;ally=a;}continue;
   }
   if(this.flash>0.2||distance>42*42)continue;
   const dx=a.position.x-p.x,dz=a.position.z-p.z;
   if(distance>4&&(-Math.sin(this.yaw)*dx-Math.cos(this.yaw)*dz)/Math.hypot(dx,dz)<0.55)continue;
   this.aim.copy(a.position);this.aim.y+=(a.height||1.75)-0.15;
   if(!s.weapons.lineOfSight(this.eye,this.aim))continue;
   if(distance<196)foes++;
   if(distance<best){best=distance;this.target=a;}
   if(this.team==='solstice')a.revealedUntil=s.time+0.3;
  }
  if(this.target){
   this.memory.copy(this.target.position);
   if(old!==this.target){this.fireAt=s.time+0.23+s.rand()*0.15;s.contact(this,foes);}
   if(foes>friends&&ally&&this.state!=='REGROUP')this.go(ally.position,'REGROUP');
   else if(this.state!=='REGROUP'){this.stopChannel();this.state='ENGAGE';}
  }else if(this.state==='ENGAGE')this.go(this.memory,'INVESTIGATE');
 }
 update(dt){
  const s=this.system,p=this.position,v=this.velocity,m=this.motion;
  if(!this.alive){this.fall+=dt;this.body.rotation.z=Math.min(Math.PI/2,this.fall*4);return;}
  if(this.target&&!this.target.alive)this.think=0;
  this.think-=dt;if(this.think<=0){this.think=0.13+s.rand()*0.05;this.perceive();}
  const t=this.target;
  let dx=0,dz=0,wishX=0,wishZ=0,yaw=this.yaw;
  this.walking=this.state==='INVESTIGATE'||this.state==='ENGAGE';
  const crouch=this.state==='ENGAGE'&&Math.sin(s.time*1.7+this.index)>0.65;
  this.crouched=crouch||(this.crouched&&collide(p,this.radius,1.75));this.height=this.crouched?1.1:1.75;
  if(t){
   this.getEye(this.eye);this.aim.copy(t.position);this.aim.y+=(t.height||1.75)-0.15;
   this.dir.copy(this.aim).sub(this.eye).normalize();
   dx=t.position.x-p.x;dz=t.position.z-p.z;
   yaw=Math.atan2(-dx,-dz);this.pitch=Math.atan2(this.dir.y,Math.hypot(this.dir.x,this.dir.z));
   if(s.time>=this.fireAt&&this.flash<0.2&&s.weapons.lineOfSight(this.eye,this.aim)){
    if(!this.burst)this.burst=2+Math.floor(s.rand()*3);
    this.dir.x+=(s.rand()-0.5)*0.009;this.dir.y+=(s.rand()-0.5)*0.009;this.dir.normalize();
    if(s.weapons.fire(this,this.dir)&&!--this.burst)this.fireAt=s.time+0.3+s.rand()*0.4;
   }
   if(this.state==='ENGAGE'){
    const length=Math.hypot(dx,dz)||1,sign=Math.sin(s.time*2+this.index)>0?1:-1;
    wishX=-dz/length*sign;wishZ=dx/length*sign;
   }
  }
  if(this.state!=='ENGAGE'&&!this.channel){
   if(this.state==='HOLD'){
    if(!t)yaw=(this.team==='solstice'?-Math.PI/2:Math.PI/2)+Math.sin(s.time*0.7+this.index)*0.85;
    if(this.team==='solstice'&&!s.charge.planted&&s.time>this.holdUntil)this.go(sites[this.site].center);
   }else{
    let point=this.path[this.step]?.position||this.goal;
    if(Math.hypot(point.x-p.x,point.z-p.z)<0.6&&Math.abs(point.y-p.y)<0.5){
     this.step++;point=this.path[this.step]?.position||this.goal;
    }
    dx=point.x-p.x;dz=point.z-p.z;
    const length=Math.hypot(dx,dz);
    if(length>0.55){wishX=dx/length;wishZ=dz/length;if(!t)yaw=Math.atan2(-dx,-dz);}
    else{
     this.state='HOLD';this.holdUntil=s.time+2.2;
     if(this.carrier&&!s.charge.planted&&p.distanceTo(sites[this.site].center)<sites[this.site].radius)this.startChannel('PLANT',this.site);
     else if(s.charge.planted&&s.defuser===this&&p.distanceTo(s.charge.position)<2.2)this.startChannel('DEFUSE',s.charge.site);
    }
   }
  }
  if(this.state==='HOLD'&&s.charge.planted&&s.defuser===this&&!this.channel)this.go(s.charge.position,'DEFUSE');
  this.yaw+=Math.atan2(Math.sin(yaw-this.yaw),Math.cos(yaw-this.yaw))*Math.min(1,dt*8);
  if(!t)this.pitch*=Math.exp(-8*dt);
  this.ads+=(Number(this.state==='ENGAGE'||this.state==='HOLD')-this.ads)*Math.min(1,dt*8);
  const speed=this.crouched?1.8:this.walking?3:5.4;
  if(this.channel)wishX=wishZ=0;
  if(wishX||wishZ){
   dx=wishX*speed-v.x;dz=wishZ*speed-v.z;
   const change=Math.hypot(dx,dz),ratio=Math.min(1,(this.grounded?34:9)*dt/(change||1));
   v.x+=dx*ratio;v.z+=dz*ratio;
  }else{v.x*=Math.exp(-12*dt);v.z*=Math.exp(-12*dt);}
  v.y-=18*dt;this.delta.copy(v).multiplyScalar(dt);
  const x=p.x,z=p.z;
  move(p,this.delta,this.radius,this.height,0.26,m);this.grounded=m.grounded;
  if(m.hitY||this.grounded)v.y=0;
  if(m.hitX)v.x=0;if(m.hitZ)v.z=0;
  const distance=Math.hypot(p.x-x,p.z-z);this.speed=dt?distance/dt:0;
  this.stuck=(wishX||wishZ)&&distance<dt*0.15?this.stuck+dt:0;
  if(this.stuck>1.4)this.go(this.goal,this.state);
  this.phase+=distance*4;this.stride+=distance;
  if(this.grounded&&this.stride>(this.walking?1.65:2.1)){this.stride=0;s.bus.emit(p,this.crouched?2.4:this.walking?4:10,'footstep',this);}
  this.body.position.copy(p);this.body.rotation.y=this.yaw;this.rig.scale.y=this.height/1.75;
  this.rig.position.y=Math.sin(this.phase*2)*0.025;this.legs[0].rotation.x=Math.sin(this.phase)*0.45;this.legs[1].rotation.x=-this.legs[0].rotation.x;
  this.arms.rotation.x=this.head.rotation.x=this.pitch;this.tag.position.y=this.height+0.4;
 }
}

export class Bots{
 constructor(scene,player,weapons,{bus=new SoundBus(),onRadio=null,onKill=null,onChannel=null,seed=4187}={}){
  Object.assign(this,{scene,player,weapons,bus,onRadio,onKill,onChannel,seed:seed|0||1,time:0,defuser:null});
  this.radioAt={solstice:0,umbra:0};this.cube=new THREE.BoxGeometry(1,1,1);
  this.mats={solstice:material(P.orange),umbra:material(P.solstice),dark:material(P.steelDark),skin:material(P.sandLight)};
  this.bots=[];
  for(const team of ['solstice','umbra']){
   const names=(team==='solstice'?'Rook Sable Ferro Ilya':'Vesper Maren Odo Kite Juno').split(' ');
   for(let i=0;i<names.length;i++)this.bots.push(new Bot(this,names[i],team,spawns[team][team==='solstice'?[0,1,3,4][i]:i],this.bots.length));
  }
  this.actors=[player,...this.bots];this.attackers=this.bots.slice(0,4);this.defenders=this.bots.slice(4);
  this.charge={planted:false,site:'A',position:sites.A.center.clone()};
  this.unsubscribe=bus.listen(e=>{for(const b of this.bots)b.hear(e);});this.plan();
 }
 rand(){let n=this.seed;n^=n<<13;n^=n>>>17;n^=n<<5;this.seed=n;return(n>>>0)/4294967296;}
 radio(bot,text){this.onRadio?.(bot.name,text,bot.team,bot.state);}
 plan(site='A',carrier=this.attackers[2]){
  this.site=site;this.carrier=carrier;for(const a of this.actors)a.carrier=a===carrier;
  const defense=['TowerEntry','TowerEast','CourtNE','HallEntryW','HallEntryN'];
  for(let i=0;i<4;i++){
   const b=this.attackers[i];b.site=i<2?'A':site;b.lane=i<2?'A':b.carrier?site:'mid';
   b.go(graph[i===0?'TowerEntry':i===1?'TowerWest':b.carrier?(site==='A'?'Tower':'Hall'):'CourtE'].position);
  }
  for(let i=0;i<5;i++){
   const b=this.defenders[i];b.lane=i<2?'A':i===2?'mid':'B';b.site=i<2?'A':'B';b.go(graph[defense[i]].position);
  }
 }
 contact(bot,count){
  if(this.time<this.radioAt[bot.team])return;this.radioAt[bot.team]=this.time+3.5;
  this.radio(bot,bot.lane==='mid'?`Contact Court — ${count>1?'two':'one'} pushing mid`:`Contact ${bot.site==='A'?'Tower':'Hall'} — ${count>1?'two':'one'} spotted`);
  if(bot.team==='umbra')for(const b of this.defenders)if(b.alive&&b!==bot&&!b.target&&b.lane!==bot.lane){
   b.go(bot.memory);b.lane=bot.lane;this.radio(b,bot.site==='B'?'Rotating to Hall':'Rotating to Tower');break;
  }
 }
 setCharge(planted,site=this.site,position=sites[site].center){
  const c=this.charge;c.planted=planted;c.site=site;c.position.copy(position);this.defuser=null;
  if(!planted)return;
  const spots=holdSpots.filter(n=>n.site===site);
  for(let i=0;i<this.bots.length;i++){
   const b=this.bots[i];if(!b.alive)continue;b.site=site;
   b.go(spots[i%spots.length].position);if(b.team==='umbra')b.lane=site;
  }
  this.radio(this.defenders[0],site==='B'?'Rotating to Hall':'Rotating to Tower');this.chooseDefuser();
 }
 chooseDefuser(){
  let best=Infinity;
  for(const b of this.defenders)if(b.alive){const d=b.position.distanceToSquared(this.charge.position);if(d<best){best=d;this.defuser=b;}}
  if(this.defuser)this.defuser.go(this.charge.position,'DEFUSE');
 }
 update(dt){this.time+=dt;if(this.charge.planted&&!this.defuser?.alive)this.chooseDefuser();for(const b of this.bots)b.update(dt);}
 reset(site='A',carrier=this.attackers[2]){this.charge.planted=false;this.defuser=null;for(const b of this.bots)b.respawn();this.plan(site,carrier);}
}
