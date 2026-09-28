import type { GameState, Lane } from './core/game';
import { wolfPose, basketEnds as ends } from './core/wolf-poses';
export class Renderer {
 private wolfSprite=new Image(); private backdrop=new Image(); private props=new Image();
 private c:CanvasRenderingContext2D; private lastEvent=0; private effectAt=0; private effect=''; private effectLane:Lane=0;
 private previousEggs=new Map<number,Lane>();
 constructor(canvas:HTMLCanvasElement){
  this.c=canvas.getContext('2d')!;canvas.width=1440;canvas.height=840;
  this.wolfSprite.src=import.meta.env.BASE_URL+'art/wolf-paired.png';this.backdrop.src=import.meta.env.BASE_URL+'art/farm-background.png';this.props.src=import.meta.env.BASE_URL+'art/farm-props.png';
 }
 private loaded(image:HTMLImageElement){return image.complete&&image.naturalWidth>0;}
 private line(p:number[][],color='#3e3028',width=2){const c=this.c;c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();}
 private poly(p:number[][],color:string,outline=false){const c=this.c;c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=color;c.fill();if(outline){c.strokeStyle='#3e3028';c.lineWidth=2;c.stroke();}}
 private oval(x:number,y:number,rx:number,ry:number,color:string){const c=this.c;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=color;c.fill();}
 private text(t:string,x:number,y:number,size:number,color='#3e3028'){const c=this.c;c.fillStyle=color;c.font=`800 ${size}px Manrope,Arial,sans-serif`;c.textAlign='center';c.fillText(t,x,y);}
 private egg(x:number,y:number,r=0){if(!this.loaded(this.props))return;const c=this.c;c.save();c.translate(x,y);c.rotate(r);c.drawImage(this.props,923,303,245,337,-10,-14,20,28);c.restore();}
 private hen(x:number,y:number,mirror:boolean,t:number,index:number){
  if(!this.loaded(this.props))return;const c=this.c;c.save();c.translate(x,y+Math.sin(t*2+index)*1.3);c.scale(mirror?-1:1,1);
  c.drawImage(this.props,0,0,820,768,-58,-96,116,109);c.restore();
 }
 private ramp(y:number){
  // Exact gameplay geometry, with ink contours and grain matching the painted coops.
  this.poly([[119,y],[329,y+56],[330,y+67],[120,y+11]],'#a66b35',true);
  this.poly([[119,y],[127,y-7],[336,y+49],[329,y+56]],'#dfad62',true);
  this.line([[126,y-2],[210,y+19],[329,y+51]],'#f4d393',1.5);
  for(let i=0;i<6;i++){const x=142+i*29,dy=(x-119)*56/210;
   this.line([[x,y+dy+3],[x+17,y+dy+7]],'#77502d',.9);
   this.line([[x+6,y+dy-4],[x+13,y+dy-2]],'#b67d3c',1);
  }
  for(const x of [138,313])this.oval(x,y+(x-119)*56/210+5,1.4,1.4,'#463b30');
 }
 private wolf(lane:Lane){
  const c=this.c,image=this.wolfSprite;if(!this.loaded(image))return;
  const p=wolfPose(lane);
  this.oval(480,p.top+995*p.scale,78,8,'#66502b25');
  // Two complete illustrations. Same origin, scale and foot baseline for both heights.
  c.save();c.translate(480,p.top);c.scale(p.facing*p.scale,p.scale);
  c.drawImage(image,p.sourceX,0,p.width,1024,p.sourceX-p.cellOrigin-350,0,p.width,1024);
  c.restore();
 }
 private star(x:number,y:number,r:number){const points:number[][]=[];for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,k=i%2?r*.42:r;points.push([x+Math.cos(a)*k,y+Math.sin(a)*k]);}this.poly(points,'#fbd56c',true);}
 draw(s:GameState){
  const c=this.c,t=s.time;c.save();c.scale(1.5,1.5);c.fillStyle='#efe4c8';c.fillRect(0,0,960,560);
  if(this.loaded(this.backdrop))c.drawImage(this.backdrop,0,0,960,560);
  for(let side=0;side<2;side++){c.save();if(side){c.translate(960,0);c.scale(-1,1);}this.ramp(195);this.ramp(315);this.hen(78,196,false,t,side);this.hen(78,316,false,t,side+2);c.restore();}
  this.wolf(s.basket);
  for(const e of s.eggs){const side=e.lane>=2,x=148+e.progress*191,y=(e.lane%2?303:183)+e.progress*54;this.egg(side?960-x:x,y,e.progress*9*(side?-1:1));}
  if(s.eventId!==this.lastEvent){
   const live=new Set(s.eggs.map(e=>e.id));const lost=[...this.previousEggs].find(([id])=>!live.has(id));
   this.lastEvent=s.eventId;this.effectAt=t;this.effect=s.event;this.effectLane=lost?.[1]??s.basket;
  }
  this.previousEggs=new Map(s.eggs.map(e=>[e.id,e.lane]));
  const age=t-this.effectAt;
  if(s.eventId&&age<.8){const[x,y]=ends[this.effectLane];c.globalAlpha=Math.min(1,(.8-age)*3);
   if(this.effect==='catch'){this.text('+1',x,y-32-age*40,25,'#3d663d');for(let i=0;i<4;i++){const a=i*Math.PI/2;this.star(x+Math.cos(a)*(18+age*40),y-15+Math.sin(a)*(18+age*35),6);}}
   else if(this.loaded(this.props)){c.drawImage(this.props,1390,365,630,355,x-37,472,74,42);this.text('Ой!',x,463-age*20,22,'#a74537');}
   c.globalAlpha=1;
  }
  this.poly([[411,16],[549,18],[551,94],[409,92]],'#fff4dceF',true);
  this.text(String(s.score),480,61,38);this.text('ПОЙМАНО',480,82,10,'#795b3c');
  for(let i=0;i<3;i++){const x=449+i*31;if(i<s.misses){this.line([[x-6,104],[x+6,120]],'#a74537',2.5);this.line([[x+6,104],[x-6,120]],'#a74537',2.5);}else this.egg(x,112);}
  this.text(`ТЕМП ${s.level}`,871,531,14,'#443b27');c.restore();
 }
}
