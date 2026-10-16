import test from 'node:test';
import assert from 'node:assert/strict';
import {PalmStart} from '../src/core/palm-start';
import {NeutralCalibration} from '../src/core/neutral-calibration';
import {TrackingGrace} from '../src/core/tracking-grace';
import {BasketTracker,type Body} from '../src/core/pose';
const body:Body={x:.1,y:.7,confidence:1,quality:'both'};
test('open palm needs three continuous seconds; fires once; no start in gameplay',()=>{
 const h=new PalmStart();
 for(let t=0;t<3000;t+=100)assert.equal(h.update(true,'ready',true,t).start,false);
 assert.equal(h.update(true,'ready',true,3000).start,true);
 assert.equal(h.update(true,'ready',true,3100).start,false);
 assert.equal(h.update(true,'playing',true,3200).start,false);
 assert.equal(h.update(true,'over',true,3300).release,true);
 h.update(false,'over',true,3400);
 for(let t=3500;t<6500;t+=100)assert.equal(h.update(true,'over',true,t).start,false);
 assert.equal(h.update(true,'over',true,6500).start,true);
});
test('missing palm, stale frames and disconnected host reset the three seconds',()=>{
 for(const failure of ['missing','stale','offline']){
  const h=new PalmStart();for(let t=0;t<2500;t+=100)h.update(true,'ready',true,t);
  if(failure==='missing')h.update(false,'ready',true,2500);
  if(failure==='offline')h.update(true,'ready',false,2500);
  assert.equal(h.update(true,'ready',true,3200).start,false);
 }
});
test('calibration accepts stable hands but keeps height threshold at torso midpoint',()=>{
 const c=new NeutralCalibration(),tracker=new BasketTracker();
 for(let t=0;t<2000;t+=100)assert.equal(c.update(body,t).samples,null);
 const samples=c.update(body,2000).samples!;assert.ok(samples);assert.equal(tracker.calibrate(samples),true);
 assert.equal(tracker.center.y,.5);
 assert.equal(tracker.update({...body,x:-.5,y:.2}),0);
});
test('occlusion and large movement cannot calibrate a false neutral',()=>{
 const c=new NeutralCalibration();for(let t=0;t<1500;t+=100)c.update(body,t);
 c.update({...body,quality:'single'},1500);assert.equal(c.update(body,2100).samples,null);
 assert.equal(c.update({...body,y:-.5},5000).samples,null);
});
test('brief tracking dropouts do not pause, sustained loss does; recovery resets timer',()=>{
 const g=new TrackingGrace();assert.equal(g.shouldPause(false,0),false);
 assert.equal(g.shouldPause(false,2499),false);assert.equal(g.shouldPause(true,2500),false);
 assert.equal(g.shouldPause(false,2600),false);assert.equal(g.shouldPause(false,5100),true);
 g.reset();assert.equal(g.shouldPause(false,10000),false);
});
