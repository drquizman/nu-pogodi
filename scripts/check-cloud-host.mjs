import {createClient} from '@supabase/supabase-js';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const env=Object.fromEntries((await readFile('.env.cloud','utf8')).trim().split(/\r?\n/).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).replace(/^\uFEFF/,''),l.slice(i+1)];}));
const params=new URLSearchParams(new URL(process.argv[2]).hash.slice(1));
const c=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let timer,state,lane=0,tracked=true,seq=0;
const wait=async predicate=>{for(let i=0;i<120;i++){if(state&&predicate(state))return state;await new Promise(r=>setTimeout(r,100));}throw Error('No matching browser state');};
try{
 const {error}=await c.auth.signInAnonymously();if(error)throw error;
 const j=await c.rpc('np_join_room',{room_id:params.get('room'),player_role:'phone',room_key:params.get('key')});assert.equal(j.data,true);
 const options={config:{private:true,broadcast:{ack:false}}};
 const own=c.channel(`np:${params.get('room')}:phone`,options),other=c.channel(`np:${params.get('room')}:host`,options);
 other.on('broadcast',{event:'message'},({payload})=>{if(payload.type==='state')state=payload;});
 const sub=ch=>new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('subscribe timeout')),15000);ch.subscribe((v,e)=>{if(v==='SUBSCRIBED'){clearTimeout(t);resolve();}else if(v==='CHANNEL_ERROR'){clearTimeout(t);reject(e);}});});
 await Promise.all([sub(own),sub(other)]);
 const send=payload=>own.send({type:'broadcast',event:'message',payload});
 timer=setInterval(()=>void send({type:'pose',seq:++seq,lane,tracked,calibrated:false}),100);
 for(lane=0;lane<4;lane++){const s=await wait(s=>s.input==='motion'&&s.lane===lane&&s.poseSeq>0);assert.equal(s.phase,'ready');}
 lane=3;await send({type:'action',action:'start'});await wait(s=>s.phase==='countdown'||s.phase==='playing');
 tracked=false;await wait(s=>s.phase==='paused');tracked=true;await wait(s=>s.phase==='countdown');
 console.log('PASS cloud host: 4 lanes, ack, remote start, pause on tracking loss, recovery.');
}finally{clearInterval(timer);await c.removeAllChannels();}
