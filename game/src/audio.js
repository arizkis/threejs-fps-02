export class AudioSynth{
 resume(){this.ctx??=new(window.AudioContext||window.webkitAudioContext)();return this.ctx.resume();}
 play(kind,id='flick',volume=1,pan=0){
  const c=this.ctx;if(!c||c.state!=='running'||kind==='footstep')return;
  const o=c.createOscillator(),g=c.createGain(),p=c.createStereoPanner(),t=c.currentTime;
  const shot=kind==='shot',f=shot?({flick:210,osprey:95,dart:155,kestrel:110,longbow:65}[id]||120):({hit:1200,plant:680,reload:260,win:540,lose:160,explosion:55}[kind]||400);
  o.type=shot?'sawtooth':'triangle';o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(Math.max(25,f/3),t+0.12);
  g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(0.0002,volume*0.09),t+0.003);g.gain.exponentialRampToValueAtTime(0.0001,t+0.16);
  p.pan.value=Math.max(-1,Math.min(1,pan));o.connect(g);g.connect(p);p.connect(c.destination);o.start(t);o.stop(t+0.17);o.onended=()=>{o.disconnect();g.disconnect();p.disconnect();};
 }
}
