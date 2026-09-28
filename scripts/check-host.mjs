// Integration regression: an actual host browser must be open on this room.
// Pass the controller link from a fresh test room, not a room with a real player.
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
const url=new URL(process.argv[2]);const p=new URLSearchParams(url.hash.slice(1));
const ws=new WebSocket(`${url.origin.replace(/^http/,'ws')}/ws`,{origin:url.origin});
let lane=0,tracked=true,seq=0,timer;
const wait=predicate=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{ws.off('message',on);reject(Error('Host did not apply motion / ack within 10s'));},10000);function on(data){const m=JSON.parse(data);if(predicate(m)){clearTimeout(timeout);ws.off('message',on);resolve(m);}}ws.on('message',on);});
const send=()=>ws.send(JSON.stringify({type:'pose',seq:++seq,lane,tracked,calibrated:false}));
try{
 const joined=wait(m=>m.type==='joined');ws.on('open',()=>ws.send(JSON.stringify({type:'join',role:'phone',room:p.get('room'),key:p.get('key')})));await joined;
 timer=setInterval(send,100);
 for(lane=0;lane<4;lane++){const state=await wait(m=>m.type==='state'&&m.input==='motion'&&m.lane===lane&&m.poseSeq>0);assert.equal(state.phase,'ready');}
 lane=3;send();const started=wait(m=>m.type==='state'&&m.input==='motion'&&['countdown','playing'].includes(m.phase));ws.send(JSON.stringify({type:'action',action:'start'}));await started;
 tracked=false;await wait(m=>m.type==='state'&&m.phase==='paused');tracked=true;await wait(m=>m.type==='state'&&m.phase==='countdown');
 console.log('PASS: actual browser switched from keyboard to phone, applied all 4 uncalibrated lanes before start, started remotely, paused on lost pose and resumed.');
}finally{clearInterval(timer);ws.close();}
