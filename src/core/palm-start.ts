/** Only fresh Open_Palm observations count; one start per ready/over phase. */
export class PalmStart {
 private since:number|null=null;
 private last=0;
 private phase='';
 private fired=false;
 private release=false;
 update(open:boolean,phase:string,enabled:boolean,now:number){
  if(phase!==this.phase){this.phase=phase;this.since=null;this.fired=false;this.release=phase==='over';}
  const eligible=enabled&&(phase==='ready'||phase==='over');
  if(!eligible||!open){this.since=null;if(eligible&&!open)this.release=false;this.last=now;return {progress:0,start:false,release:this.release};}
  if(this.release||this.fired)return {progress:0,start:false,release:this.release};
  if(this.since===null||now-this.last>600)this.since=now;
  this.last=now;
  const progress=Math.min(1,(now-this.since)/3000);
  const start=progress===1;if(start)this.fired=true;
  return {progress,start,release:false};
 }
}
