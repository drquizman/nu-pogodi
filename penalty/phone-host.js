import {PhoneConnection} from './phone-connection.js';
import {createSeat,resumeSeat} from './cloud.js';
export function initPhoneHost(){
  const $=id=>document.getElementById(id),button=$('connect-phone'),dialog=$('phone-dialog'),panel=$('motion-setup');
  let seat,connection,phone=false,lastPose=0,lastState='',lastSent=0,busy=false,generation=0,mode='phone',tracked=false;
  function text(s){$('phone-status').textContent=s;$('pair-message').textContent=s;$('motion-status').textContent=s;}
  function layout(){
    document.body.dataset.controls=mode;
    panel.hidden=mode!=='phone'||dialog.open||window.penalty.getState().auto;
    $('motion-title').innerHTML=tracked?'Покажи открытую ладонь<br>в камеру на 2 секунды':'Встань в кадр<br>покажи пояс и обе кисти';
  }
  function lost(s){tracked=false;lastPose=0;$('palm-progress').style.width='0%';window.penalty.stopMotion();text(s);layout();}
  function showSeat(){
    $('phone-qr').src=seat.qr;$('phone-qr').hidden=false;$('phone-link').href=seat.phoneURL;$('phone-link').hidden=false;
  }
  function connect(current){
    connection?.close();connection=new PhoneConnection({room:seat.id,role:'host',key:seat.hostKey},m=>{
      if(current!==generation||mode!=='phone')return;
      if(m.type==='joined')lastState='';
      if(m.type==='fatal'){try{sessionStorage.removeItem('penalty-cloud-room');}catch{}seat=null;lost(m.message);}
      if(m.type==='peer'){
        phone=m.connected;
        if(!phone)lost('Телефон не подключён');
        else{if(dialog.open)dialog.close();text('Включи камеру на телефоне');layout();}
      }
      if(m.type==='pose'){
        lastPose=performance.now();tracked=m.tracked;window.penalty.setMotionPose(m);
        text(tracked?'Камера видит тебя':m.guide||'Покажи пояс и обе кисти');
        $('palm-progress').style.width=`${Math.round((m.startProgress||0)*100)}%`;
        if(dialog.open)dialog.close();layout();
      }
      if(m.type==='action'&&m.action==='start'&&tracked&&lastPose&&performance.now()-lastPose<700&&window.penalty.getState().input==='motion'){
        window.penalty.startAuto();layout();
      }
      if(m.type==='action'&&m.action==='pause'){window.penalty.pauseAuto();layout();}
    },online=>{if(current===generation&&!online)lost('Связь потеряна · переподключаемся');});
  }
  async function pair(){
    if(busy)return;busy=true;window.penalty.pauseAuto();const current=++generation;mode='phone';button.disabled=true;
    if(!dialog.open)dialog.showModal();layout();text('Готовим QR-код…');
    try{
      let saved;try{saved=JSON.parse(sessionStorage.getItem('penalty-cloud-room'));}catch{}
      let next;if(saved)try{next=await resumeSeat(saved);}catch{}
      if(!next)next=await createSeat();
      if(current!==generation)return;seat=next;
      try{sessionStorage.setItem('penalty-cloud-room',JSON.stringify({id:seat.id,hostKey:seat.hostKey,joinKey:seat.joinKey}));}catch{}
      showSeat();connect(current);text('');
    }catch{if(current===generation)text('Не удалось получить QR-код. Проверь интернет или выбери клавиатуру');}
    finally{busy=false;button.disabled=false;}
  }
  function keyboard(){
    generation++;mode='keyboard';phone=false;tracked=false;lastPose=0;
    const old=connection;connection=null;void old?.send({type:'closed'}).finally(()=>old.close());
    window.penalty.stopMotion();if(dialog.open)dialog.close();text('');layout();
  }
  button.onclick=()=>void pair();$('close-phone-dialog').onclick=keyboard;$('disconnect-phone').onclick=keyboard;
  dialog.addEventListener('cancel',e=>{e.preventDefault();keyboard();});
  setInterval(()=>{
    if(mode!=='phone')return;
    if(phone&&lastPose&&performance.now()-lastPose>1600)lost('Камера потеряла тебя · вернись в кадр');
    const s=window.penalty.getState(),body={type:'state',phase:s.phase,auto:s.auto,saves:s.saves,goals:s.goals,input:s.input},encoded=JSON.stringify(body);
    if(encoded!==lastState||performance.now()-lastSent>1000){connection?.send(body);lastState=encoded;lastSent=performance.now();}
    layout();
  },200);
  void pair();
}
