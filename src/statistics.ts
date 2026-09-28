import {cloud, cloudEnabled, ensureSession} from './backend';
type Totals = {games:number; caught:number; broken:number};
type Report = {id:string; room:string; key:string; caught:number; broken:number; at:number};
const storageKey='np-pending-stats';
export class Statistics {
 private room?:{id:string;hostKey:string};
 private run=crypto.randomUUID();
 private caught=0;
 private broken=0;
 private pending:Report[]=[];
 private busy=false;
 private local:Totals={games:0,caught:0,broken:0};
 constructor(private render:(totals:Totals)=>void) {
  try {
   this.pending=JSON.parse(localStorage.getItem(storageKey)||'[]').filter((r:Report)=>Date.now()-r.at<86400000);
   this.local=JSON.parse(localStorage.getItem('np-local-stats')||'null')||this.local;
  } catch {this.pending=[];}
  if(!cloudEnabled)render(this.local);
  else {void this.refresh(); setInterval(()=>{void this.flush();void this.refresh();},15000);}
  window.addEventListener('online',()=>void this.flush());
 }
 setRoom(room:{id:string;hostKey:string}) {this.room=room;this.enqueue();void this.flush();}
 start() {this.run=crypto.randomUUID();this.caught=0;this.broken=0;}
 observe(caught:number,broken:number) {
  if(caught===this.caught&&broken===this.broken)return;
  if(!cloudEnabled){
   this.local.games+=this.caught===0&&caught>0?1:0;
   this.local.caught+=caught-this.caught;this.local.broken+=broken-this.broken;
   try{localStorage.setItem('np-local-stats',JSON.stringify(this.local));}catch{}
   this.render(this.local);
  }
  this.caught=caught;this.broken=broken;this.enqueue();void this.flush();
 }
 private save(){try{localStorage.setItem(storageKey,JSON.stringify(this.pending));}catch{}}
 private enqueue(){
  if(!cloudEnabled||!this.room||!(this.caught||this.broken))return;
  const report={id:this.run,room:this.room.id,key:this.room.hostKey,caught:this.caught,broken:this.broken,at:Date.now()};
  const index=this.pending.findIndex(r=>r.id===this.run);
  if(index<0)this.pending.push(report);else this.pending[index]=report;
  this.save();
 }
 private async refresh(){
  if(!cloud)return;
  try{const {data,error}=await cloud.rpc('np_get_stats');if(!error&&data)this.render(data);}catch{}
 }
 private async flush(){
  if(!cloud||this.busy||!this.pending.length)return;
  this.busy=true;
  try{
   await ensureSession();
   while(this.pending.length){
    const r=this.pending[0];
    if(Date.now()-r.at>=86400000){this.pending.shift();this.save();continue;}
    const {data,error}=await cloud.rpc('np_report_stats',{run_id:r.id,room_id:r.room,host_key:r.key,caught:r.caught,broken:r.broken});
    if(error)break;
    if(this.pending[0]===r)this.pending.shift();
    this.save();if(data)this.render(data);
   }
  }catch{}finally{this.busy=false;}
 }
}
