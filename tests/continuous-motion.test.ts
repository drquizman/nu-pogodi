import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,type Lane} from '../src/core/game';
import {BasketTracker,OcclusionTracker,bodyPosition,type Point} from '../src/core/pose';
function pose():Point[]{const p=Array.from({length:33},()=>({x:.5,y:.45,visibility:1}));p[11]={x:.35,y:.2,visibility:1};p[12]={x:.65,y:.2,visibility:1};p[23]={x:.4,y:.7,visibility:1};p[24]={x:.6,y:.7,visibility:1};p[15].x=.45;p[16].x=.55;return p;}
test('calibrated camera frame keeps whole-body hand movement instead of cancelling it',()=>{
 for(const lane of [0,1,2,3] as Lane[]){
  const p=pose(),o=new OcclusionTracker(),b=new BasketTracker(),neutral=bodyPosition(p)!;
  b.calibrate(Array.from({length:20},()=>neutral));o.anchorAt(p);
  const dx=lane>=2?-.12:.12,dy=lane%2?.08:-.08;
  const moved=p.map(v=>({...v,x:v.x+dx,y:v.y+dy}));
  assert.ok(Math.abs(bodyPosition(moved)!.x-neutral.x)<1e-6,'old torso-relative coordinates cancel movement');
  for(let i=0;i<3;i++)b.update(o.update(moved,i*70)!);
  assert.equal(b.lane,lane);
  o.update([],300);
  assert.equal(b.update(o.update(moved,400)!),lane,'temporary loss must preserve calibration frame');
 }
});
test('speed rises smoothly with playing time and is independent of score',()=>{
 const g=new Game(()=>0);g.state.phase='playing';g.step(.1);const first=g.state.level;
 g.state.score=100;g.step(.1);assert.ok(g.state.level>first&&g.state.level-first<.001);
 g.state.time=59.9;g.step(.1);assert.ok(Math.abs(g.state.level-1.5)<1e-9);
 g.state.time=119.9;g.step(.1);assert.ok(Math.abs(g.state.level-2)<1e-9);
 const frozen=JSON.stringify({...g.state,phase:'paused'});g.pause();g.step(.1);assert.equal(JSON.stringify(g.state),frozen);
 g.start();assert.equal(g.state.time,0);assert.equal(g.state.level,1);
});
test('later game moves eggs faster and spawns more often',()=>{
 const count=(time:number)=>{const g=new Game(()=>0);g.state.phase='playing';g.state.time=time;for(let i=0;i<100;i++)g.step(.1);return g.state.eggs.length+g.state.score;};
 assert.ok(count(120)>count(0));
 const distance=(time:number)=>{const g=new Game(()=>0);g.state.phase='playing';g.state.time=time;g.state.eggs=[{id:999,lane:0,progress:0}];g.step(.1);return g.state.eggs[0].progress;};
 assert.ok(distance(120)>distance(0)*1.99);
});
