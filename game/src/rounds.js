import * as THREE from 'three';
import { sites, siteAt, spawns } from './world.js';
import { WEAPONS, UTILITIES, createLoadout } from './weapons.js';

export const SHOP={...WEAPONS,...UTILITIES,vest:{name:'Vest',price:650},vesthelm:{name:'Vest + Helm',price:1000}};
export class Rounds{
 constructor(player,bots,weapons,{onEvent=null,onRadio=null}={}){
  Object.assign(this,{player,bots,weapons,onEvent,onRadio});
  this.state={phase:'BUY',round:0,timer:12,time:0,scores:{solstice:0,umbra:0},winner:null,reason:'',matchWinner:null,notice:'',actors:bots.actors,player,
   charge:{planted:false,timer:40,site:null,carrier:null,position:new THREE.Vector3(),channelActor:null,kind:'',progress:0,duration:3}};
  this.newMatch();
 }
 get snapshot(){return this.state;}
 emit(kind,data){this.onEvent?.(kind,data);}
 radio(a,text){this.onRadio?.(a.name,text,a.team);}
 award(a,amount){a.cash+=amount;a.cashDelta=amount;a.cashUntil=this.state.time+1.3;}
 newMatch(){
  const s=this.state;s.scores.solstice=s.scores.umbra=0;s.round=0;s.matchWinner=null;
  for(const a of s.actors){a.cash=800;a.kills=a.deaths=0;a.loadout=createLoadout();a.armour=0;a.helmet=false;a.alive=true;}
  this.startRound();
 }
 startRound(){
  const s=this.state,c=s.charge;s.phase='BUY';s.round++;s.timer=12;s.winner=null;s.reason=s.notice='';
  c.planted=false;c.timer=40;c.site=null;c.channelActor=null;c.kind='';c.progress=0;
  // Survivors keep guns, utility and remaining armour; deaths reset to a free
  // pistol. Everyone refills ammunition and health. Cash persists until match reset.
  for(const a of s.actors){
   if(!a.alive){a.loadout=createLoadout();a.armour=0;a.helmet=false;}
   a._deathRecorded=false;a.cashDelta=0;a.flash=0;this.weapons.refill(a);
  }
  const site=s.round%2?'A':'B';this.bots.reset(site);this.player.respawn(spawns.solstice[2],-Math.PI/2,this.player.armour,this.player.helmet);
  this.weapons.resetEffects();c.carrier=this.bots.carrier;c.position.copy(c.carrier.position);
  const preferences=['kestrel','dart','kestrel','longbow','longbow','kestrel','dart','kestrel','osprey'];
  for(let i=0;i<this.bots.bots.length;i++){
   const a=this.bots.bots[i];if(!a.loadout.primary)this.buy(a,preferences[i]);
   if(i%2===0&&a.armour<50)this.buy(a,'vest');
  }
  this.emit('round',s);
 }
 canBuy(a,id){
  const d=SHOP[id],l=a.loadout;
  return this.state.phase==='BUY'&&a.alive&&d&&a.cash>=d.price&&
   (id==='vest'?a.armour<100:id==='vesthelm'?a.armour<100||!a.helmet:UTILITIES[id]?l.utilities[id]<2:!l.guns[id]&&!(d.slot===2&&l.primary));
 }
 buy(a,id){
  if(!this.canBuy(a,id)){if(a===this.player)this.state.notice='Unavailable: check cash, equipment and buy phase.';return false;}
  const d=SHOP[id];
  if(id==='vest'||id==='vesthelm'){a.armour=100;if(id==='vesthelm')a.helmet=true;}
  else this.weapons.give(a,id);
  this.award(a,-d.price);this.state.notice='';this.emit('buy',{actor:a,id});return true;
 }
 recordKill(killer,victim,weapon='flick',head=false){
  if(this.state.phase!=='LIVE'||victim._deathRecorded)return;
  victim._deathRecorded=true;victim.deaths++;
  if(killer&&killer.team!==victim.team){killer.kills++;this.award(killer,300);}
  const c=this.state.charge;
  if(c.carrier===victim){victim.carrier=false;c.carrier=null;c.position.copy(victim.position);this.cancelChannel();}
  this.emit('kill',{killer,victim,weapon,head});
 }
 cancelChannel(){const c=this.state.charge;c.channelActor=null;c.kind='';c.progress=0;}
 channel(a,kind,site,dt){
  const c=this.state.charge;
  if(c.channelActor!==a||c.kind!==kind){c.channelActor=a;c.kind=kind;c.progress=0;c.duration=kind==='PLANT'?3:5;}
  c.progress+=dt;
  if(c.progress>=c.duration){if(kind==='PLANT')this.plant(a,site);else this.defuse(a);}
 }
 plant(a,site){
  const c=this.state.charge;c.planted=true;c.timer=40;c.site=site;c.position.copy(a.position);c.carrier=null;a.carrier=false;
  this.cancelChannel();this.award(a,300);this.bots.setCharge(true,site,c.position);
  this.radio(a,`Charge planted at ${sites[site].name}`);this.emit('plant',{actor:a,site});this.bots.bus.emit(c.position,45,'plant',a);
 }
 defuse(a){this.award(a,300);this.cancelChannel();this.emit('defuse',a);this.finish('umbra','Defused');}
 finish(winner,reason){
  const s=this.state;if(s.phase!=='LIVE')return;
  this.cancelChannel();for(const b of this.bots.bots)b.stopChannel();
  s.phase='END';s.timer=4;s.winner=winner;s.reason=reason;s.scores[winner]++;
  s.matchWinner=s.scores[winner]>=7?winner:null;
  for(const a of s.actors)this.award(a,a.team===winner?3250+(reason==='Charge detonated'?800:0):1900);
  this.emit('end',s);
 }
 update(dt){
  const s=this.state,c=s.charge;s.time+=dt;s.timer=Math.max(0,s.timer-dt);
  if(s.phase==='BUY'){
   if(s.timer===0){s.phase='LIVE';s.timer=100;this.emit('live',s);}return;
  }
  if(s.phase==='END'){if(s.timer===0){if(s.matchWinner)this.newMatch();else this.startRound();}return;}
  let sol=0,umb=0;
  for(const a of s.actors){if(a.alive){if(a.team==='solstice')sol++;else umb++;}}
  if(!umb){this.finish('solstice','Umbra eliminated');return;}
  if(!sol&&!c.planted){this.finish('umbra','Solstice eliminated');return;}
  if(c.carrier&&!c.carrier.alive){c.position.copy(c.carrier.position);c.carrier.carrier=false;c.carrier=null;}
  if(!c.planted&&!c.carrier){
   for(const a of s.actors)if(a.alive&&a.team==='solstice'&&a.position.distanceToSquared(c.position)<3.24){
    c.carrier=a;a.carrier=true;if(a.go)a.go(sites[this.bots.site].center);this.emit('pickup',a);break;
   }
  }
  let actor=null,kind='',site=null;
  if(!c.planted&&c.carrier?.alive){
   const a=c.carrier,zone=siteAt(a.position),intent=a===this.player?a.input.locked&&a.input.down('KeyE'):a.channel==='PLANT';
   c.position.copy(a.position);
   if(zone&&intent&&a.speed<0.35&&a.grounded!==false){actor=a;kind='PLANT';site=zone.id;}
  }else if(c.planted){
   c.timer=Math.max(0,c.timer-dt);
   const a=this.bots.defuser;
   if(a?.alive&&a.channel==='DEFUSE'&&a.speed<0.35&&a.position.distanceToSquared(c.position)<4.84){actor=a;kind='DEFUSE';site=c.site;}
  }
  if(actor)this.channel(actor,kind,site,dt);else this.cancelChannel();
  if(s.phase!=='LIVE')return;
  if(c.planted&&c.timer===0)this.finish('solstice','Charge detonated');
  else if(!c.planted&&s.timer===0)this.finish('umbra','Time expired');
 }
}
