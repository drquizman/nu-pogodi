const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export function isOpenPalm(points){
  if(points?.length!==21||points.some(p=>!['x','y','z'].every(k=>Number.isFinite(p[k]))))return false;
  const scale=distance(points[0],points[9]);if(scale<.012)return false;
  // Allow a relaxed little finger and a tucked thumb, including a tilted palm.
  let extended=0;
  for(const [base,joint,tip]of [[5,6,8],[9,10,12],[13,14,16],[17,18,20]]){
    const a=points[base],b=points[joint],c=points[tip];
    const dot=(a.x-b.x)*(c.x-b.x)+(a.y-b.y)*(c.y-b.y)+(a.z-b.z)*(c.z-b.z);
    const length=distance(a,b)*distance(c,b);
    if(length>0&&dot/length<-.55&&distance(c,points[0])>distance(b,points[0])+scale*.1)extended++;
  }
  return extended>=3;
}
export class PalmHold{
  constructor(){this.reset();}
  reset(){this.elapsed=0;this.last=null;this.lastOpen=null;this.wasOpen=false;this.fired=false;}
  update(open,enabled,now){
    if(!enabled){this.reset();return {progress:0,start:false};}
    if(!open){
      if(this.lastOpen===null||now-this.lastOpen>300)this.reset();
      this.wasOpen=false;this.last=now;return {progress:Math.min(1,this.elapsed/2000),start:false};
    }
    if(this.lastOpen===null||now-this.lastOpen>600)this.reset();
    if(this.fired)return {progress:1,start:false};
    if(this.wasOpen&&this.last!==null)this.elapsed+=now-this.last;
    this.last=now;this.lastOpen=now;this.wasOpen=true;
    const progress=Math.min(1,this.elapsed/2000),start=progress===1;
    if(start)this.fired=true;
    return {progress,start};
  }
}
