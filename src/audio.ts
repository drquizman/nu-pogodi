import type { GameState } from './core/game';
/** Original farm melody and game effects, synthesized locally. */
export class Sound {
 private ctx?:AudioContext; private music?:GainNode; private fx?:GainNode;
 private nextBeat=0; private beat=0; private rolling=new Map<number,number>(); private event=0; private countdown=0; private phase='ready';
 enabled=true;
 get ready(){return this.ctx?.state==='running';}
 unlock(){if(!this.ctx){this.ctx=new AudioContext();this.music=this.ctx.createGain();this.fx=this.ctx.createGain();this.music.gain.value=0;this.fx.gain.value=.22;this.music.connect(this.ctx.destination);this.fx.connect(this.ctx.destination);}void this.ctx.resume().catch(()=>{});}
 private note(midi:number,time:number,duration:number,volume:number,bus:GainNode,type:OscillatorType='sine'){
  const c=this.ctx!,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=440*2**((midi-69)/12);g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(volume,time+.007);g.gain.exponentialRampToValueAtTime(.0001,time+duration);o.connect(g);g.connect(bus);o.start(time);o.stop(time+duration+.02);o.onended=()=>{o.disconnect();g.disconnect();};
 }
 play(kind:'catch'|'miss'|'tick'|'roll'|'lay'){
  if(!this.ready||!this.enabled)return;const c=this.ctx!,t=c.currentTime,bus=this.fx!;
  if(kind==='catch'){[76,83,88].forEach((n,i)=>this.note(n,t+i*.045,.18,.5,bus));}
  else if(kind==='miss'){[65,60,48].forEach((n,i)=>this.note(n,t+i*.075,.16,.5,bus,'triangle'));const buffer=c.createBuffer(1,c.sampleRate*.09,c.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length)**2;const source=c.createBufferSource(),g=c.createGain();source.buffer=buffer;g.gain.value=.23;source.connect(g);g.connect(bus);source.start(t);source.onended=()=>{source.disconnect();g.disconnect();};}
  else if(kind==='roll'){this.note(79,t,.035,.23,bus,'triangle');this.note(62,t+.014,.04,.13,bus);}
  else if(kind==='lay'){this.note(74,t,.09,.3,bus,'triangle');this.note(69,t+.06,.11,.25,bus,'triangle');}
  else this.note(81,t,.13,.4,bus);
 }
 update(s:GameState){
  if(s.phase!==this.phase){if(s.phase==='countdown'){this.countdown=0;if(this.phase==='ready'||this.phase==='over'){this.rolling.clear();this.event=0;}}this.phase=s.phase;}
  if(s.phase==='countdown'&&Math.ceil(s.countdown)!==this.countdown){this.countdown=Math.ceil(s.countdown);this.play('tick');}
  if(s.eventId!==this.event){this.event=s.eventId;if(s.event)this.play(s.event);}
  if(s.phase==='playing')for(const egg of s.eggs){const step=Math.floor(egg.progress*7),previous=this.rolling.get(egg.id);if(previous===undefined)this.play('lay');else if(step!==previous)this.play('roll');this.rolling.set(egg.id,step);}
  const ids=new Set(s.eggs.map(e=>e.id));for(const id of this.rolling.keys())if(!ids.has(id))this.rolling.delete(id);
  if(!this.ready)return;const c=this.ctx!,playing=s.phase==='playing'&&this.enabled;this.music!.gain.setTargetAtTime(playing?.13:0,c.currentTime,.08);this.fx!.gain.setTargetAtTime(this.enabled?.22:0,c.currentTime,.03);
  if(!playing){this.nextBeat=0;return;}if(this.nextBeat<c.currentTime-.1)this.nextBeat=c.currentTime+.03;
  const melody=[72,76,79,76,74,77,81,77,76,79,84,79,77,76,74,71,72,76,79,84,83,79,77,74,76,79,77,74,72,67,72,-1];
  while(this.nextBeat<c.currentTime+.12){const i=this.beat%32,n=melody[i],bass=[48,53,55,48][Math.floor(i/8)];if(n>=0){this.note(n,this.nextBeat,.22,.55,this.music!,'triangle');this.note(n+12,this.nextBeat,.1,.08,this.music!);}if(i%2===0)this.note(bass,this.nextBeat,.27,.65,this.music!);if(i%4===2){this.note(bass+16,this.nextBeat,.12,.2,this.music!);this.note(bass+19,this.nextBeat,.12,.2,this.music!);}this.beat++;this.nextBeat+=.235;}
 }
}
