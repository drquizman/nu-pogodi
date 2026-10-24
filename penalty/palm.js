const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export function isOpenPalm(points){
  if(points?.length!==21||points.some(p=>!['x','y','z'].every(k=>Number.isFinite(p[k]))))return false;
  const scale=distance(points[0],points[9]);if(scale<.012)return false;
  // A start gesture needs four extended fingers, not a relaxed goalkeeper hand.
  let extended=0;
  for(const [base,joint,tip]of [[5,6,8],[9,10,12],[13,14,16],[17,18,20]]){
    const a=points[base],b=points[joint],c=points[tip];
    const dot=(a.x-b.x)*(c.x-b.x)+(a.y-b.y)*(c.y-b.y)+(a.z-b.z)*(c.z-b.z);
    const length=distance(a,b)*distance(c,b);
    if(length>0&&dot/length<-.55&&distance(c,points[0])>distance(b,points[0])+scale*.1)extended++;
  }
  return extended===4;
}
export function isPresentedPalm(points,world,body){
  if(!isOpenPalm(world)||points?.length!==21)return false;
  const visible=p=>p&&['x','y'].every(k=>Number.isFinite(p[k]))&&(p.visibility??1)>=.4;
  if(!body||![11,12,23,24].every(i=>visible(body[i])))return false;
  const shoulderY=(body[11].y+body[12].y)/2,torso=(body[23].y+body[24].y)/2-shoulderY,width=Math.abs(body[11].x-body[12].x);
  if(torso<.06||width<.05)return false;
  const wrist=points[0],side=[15,16].filter(i=>visible(body[i])).sort((a,b)=>Math.hypot(body[a].x-wrist.x,body[a].y-wrist.y)-Math.hypot(body[b].x-wrist.x,body[b].y-wrist.y))[0];
  if(side===undefined||!visible(body[side-2]))return false;
  const elbow=body[side-2];
  if(wrist.y>shoulderY+torso*.12||elbow.y-wrist.y<torso*.15||Math.abs(wrist.x-(body[11].x+body[12].x)/2)>width*1.4)return false;
  const height=Math.hypot(points[9].x-wrist.x,points[9].y-wrist.y);
  if(height<.01||[8,12,16,20].some(i=>points[i].y>wrist.y-height*.5))return false;
  // Palm plane must face the lens; an edge-on hand cannot activate the timer.
  const a=['x','y','z'].map(k=>world[5][k]-world[0][k]),b=['x','y','z'].map(k=>world[17][k]-world[0][k]);
  const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  return Math.abs(n[2])/Math.hypot(...n)>.65;
}
export class PalmHold{
  constructor(){this.reset();}
  clearTiming(){this.elapsed=0;this.last=null;this.lastOpen=null;this.wasOpen=false;}
  reset(){this.clearTiming();this.locked=false;this.releaseSince=null;}
  update(open,enabled,now){
    if(!enabled){this.clearTiming();this.releaseSince=null;return {progress:0,start:false};}
    if(this.locked){
      if(open)this.releaseSince=null;
      else{this.releaseSince??=now;if(now-this.releaseSince>=350){this.locked=false;this.releaseSince=null;this.clearTiming();}}
      return {progress:0,start:false};
    }
    if(!open){
      if(this.lastOpen===null||now-this.lastOpen>300)this.reset();
      this.wasOpen=false;this.last=now;return {progress:Math.min(1,this.elapsed/2000),start:false};
    }
    if(this.lastOpen===null||now-this.lastOpen>600)this.reset();
    if(this.wasOpen&&this.last!==null)this.elapsed+=now-this.last;
    this.last=now;this.lastOpen=now;this.wasOpen=true;
    const progress=Math.min(1,this.elapsed/2000),start=progress===1;
    if(start)this.locked=true;
    return {progress,start};
  }
}
