import type { Lane } from './game';
export interface Point { x: number; y: number; visibility?: number }
export interface Body { x: number; y: number; confidence: number; quality?:'both'|'single'|'held' }
function visible(p:Point|undefined) {
  return !!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??0)>=.55&&p.x>=.02&&p.x<=.98&&p.y>=.02&&p.y<=.98;
}
function torsoFrame(points:Point[]) {
  if([11,12,23,24].some(i=>!visible(points[i])))return null;
  const x=(points[11].x+points[12].x)/2,y=(points[11].y+points[12].y)/2;
  const scale=(points[23].y+points[24].y)/2-y;
  if(scale<.12||Math.abs(points[11].x-points[12].x)<.09)return null;
  return {x,y,scale};
}
export function bodyPosition(points: Point[]): Body | null {
  const frame=torsoFrame(points);if(!frame||!visible(points[15])||!visible(points[16]))return null;
  return {x:-((points[15].x+points[16].x)/2-frame.x)/frame.scale,y:((points[15].y+points[16].y)/2-frame.y)/frame.scale,confidence:Math.min(...[11,12,15,16,23,24].map(i=>points[i].visibility??0)),quality:'both'};
}
/** Short occlusions are bridged only after observing both wrists on a visible torso. */
export class OcclusionTracker {
  private lastBoth=-Infinity;
  private lastReliable=-Infinity;
  private lastBody:Body|null=null;
  private offsets=new Map<number,{x:number;y:number}>();
  reset(){this.lastBoth=-Infinity;this.lastReliable=-Infinity;this.lastBody=null;this.offsets.clear();}
  update(points:Point[],now:number):Body|null {
    const frame=torsoFrame(points);
    // Never keep playing using a remembered person who has left the frame.
    if(!frame){this.reset();return null;}
    const normalize=(p:Point)=>({x:-(p.x-frame.x)/frame.scale,y:(p.y-frame.y)/frame.scale});
    const full=bodyPosition(points);
    if(full){this.lastBoth=now;this.lastReliable=now;this.lastBody=full;for(const i of [15,16]){const p=normalize(points[i]);this.offsets.set(i,{x:full.x-p.x,y:full.y-p.y});}return full;}
    const wrist=[15,16].find(i=>visible(points[i]));
    if(wrist!==undefined&&now-this.lastBoth<=2000){
      const offset=this.offsets.get(wrist);
      if(offset){const p=normalize(points[wrist]);const body:Body={x:p.x+offset.x,y:p.y+offset.y,confidence:points[wrist].visibility??0,quality:'single'};this.lastReliable=now;this.lastBody=body;return body;}
    }
    // Both hands momentarily disappear: keep the last position, never extrapolate.
    if(wrist===undefined&&this.lastBody&&now-this.lastReliable<=350)return {...this.lastBody,quality:'held'};
    return null;
  }
}
export class BasketTracker {
  private smooth: Body | null = null;
  lane: Lane = 0;
  center: Body = { x: 0, y: .55, confidence: 1 };
  update(body: Body): Lane {
    this.smooth = this.smooth ? { x: this.smooth.x*.6+body.x*.4, y: this.smooth.y*.6+body.y*.4, confidence: body.confidence } : { ...body };
    const x = this.smooth.x-this.center.x, y = this.smooth.y-this.center.y;
    let right = this.lane >= 2, bottom = this.lane % 2 === 1;
    if (x > .14) right = true; else if (x < -.14) right = false;
    if (y > .1) bottom = true; else if (y < -.1) bottom = false;
    this.lane = ((right ? 2 : 0) + (bottom ? 1 : 0)) as Lane;
    return this.lane;
  }
  calibrate(samples: Body[]) {
    if (samples.length < 20) return false;
    const average = (key: 'x'|'y') => samples.reduce((sum,p)=>sum+p[key],0)/samples.length;
    const x = average('x'), y = average('y');
    if (samples.some(p => Math.abs(p.x-x) > .3 || Math.abs(p.y-y) > .25)) return false;
    this.center = { x,y,confidence:1 }; this.smooth = null; return true;
  }
}
