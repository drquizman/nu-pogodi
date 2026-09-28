import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game';
import { BasketTracker, bodyPosition } from '../src/core/pose';
test('all four lanes can catch; pause freezes eggs and score',()=>{
 for(const lane of [0,1,2,3] as const){const g=new Game(()=>lane/4+.01);g.start();g.move(lane);for(let i=0;i<110;i++)g.step(.1);assert.ok(g.state.score>=1);assert.equal(g.state.misses,0);g.pause();const before=JSON.stringify(g.state);for(let i=0;i<100;i++)g.step(.1);assert.equal(JSON.stringify(g.state),before);g.resume();assert.equal(g.state.phase,'countdown');}
});
test('three misses end the game, restart clears old eggs and score',()=>{const g=new Game(()=>.6);g.start();for(let i=0;i<300;i++)g.step(.1);assert.equal(g.state.phase,'over');assert.equal(g.state.misses,3);g.start();assert.equal(g.state.misses,0);assert.equal(g.state.eggs.length,0);});
test('tracking rejects missing wrists/hips and mirrors horizontal motion',()=>{
 const points=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));points[11]={x:.35,y:.2,visibility:1};points[12]={x:.65,y:.2,visibility:1};points[23].y=.8;points[24].y=.8;points[15].x=.2;points[16].x=.3;
 assert.ok(bodyPosition(points)!.x>0);points[15].visibility=.2;assert.equal(bodyPosition(points),null);points[15].visibility=1;points[24].y=1.1;assert.equal(bodyPosition(points),null);
});
test('calibration needs stable samples and hysteresis prevents neutral jitter',()=>{const t=new BasketTracker();assert.equal(t.calibrate([{x:0,y:.5,confidence:1}]),false);assert.equal(t.calibrate(Array.from({length:30},()=>({x:0,y:.5,confidence:1}))),true);for(let i=0;i<20;i++)t.update({x:.5,y:.9,confidence:1});assert.equal(t.lane,3);for(let i=0;i<50;i++)t.update({x:i%2?.03:-.03,y:.5,confidence:1});assert.equal(t.lane,3);});
