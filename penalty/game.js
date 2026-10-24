import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { BALL_RADIUS, KEEPER_Z, ZONES, zoneForKey, canSaveShot, defenseWeight } from './zones.js';
import { StadiumAudio, whistleLead, runupElapsed } from './sounds.js';
import {initPhoneHost} from './phone-host.js?v=hands-free-4';

const $=id=>document.getElementById(id), V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const clamp=T.MathUtils.clamp, lerp=T.MathUtils.lerp, smooth=u=>{u=clamp(u,0,1);return u*u*(3-2*u);};
const canvas=$('game'), arena=$('arena');
const audio=new StadiumAudio(),soundEvents=[];
try{audio.enabled=localStorage.getItem('penalty-sound-enabled')!=='false';}catch{}
function sound(name){soundEvents.push({name,time,attempt:state.attempts});if(soundEvents.length>100)soundEvents.shift();audio.play(name);}
function updateSoundButton(){const b=$('sound');b.setAttribute('aria-pressed',String(audio.enabled));b.setAttribute('aria-label',audio.enabled?'Выключить звук':'Включить звук');b.textContent=audio.enabled?'♪ ВКЛ':'♪ ВЫКЛ';}
updateSoundButton();
for(const event of ['pointerdown','keydown'])document.addEventListener(event,e=>{if(e.isTrusted)audio.unlock();},{capture:true});
$('sound').addEventListener('click',()=>{audio.setEnabled(!audio.enabled);updateSoundButton();try{localStorage.setItem('penalty-sound-enabled',String(audio.enabled));}catch{}});
let renderer;
try{renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});}catch(error){$('loading').textContent='Для 3D нужен браузер с поддержкой WebGL. Попробуйте Chrome или Edge.';throw error;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
const scene=new T.Scene();scene.background=new T.Color('#afc4b0');scene.fog=new T.Fog('#afc4b0',35,80);
const camera=new T.PerspectiveCamera(40,1,.1,120);
const cameraViews=[{p:V(0,1.8,-12),look:V(0,1.22,-6.5)},{p:V(2.2,1.9,-12),look:V(0,1.22,-6.5)},{p:V(-2.2,1.9,-12),look:V(0,1.22,-6.5)}];
// From behind the goal, positive world X appears on the left of the screen.
const screenDirection=()=>camera.position.z< -6.5?-1:1;
let view=0;camera.position.copy(cameraViews[0].p);camera.lookAt(cameraViews[0].look);
scene.add(new T.HemisphereLight('#fcf5df','#496e4c',2.6));
const sun=new T.DirectionalLight('#fff1ca',3.7);sun.position.set(-12,19,10);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-17,right:17,top:20,bottom:-18,near:1,far:65});sun.shadow.normalBias=.035;sun.shadow.bias=-.0001;sun.shadow.radius=4;scene.add(sun);
const mat=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.85,...extra});
const green=mat('#53795b'),darkGreen=mat('#456c52'),white=mat('#f0f0d4'),wood=mat('#c6a46f'),steel=mat('#284d45'),chalk=mat('#c8dbb3');
function box(w,h,d,m,x,y,z){const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;scene.add(o);return o;}
function cylinder(a,b,r,m,parent=scene){a=Array.isArray(a)?V(...a):a;b=Array.isArray(b)?V(...b):b;const delta=b.clone().sub(a);const o=new T.Mesh(new T.CylinderGeometry(r,r,delta.length(),8),m);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(V(0,1,0),delta.normalize());o.castShadow=true;parent.add(o);return o;}
// A small neighbourhood ground, with broad mowing stripes and painted markings.
box(23,.4,34,mat('#8ba37c'),0,-.31,0);
box(19,.13,29,green,0,-.055,0);
for(let i=0;i<12;i++)box(18.9,.012,2.4,i%2?green:darkGreen,0,.018,-13.2+i*2.4);
function line(points,color='#dae6c6',opacity=1){const o=new T.Line(new T.BufferGeometry().setFromPoints(points.map(p=>V(...p))),new T.LineBasicMaterial({color,transparent:opacity<1,opacity}));scene.add(o);return o;}
function markingRect(x1,z1,x2,z2){line([[x1,.032,z1],[x2,.032,z1],[x2,.032,z2],[x1,.032,z2],[x1,.032,z1]]);}
markingRect(-8.7,-6.5,8.7,13.2);markingRect(-6.7,-6.5,6.7,2.8);markingRect(-4.65,-6.5,4.65,-3.5);
function flatCircle(r,x,z,width=.035){const o=new T.Mesh(new T.RingGeometry(r-width,r,96),chalk);o.rotation.x=-Math.PI/2;o.position.set(x,.034,z);scene.add(o);return o;}
flatCircle(.10,.25,4.45,.10);flatCircle(2.75,0,10.8);line([[-8.7,.035,10.8],[8.7,.035,10.8]]);
const arc=[];for(let i=0;i<=60;i++){const a=Math.PI*.13+(Math.PI*.74)*i/60;arc.push([Math.cos(a)*3.1,.037,1.62+Math.sin(a)*3.1]);}line(arc);
// Goal: regulation proportions and a mesh net, open toward the kicker.
const GZ=-6.5,GW=3.66,GH=2.44;
cylinder([-GW,.05,GZ],[-GW,GH,GZ],.065,white);cylinder([GW,.05,GZ],[GW,GH,GZ],.065,white);cylinder([-GW,GH,GZ],[GW,GH,GZ],.065,white);
const netPoints=[];const seg=(a,b)=>netPoints.push(...a,...b);
for(let x=-GW;x<=GW+.01;x+=.245)seg([x,.08,GZ-1.65],[x,GH,GZ-.5]);
for(let y=.08;y<=GH;y+=.20){const z=GZ-1.65+1.15*y/GH;seg([-GW,y,z],[GW,y,z]);}
for(let x=-GW;x<=GW+.01;x+=.245)seg([x,GH,GZ],[x,GH,GZ-.5]);
for(let z=GZ-.5;z<GZ;z+=.17)seg([-GW,GH,z],[GW,GH,z]);
for(const x of [-GW,GW]){cylinder([x,.04,GZ-1.65],[x,GH,GZ-.5],.025,steel);cylinder([x,GH,GZ],[x,GH,GZ-.5],.025,steel);for(let y=.1;y<=GH;y+=.2)seg([x,y,GZ],[x,y,GZ-1.65+1.15*y/GH]);for(let i=0;i<=8;i++){const u=i/8;seg([x,.05,GZ-1.65*u],[x,GH,GZ-.5*u]);}}
const netGeo=new T.BufferGeometry();netGeo.setAttribute('position',new T.Float32BufferAttribute(netPoints,3));const net=new T.LineSegments(netGeo,new T.LineBasicMaterial({color:'#eef4df',transparent:true,opacity:.16}));scene.add(net);
// Fences, low terraces, lamps, trees and small urban silhouettes.
for(const x of [-10.3,10.3]){box(.16,.5,31,steel,x,.25,.3);for(let z=-14;z<=15;z+=2.5)cylinder([x,.3,z],[x,2.8,z],.035,steel);for(const y of [1,2,2.8])line([[x,y,-14],[x,y,15]],'#305b4b',.36);}
// Keep the viewing corridor behind the goal clear; terraces sit at the far end.
for(let x=-10;x<=10;x+=2)cylinder([x,.25,15],[x,3.4,15],.035,steel);
for(let x=-10;x<=10;x+=.35)line([[x,.4,15],[x,3.4,15]],'#3e6550',.3);
for(let y=.4;y<3.5;y+=.35)line([[-10.2,y,15],[10.2,y,15]],'#3e6550',.3);
for(let row=0;row<3;row++){box(15,.18,.55,wood,0,.65+row*.43,16.3+row*.7);for(const x of [-6.2,0,6.2])box(.15,.6+row*.43,.2,steel,x,(.6+row*.43)/2,16.3+row*.7);}
for(const [x,z] of [[-10,-8],[10,-8],[-10,10],[10,10]]){cylinder([x,0,z],[x,7.5,z],.075,steel);box(1,.16,.4,white,x,7.5,z);}
const treeM=[mat('#51765d'),mat('#668563'),mat('#81946a')];
let seed=17;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
for(let i=0;i<22;i++){const x=(i<12?-19+rand()*38:(i%2?-15:15)),z=i<12?-19-rand()*9:-10+rand()*32;const h=2.2+rand()*2;cylinder([x,0,z],[x,h,z],.13,wood);for(let j=0;j<3;j++){const o=new T.Mesh(new T.IcosahedronGeometry(1.3+rand()*.65,1),treeM[i%3]);o.position.set(x+(rand()-.5)*1.5,h+j*.65,z+(rand()-.5));o.scale.set(1,1.2,1);o.castShadow=true;scene.add(o);}}
for(let i=0;i<12;i++){const h=3+rand()*7;box(3+rand()*4,h,3,mat(['#849d88','#93a68f','#9aac99'][i%3]),-32+i*5.5,h/2,-33-rand()*8);}
function sign(text,x,z){const c=document.createElement('canvas');c.width=1024;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#244e40';ctx.fillRect(0,0,1024,128);ctx.fillStyle='#d8eda5';ctx.textAlign='center';ctx.font='bold 47px Arial';ctx.fillText(text,512,82);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const o=new T.Mesh(new T.PlaneGeometry(5,.625),new T.MeshBasicMaterial({map:tex}));o.position.set(x,.65,z);scene.add(o);}
sign('ОДИН НА ОДИН',-5.5,-9.5);sign('ТВОЙ ВЫХОД',5.5,-9.5);
const ball=new T.Mesh(new T.IcosahedronGeometry(BALL_RADIUS,3),mat('#f6f3da',{roughness:.6}));ball.castShadow=true;scene.add(ball);
// Dark pentagons follow the twelve vertices of an icosahedron.
const ico=new T.IcosahedronGeometry(1,0).getAttribute('position'),seen=[];
for(let i=0;i<ico.count;i++){const p=V().fromBufferAttribute(ico,i);if(seen.some(v=>v.distanceTo(p)<.01))continue;seen.push(p);const patch=new T.Mesh(new T.CircleGeometry(.146,5),mat('#233c35'));patch.position.copy(p).multiplyScalar(BALL_RADIUS+.002);patch.quaternion.setFromUnitVectors(V(0,0,1),p);ball.add(patch);}
const ballStart=V(.25,BALL_RADIUS+.005,4.45);ball.position.copy(ballStart);
const halo=new T.Mesh(new T.RingGeometry(.52,.55,48),new T.MeshBasicMaterial({color:'#e9f5b1',transparent:true,opacity:.45,side:T.DoubleSide}));halo.rotation.x=-Math.PI/2;halo.position.set(.25,.045,4.45);scene.add(halo);
const zoneLayer=$('target-layer');
const zoneButtons=ZONES.map(zone=>{
  const b=document.createElement('span');b.className='target-zone '+(zone.hands===1?'one-hand':'two-hands');
  b.innerHTML=`<strong>${zone.key}</strong><small>${zone.ru.toUpperCase()}</small>`;
  b.setAttribute('aria-label',`${zone.key} / ${zone.ru}: ${zone.label}, ${zone.hands===1?'одна рука':'прыжок двумя руками'}`);
  b.title=b.getAttribute('aria-label');zoneLayer.append(b);return b;
});
function updateZoneMarkers(){
  const w=arena.clientWidth,h=arena.clientHeight;
  for(const zone of ZONES){const p=V(zone.x,zone.y,zone.z).project(camera),b=zoneButtons[zone.index];
    b.style.left=(p.x*.5+.5)*w+'px';b.style.top=(-p.y*.5+.5)*h+'px';
    b.classList.toggle('incoming',state.shotZone===zone.index&&['runup','flight'].includes(state.phase));
    b.classList.toggle('defending',state.defense?.index===zone.index);
  }
}

// Matrices are solved in character space, so the same rig can face either way.
const clean=n=>T.PropertyBinding.sanitizeNodeName(n);
class Actor{
  constructor(source,color,opacity=1){
    this.root=new T.Group();this.model=clone(source);this.root.add(this.model);scene.add(this.root);this.root.updateMatrixWorld(true);
    this.bones=[];this.rest={};this.inverse={};this.wanted={};this.actual={};
    this.model.traverse(o=>{if(o.isBone){this.bones.push(o);this.rest[o.name]=o.matrixWorld.clone();this.inverse[o.name]=o.matrixWorld.clone().invert();}if(o.isMesh){o.castShadow=opacity===1;o.receiveShadow=true;o.frustumCulled=false;o.material=mat(color,{roughness:.47,transparent:opacity<1,opacity,depthWrite:opacity===1});}});
    this.bones.sort((a,b)=>{const depth=o=>{let d=0;while(o.parent){d++;o=o.parent;}return d;};return depth(a)-depth(b);});
  }
  R(n){return this.rest[clean(n)];}
  pos(n){return V().setFromMatrixPosition(this.R(n));}
  begin(t,hipY=0,lean=0){
    this.wanted={};const hips=this.pos('hips');
    this.wanted[clean('hips')]=new T.Matrix4().makeTranslation(0,hipY+.003*Math.sin(t*2.5),0).multiply(this.R('hips'));
    const d=this.wanted[clean('hips')].clone().multiply(this.R('hips').clone().invert());
    const pivot=new T.Matrix4().makeTranslation(...hips.toArray()).multiply(new T.Matrix4().makeRotationZ(lean)).multiply(new T.Matrix4().makeTranslation(...hips.clone().negate().toArray()));
    this.wanted.spine=d.multiply(pivot).multiply(this.R('spine'));
  }
  solve(kind,side,target,pole){
    const [a,b,c]=kind==='arm'?['upper.','fore.','hand.']:['thigh.','shin.','foot.'];
    const an=clean(a+side),bn=clean(b+side),cn=clean(c+side),parent=kind==='arm'?'spine':'hips';
    const d=this.wanted[parent].clone().multiply(this.inverse[parent]);
    const s0=this.pos(a+side),e0=this.pos(b+side),w0=this.pos(c+side),s=s0.clone().applyMatrix4(d);
    const l1=s0.distanceTo(e0),l2=e0.distanceTo(w0),delta=target.clone().sub(s),dist=clamp(delta.length(),Math.abs(l1-l2)+.001,l1+l2-.001),dir=delta.normalize();
    const along=(l1*l1-l2*l2+dist*dist)/(2*dist),height=Math.sqrt(Math.max(0,l1*l1-along*along));
    const bend=pole.clone().sub(s);bend.addScaledVector(dir,-bend.dot(dir)).normalize();
    const elbow=s.clone().addScaledVector(dir,along).addScaledVector(bend,height),w=s.clone().addScaledVector(dir,dist);
    const orient=(n,from,to,origA,origB)=>{const q=new T.Quaternion().setFromUnitVectors(origB.clone().sub(origA).normalize(),to.clone().sub(from).normalize());q.multiply(new T.Quaternion().setFromRotationMatrix(this.rest[n]));return new T.Matrix4().compose(from,q,V(1,1,1));};
    this.wanted[an]=orient(an,s,elbow,s0,e0);this.wanted[bn]=orient(bn,elbow,w,e0,w0);
    if(kind==='leg'){const q=new T.Quaternion().setFromRotationMatrix(this.rest[cn]);this.wanted[cn]=new T.Matrix4().compose(w,q,V(1,1,1));}
  }
  arm(side,p){this.solve('arm',side,p,V(side==='L'?.7:-.7,1.12,-.35));}
  leg(side,p){this.solve('leg',side,p,V(side==='L'?.2:-.2,.48,.8));}
  apply(){
    this.actual={};
    for(const bone of this.bones){const n=bone.name,p=bone.parent.isBone?bone.parent.name:null;const parent=p?this.actual[p]:new T.Matrix4();const inherit=parent.clone().multiply(p?this.inverse[p]:new T.Matrix4()).multiply(this.rest[n]);const m=this.wanted[n]||inherit;parent.clone().invert().multiply(m).decompose(bone.position,bone.quaternion,bone.scale);this.actual[n]=m;}
    this.root.updateMatrixWorld(true);
  }
  world(n){return V().setFromMatrixPosition(this.actual[clean(n)]).applyMatrix4(this.root.matrixWorld);}
}
let keeper,kicker,ready=false;
const state={phase:'ready',phaseTime:0,flightTime:0,whistleLead:1,saves:0,goals:0,attempts:0,keeperX:0,targetX:0,velocity:V(),jumpStart:-100,source:'manual',pose:null,poseAt:0,auto:false,nextAuto:0,shotTarget:null,shotZone:null,defense:null,outcome:null};
let time=0,last=performance.now(),lastKeeperX=0;
const shootButton=$('shoot'),result=$('result');
function setLabel(s){$('state-label').textContent=s;}
function score(){ $('saves').textContent=state.saves;$('goals').textContent=state.goals; }
function resetBall(){state.phase='ready';state.phaseTime=0;state.flightTime=0;state.outcome=null;state.shotZone=null;state.defense=null;state.targetX=0;state.keeperX=0;lastKeeperX=0;state.pose=null;state.source='manual';state.jumpStart=-100;ball.position.copy(ballStart);ball.rotation.set(0,0,0);result.classList.remove('show');shootButton.disabled=!ready;halo.visible=true;setLabel('ГОТОВ К УДАРУ');$('control-hint').textContent='Исходная стойка по центру · только 12 клавиш';state.nextAuto=time+2.1;}
function shoot(target){
  if(!ready||state.phase!=='ready')return false;
  const zone=typeof target==='number'?ZONES[target]:!target?ZONES[Math.floor(Math.random()*ZONES.length)]:null;
  if(!zone&&(!target||!Number.isFinite(target.x)||!Number.isFinite(target.y)))return false;
  state.phase='runup';state.phaseTime=0;state.attempts++;state.shotZone=zone?.index??null;
  state.whistleLead=whistleLead();sound('whistle');
  state.shotTarget=zone?V(zone.x,zone.y,zone.z):V(clamp(target.x,-3.15,3.15),clamp(target.y,BALL_RADIUS+.01,GH-BALL_RADIUS-.01),KEEPER_Z);
  result.classList.remove('show');shootButton.disabled=true;halo.visible=false;setLabel('СВИСТОК · ПРИГОТОВЬСЯ');return true;
}
function defend(index){
  const zone=ZONES[index];if(!ready||!zone)return false;
  state.pose=null;state.source='keys';state.targetX=0;
  state.defense={index,start:time,releaseAt:null};
  $('control-hint').textContent=`${zone.key} / ${zone.ru.toUpperCase()} · ${zone.hands===1?'одна рука':'прыжок двумя руками'}`;
  canvas.focus({preventScroll:true});return true;
}
function release(){state.phase='flight';state.phaseTime=0;state.flightTime=0;sound('kick');const duration=.85;state.velocity.copy(state.shotTarget).sub(ballStart).divideScalar(duration);state.velocity.y=(state.shotTarget.y-ballStart.y+4.9*duration*duration)/duration;setLabel('ЛОВИ МОМЕНТ');}
function finish(saved){if(state.outcome)return;state.outcome=saved?'save':'goal';if(saved){state.saves++;sound('save');sound('applause');}else{state.goals++;sound('net');sound('cheer');}score();$('result-title').textContent=saved?'ВОТ ЭТО СЕЙВ!':'ГОЛ!';$('result-sub').textContent=saved?'ВОРОТА ПОД ЗАЩИТОЙ':'СЛЕДУЮЩИЙ МЯЧ — ТВОЙ';result.classList.toggle('goal',!saved);result.classList.add('show');state.phase='result';state.phaseTime=0;setLabel(saved?'МЯЧ ОТБИТ':'МЯЧ В СЕТКЕ');}
function pointSegmentDistance(p,a,b){const ab=b.clone().sub(a),u=clamp(p.clone().sub(a).dot(ab)/ab.lengthSq(),0,1);return p.distanceTo(a.addScaledVector(ab,u));}
function touchesKeeper(p){
  const pairs=[['upper.L','fore.L',.115],['fore.L','hand.L',.115],['upper.R','fore.R',.115],['fore.R','hand.R',.115],['thigh.L','shin.L',.14],['shin.L','foot.L',.11],['thigh.R','shin.R',.14],['shin.R','foot.R',.11]];
  if(p.distanceTo(keeper.world('head').add(V(0,.19,0)))<BALL_RADIUS+.28)return true;
  const hips=keeper.world('hips'),chest=keeper.world('spine').add(V(0,.36,0));
  if(pointSegmentDistance(p,hips,chest)<BALL_RADIUS+.23)return true;
  for(const[a,b,r]of pairs)if(pointSegmentDistance(p,keeper.world(a),keeper.world(b))<BALL_RADIUS+r)return true;
  for(const side of ['L','R']){const h=keeper.world('hand.'+side),e=keeper.world('fore.'+side),tip=h.clone().add(h.clone().sub(e).normalize().multiplyScalar(.16));if(pointSegmentDistance(p,h,tip)<BALL_RADIUS+.10)return true;}
  return false;
}
function keeperPose(t,dt){
  const external=state.pose&&performance.now()-state.poseAt<500;
  if(!external&&['pose','motion'].includes(state.source)){if(state.source==='motion')stopMotion();else{state.source='manual';state.pose=null;state.targetX=0;}$('control-hint').textContent='Сигнал позы потерян · доступны 12 клавиш';}
  let defense=state.defense,weight=0,zone=null;
  if(defense){
    const end=defense.releaseAt===null?Infinity:Math.max(defense.start+1.7,defense.releaseAt+.30);
    weight=defenseWeight(defense,t);zone=ZONES[defense.index];
    if(t>end+.30){state.defense=null;defense=null;zone=null;}
  }
  const sign=zone?Math.sign(zone.x):0;
  const defenseX=zone&&zone.hands===2?sign*[2.1,1.95,1.65][zone.row]:0;
  const idleX=external&&state.source==='pose'?clamp(state.targetX,-3.25,3.25):0;
  state.keeperX=T.MathUtils.damp(state.keeperX,lerp(idleX,defenseX,weight),20,dt);
  const speed=(state.keeperX-lastKeeperX)/Math.max(dt,.001);lastKeeperX=state.keeperX;
  const jumpAge=t-state.jumpStart,jump=jumpAge<.9?Math.sin(clamp(jumpAge/.9,0,1)*Math.PI)*.78:0;
  const lift=zone?(zone.hands===2?[.42,.18,.22][zone.row]:zone.row===0?.16:0)*weight:0;
  const tilt=zone&&zone.hands===2?-sign*[.50,.80,1.2][zone.row]*weight:clamp(-speed*.025,-.13,.13)*(1-weight);
  keeper.root.position.set(state.keeperX,jump+lift,KEEPER_Z);keeper.root.rotation.z=tilt;keeper.root.updateMatrixWorld(true);
  keeper.begin(t,lerp(-.06,zone?.hands===1&&zone.row===2?-.43:-.06,weight),0);
  const sway=.025*Math.sin(t*2.3),legOffset=clamp(speed*.015,-.1,.1);
  const tucked=zone?.hands===2?weight*.13:0;
  keeper.leg('L',V(.24+legOffset,.08+tucked,.02));keeper.leg('R',V(-.24+legOffset,.08+tucked,.02));
  if(external&&!zone){for(const side of ['L','R']){const h=state.pose[side==='L'?'leftHand':'rightHand'];keeper.arm(side,h?V(clamp(h.x,-1.1,1.1),clamp(h.y,.3,2.25),clamp(h.z??.15,-.3,.65)):V(side==='L'?.28:-.28,.98,.08));}}
  else{
    const raised=jump>.1?.50:0;
    for(const side of ['L','R']){
      const resting=V(side==='L'?.28:-.28,.98+sway+raised,.08);
      const active=zone&&(zone.hands===2||(zone.x>0?side==='L':side==='R'));
      if(active){
        const handOffset=zone.hands===2?(side==='L'?.10:-.10):0;
        const target=keeper.root.worldToLocal(V(zone.x+handOffset,zone.y,zone.z+.14));
        // Aim the palm, allowing the original wrist and fingers to stay straight.
        const shoulder=keeper.pos('upper.'+side);shoulder.y+=zone.hands===1&&zone.row===2?-.43:-.06;
        target.addScaledVector(target.clone().sub(shoulder).normalize(),-.12);
        keeper.arm(side,resting.lerp(target,weight));
      }else keeper.arm(side,resting);
    }
  }
  keeper.apply();
}
function kickerPose(t){
  let u=0,back=state.phase==='ready'?1:0,strike=0,walk=0;
  if(state.phase==='runup'){u=runupElapsed(state.phaseTime,state.whistleLead);back=1-smooth(u/.58);strike=smooth((u-.58)/.2);walk=Math.sin(u*19)*Math.sin(Math.PI*clamp(u/.78,0,1));}
  else if(state.phase==='flight'){strike=1-smooth(state.phaseTime/.6);}
  kicker.root.position.set(-.03,0,5.2+back*.95);kicker.root.rotation.y=Math.PI;
  kicker.begin(t,-.02,-.04*strike);
  kicker.leg('L',V(.18,.08,walk*.08));
  const rk=state.phase==='runup'?lerp(-.38,.75,strike):lerp(.01,.75,strike);
  kicker.leg('R',V(-.28,.08+Math.max(0,strike)*.17+Math.abs(walk)*.09,rk));
  kicker.arm('L',V(.32+strike*.18,.92+strike*.23,.05-walk*.06));kicker.arm('R',V(-.32-strike*.16,.92+strike*.13,.03+walk*.06));kicker.apply();
}
function update(dt){
  time+=dt;if(!ready)return;
  state.phaseTime+=dt;keeperPose(time,dt);kickerPose(time);
  if(state.phase==='ready'&&state.auto&&time>=state.nextAuto)shoot();
  if(state.phase==='runup'&&state.phaseTime>=state.whistleLead)release();
  if(state.phase==='flight'||state.phase==='result'){
    for(let remaining=dt;remaining>0;){const step=Math.min(remaining,1/180);remaining-=step;state.flightTime+=step;ball.position.addScaledVector(state.velocity,step);state.velocity.y-=9.8*step;
      if(state.phase==='flight'){
        if(ball.position.z<-5.35&&ball.position.z>-6.8&&canSaveShot(state.shotZone,state.defense?.index,defenseWeight(state.defense,time))&&touchesKeeper(ball.position)){state.velocity.set((ball.position.x-state.keeperX)*4,2.4,5.7);finish(true);}
        else if(ball.position.z<GZ-BALL_RADIUS){finish(false);state.velocity.z*=-.10;state.velocity.x*=.12;state.velocity.y*=.3;ball.position.z=GZ-.6;}
      }
      if(ball.position.y<BALL_RADIUS+.002){ball.position.y=BALL_RADIUS+.002;state.velocity.y=Math.abs(state.velocity.y)*.45;state.velocity.x*=.985;state.velocity.z*=.985;}
      if(ball.position.z<GZ-1.5){ball.position.z=GZ-1.5;state.velocity.z=Math.abs(state.velocity.z)*.2;}
      ball.rotation.x+=state.velocity.z*step*3;ball.rotation.z-=state.velocity.x*step*3;
    }
    if(state.phase==='result'&&state.phaseTime>2.5)resetBall();
  }
  halo.material.opacity=.28+.12*Math.sin(time*3);
}
function fitGoalCamera(){
  camera.updateMatrixWorld(true);
  let tangent=0;
  // Fit the front posts almost to the side edges, retaining the whole goal on
  // wide screens too. Keep the camera itself at the keeper's head height.
  for(const x of [-GW-.07,GW+.07])for(const y of [0,GH+.07]){
    const p=V(x,y,GZ).applyMatrix4(camera.matrixWorldInverse);
    tangent=Math.max(tangent,Math.abs(p.x)/(-p.z)/camera.aspect/.96,Math.abs(p.y)/(-p.z)/.92);
  }
  camera.fov=T.MathUtils.radToDeg(2*Math.atan(tangent));camera.updateProjectionMatrix();
}
function resize(){const w=arena.clientWidth,h=arena.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;fitGoalCamera();}
new ResizeObserver(resize).observe(arena);resize();
function frame(now){const dt=Math.min((now-last)/1000,.05);last=now;update(dt);updateZoneMarkers();renderer.render(scene,camera);requestAnimationFrame(frame);}
requestAnimationFrame(frame);
document.addEventListener('visibilitychange',()=>{last=performance.now();releaseControls();if(document.hidden)audio.stop();});
canvas.addEventListener('pointerdown',()=>canvas.focus({preventScroll:true}));
window.addEventListener('keydown',e=>{
  if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable)return;
  const zone=zoneForKey(e);
  if(zone){e.preventDefault();if(!e.repeat)defend(zone.index);return;}
  if(e.code==='Space'&&!['BUTTON'].includes(document.activeElement?.tagName)){
    e.preventDefault();if(!e.repeat)shoot();
  }
});
window.addEventListener('keyup',e=>{const zone=zoneForKey(e);if(zone&&state.defense?.index===zone.index)state.defense.releaseAt=time;});
function releaseControls(){if(state.defense)state.defense.releaseAt=time;}
window.addEventListener('blur',releaseControls);
shootButton.addEventListener('click',()=>shoot());$('auto').addEventListener('change',e=>{state.auto=e.target.checked;state.nextAuto=time+1;});
function resetGame(){audio.stop();state.saves=0;state.goals=0;state.attempts=0;score();state.targetX=0;state.keeperX=0;lastKeeperX=0;state.jumpStart=-100;state.pose=null;state.source='manual';$('control-hint').textContent='12 клавиш = 12 точек в воротах';resetBall();}
function pauseAuto(){state.auto=false;$('auto').checked=false;if(['runup','flight'].includes(state.phase)){audio.stop();resetBall();}}
function stopMotion(){if(state.source!=='motion')return;state.pose=null;state.defense=null;state.targetX=0;state.source='manual';pauseAuto();}
function setMotionPose(pose){
  if(!pose||pose.tracked!==true){stopMotion();return false;}
  if(pose.zone!==null&&(!Number.isInteger(pose.zone)||pose.zone<0||pose.zone>11))return false;
  for(const key of ['leftHand','rightHand']){const h=pose[key];if(!h||!['x','y','z'].every(a=>Number.isFinite(h[a])))return false;}
  const previous=state.source;state.pose={x:0,leftHand:{...pose.leftHand},rightHand:{...pose.rightHand}};state.poseAt=performance.now();state.source='motion';state.targetX=0;
  if(pose.zone===null)state.defense=null;
  else if(previous!=='motion'||state.defense?.index!==pose.zone)state.defense={index:pose.zone,start:time,releaseAt:null};
  $('control-hint').textContent=pose.zone===null?'Вратарь повторяет движения рук':`Камера · ${ZONES[pose.zone].ru.toUpperCase()} · ${ZONES[pose.zone].hands===1?'одна рука':'прыжок двумя руками'}`;return true;
}
$('reset').addEventListener('click',resetGame);
$('view').addEventListener('click',()=>{view=(view+1)%cameraViews.length;camera.position.copy(cameraViews[view].p);camera.lookAt(cameraViews[view].look);fitGoalCamera();});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{setLabel('ПОЛНОЭКРАННЫЙ РЕЖИМ НЕДОСТУПЕН');}});
// Transport-independent boundary for the later phone / pose-tracking connection.
// x: -1..1 from the screen's left to right. Hand coordinates are in character metres,
// anatomical left/right, with Y up and Z toward the kicker. No camera is opened here.
window.penalty={
  setKeeperPose(pose){
    if(!pose||!Number.isFinite(pose.x))return false;
    for(const k of ['leftHand','rightHand'])if(pose[k]&&(!Number.isFinite(pose[k].x)||!Number.isFinite(pose[k].y)||(pose[k].z!==undefined&&!Number.isFinite(pose[k].z))))return false;
    state.targetX=clamp(pose.x,-1,1)*3.25*screenDirection();state.pose=structuredClone(pose);state.poseAt=performance.now();state.source='pose';state.defense=null;
    if(pose.jump&&time-state.jumpStart>.95)state.jumpStart=time;
    $('control-hint').textContent='Получаем движения тела · управление позой';return true;
  },
  disconnectPose(){state.pose=null;state.targetX=0;state.source='manual';$('control-hint').textContent='Исходная стойка по центру · только 12 клавиш';},
  defend,reset:resetGame,
  setMotionPose,stopMotion,pauseAuto,
  startAuto(){state.auto=true;$('auto').checked=true;state.nextAuto=time+1;},
  getZones:()=>structuredClone(ZONES),
  shoot:target=>shoot(target),
  getSoundState:()=>({enabled:audio.enabled,context:audio.context?.state??'locked',events:structuredClone(soundEvents)}),
  getState:()=>({ready,auto:state.auto,phase:state.phase,whistleLead:state.whistleLead,saves:state.saves,goals:state.goals,attempts:state.attempts,keeperX:state.keeperX,input:state.source,ball:ball.position.toArray(),ballRadius:BALL_RADIUS,shotZone:state.shotZone,defense:state.defense?{index:state.defense.index,hands:ZONES[state.defense.index].hands}:null,outcome:state.outcome}),
};
try{
  const gltf=await new GLTFLoader().loadAsync('./assets/ball-man.glb');
  keeper=new Actor(gltf.scene,'#f7efcf',.50);kicker=new Actor(gltf.scene,'#e7b078');
  ready=true;keeperPose(0,1/60);kickerPose(0);$('loading').classList.add('hidden');shootButton.disabled=false;
  initPhoneHost();
  window.dispatchEvent(new Event('penalty-ready'));
}catch(error){console.error(error);$('loading').replaceChildren(document.createTextNode('Не удалось загрузить персонажей. Обновите страницу или запустите её через Запустить.bat.'));}
