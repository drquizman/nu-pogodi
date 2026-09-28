import { createClient } from '@supabase/supabase-js';
export const cloudEnabled=!!import.meta.env.VITE_SUPABASE_URL;
export const cloud=cloudEnabled?createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,detectSessionInUrl:false,autoRefreshToken:true}}):null;
let login:Promise<void>|undefined;
export function ensureSession(){
 return login??= (async()=>{const {error}=await cloud!.auth.signInAnonymously();if(error)throw error;})().catch(error=>{login=undefined;throw error;});
}
export async function hostConfig(){return cloudEnabled?{publicOrigin:location.origin}:fetch('/api/config').then(r=>r.json());}
export async function createRoom(){
 if(cloudEnabled){await ensureSession();const {data,error}=await cloud!.rpc('np_create_room');if(error)throw error;return data;}
 const response=await fetch('/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 if(!response.ok)throw Error('Не удалось создать комнату');return response.json();
}
export function controllerUrl(origin:string,id:string,key:string){
 return cloudEnabled?`${origin}${import.meta.env.BASE_URL}?controller=1#room=${id}&key=${key}`:`${origin}/controller#room=${id}&key=${key}`;
}
