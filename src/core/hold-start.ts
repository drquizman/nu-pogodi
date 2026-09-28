import type { Body } from './pose';
/** A deliberate, stable basket pose; lost/late frames never count toward a hold. */
export class HoldStart {
  private anchor:Body|null=null;
  private since=0;
  private last=0;
  private fired=false;
  private previousPhase='';
  private releaseRequired=false;
  update(body:Body|null, center:Body, phase:string, enabled:boolean, now:number) {
    if(phase!==this.previousPhase){this.anchor=null;this.fired=false;this.releaseRequired=phase==='over';this.previousPhase=phase;}
    const eligible=enabled&&(phase==='ready'||phase==='over');
    const centered=body!==null&&Math.abs(body.x-center.x)<.35&&Math.abs(body.y-center.y)<.4;
    if(!eligible||!centered){this.anchor=null;if(eligible&&!centered)this.releaseRequired=false;this.last=now;return {progress:0,start:false,release:this.releaseRequired};}
    if(this.releaseRequired||this.fired)return {progress:0,start:false,release:this.releaseRequired};
    if(!this.anchor||now-this.last>500||Math.abs(body!.x-this.anchor.x)>.16||Math.abs(body!.y-this.anchor.y)>.16){this.anchor={...body!};this.since=now;}
    this.last=now;
    const progress=Math.min(1,(now-this.since)/3000);
    if(progress===1)this.fired=true;
    return {progress,start:progress===1,release:false};
  }
}
