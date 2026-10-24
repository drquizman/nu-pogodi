const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const visible=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??1)>=.5;
export function analyzePose(points){
  const ls=points[11],rs=points[12],lh=points[23],rh=points[24],lw=points[15],rw=points[16];
  const lost=guide=>({tracked:false,zone:null,guide});
  if(![ls,rs,lh,rh,lw,rw].every(visible))return lost('Покажи плечи, пояс и обе кисти');
  const width=Math.abs(ls.x-rs.x),hipY=(lh.y+rh.y)/2,shoulderY=(ls.y+rs.y)/2,torso=hipY-shoulderY;
  if(width<.06||torso<.08)return lost('Встань лицом к камере, чтобы был виден пояс');
  const cx=(ls.x+rs.x)/2,orientation=Math.sign(ls.x-rs.x)||1;
  const hand=p=>({x:clamp((p.x-cx)/width*orientation*.45,-1.1,1.1),y:clamp(.92+(hipY-p.y)/torso*.42,.3,2.25),z:.15});
  const xy=p=>({x:(p.x-cx)/width*orientation,h:(hipY-p.y)/torso});
  const a=xy(lw),b=xy(rw),extended=p=>Math.abs(p.x)>.85;
  const row=h=>h>1.35?0:h<.55?2:1;
  let zone=null,guide='Одна рука вбок — отбить. Обе в одну сторону — прыжок';
  if(extended(a)&&extended(b)&&Math.sign(a.x)!==Math.sign(b.x))guide='Для прыжка направь обе руки в одну сторону';
  else if(Math.sign(a.x)===Math.sign(b.x)&&Math.min(Math.abs(a.x),Math.abs(b.x))>.42&&Math.max(Math.abs(a.x),Math.abs(b.x))>.85&&Math.abs(a.h-b.h)<.8){
    zone=row((a.h+b.h)/2)*4+(a.x>0?0:3);guide='Прыжок двумя руками';
  }else{
    const chosen=extended(a)&&!extended(b)?a:extended(b)&&!extended(a)?b:null;
    if(chosen){zone=row(chosen.h)*4+(chosen.x>0?1:2);guide='Отбивание одной рукой';}
  }
  return {tracked:true,zone,leftHand:hand(lw),rightHand:hand(rw),guide};
}
export class MotionTracker{
  constructor(){this.candidate=null;this.since=0;this.zone=null;this.hands=null;}
  update(points,now){
    const result=analyzePose(points);
    if(!result.tracked){this.zone=null;this.candidate=null;this.hands=null;return result;}
    if(result.zone!==this.candidate){this.candidate=result.zone;this.since=now;}
    if(now-this.since>=100)this.zone=this.candidate;
    if(!this.hands)this.hands={leftHand:{...result.leftHand},rightHand:{...result.rightHand}};
    else for(const key of ['leftHand','rightHand'])for(const axis of ['x','y','z'])this.hands[key][axis]+=(result[key][axis]-this.hands[key][axis])*.45;
    return {...result,...structuredClone(this.hands),zone:this.zone};
  }
}
