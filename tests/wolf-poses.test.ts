import test from 'node:test';
import assert from 'node:assert/strict';
import {wolfPose,basketEnds} from '../src/core/wolf-poses';
test('whole wolf frames use identical scale, top and foot baseline',()=>{
 for(const [a,b] of [[0,1],[2,3]] as const){const upper=wolfPose(a),lower=wolfPose(b);
  assert.equal(upper.scale,lower.scale);assert.equal(upper.top,lower.top);
  assert.equal(upper.facing,lower.facing);
  assert.equal(upper.top+995*upper.scale,lower.top+995*lower.scale);
 }
});
test('drawn basket rims align with both shelf heights exactly',()=>{
 for(const lane of [0,1,2,3] as const){const p=wolfPose(lane);
  assert.ok(Math.abs(p.top+p.rimY*p.scale-basketEnds[lane][1])<1e-9);
 }
});
