import type { RealtimeChannel } from '@supabase/supabase-js';
import {cloud,ensureSession} from './backend';
export class CloudConnection {
 private own?:RealtimeChannel;private other?:RealtimeChannel;private online=false;private stopped=false;
 private pulse?:number;private retry?:number;private lastPeer=0;private peer=false;private ready=new Set<string>();
 constructor(private credentials:{room:string;role:'host'|'phone';key:string},private receive:(msg:any)=>void,private status:(online:boolean)=>void){void this.connect();}
 private setPeer(value:boolean){if(value!==this.peer){this.peer=value;this.receive({type:this.credentials.role==='host'?'peer':'host',connected:value});}}
 private async connect(){
  try{
   await ensureSession();if(this.stopped)return;
   const {room,role,key}=this.credentials;
   const {data,error}=await cloud!.rpc('np_join_room',{room_id:room,player_role:role,room_key:key});
   if(error)throw error;if(!data){this.stopped=true;this.receive({type:'fatal',message:'Комната закрыта. Обнови экран игры и сканируй новый QR.'});return;}
   const otherRole=role==='host'?'phone':'host';
   const subscribe=(who:string)=>{
    const channel=cloud!.channel(`np:${room}:${who}`,{config:{private:true,broadcast:{self:false,ack:false}}});
    if(who===otherRole)channel.on('broadcast',{event:'message'},({payload})=>{
     if(this.stopped||!payload||typeof payload!=='object')return;
     this.lastPeer=performance.now();this.setPeer(true);
     if(payload.type==='heartbeat')return;
     if(role==='host'&&payload.type==='pose'&&Number.isInteger(payload.lane)&&payload.lane>=0&&payload.lane<=3&&typeof payload.tracked==='boolean')this.receive(payload);
     else if(role==='host'&&payload.type==='action'&&['start','pause','resume'].includes(payload.action))this.receive(payload);
     else if(role==='phone'&&payload.type==='state')this.receive(payload);
    });
    channel.subscribe(value=>{
     if(this.stopped)return;
     if(value==='SUBSCRIBED')this.ready.add(who);else this.ready.delete(who);
     const next=this.ready.size===2;if(next!==this.online){this.online=next;this.status(next);if(next){this.receive({type:'joined'});this.send({type:'heartbeat'});}else this.setPeer(false);}
    });return channel;
   };
   this.own=subscribe(role);this.other=subscribe(otherRole);
   this.pulse=window.setInterval(()=>{this.send({type:'heartbeat'});if(performance.now()-this.lastPeer>5000)this.setPeer(false);},1500);
  }catch(error){if(this.stopped)return;this.status(false);this.retry=window.setTimeout(()=>void this.connect(),3000);}
 }
 send(msg:unknown){if(this.online&&!this.stopped&&this.own)void this.own.send({type:'broadcast',event:'message',payload:msg}).catch(()=>{});}
 close(){this.stopped=true;clearInterval(this.pulse);clearTimeout(this.retry);if(this.own)void cloud!.removeChannel(this.own);if(this.other)void cloud!.removeChannel(this.other);this.status(false);}
}
