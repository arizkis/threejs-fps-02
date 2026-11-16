import * as THREE from 'three';
import{PALETTE as P,material,unlit,canvasTexture}from './palette.js';
import{segmentAABB,traceSegment,lineOfSight as worldSight}from './world.js';
export const WEAPONS ={};
const FIELDS='name price damage mag reserve interval reload auto spread move recoil bloom radius slot'.split(' ');
for(const row of[
 ['flick','Flick P9',0,26,12,48,0.16,1.25,false,0.012,0.018,0.012,0.007,28,1],
 ['osprey','Osprey',600,42,7,28,0.4,1.65,false,0.004,0.018,0.035,0.01,38,1],
 ['dart','Dart SMG',1500,22,32,96,0.075,1.8,true,0.012,0.032,0.007,0.005,32,2],
 ['kestrel','Kestrel AR',2700,34,25,75,0.105,2.1,true,0.0045,0.022,0.017,0.006,40,2],
 ['longbow','Longbow DMR',3300,68,10,30,0.55,2.4,false,0.0016,0.025,0.038,0.01,44,2],
]){
 const def={};for(let i=1;i<row.length;i++)def[FIELDS[i-1]]=row[i];WEAPONS[row[0]]=def;
}
export const UTILITIES ={
 shard:{name:'Shard HE',price:300,fuse:3,color:P.orange},
 flare:{name:'Flare',price:200,fuse:1.25,color:P.white},
 veil:{name:'Veil smoke',price:300,fuse:1.5,color:P.shadow},
};
const EMPTY=[],UP=new THREE.Vector3(0,1,0);
const KEYS=[['Digit1','sidearm'],['Digit2','primary'],['Digit4','shard'],['Digit5','flare'],['Digit6','veil']];
function gun(id){return{id,def:WEAPONS[id],mag:WEAPONS[id].mag,reserve:WEAPONS[id].reserve,nextShot:0,reloadUntil:0,bloom:0};}
export function createLoadout(){
 return{guns:{flick:gun('flick')},sidearm:'flick',primary:null,active:'flick',selected:'flick',utilities:{shard:0,flare:0,veil:0}};
}
function sphereRay(o,d,x,y,z,radius){
 const a=o.x-x,b=o.y-y,c=o.z-z,dot=a*d.x+b*d.y+c*d.z;
 const disc=dot*dot-(a*a+b*b+c*c-radius*radius);
 if(disc<0)return Infinity;
 const root=Math.sqrt(disc),near=-dot-root,far=-dot+root;
 return near>=0?near:far>=0?far:Infinity;
}
const bodyBox=new THREE.Box3(),rayEnd=new THREE.Vector3();
const actorHit={part:'torso'};
// Unit dir; torso box, head sphere and four limb spheres.
export function hitActor(origin,dir,range,a,out=actorHit){
 const p=a.position,h=a.height||1.75;
 let best=sphereRay(origin,dir,p.x,p.y+h-0.18,p.z,a.headRadius||0.18),part='head';
 bodyBox.min.set(p.x-0.24,p.y+0.43,p.z-0.19);
 bodyBox.max.set(p.x+0.24,p.y+h-0.36,p.z+0.19);
 rayEnd.copy(origin).addScaledVector(dir,range);
 const torso=segmentAABB(origin,rayEnd,bodyBox)*range;
 if(torso<best){best=torso;part='torso';}
 for(let i=0;i<4;i++){
  const side=i%2?1:-1,arm=i<2;
  const t=sphereRay(origin,dir,p.x+side*(arm?0.32:0.14),p.y+(arm?h*0.61:0.25),p.z,arm?0.15:0.22);
  if(t<best){best=t;part='limb';}
 }
 out.part=part;return best<=range?best:Infinity;
}
export class Weapons{
 // getActors returns both teams, including the human; callbacks consume pooled state.
 constructor(scene,camera,player,{getActors=()=>EMPTY,onSound=null,onHit=null,onKill=null,seed=90210}={}){
  Object.assign(this,{scene,camera,player,getActors,onSound,onHit,onKill,time:0,seed:seed|0||1,kick:0});
  for(const key of['_from','_end','_dir','_right','_up','_point','_normal','_eye','_muzzle'])this[key]=new THREE.Vector3();
  this._hit={point:this._point,normal:this._normal,collider:null,t:Infinity};
  this.region={part:'torso'};
  this._sound={type:'shot',weapon:'flick',position:new THREE.Vector3(),radius:40,actor:null,team:''};
  this._slots=['flick',null,'shard','flare','veil'];
  this.effects=new THREE.Group();scene.add(this.effects);
  if(!camera.parent)scene.add(camera);
  this.models={};this.view=new THREE.Group();camera.add(this.view);
  this.ensure(player);this.buildModels();this.buildPools();
 }
 rand(){let n=this.seed;n^=n<<13;n^=n>>>17;n^=n<<5;this.seed=n;return(n>>>0)/4294967296;}
 ensure(a){return a.loadout||(a.loadout=createLoadout());}
 eye(a,out){out.copy(a.position);out.y+=(a.height||1.75)-0.15;return a.getEye?a.getEye(out):out;}
 current(a=this.player){const l=this.ensure(a);return l.guns[l.active];}
 give(a,id,equip=true){
  const l=this.ensure(a);
  if(UTILITIES[id]){if(l.utilities[id]>=2)return false;l.utilities[id]++;return true;}
  const def=WEAPONS[id];if(!def)return false;
  const slot=def.slot===1?'sidearm':'primary';
  if(l[slot]!==id)delete l.guns[l[slot]];
  l[slot]=id;l.guns[id]=gun(id);
  if(equip)this.equip(a,id);
  return true;
 }
 equip(a,id){
  const l=this.ensure(a);
  if(!l.guns[id]&&!(l.utilities[id]>0))return false;
  const previous=l.guns[l.active];if(previous)previous.reloadUntil=0;
  l.selected=id;if(l.guns[id])l.active=id;
  return true;
 }
 refill(a){
  const l=this.ensure(a);for(const id in l.guns)l.guns[id]=gun(id);
 }
 sound(type,a,position,radius,weapon=''){
  const e=this._sound;e.type=type;e.actor=a;e.team=a?.team;e.weapon=weapon;e.radius=radius;e.position.copy(position);
  this.onSound?.(e);// Bus copies this reusable event.
 }
 reload(a=this.player){
  const g=this.current(a);
  if(!a.alive||g.reloadUntil||g.mag===g.def.mag||!g.reserve)return false;
  g.mag=0;g.reloadUntil=this.time+g.def.reload;
  this.sound('reload',a,a.position,8,g.id);return true;
 }
 spread(a=this.player){
  const g=this.current(a),speed=a.speed??Math.hypot(a.velocity?.x||0,a.velocity?.z||0);
  let value=g.def.spread+g.bloom+g.def.move*Math.min(1,speed/5.4)+(a.grounded===false?0.065:0);
  if(a.crouched)value*=0.62;
  return value*(1-(a.ads||0)*(g.id==='longbow'?0.85:0.45));
 }
 damage(target,amount,source,part,weapon){
  if(target.alive===false||target.team===source?.team)return 0;
  const alive=target.health>0;
  let dealt;
  if(target.takeDamage)dealt=target.takeDamage(amount,source,part);
  else{
   const absorbed=Math.min(target.armour||0,amount*0.6);
   target.armour=(target.armour||0)-absorbed;
   dealt=Math.min(target.health,amount-absorbed);target.health-=dealt;
   if(target.health<=0)target.alive=false;
  }
  if(source===this.player&&dealt>0)this.onHit?.(part==='head',target,dealt);
  if(alive&&target.health<=0)this.onKill?.(source,target,weapon,part==='head');
  return dealt;
 }
 fire(a=this.player,dir=null){
  const l=this.ensure(a),g=l.guns[l.selected];
  if(!a.alive||!g||this.time<g.nextShot||g.reloadUntil)return false;
  if(!g.mag){this.reload(a);return false;}
  const o=this._from,d=this._dir,e=this._end,n=this._normal,m=this._muzzle;
  g.mag--;g.nextShot=this.time+g.def.interval;
  this.eye(a,o);
  if(dir)d.copy(dir).normalize();else this.camera.getWorldDirection(d);
  this._right.crossVectors(d,UP).normalize();this._up.crossVectors(this._right,d).normalize();
  const angle=this.rand()*Math.PI*2,radius=Math.sqrt(this.rand())*this.spread(a);
  d.addScaledVector(this._right,Math.cos(angle)*radius).addScaledVector(this._up,Math.sin(angle)*radius).normalize();
  e.copy(o).addScaledVector(d,100);
  const wall=traceSegment(o,e,this._hit);
  let distance=Math.min(100,wall*100),victim=null,part='torso';
  const actors=this.getActors();
  for(let i=0;i<actors.length;i++){
   const target=actors[i];
   if(target===a||target.team===a.team||target.alive===false||target.health<=0)continue;
   const t=hitActor(o,d,distance,target,this.region);
   if(t<distance){distance=t;victim=target;part=this.region.part;}
  }
  e.copy(o).addScaledVector(d,distance);
  if(victim){
   this.damage(victim,g.def.damage*(part==='head'?4:part==='limb'?0.75:1),a,part,g.id);
   n.copy(d).negate();
  }
  const color=a.team==='umbra'?P.tracerRed:P.tracerGold;
  if(victim||wall!==Infinity)this.sparks(e,n,color);
  if(a===this.player){
   this.models[g.id].userData.muzzle.getWorldPosition(m);
   a.recoil(g.def.recoil*(a.crouched?0.75:1),(this.rand()-0.5)*g.def.recoil*0.4);
   this.kick=Math.min(0.09,this.kick+0.035);
  }else if(a.muzzle){a.muzzle.updateWorldMatrix(true,false);a.muzzle.getWorldPosition(m);}
  else m.copy(o).addScaledVector(d,0.45);
  this.tracer(m,e,color);this.muzzleFlash(m,d,color);
  g.bloom=Math.min(0.065,g.bloom+g.def.bloom);
  this.sound('shot',a,o,g.def.radius,g.id);return true;
 }
 updateLoadout(a,dt){
  if(a!==this.player)a.flash=Math.max(0,(a.flash||0)-dt);
  a.updateHit?.(dt);
  const l=this.ensure(a);
  for(const id in l.guns){
   const g=l.guns[id];g.bloom*=Math.exp(-(a.crouched?8:5)*dt);
   if(g.reloadUntil&&this.time>=g.reloadUntil){
    g.mag=Math.min(g.def.mag,g.reserve);g.reserve-=g.mag;g.reloadUntil=0;
   }
  }
 }
 update(dt,active=true){
  this.time+=dt;this.kick*=Math.exp(-18*dt);
  const actors=this.getActors();
  for(let i=0;i<actors.length;i++)this.updateLoadout(actors[i],dt);
  if(!actors.includes(this.player))this.updateLoadout(this.player,dt);
  const p=this.player,input=p.input,l=this.ensure(p);
  if(active&&p.alive&&input.locked){
   for(const key of KEYS)if(input.consumePress(key[0]))this.equip(p,l[key[1]]||key[1]);
   const wheel=input.consumeWheel();
   if(wheel){
    const slots=this._slots;slots[0]=l.sidearm;slots[1]=l.primary;
    let i=slots.indexOf(l.selected);
    for(let n=0;n<5;n++){i=(i+(wheel>0?1:4))%5;if(slots[i]&&this.equip(p,slots[i]))break;}
   }
   if(input.consumePress('KeyR'))this.reload(p);
   if(UTILITIES[l.selected]){
    if(input.consumeMousePress()){this.camera.getWorldDirection(this._dir);this.throwGrenade(p,l.selected,this._dir);}
   }else{
    const g=this.current(p);
    if(g.def.auto?input.mouseDown():input.consumeMousePress())this.fire(p);
   }
  }
  p.adsFov=l.active==='longbow'?38:61;
  for(const id in this.models)this.models[id].visible=p.alive&&l.selected===id;
  this.view.position.set(0.24*(1-p.ads),-0.28+p.ads*0.035+Math.sin(this.time*8)*p.speed*0.001,-0.4+this.kick);
  this.view.rotation.set(this.kick*0.6,0,Math.sin(this.time*6)*p.speed*0.001);
  this.updateEffects(dt);this.updateGrenades(dt);
 }
 buildModels(){
  this.view.scale.setScalar(0.6);
  const dark=material(P.steelDark,{depthTest:false,depthWrite:false}),steel=material(P.concrete,{metalness:0.3,depthTest:false,depthWrite:false});
  const grip=material(P.copper,{depthTest:false,depthWrite:false}),accent=unlit(P.orange,{depthTest:false,depthWrite:false});
  const cube=new THREE.BoxGeometry(1,1,1),barrel=new THREE.CylinderGeometry(1,1,1,8);
  for(const id in WEAPONS){
   const root=new THREE.Group(),rifle=WEAPONS[id].slot===2,len=id==='longbow'?0.72:rifle?0.5:id==='osprey'?0.34:0.25;
   this.view.add(root);this.models[id]=root;
   const part=(geo,mat,x,y,z,sx,sy,sz,rx=0)=>{
    const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.rotation.x=rx;mesh.renderOrder=20;root.add(mesh);
   };
   part(cube,steel,0,0,-len/2,0.13,0.15,len);
   part(cube,grip,0,-0.15,-0.04,0.1,0.24,0.12,0.2);
   part(barrel,dark,0,0,-len-0.09,0.025,0.22,0.025,Math.PI/2);
   part(barrel,accent,0,0,-len-0.18,0.032,0.055,0.032,Math.PI/2);
   part(cube,accent,0,0.084,-len/2,0.11,0.018,len*0.65);
   part(cube,accent,0,0.11,-len+0.07,0.07,0.06,0.05);
   if(rifle){
    part(cube,accent,0,-0.17,-0.24,0.09,id==='dart'?0.25:0.18,0.16,-0.15);
    part(cube,grip,0,-0.02,0.12,0.12,0.16,0.26);
    for(let i=0;i<3;i++)part(cube,dark,0,0,-len+0.1+i*0.07,0.15,0.16,0.025);
   }
   if(id==='longbow'){
    part(barrel,dark,0,0.18,-0.28,0.055,0.28,0.055,Math.PI/2);
    part(barrel,accent,0,0.18,-0.425,0.041,0.006,0.041,Math.PI/2);
   }
   const muzzle=new THREE.Object3D();muzzle.position.set(0,0,-len-0.21);root.add(muzzle);root.userData.muzzle=muzzle;
  }
 }
 buildPools(){
  const particle=new THREE.IcosahedronGeometry(1,0);
  const glow=color=>unlit(color,{transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,side:THREE.DoubleSide});
  const shape=new THREE.Shape();
  for(let i=0;i<16;i++){const a=i*Math.PI/8,r=i%2?0.12:1;shape[i?'lineTo':'moveTo'](Math.cos(a)*r,Math.sin(a)*r);}shape.closePath();
  const star=new THREE.ShapeGeometry(shape),halo=canvasTexture(32,32,(c)=>{
   const g=c.createRadialGradient(16,16,0,16,16,16);g.addColorStop(0,'#ffffff');g.addColorStop(0.25,'#ffffff99');g.addColorStop(1,'#ffffff00');c.fillStyle=g;c.fillRect(0,0,32,32);
  });
  const pool=(count,geometry,mat,kind=0)=>{
   const list=[];
   for(let i=0;i<count;i++){
    let mesh;
    if(kind===3){
     const g=new THREE.BufferGeometry();
     g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3).setUsage(THREE.DynamicDrawUsage));
     mesh=new THREE.Line(g,mat.clone());mesh.frustumCulled=false;
     mesh.add(new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,6),glow(P.tracerGold)));
    }else mesh=new THREE.Mesh(geometry,mat.clone());
    if(kind===4||kind===5){
     const core=new THREE.Mesh(star,glow(P.white));core.scale.setScalar(0.4);mesh.add(core);
     const haze=new THREE.Sprite(new THREE.SpriteMaterial({map:halo,color:P.glint,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));haze.scale.set(3,3,1);mesh.add(haze);
    }
    mesh.visible=false;this.effects.add(mesh);
    list.push({mesh,life:0,age:0,velocity:new THREE.Vector3(),previous:new THREE.Vector3(),kind,radius:0,owner:null,type:''});
   }
   return list;
  };
  this.tracers=pool(32,null,new THREE.LineBasicMaterial({color:P.tracerGold,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),3);
  this.flashes=pool(10,star,glow(P.tracerGold),4);
  this.impacts=pool(20,star,glow(P.tracerGold),5);
  this.puffs=pool(128,new THREE.PlaneGeometry(1,1),unlit(P.white,{map:halo,transparent:true,depthWrite:false}),6);
  this.lights=Array.from({length:4},()=>{const light=new THREE.PointLight(P.glint,0,5,2);this.effects.add(light);return{light,life:0};});
  this.sparkPool=pool(60,particle,glow(P.orange),1);
  this.blasts=pool(4,particle,unlit(P.orange,{transparent:true,opacity:0.6,depthWrite:false,toneMapped:false}),2);
  this.particles=[...this.flashes,...this.impacts,...this.puffs,...this.sparkPool,...this.blasts];
  this.grenadeMats={};for(const id in UTILITIES)this.grenadeMats[id]=material(UTILITIES[id].color,{metalness:0.4});
  this.grenades=pool(20,new THREE.IcosahedronGeometry(0.11,1),this.grenadeMats.shard);
  this.smokes=pool(10,new THREE.SphereGeometry(1,12,8),unlit(P.smoke,{transparent:true,opacity:0.86,depthWrite:false}));
  this._pools=[this.tracers,this.particles,this.grenades,this.smokes];
  this.ti=this.fi=this.si=this.bi=this.ii=this.pi=0;
 }
 tracer(a,b,color=P.tracerGold){
  const t=this.tracers[this.ti++%this.tracers.length],attr=t.mesh.geometry.attributes.position;
  attr.setXYZ(0,a.x,a.y,a.z);attr.setXYZ(1,b.x,b.y,b.z);attr.needsUpdate=true;t.life=0.15;t.mesh.visible=true;
  t.mesh.material.color.setHex(color);t.mesh.material.opacity=1;
  const glow=t.mesh.children[0];glow.material.color.setHex(color);glow.material.opacity=0.4;
  glow.position.copy(a).lerp(b,0.5);glow.scale.set(0.025,a.distanceTo(b),0.025);
  glow.quaternion.setFromUnitVectors(UP,this._right.copy(b).sub(a).normalize());
 }
 star(p,position,size,life,color){
  p.life=p.duration=life;p.mesh.visible=true;p.mesh.position.copy(position);p.mesh.scale.setScalar(size);
  p.mesh.quaternion.copy(this.camera.quaternion);p.mesh.material.color.setHex(color);p.mesh.material.opacity=1;
  for(const child of p.mesh.children)child.material.opacity=child.isSprite?0.45:1;
 }
 muzzleFlash(position,dir,color=P.tracerGold){
  const pulse=this.lights[this.fi%this.lights.length],p=this.flashes[this.fi++%this.flashes.length];
  this.star(p,position,0.16,0.075,color);p.mesh.renderOrder=21;
  pulse.life=0.075;pulse.light.position.copy(position);pulse.light.color.setHex(color);pulse.light.intensity=7;
  this.puff(position,0.25,0.5);
 }
 puff(position,size,life){
  const p=this.puffs[this.pi++%this.puffs.length];p.life=p.duration=life;p.age=0;p.radius=size;p.mesh.visible=true;
  p.mesh.position.copy(position);p.mesh.quaternion.copy(this.camera.quaternion);p.mesh.scale.setScalar(size);p.mesh.material.opacity=0.6;
 }
 sparks(position,normal,color=P.tracerGold){
  const burst=this.impacts[this.ii++%this.impacts.length];this.star(burst,position,0.65,0.12,color);
  burst.mesh.position.addScaledVector(normal,0.025);this.puff(burst.mesh.position,0.35,0.35);
  for(let i=0;i<5;i++){
   const p=this.sparkPool[this.si++%this.sparkPool.length];p.life=p.duration=0.12+this.rand()*0.12;p.mesh.visible=true;p.mesh.material.opacity=1;p.mesh.material.color.setHex(color);
   p.mesh.position.copy(position);p.mesh.scale.setScalar(0.025);
   p.velocity.set((this.rand()-0.5)*3,this.rand()*3,(this.rand()-0.5)*3).addScaledVector(normal,2);
  }
 }
 updateEffects(dt){
  for(const t of this.tracers)if(t.life>0){t.life-=dt;t.mesh.visible=t.life>0;t.mesh.material.opacity=Math.max(0,t.life/0.15);t.mesh.children[0].material.opacity=t.mesh.material.opacity*0.4;}
  for(const p of this.lights){p.life=Math.max(0,p.life-dt);p.light.intensity=7*p.life/0.075;}
  for(const p of this.particles)if(p.life>0){
   p.life-=dt;p.mesh.visible=p.life>0;
   const fade=Math.max(0,p.life/p.duration);
   if(p.kind!==2)p.mesh.material.opacity=fade*(p.kind===6?0.6:1);
   if(p.kind>=4){p.mesh.quaternion.copy(this.camera.quaternion);for(const c of p.mesh.children)c.material.opacity=fade*(c.isSprite?0.45:1);}
   if(p.kind===6){p.age+=dt;p.mesh.scale.setScalar(p.radius+p.age*1.5);p.mesh.position.y+=dt*0.9;}
   if(p.kind===1){p.velocity.y-=9*dt;p.mesh.position.addScaledVector(p.velocity,dt);}
   if(p.kind===2){p.mesh.scale.setScalar((1-p.life/0.35)*p.radius+0.2);p.mesh.material.opacity=Math.max(0,p.life/0.35)*0.6;}
  }
  for(const s of this.smokes)if(s.life>0){
   s.life-=dt;s.age+=dt;s.mesh.visible=s.life>0;s.radius=Math.min(3.5,0.3+s.age*4);
   s.mesh.scale.setScalar(s.radius);s.mesh.rotation.y+=dt*0.07;
  }
 }
 throwGrenade(a,type,dir){
  const l=this.ensure(a);if(!a.alive||!l.utilities[type])return false;
  let p=null;for(const g of this.grenades)if(g.life<=0){p=g;break;}
  if(!p)return false;
  l.utilities[type]--;p.type=type;p.owner=a;p.life=UTILITIES[type].fuse;
  p.mesh.material=this.grenadeMats[type];p.mesh.visible=true;
  this.eye(a,this._eye);
  p.mesh.position.copy(this._eye).addScaledVector(dir,0.35);
  if(traceSegment(this._eye,p.mesh.position,this._hit)!==Infinity)p.mesh.position.copy(this._point).addScaledVector(this._normal,0.12);
  p.velocity.copy(dir).normalize().multiplyScalar(12);p.velocity.y+=3.5;
  if(a.velocity)p.velocity.addScaledVector(a.velocity,0.35);
  l.selected=l.active;this.sound('throw',a,this._eye,8,type);return true;
 }
 updateGrenades(dt){
  for(const p of this.grenades)if(p.life>0){
   p.life-=dt;p.previous.copy(p.mesh.position);p.velocity.y-=12*dt;
   p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.rotation.x+=dt*5;
   if(traceSegment(p.previous,p.mesh.position,this._hit)!==Infinity){
    p.mesh.position.copy(this._point).addScaledVector(this._normal,0.12);
    if(p.type==='shard'){this.pop(p);continue;}
    p.velocity.addScaledVector(this._normal,-1.45*p.velocity.dot(this._normal)).multiplyScalar(0.7);
   }
   if(p.life<=0)this.pop(p);
  }
 }
 pop(p){
  const o=this._from,e=this._eye,d=this._dir;
  p.life=0;p.mesh.visible=false;o.copy(p.mesh.position);
  this.sound(p.type==='veil'?'smoke':'explosion',p.owner,o,50,p.type);
  if(p.type==='veil'){
   let s=this.smokes[0];for(const cloud of this.smokes)if(cloud.life<s.life)s=cloud;
   s.life=8;s.age=0;s.radius=0.3;s.mesh.position.copy(o);s.mesh.position.y+=0.9;
   s.mesh.scale.setScalar(s.radius);s.mesh.visible=true;return;
  }
  const blast=this.blasts[this.bi++%this.blasts.length];
  blast.life=0.35;blast.radius=p.type==='shard'?5:2;blast.mesh.visible=true;
  blast.mesh.position.copy(o);blast.mesh.material.color.setHex(p.type==='shard'?P.orange:P.white);
  const actors=this.getActors();
  for(const a of actors){
   if(a.alive===false)continue;
   this.eye(a,e);
   const distance=e.distanceTo(o);
   if(p.type==='shard'){
    if(a===this.player)a.shake(Math.max(0,1-distance/14)*0.8);
    if(distance<7&&worldSight(o,e))this.damage(a,100*(1-distance/7),p.owner,'torso','shard');
   }else if(distance<22&&this.lineOfSight(o,e)){
    if(a===this.player)this.camera.getWorldDirection(d);
    else d.set(-Math.sin(a.yaw||0),0,-Math.cos(a.yaw||0));
    this._up.copy(o).sub(e).normalize();
    const facing=distance<3?1:0.25+0.75*Math.max(0,d.dot(this._up));
    a.flash=Math.max(a.flash||0,3.5*(1-distance/22)*facing);
   }
  }
 }
 blocksSight(a,b){
  const x=b.x-a.x,y=b.y-a.y,z=b.z-a.z,length=x*x+y*y+z*z;
  for(const s of this.smokes)if(s.life>0){
   const c=s.mesh.position,t=length?THREE.MathUtils.clamp(((c.x-a.x)*x+(c.y-a.y)*y+(c.z-a.z)*z)/length,0,1):0;
   const dx=a.x+x*t-c.x,dy=a.y+y*t-c.y,dz=a.z+z*t-c.z;
   if(dx*dx+dy*dy+dz*dz<s.radius*s.radius)return true;
  }
  return false;
 }
 lineOfSight(a,b){return worldSight(a,b)&&!this.blocksSight(a,b);}
 resetEffects(){
  for(const pool of this._pools)for(const p of pool){p.life=0;p.mesh.visible=false;}
  for(const p of this.lights){p.life=0;p.light.intensity=0;}
 }
}
