import {PhoneConnection} from './phone-connection.js?v=intent-gate-7';
import {MotionTracker} from './motion.js?v=intent-gate-7';
import {IntentionalStart,START_PROTOCOL} from './palm.js?v=intent-gate-7';
import {drawSilhouette} from './silhouette.js?v=intent-gate-7';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.hash.slice(1)),room=params.get('room'),key=params.get('key');
const video=$('video'),canvas=$('skeleton'),palm=new IntentionalStart();
let connection,online=false,host=false,stream,worker,workerReady=false,busy=false,starting=false,generation=0,lastVideo=-1,lastFrame=0,lastPose=0,seq=0,wake,timeout,auto=false,tracker=new MotionTracker();
function guide(message){$('guide').textContent=message;$('guide').hidden=!message;}
function sendPose(p={tracked:false,zone:null,guide:'Включи камеру на телефоне'}){connection?.send({type:'pose',...p,seq:++seq});}
function stopCamera(message='Включи камеру на телефоне'){
  generation++;clearTimeout(timeout);starting=false;workerReady=false;busy=false;
  stream?.getTracks().forEach(t=>t.stop());stream=null;worker?.terminate();worker=null;video.srcObject=null;
  lastPose=0;lastVideo=-1;tracker=new MotionTracker();palm.reset();void wake?.release();wake=null;
  document.body.classList.remove('camera-on');$('camera-start').hidden=false;$('camera-start').disabled=!online;$('camera-start').textContent='Включить камеру';
  canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);guide(message);sendPose({tracked:false,zone:null,guide:message});
}
async function startCamera(){
  if(starting||!online)return;
  if(!isSecureContext||!navigator.mediaDevices?.getUserMedia){guide('Открой ссылку в Chrome или Safari.');return;}
  stopCamera();starting=true;const current=++generation;
  $('camera-start').disabled=true;$('camera-start').textContent='Включаем камеру…';guide('Разреши доступ к камере');
  try{
    const acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'user'},width:{ideal:640},height:{ideal:480},frameRate:{ideal:20,max:30},resizeMode:{ideal:'none'}},audio:false});
    if(current!==generation){acquired.getTracks().forEach(t=>t.stop());return;}
    stream=acquired;video.srcObject=stream;await video.play();if(current!==generation)return;
    document.body.classList.add('camera-on');$('camera-start').hidden=true;guide('Загружаем распознавание…');
    sendPose({tracked:false,zone:null,guide:'Загружаем распознавание на телефоне…'});
    worker=new Worker(new URL('./pose-worker.js?v=intent-gate-7',import.meta.url));
    timeout=setTimeout(()=>{if(current===generation&&!workerReady)stopCamera('Модель не загрузилась. Проверь интернет и попробуй снова.');},60000);
    worker.onmessage=e=>{
      if(current!==generation)return;
      if(e.data.type==='ready'){clearTimeout(timeout);starting=false;workerReady=true;lastPose=performance.now();guide('Смотри на экран компьютера');}
      if(e.data.type==='error')stopCamera(`Не удалось запустить распознавание: ${e.data.message||'ошибка модели'}`);
      if(e.data.type==='pose'){
        busy=false;lastPose=performance.now();
        const result=tracker.update(e.data.points,lastPose);
        const gesture={neutral:e.data.neutral===true,gesture:e.data.openPalm===true,anchor:e.data.anchor};
        const hold=palm.update(gesture,!auto&&host&&online&&result.tracked&&!result.held,lastPose);
        const presented=!auto&&e.data.openPalm===true;
        drawSilhouette(canvas,e.data.points,video.videoWidth||640,video.videoHeight||480,{palms:presented?e.data.palms||[]:[],progress:presented?hold.progress:0});
        sendPose({...result,startProgress:hold.progress,startProtocol:START_PROTOCOL,startNeutral:gesture.neutral,startGesture:gesture.gesture,startAnchor:gesture.anchor});
        guide(auto?'':hold.phase==='lower'?'Сначала опусти обе руки':presented?`Держи ладонь неподвижно · ${Math.round(hold.progress*100)}%`:'');
      }
    };
    worker.onerror=e=>{if(current===generation)stopCamera(`Ошибка распознавания: ${e.message||'открой ссылку в Chrome или Safari'}`);};
    worker.postMessage({type:'init'});
    try{wake=await navigator.wakeLock?.request('screen');}catch{}
  }catch(e){if(current!==generation)return;stopCamera(e.name==='NotAllowedError'?'Разреши доступ к камере в настройках сайта.':'Не удалось включить камеру. Попробуй снова.');}
}
async function frame(now){
  requestAnimationFrame(frame);
  if(!workerReady||!stream||busy||video.readyState<2||video.currentTime===lastVideo||now-lastFrame<80)return;
  lastVideo=video.currentTime;lastFrame=now;busy=true;const current=generation;
  try{
    const scale=Math.min(1,640/Math.max(video.videoWidth,video.videoHeight)),bitmap=await createImageBitmap(video,{resizeWidth:Math.round(video.videoWidth*scale),resizeHeight:Math.round(video.videoHeight*scale)});
    if(current!==generation){bitmap.close();return;}
    worker.postMessage({type:'frame',frame:bitmap,at:performance.now(),checkPalm:!auto},[bitmap]);
  }catch{if(current===generation)stopCamera('Не удалось прочитать кадр камеры. Попробуй снова.');}
}
if(!room||!key){guide('Открой ссылку из QR-кода на экране компьютера');$('camera-start').disabled=true;}
else connection=new PhoneConnection({room,role:'phone',key},m=>{
  if(m.type==='fatal')stopCamera(m.message);
  if(m.type==='host'){host=m.connected;if(!host){palm.reset();}}
  if(m.type==='state'){auto=m.auto===true;}
},(connected,code)=>{
  online=connected;$('camera-start').disabled=!online;
  if(!stream)guide(online?'':'Подключаемся…');
  if(!online){palm.reset();if([1000,1008,4001].includes(code))stopCamera('Отсканируй новый QR-код на компьютере');}
});
$('camera-start').onclick=()=>void startCamera();
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera('Включи камеру снова');});
window.addEventListener('pagehide',()=>{stopCamera();connection?.close();});
setInterval(()=>{if(workerReady&&performance.now()-lastPose>6000)stopCamera('Камера перестала отвечать. Включи её снова.');if(!stream)sendPose();},500);
requestAnimationFrame(frame);





