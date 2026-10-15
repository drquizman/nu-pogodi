export class TrackingGrace {
 private lostAt:number|null=null;
 reset(){this.lostAt=null;}
 shouldPause(good:boolean,now:number){
  if(good){this.reset();return false;}
  this.lostAt??=now;
  return now-this.lostAt>=2500;
 }
}
