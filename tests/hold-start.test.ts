import test from 'node:test';
import assert from 'node:assert/strict';
import {HoldStart} from '../src/core/hold-start';
const center={x:0,y:.55,confidence:1};
test('hands-free starts once after three seconds, never from a single frame',()=>{const h=new HoldStart();for(let t=0;t<3000;t+=100)assert.equal(h.update(center,center,'ready',true,t).start,false);assert.equal(h.update(center,center,'ready',true,3000).start,true);assert.equal(h.update(center,center,'ready',true,3100).start,false);});
test('tracking loss, stale frames, calibration or connection block the hold',()=>{for(const kind of ['loss','disabled','gap']){const h=new HoldStart();for(let t=0;t<2500;t+=100)h.update(center,center,'ready',true,t);if(kind==='loss')h.update(null,center,'ready',true,2500);if(kind==='disabled')h.update(center,center,'ready',false,2500);assert.equal(h.update(center,center,'ready',true,3100).start,false);}});
test('game over requires lowering hands before another intentional hold',()=>{const h=new HoldStart();h.update(center,center,'playing',true,0);assert.equal(h.update(center,center,'over',true,100).release,true);assert.equal(h.update(center,center,'over',true,5000).start,false);h.update({...center,y:1.2},center,'over',true,5100);for(let t=5200;t<8200;t+=100)assert.equal(h.update(center,center,'over',true,t).start,false);assert.equal(h.update(center,center,'over',true,8200).start,true);});
