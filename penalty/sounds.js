// Local, procedural stadium effects. No downloads or audio permissions needed.
export const whistleLead=(random=Math.random)=>random()<.5?1:2;
export const runupElapsed=(elapsed,lead)=>Math.max(0,elapsed-(lead-.78));

export class StadiumAudio{
  constructor(context=null){
    this.context=context;this.enabled=true;this.active=new Set();this.epoch=0;
    if(context)this.setup();
  }
  setup(){
    const c=this.context;
    this.master=c.createGain();this.master.gain.value=this.enabled?0.6:0;
    const limiter=c.createDynamicsCompressor();limiter.threshold.value=-13;limiter.knee.value=18;limiter.ratio.value=6;limiter.attack.value=.003;limiter.release.value=.18;
    this.master.connect(limiter);limiter.connect(c.destination);
    this.noise=c.createBuffer(1,c.sampleRate*4,c.sampleRate);
    const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    const impulse=c.createBuffer(2,c.sampleRate*1.3,c.sampleRate);
    for(let ch=0;ch<2;ch++){const a=impulse.getChannelData(ch);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1)*Math.pow(1-i/a.length,3)*.24;}
    const reverb=c.createConvolver();reverb.buffer=impulse;
    this.wet=c.createGain();this.wet.gain.value=.24;this.wet.connect(reverb);reverb.connect(this.master);
  }
  unlock(){
    try{
      if(!this.context){const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)return;this.context=new Audio();this.setup();}
      if(this.context.state==='suspended'&&!this.context.startRendering)this.context.resume().catch(()=>{});
    }catch{/* The game remains playable when audio is unavailable. */}
  }
  setEnabled(enabled){
    this.enabled=enabled;
    if(this.master){const c=this.context;this.master.gain.cancelScheduledValues(c.currentTime);this.master.gain.setTargetAtTime(enabled?0.6:0,c.currentTime,.025);}
    if(enabled)this.unlock();
  }
  stop(){
    this.epoch++;
    for(const source of this.active){try{source.stop();}catch{}}
    this.active.clear();
  }
  track(source,end,nodes=[]){
    this.active.add(source);source.onended=()=>{this.active.delete(source);source.disconnect();for(const node of nodes)node.disconnect();};source.stop(end);
  }
  output(node,pan=0,wet=.16){
    const p=this.context.createStereoPanner(),nodes=[node,p];p.pan.value=pan;node.connect(p);p.connect(this.master);
    if(wet){const send=this.context.createGain();send.gain.value=wet;p.connect(send);send.connect(this.wet);nodes.push(send);}
    return nodes;
  }
  tone(at,duration,from,to,volume,type='sine',pan=0){
    const c=this.context,o=c.createOscillator(),g=c.createGain();o.type=type;
    o.frequency.setValueAtTime(from,at);o.frequency.exponentialRampToValueAtTime(to,at+duration);
    g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(volume,at+.006);g.gain.exponentialRampToValueAtTime(.0001,at+duration);
    o.connect(g);const route=this.output(g,pan);o.start(at);this.track(o,at+duration+.02,route);
  }
  burst(at,duration,volume,freq=1400,pan=0,q=.7){
    const c=this.context,s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();
    s.buffer=this.noise;f.type='bandpass';f.frequency.value=freq;f.Q.value=q;
    g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(volume,at+.003);g.gain.exponentialRampToValueAtTime(.0001,at+duration);
    s.connect(f);f.connect(g);const route=this.output(g,pan);s.start(at,Math.random()*Math.max(.01,4-duration));this.track(s,at+duration+.02,[f,...route]);
  }
  whistle(at){
    const c=this.context,envelope=c.createGain();envelope.gain.setValueAtTime(0,at);envelope.gain.linearRampToValueAtTime(.12,at+.025);
    envelope.gain.setValueAtTime(.12,at+.27);envelope.gain.exponentialRampToValueAtTime(.0001,at+.43);const route=this.output(envelope,0,.7);
    for(const f of [2850,3470]){
      const o=c.createOscillator();o.frequency.setValueAtTime(f*.94,at);o.frequency.linearRampToValueAtTime(f,at+.05);o.frequency.linearRampToValueAtTime(f*.98,at+.4);o.connect(envelope);
      const vibrato=c.createOscillator(),depth=c.createGain();vibrato.frequency.value=36;depth.gain.value=26;vibrato.connect(depth);depth.connect(o.frequency);
      vibrato.start(at);o.start(at);this.track(o,at+.45,route);this.track(vibrato,at+.45,[depth]);
    }
    this.burst(at,.12,.10,4800,0,.5);
  }
  kick(at){this.tone(at,.19,155,46,.78);this.burst(at,.065,.55,1800);this.burst(at+.01,.12,.14,380);}
  save(at){this.tone(at,.12,210,80,.46);this.burst(at,.095,.82,1250);this.burst(at+.025,.16,.18,3100);}
  net(at){
    this.tone(at,.17,115,40,.27);
    for(let i=0;i<7;i++)this.burst(at+i*.028,.07,.25*(1-i/9),2400+Math.random()*1700,(Math.random()-.5)*.7,1.2);
  }
  applause(at){
    for(let i=0;i<75;i++){
      const offset=Math.random()*2.8,fade=Math.sin(Math.PI*offset/3.4)**.65;
      this.burst(at+offset,.035+Math.random()*.065,(.10+Math.random()*.19)*fade,950+Math.random()*2400,(Math.random()*2-1)*.9,.7);
    }
    this.crowd(at+.10,2.8,.12);
  }
  crowd(at,duration=3.3,volume=.34){
    const c=this.context;
    for(const [frequency,q,gain]of [[480,.8,.7],[1050,.7,1],[1900,.6,.4]]){
      const s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise;
      f.type='bandpass';f.frequency.value=frequency;f.Q.value=q;
      g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(volume*gain,at+.28);
      g.gain.setValueAtTime(volume*gain*.8,at+duration*.55);g.gain.exponentialRampToValueAtTime(.0001,at+duration);
      const lfo=c.createOscillator(),depth=c.createGain();lfo.frequency.value=2+Math.random()*3;depth.gain.value=volume*gain*.16;lfo.connect(depth);depth.connect(g.gain);
      s.connect(f);f.connect(g);const route=this.output(g,(Math.random()-.5)*.8,.8);s.start(at,Math.random()*.4);lfo.start(at);this.track(s,at+duration,[f,...route]);this.track(lfo,at+duration*.8,[depth]);
    }
    // Several distant vowels give the noise bed a human crowd's rising "oh!".
    for(let i=0;i<9;i++){
      const o=c.createOscillator(),f=c.createBiquadFilter(),g=c.createGain();o.type='sawtooth';
      const pitch=95+Math.random()*90;o.frequency.setValueAtTime(pitch,at);o.frequency.linearRampToValueAtTime(pitch*1.18,at+.4);o.frequency.linearRampToValueAtTime(pitch*.95,at+duration);
      f.type='bandpass';f.frequency.value=540+Math.random()*150;f.Q.value=1.7;
      g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(volume*.07,at+.25+Math.random()*.2);g.gain.exponentialRampToValueAtTime(.0001,at+duration);
      o.connect(f);f.connect(g);const route=this.output(g,(i-4)/5,.8);o.start(at);this.track(o,at+duration,[f,...route]);
    }
  }
  play(name){
    if(!this.enabled||!this.context)return false;
    const c=this.context,epoch=this.epoch;
    const start=()=>{if(epoch!==this.epoch||!this.enabled)return;const at=c.currentTime+.005;if(name==='cheer')this.crowd(at);else this[name]?.(at);};
    if(c.state==='running'||c.startRendering)start();
    else c.resume().then(start).catch(()=>{});
    return true;
  }
}
