import {cloud,ensureSession,validMessage} from './cloud.js';
export class PhoneConnection{
  constructor(credentials,receive,status,options={}){this.client=options.client||cloud;this.login=options.ensureSession||ensureSession;this.credentials=credentials;this.receive=receive;this.status=status;this.stopped=false;this.channels=[];this.ready=new Set();this.lastPeer=0;this.peer=false;this.generation=0;this.lastSeq=-1;void this.connect();}
  setPeer(value){if(this.peer!==value){this.peer=value;this.receive({type:this.credentials.role==='host'?'peer':'host',connected:value});}}
  async clear(){clearInterval(this.pulse);const channels=this.channels.splice(0);this.ready.clear();await Promise.allSettled(channels.map(c=>this.client.removeChannel(c)));}
  async connect(){
    const generation=++this.generation;
    try{
      await this.clear();await this.login();if(this.stopped||generation!==this.generation)return;
      const {room,role,key}=this.credentials;
      const {data,error}=await this.client.rpc('np_join_room',{room_id:room,player_role:role,room_key:key});if(error)throw error;
      if(!data){this.stopped=true;this.status(false,1008);this.receive({type:'fatal',message:'Комната закрыта. Отсканируй новый QR-код.'});return;}
      if(this.stopped||generation!==this.generation)return;
      const other=role==='host'?'phone':'host';
      for(const who of [role,other]){
        const channel=this.client.channel(`np:${room}:${who}`,{config:{private:true,broadcast:{self:false,ack:false}}});this.channels.push(channel);if(who===role)this.own=channel;
        if(who===other)channel.on('broadcast',{event:'message'},({payload:m})=>{
          if(this.stopped||generation!==this.generation||!validMessage(role,m))return;
          this.lastPeer=performance.now();this.setPeer(true);if(m.type==='heartbeat')return;
          if(m.type==='pose'){if(m.seq<=this.lastSeq)return;this.lastSeq=m.seq;}
          if(m.type==='closed'){this.receive({type:'fatal',message:'Экран отключил телефон. Отсканируй новый QR-код.'});this.status(false,1000);this.close();return;}
          this.receive(m);
        });
        channel.subscribe(value=>{
          if(this.stopped||generation!==this.generation)return;
          if(value==='SUBSCRIBED')this.ready.add(who);else this.ready.delete(who);
          if(this.ready.size===2){this.status(true);this.receive({type:'joined'});void this.send({type:'heartbeat'});}
          else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(value)){this.status(false);this.setPeer(false);this.retryConnect();}
        });
      }
      this.pulse=setInterval(()=>{void this.send({type:'heartbeat'});if(performance.now()-this.lastPeer>4500)this.setPeer(false);},1200);
    }catch{if(!this.stopped){this.status(false);this.setPeer(false);this.retryConnect();}}
  }
  retryConnect(){if(this.stopped||this.retry)return;this.retry=setTimeout(()=>{this.retry=null;void this.connect();},2000);}
  async send(message){if(!this.stopped&&this.ready.size===2&&this.own)return this.own.send({type:'broadcast',event:'message',payload:{...message,app:'penalty-v1'}}).catch(()=>{});}
  close(){this.stopped=true;this.generation++;clearTimeout(this.retry);this.retry=null;void this.clear();this.setPeer(false);this.status(false);}
}
