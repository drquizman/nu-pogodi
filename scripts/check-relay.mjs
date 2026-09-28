import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
const origin=process.argv[2]||'http://127.0.0.1:17891';
const response=await fetch(`${origin}/api/rooms`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:'{}'});
assert.equal(response.status,200);const room=await response.json();const sockets=[];
const wait=(ws,predicate)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.off('message',on);reject(Error('Message timeout'));},8000);function on(raw){const msg=JSON.parse(raw);if(predicate(msg)){clearTimeout(timer);ws.off('message',on);resolve(msg);}}ws.on('message',on);});
async function join(role,key){const ws=new WebSocket(`${origin.replace(/^http/,'ws')}/ws`,{origin});sockets.push(ws);const joined=wait(ws,m=>m.type==='joined');ws.on('open',()=>ws.send(JSON.stringify({type:'join',room:room.id,role,key})));await joined;return ws;}
try{
 const host=await join('host',room.hostKey);const peer=wait(host,m=>m.type==='peer'&&m.connected);const phone=await join('phone',room.joinKey);await peer;
 let result=wait(host,m=>m.type==='pose');phone.send(JSON.stringify({type:'pose',lane:3,tracked:true,calibrated:false,seq:42}));const pose=await result;assert.equal(pose.lane,3);assert.equal(pose.seq,42);
 result=wait(phone,m=>m.type==='state');host.send(JSON.stringify({type:'state',phase:'playing',score:7,misses:1,input:'motion',lane:3,poseSeq:42}));const state=await result;assert.equal(state.score,7);assert.equal(state.poseSeq,42);assert.equal(state.input,'motion');
 phone.send('null');phone.send('[]');phone.send('{invalid');result=wait(phone,m=>m.type==='pong');phone.send(JSON.stringify({type:'ping',at:123}));assert.equal((await result).at,123);
 const disconnected=wait(host,m=>m.type==='peer'&&!m.connected);phone.close();await disconnected;
 const resumed=await join('phone',room.joinKey);result=wait(host,m=>m.type==='action');resumed.send(JSON.stringify({type:'action',action:'start'}));assert.equal((await result).action,'start');
 const bad=new WebSocket(`${origin.replace(/^http/,'ws')}/ws`,{origin});sockets.push(bad);const rejected=new Promise(resolve=>bad.on('close',code=>resolve(code)));bad.on('open',()=>bad.send(JSON.stringify({type:'join',room:room.id,role:'host',key:room.joinKey})));assert.equal(await rejected,1008);
 console.log('PASS: pairing, pose relay, game state, malformed messages, reconnect, role isolation.');
}finally{for(const ws of sockets)ws.close();}
