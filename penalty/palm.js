const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export function isOpenPalm(points){
  if(points?.length!==21||points.some(p=>!['x','y','z'].every(k=>Number.isFinite(p[k]))))return false;
  const scale=distance(points[0],points[9]);if(scale<.025)return false;
  // All four fingers must be straight and extend away from the wrist.
  for(const [base,joint,tip]of [[5,6,8],[9,10,12],[13,14,16],[17,18,20]]){
    const a=points[base],b=points[joint],c=points[tip];
    const dot=(a.x-b.x)*(c.x-b.x)+(a.y-b.y)*(c.y-b.y)+(a.z-b.z)*(c.z-b.z);
    if(dot/(distance(a,b)*distance(c,b))>-.75||distance(c,points[0])<distance(b,points[0])+scale*.18)return false;
  }
  return distance(points[4],points[17])>scale*.7;
}
export class PalmHold{
  constructor(){this.reset();}
  reset(){this.since=null;this.last=0;this.fired=false;}
  update(open,enabled,now){
    if(!enabled||!open){this.reset();return {progress:0,start:false};}
    if(this.fired)return {progress:1,start:false};
    if(this.since===null||now-this.last>600)this.since=now;
    this.last=now;const progress=Math.min(1,(now-this.since)/2000),start=progress===1;
    if(start)this.fired=true;
    return {progress,start};
  }
}
