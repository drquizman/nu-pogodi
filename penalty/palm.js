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
  const other=side===15?16:15;
  if(!visible(body[other])||body[other].y<shoulderY+torso*.7)return false;
  const elbow=body[side-2];
  if(wrist.y>shoulderY+torso*.05||wrist.y<shoulderY-torso*.9||elbow.y-wrist.y<torso*.2||Math.abs(wrist.x-(body[11].x+body[12].x)/2)>width*.95)return false;
  const height=Math.hypot(points[9].x-wrist.x,points[9].y-wrist.y);
  if(height<.01||[8,12,16,20].some(i=>points[i].y>wrist.y-height*.5))return false;
  // Palm plane must face the lens; an edge-on hand cannot activate the timer.
  const a=['x','y','z'].map(k=>world[5][k]-world[0][k]),b=['x','y','z'].map(k=>world[17][k]-world[0][k]);
  const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  return Math.abs(n[2])/Math.hypot(...n)>.65;
}
export const START_PROTOCOL='intentional-palm-7';
export function handsLowered(body){
  if(!body||![11,12,15,16,23,24].every(i=>body[i]&&Number.isFinite(body[i].y)&&(body[i].visibility??1)>=.4))return false;
  const shoulder=(body[11].y+body[12].y)/2,torso=(body[23].y+body[24].y)/2-shoulder;
  return torso>.06&&[15,16].every(i=>body[i].y>shoulder+torso*.7);
}
export function palmAnchor(points,body){
  if(!points?.[0]||!body?.[24])return null;
  const cx=(body[11].x+body[12].x)/2,sy=(body[11].y+body[12].y)/2,width=Math.abs(body[11].x-body[12].x),torso=(body[23].y+body[24].y)/2-sy;
  if(width<.05||torso<.06)return null;
  const side=Math.hypot(body[15].x-points[0].x,body[15].y-points[0].y)<Math.hypot(body[16].x-points[0].x,body[16].y-points[0].y)?15:16;
  return {x:(points[0].x-cx)/width,y:(points[0].y-sy)/torso,side};
}
export class IntentionalStart{
  constructor(){this.reset();}
  reset(){this.armed=false;this.neutralAt=null;this.since=null;this.last=null;this.anchor=null;this.fired=false;}
  update(sample,enabled,now){
    if(!enabled){this.reset();return {progress:0,start:false,phase:'lower'};}
    if(this.last!==null&&(now-this.last>450||now<this.last)){this.since=null;this.neutralAt=null;this.anchor=null;}
    this.last=now;
    if(!this.armed){
      if(sample.neutral&&!sample.gesture){this.neutralAt??=now;if(now-this.neutralAt>=500){this.armed=true;this.fired=false;}}
      else this.neutralAt=null;
      return {progress:0,start:false,phase:this.armed?'show':'lower'};
    }
    const p=sample.anchor;
    if(!sample.gesture||!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||![15,16].includes(p.side)){
      this.since=null;this.anchor=null;
      return {progress:0,start:false,phase:'show'};
    }
    if(this.since===null||!this.anchor||this.anchor.side!==p.side||Math.hypot(p.x-this.anchor.x,p.y-this.anchor.y)>.18){this.since=now;this.anchor={...p};}
    const progress=Math.min(1,(now-this.since)/2000),start=progress===1&&!this.fired;
    if(start){this.fired=true;this.armed=false;this.neutralAt=null;}
    return {progress,start,phase:'hold'};
  }
}

