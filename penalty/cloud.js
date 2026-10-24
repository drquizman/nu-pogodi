import {createClient} from './vendor/supabase.js';
import {toDataURL} from './vendor/qrcode.js';
import {SUPABASE_URL,SUPABASE_ANON_KEY} from './cloud-config.js';
export const cloud=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:false,detectSessionInUrl:false,autoRefreshToken:true}});
let login;
export function ensureSession(){return login??=(async()=>{const {error}=await cloud.auth.signInAnonymously();if(error)throw error;})().catch(e=>{login=null;throw e;});}
export function controllerURL(id,key,base=location.href){const u=new URL('./phone.html',base);u.search='';u.hash=new URLSearchParams({room:id,key}).toString();return u.href;}
async function seatInfo(seat){const phoneURL=controllerURL(seat.id,seat.joinKey);return {...seat,phoneURL,qr:await toDataURL(phoneURL,{width:300,margin:2,errorCorrectionLevel:'M'})};}
export async function createSeat(){await ensureSession();const {data,error}=await cloud.rpc('np_create_room');if(error)throw error;return seatInfo(data);}
export async function resumeSeat(seat){
  if(!seat?.id||!seat.hostKey||!seat.joinKey)throw Error('Подключение устарело');
  await ensureSession();const {data,error}=await cloud.rpc('np_join_room',{room_id:seat.id,player_role:'host',room_key:seat.hostKey});
  if(error)throw error;if(!data)throw Error('Подключение устарело');return seatInfo(seat);
}
const validHand=h=>h&&['x','y','z'].every(k=>Number.isFinite(h[k]))&&Math.abs(h.x)<=1.2&&h.y>=.2&&h.y<=2.4&&Math.abs(h.z)<=.8;
export function validMessage(role,m){
  if(!m||typeof m!=='object'||m.app!=='penalty-v1')return false;
  if(m.type==='heartbeat')return true;
  if(role==='host'){
    if(m.type==='action')return ['start','pause'].includes(m.action);
    return m.type==='pose'&&Number.isSafeInteger(m.seq)&&typeof m.tracked==='boolean'&&(m.startProgress===undefined||(Number.isFinite(m.startProgress)&&m.startProgress>=0&&m.startProgress<=1))&&(!m.tracked||((m.zone===null||(Number.isInteger(m.zone)&&m.zone>=0&&m.zone<12))&&validHand(m.leftHand)&&validHand(m.rightHand)));
  }
  return m.type==='closed'||(m.type==='state'&&['ready','runup','flight','result'].includes(m.phase)&&Number.isFinite(m.saves)&&Number.isFinite(m.goals));
}
