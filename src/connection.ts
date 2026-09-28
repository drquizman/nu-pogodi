import { cloudEnabled } from './backend';
import { CloudConnection } from './cloud-connection';
class LocalConnection {
  private ws?: WebSocket; private stopped=false; private timer?:number;
  constructor(private credentials:{room:string;role:'host'|'phone';key:string}, private receive:(msg:any)=>void, private status:(online:boolean)=>void) { this.connect(); }
  private connect(){
    const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);this.ws=ws;
    ws.onopen=()=>ws.send(JSON.stringify({type:'join',...this.credentials}));
    ws.onmessage=e=>{let msg;try{msg=JSON.parse(e.data);}catch{return;}if(msg.type==='joined')this.status(true);this.receive(msg);};
    ws.onclose=e=>{this.status(false);if(e.code===4001||e.code===1008){this.receive({type:'fatal',message:e.code===4001?'Управление открыто в другом окне.':'Комната закрыта. Сканируйте новый QR-код на компьютере.'});this.stopped=true;}if(!this.stopped)this.timer=window.setTimeout(()=>this.connect(),1500);};
    ws.onerror=()=>ws.close();
  }
  send(msg:unknown){if(this.ws?.readyState===1&&this.ws.bufferedAmount<8192)this.ws.send(JSON.stringify(msg));}
  close(){this.stopped=true;clearTimeout(this.timer);this.ws?.close();}
}

export class Connection {
 private inner:LocalConnection|CloudConnection;
 constructor(credentials:{room:string;role:'host'|'phone';key:string},receive:(msg:any)=>void,status:(online:boolean)=>void){this.inner=cloudEnabled?new CloudConnection(credentials,receive,status):new LocalConnection(credentials,receive,status);}
 send(msg:unknown){this.inner.send(msg);}
 close(){this.inner.close();}
}