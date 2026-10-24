import {PhoneConnection} from './phone-connection.js';
import {MotionTracker} from './motion.js';
import {ZONES} from './zones.js';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.hash.slice(1)),room=params.get('room'),key=params.get('key');
let connection,online=false,host=false,stream,worker,workerReady=false,busy=false,starting=false,generation=0,lastVideo=-1,lastFrame=0,lastPose=0,lastTracked=0,lastGood,seq=0,wake,tracker=new MotionTracker();
const video=$('video'),canvas=$('skeleton'),ctx=canvas.getContext('2d');
function sendPose(p={tracked:false,zone:null,guide:'Камера выключена'}){connection?.send({type:'pose',...p,seq:++seq});}
function refresh(){const fresh=performance.now()-lastTracked<500; $('play').disabled=!online||!host||!stream||!fresh;$('pause').disabled=!online||!host;}
function stopCamera(message='Камера выключена'){
  generation++;starting=false;workerReady=false;busy=false;stream?.getTracks().forEach(t=>t.stop());stream=null;worker?.terminate();worker=null;video.srcObject=null;
  lastPose=0;lastTracked=0;lastGood=null;lastVideo=-1;tracker=new MotionTracker();void wake?.release();wake=null;
  $('camera-start').hidden=false;$('camera-start').disabled=!online;$('camera-start').textContent='Включить камеру';$('placeholder').hidden=false;$('badge').textContent='Камера выключена';$('guide').textContent=message;ctx.clearRect(0,0,canvas.width,canvas.height);sendPose({tracked:false,zone:null,guide:message});refresh();
}
function draw(points){
  canvas.width=video.videoWidth||640;canvas.height=video.videoHeight||480;ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.lineWidth=canvas.width/160;ctx.strokeStyle='#d9f48f';ctx.fillStyle='#e9ffb9';
  for(const[a,b]of [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24]]){
    if(!points[a]||!points[b]||(points[a].visibility??0)<.5||(points[b].visibility??0)<.5)continue;
    ctx.beginPath();ctx.moveTo(points[a].x*canvas.width,points[a].y*canvas.height);ctx.lineTo(points[b].x*canvas.width,points[b].y*canvas.height);ctx.stroke();
  }
  for(const i of [11,12,13,14,15,16,23,24]){const p=points[i];if(p&&(p.visibility??0)>.5){ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,canvas.width/110,0,Math.PI*2);ctx.fill();}}
}
async function startCamera(){
  if(starting||!online)return;if(!isSecureContext||!navigator.mediaDevices?.getUserMedia){$('guide').textContent='Открой защищённую ссылку из QR-кода в Chrome или Safari.';return;}
  stopCamera();starting=true;const current=++generation;$('camera-start').disabled=true;$('camera-start').textContent='Включаем камеру…';$('guide').textContent='Разреши доступ к камере. Микрофон не нужен.';
  let timeout;
  try{
    const facing=$('facing').value;
    const acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:640},height:{ideal:480},frameRate:{ideal:20,max:30}},audio:false});
    if(current!==generation){acquired.getTracks().forEach(t=>t.stop());return;}
    stream=acquired;video.srcObject=stream;await video.play();if(current!==generation)return;
    $('placeholder').hidden=true;$('camera-start').hidden=true;$('badge').textContent='Загружаем распознавание…';$('guide').textContent='Подготавливаем модель. Встань так, чтобы были видны кисти и пояс.';
    document.querySelector('.camera').classList.toggle('back',facing==='environment');
    worker=new Worker('./pose-worker.js');
    timeout=setTimeout(()=>{if(current===generation&&!workerReady)stopCamera('Модель загружается слишком долго. Проверь интернет и включи камеру снова.');},45000);
    worker.onmessage=e=>{
      if(current!==generation)return;
      if(e.data.type==='ready'){clearTimeout(timeout);starting=false;workerReady=true;lastPose=performance.now();$('badge').textContent='Ищем человека…';}
      if(e.data.type==='error'){clearTimeout(timeout);stopCamera('Распознавание не запустилось. Попробуй включить камеру снова.');}
      if(e.data.type==='pose'){
        busy=false;lastPose=performance.now();draw(e.data.points);
        let result=tracker.update(e.data.points,lastPose);
        if(result.tracked){lastTracked=lastPose;lastGood=result;}
        else if(lastGood&&lastPose-lastTracked<180)result=lastGood;
        sendPose(result);$('badge').textContent=result.tracked?'Руки видны':'Не вижу руки';
        $('guide').textContent=result.zone===null?result.guide:`${ZONES[result.zone].ru.toUpperCase()} · ${result.guide}`;refresh();
      }
    };
    worker.onerror=()=>{if(current===generation){clearTimeout(timeout);stopCamera('Этот браузер не запустил распознавание. Открой ссылку в Chrome или Safari.');}};
    worker.postMessage({type:'init'});
    try{wake=await navigator.wakeLock?.request('screen');}catch{}
  }catch(e){if(current!==generation)return;clearTimeout(timeout);stopCamera(e.name==='NotAllowedError'?'Доступ к камере не разрешён. Разреши его в настройках сайта и попробуй снова.':e.name==='NotFoundError'?'Камера не найдена. Открой ссылку на телефоне.':'Не удалось включить камеру. Закрой другие приложения, использующие её, и попробуй снова.');}
}
async function frame(now){
  requestAnimationFrame(frame);
  if(!workerReady||!stream||busy||video.readyState<2||video.currentTime===lastVideo||now-lastFrame<65)return;
  lastVideo=video.currentTime;lastFrame=now;busy=true;const current=generation;
  try{const scale=Math.min(1,480/video.videoWidth),bitmap=await createImageBitmap(video,{resizeWidth:Math.round(video.videoWidth*scale),resizeHeight:Math.round(video.videoHeight*scale)});if(current!==generation){bitmap.close();return;}worker.postMessage({type:'frame',frame:bitmap,at:performance.now()},[bitmap]);}
  catch{if(current===generation)stopCamera('Не удалось прочитать кадр камеры. Попробуй снова.');}
}
if(!room||!key){$('connection').textContent='Нет подключения';$('guide').textContent='Открой игру на компьютере и отсканируй QR-код «Подключить телефон».';$('camera-start').disabled=true;}
else{
  connection=new PhoneConnection({room,role:'phone',key},m=>{
    if(m.type==='fatal')stopCamera(m.message);
    if(m.type==='host'){host=m.connected;$('connection').textContent=host?'Экран подключён':'Ждём экран игры';refresh();}
    if(m.type==='state'){$('saves').textContent=m.saves;$('goals').textContent=m.goals;}
  },(connected,code)=>{online=connected;$('camera-start').disabled=!online;$('connection').textContent=online?'Связь установлена':'Переподключаемся…';if(!online&&[1000,1008,4001].includes(code))stopCamera('Подключение закрыто. Отсканируй новый QR-код в игре.');refresh();});
}
$('camera-start').onclick=()=>void startCamera();$('camera-stop').onclick=()=>stopCamera();$('facing').onchange=()=>{if(stream)void startCamera();};
$('play').onclick=()=>connection?.send({type:'action',action:'start'});$('pause').onclick=()=>connection?.send({type:'action',action:'pause'});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera('Камера остановлена. Вернись в кадр и включи её снова.');});
window.addEventListener('pagehide',()=>{stopCamera();connection?.close();});
setInterval(()=>{if(workerReady&&performance.now()-lastPose>1200)stopCamera('Камера перестала передавать кадры. Включи её снова.');if(!stream)sendPose();refresh();},500);
requestAnimationFrame(frame);
