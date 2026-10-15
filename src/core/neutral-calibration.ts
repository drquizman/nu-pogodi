import type {Body} from './pose';
export class NeutralCalibration {
 private samples:Body[]=[];
 private since=0;
 private last=0;
 reset(){this.samples=[];this.since=0;this.last=0;}
 update(body:Body|null,now:number){
  if(!body||body.quality!=='both'||Math.abs(body.x)>.45||body.y<.25||body.y>1.15){this.reset();return {progress:0,samples:null};}
  const anchor=this.samples[0];
  if(!anchor||now-this.last>600||Math.abs(body.x-anchor.x)>.15||Math.abs(body.y-anchor.y)>.15){this.samples=[];this.since=now;}
  this.last=now;this.samples.push({...body});
  const progress=Math.min(1,(now-this.since)/2000);
  return {progress,samples:progress===1&&this.samples.length>=12?this.samples:null};
 }
}
