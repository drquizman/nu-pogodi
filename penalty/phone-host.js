import {PhoneConnection} from './phone-connection.js';
import {createSeat,resumeSeat} from './cloud.js';
export function initPhoneHost(){
  const button=document.querySelector('#connect-phone'),dialog=document.querySelector('#phone-dialog'),status=document.querySelector('#phone-status'),message=document.querySelector('#pair-message');
  let seat,connection,phone=false,lastPose=0,lastState='',busy=false;
  const text=s=>{status.textContent=s;message.textContent=s;};
  function showSeat(){const qr=document.querySelector('#phone-qr'),link=document.querySelector('#phone-link');qr.src=seat.qr;qr.hidden=false;link.href=seat.phoneURL;link.hidden=false;document.querySelector('#disconnect-phone').hidden=false;}
  function lost(s){lastPose=0;window.penalty.stopMotion();text(s);}
  function connect(){
    connection?.close();connection=new PhoneConnection({room:seat.id,role:'host',key:seat.hostKey},m=>{
      if(m.type==='joined')lastState='';
      if(m.type==='fatal'){try{sessionStorage.removeItem('penalty-cloud-room');}catch{}seat=null;lost(m.message);}
      if(m.type==='peer'){phone=m.connected;if(!phone)lost('Телефон не подключён · отсканируй QR-код');else text('Телефон подключён · включи на нём камеру');}
      if(m.type==='pose'){
        lastPose=performance.now();window.penalty.setMotionPose(m);
        text(m.tracked?(m.zone===null?'Камера видит тебя · покажи жест':`Управление телом · ${window.penalty.getZones()[m.zone].ru.toUpperCase()}`):m.guide||'Покажи обе руки и пояс');
        if(m.tracked&&dialog.open)dialog.close();
      }
      if(m.type==='action'&&m.action==='start'&&lastPose&&performance.now()-lastPose<500&&window.penalty.getState().input==='motion')window.penalty.startAuto();
      if(m.type==='action'&&m.action==='pause')window.penalty.pauseAuto();
    },online=>{if(!online)lost('Связь потеряна · переподключаемся');});
  }
  async function pair(){
    if(busy)return;busy=true;button.disabled=true;text('Готовим подключение…');
    try{
      if(!seat){let saved;try{saved=JSON.parse(sessionStorage.getItem('penalty-cloud-room'));}catch{}
        if(saved)try{seat=await resumeSeat(saved);}catch{}
        if(!seat)seat=await createSeat();
        try{sessionStorage.setItem('penalty-cloud-room',JSON.stringify({id:seat.id,hostKey:seat.hostKey,joinKey:seat.joinKey}));}catch{}
        showSeat();connect();
      }else showSeat();
      text(phone?'Телефон подключён · встань в кадр':'Отсканируй QR-код камерой телефона');
    }catch{text('Не удалось подключиться к игре. Проверь интернет и попробуй снова.');}finally{busy=false;button.disabled=false;}
  }
  button.addEventListener('click',()=>{dialog.showModal();void pair();});
  document.querySelector('#close-phone-dialog').onclick=()=>dialog.close();
  document.querySelector('#disconnect-phone').onclick=async()=>{
    if(!seat)return;seat=null;await connection?.send({type:'closed'});connection?.close();phone=false;window.penalty.stopMotion();
    try{sessionStorage.removeItem('penalty-cloud-room');}catch{}
    document.querySelector('#phone-qr').hidden=true;document.querySelector('#phone-link').hidden=true;document.querySelector('#disconnect-phone').hidden=true;text('Телефон отключён · доступна клавиатура');dialog.close();
  };
  setInterval(()=>{
    if(phone&&lastPose&&performance.now()-lastPose>700)lost('Камера потеряла движения · автоудары остановлены');
    const s=window.penalty.getState(),body={type:'state',phase:s.phase,saves:s.saves,goals:s.goals,input:s.input},encoded=JSON.stringify(body);
    if(encoded!==lastState){connection?.send(body);lastState=encoded;}
  },200);
  try{if(sessionStorage.getItem('penalty-cloud-room'))void pair();}catch{}
}
