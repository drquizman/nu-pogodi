import {PhoneConnection} from './phone-connection.js?v=intent-gate-7';
import {createSeat,resumeSeat} from './cloud.js?v=intent-gate-7';
import {IntentionalStart,START_PROTOCOL} from './palm.js?v=intent-gate-7';

const trackingGraceMs=5000;
const returnHint='Вернись в кадр · серия продолжится';

export function initPhoneHost({phoneBase,onRoom}={}){
  const $=id=>document.getElementById(id),button=$('connect-phone'),dialog=$('phone-dialog'),panel=$('motion-setup');
  let seat,connection,phone=false,lastPose=0,lastTracked=0,lastState='',lastSent=0,busy=false,generation=0,mode='phone',tracked=false,startPhase='lower';
  const starter=new IntentionalStart();
  const feedback=[...document.querySelectorAll('[data-pose-feedback]')];
  const progressBars=[$('palm-progress'),$('replay-progress')].filter(Boolean);
  let progress=0,confirmUntil=0;
  function text(s){$('phone-status').textContent=s;$('pair-message').textContent=s;$('motion-status').textContent=s;}
  function setText(node,value){if(node&&node.textContent!==value)node.textContent=value;}
  function layout(){
    document.body.dataset.controls=mode;
    const state=window.penalty.getState();
    panel.hidden=mode!=='phone'||dialog.open||state.auto||state.seriesComplete;
    const stance=tracked&&startPhase!=='lower',palm=tracked&&startPhase==='hold';
    const instruction=!tracked?(phone?'Встань в кадр':'Подключи телефон')
      :palm?'Ладонь видна. Держи 2 секунды'
      :stance?'Стойка принята. Подними ладонь':'Встань по центру и опусти руки';
    setText($('motion-title'),instruction);
    setText($('replay-status'),instruction);
    for(const row of feedback){
      const stanceStep=row.querySelector('[data-pose-step="stance"]');
      const palmStep=row.querySelector('[data-pose-step="palm"]');
      stanceStep.toggleAttribute('data-confirmed',stance);
      palmStep.toggleAttribute('data-confirmed',palm);
      setText(stanceStep,stance?'✓ Стойка принята':'1. Руки вниз');
      setText(palmStep,palm?'✓ Ладонь видна':'2. Ладонь к камере');
    }
    for(const bar of progressBars)bar.style.width=`${Math.round(progress*100)}%`;
    const confirmation=$('start-confirmation');
    if(confirmation)confirmation.hidden=!state.auto||performance.now()>=confirmUntil;
  }
  function lost(s){starter.reset();startPhase='lower';tracked=false;lastPose=0;lastTracked=0;progress=0;confirmUntil=0;window.penalty.stopMotion(!phoneBase);if(phoneBase)window.penalty.pauseAuto();text(s);layout();}
  function interrupted(message){
    if(!phoneBase||!window.penalty.getState().auto){lost(message);return;}
    tracked=false;lastPose=0;
    window.penalty.setMotionPose(null);
    text(returnHint);layout();
  }
  function showSeat(){
    $('phone-qr').src=seat.qr;$('phone-qr').hidden=false;$('phone-link').href=seat.phoneURL;$('phone-link').hidden=false;
    onRoom?.(seat);
  }
  function connect(current){
    connection?.close();connection=new PhoneConnection({room:seat.id,role:'host',key:seat.hostKey},m=>{
      if(current!==generation||mode!=='phone')return;
      if(m.type==='joined')lastState='';
      if(m.type==='fatal'){try{sessionStorage.removeItem('penalty-cloud-room');}catch{}seat=null;lost(m.message);}
      if(m.type==='peer'){
        phone=m.connected;
        if(!phone)interrupted('Телефон не подключён');
        else{if(dialog.open)dialog.close();text(window.penalty.getState().auto?returnHint:'Включи камеру на телефоне');layout();}
      }
      if(m.type==='pose'){
        const now=performance.now();
        const playing=window.penalty.getState().auto;
        if(phoneBase&&playing&&lastTracked&&now-lastTracked>=trackingGraceMs)lost('Камера потеряла тебя · вернись в кадр');
        lastPose=now;tracked=m.tracked&&!m.held;
        if(tracked)lastTracked=now;
        window.penalty.setMotionPose(m);
        const auto=window.penalty.getState().auto;
        text(tracked?'Камера видит тебя':phoneBase&&auto?returnHint:m.guide||'Покажи пояс и обе кисти');
        const hold=starter.update({neutral:m.startNeutral===true,gesture:m.startGesture===true,anchor:m.startAnchor},m.startProtocol===START_PROTOCOL&&tracked&&!auto,now);
        startPhase=hold.phase;progress=hold.progress;
        if(hold.start){
          window.penalty.startAuto();
          confirmUntil=performance.now()+2400;
        }
        if(dialog.open)dialog.close();layout();
      }
      // Start is decided here from fresh gesture frames; legacy actions cannot start.
      if(m.type==='action'&&m.action==='pause'){window.penalty.pauseAuto();layout();}
    },online=>{if(current===generation&&!online)interrupted('Связь потеряна · переподключаемся');});
  }
  async function pair(fresh=false){
    if(busy)return;busy=true;window.penalty.pauseAuto();const current=++generation;mode='phone';button.disabled=true;
    if(fresh){
      const old=connection;connection=null;void old?.send({type:'closed'}).finally(()=>old.close());
      phone=false;lastPose=0;lastTracked=0;tracked=false;starter.reset();
      startPhase='lower';progress=0;confirmUntil=0;$('phone-qr').hidden=true;$('phone-link').hidden=true;
    }
    if(!dialog.open)dialog.showModal();layout();text('Готовим QR-код…');
    try{
      let saved;try{if(!fresh)saved=JSON.parse(sessionStorage.getItem('penalty-cloud-room'));}catch{}
      let next;if(saved)try{next=await resumeSeat(saved,phoneBase);}catch{}
      if(!next)next=await createSeat(phoneBase);
      if(current!==generation)return;seat=next;
      try{sessionStorage.setItem('penalty-cloud-room',JSON.stringify({id:seat.id,hostKey:seat.hostKey,joinKey:seat.joinKey}));}catch{}
      showSeat();connect(current);text('');
    }catch{if(current===generation)text(phoneBase?'Не удалось получить QR-код. Проверь интернет и обнови QR':'Не удалось получить QR-код. Проверь интернет или выбери клавиатуру');}
    finally{busy=false;button.disabled=false;}
  }
  function keyboard(){
    generation++;mode='keyboard';phone=false;tracked=false;lastPose=0;lastTracked=0;
    const old=connection;connection=null;void old?.send({type:'closed'}).finally(()=>old.close());
    window.penalty.stopMotion();if(dialog.open)dialog.close();text('');layout();
  }
  button.onclick=()=>void pair(Boolean(phoneBase));$('close-phone-dialog').onclick=phoneBase?()=>void pair(true):keyboard;$('disconnect-phone').onclick=keyboard;
  dialog.addEventListener('cancel',e=>{e.preventDefault();if(!phoneBase)keyboard();});
  setInterval(()=>{
    if(mode!=='phone')return;
    const now=performance.now();
    if(phoneBase&&window.penalty.getState().auto&&lastTracked&&now-lastTracked>=trackingGraceMs){
      lost('Камера потеряла тебя · вернись в кадр');
    }else if(phone&&lastPose&&now-lastPose>1600){
      interrupted('Камера потеряла тебя · вернись в кадр');
    }
    const s=window.penalty.getState(),body={type:'state',phase:s.phase,auto:s.auto,saves:s.saves,goals:s.goals,input:s.input},encoded=JSON.stringify(body);
    if(encoded!==lastState||performance.now()-lastSent>1000){connection?.send(body);lastState=encoded;lastSent=performance.now();}
    layout();
  },200);
  void pair();
}

