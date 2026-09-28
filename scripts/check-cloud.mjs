import {createClient} from '@supabase/supabase-js';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const env=Object.fromEntries((await readFile('.env.cloud','utf8')).trim().split(/\r?\n/).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).replace(/^\uFEFF/,''),l.slice(i+1)];}));
const clients=[];const channels=[];
const client=async()=>{const c=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(c);const {error}=await c.auth.signInAnonymously();if(error)throw error;return c;};
const join=async(c,room,role,key)=>{const r=await c.rpc('np_join_room',{room_id:room,player_role:role,room_key:key});if(r.error)throw r.error;return r.data;};
const channel=(c,topic)=>{const ch=c.channel(topic,{config:{private:true,broadcast:{ack:true}}});channels.push(ch);return ch;};
const subscribe=ch=>new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('subscribe timeout')),15000);ch.subscribe((s,e)=>{if(s==='SUBSCRIBED'){clearTimeout(t);resolve();}else if(s==='CHANNEL_ERROR'||s==='TIMED_OUT'){clearTimeout(t);reject(e||Error(s));}});});
try{
 const h=await client(),p=await client(),stranger=await client();
 const created=await h.rpc('np_create_room');if(created.error)throw created.error;const r=created.data;
 assert.equal(await join(h,r.id,'host',r.hostKey),true);assert.equal(await join(p,r.id,'phone',r.joinKey),true);
 assert.equal(await join(stranger,r.id,'host',r.joinKey),false);assert.equal(await join(stranger,r.id,'phone','wrong'),false);
 const listener=channel(h,`np:${r.id}:phone`),sender=channel(p,`np:${r.id}:phone`);
 const message=new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('pose timeout')),10000);listener.on('broadcast',{event:'message'},({payload})=>{clearTimeout(t);resolve(payload);});});
 await Promise.all([subscribe(listener),subscribe(sender)]);
 assert.equal(await sender.send({type:'broadcast',event:'message',payload:{type:'pose',lane:3,tracked:true,seq:42}}),'ok');
 assert.equal((await message).seq,42);
 const denied=channel(stranger,`np:${r.id}:phone`);let blocked=false;try{await subscribe(denied);}catch{blocked=true;}assert.equal(blocked,true);
 const readOnly=channel(p,`np:${r.id}:host`);await subscribe(readOnly);
 const outcome=await readOnly.send({type:'broadcast',event:'message',payload:{type:'state',score:999}});assert.notEqual(outcome,'ok');
 console.log('PASS cloud: anonymous pairing, private pose delivery, wrong key/role rejection, outsider read rejection, phone cannot send host state.');
}finally{for(const c of clients)await c.removeAllChannels();}
