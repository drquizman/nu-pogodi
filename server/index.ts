import express from 'express';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { resolve } from 'node:path';
const app = express(); const server = createServer(app);
const production = process.argv.includes('--production');
const port = Number(process.env.PORT || 17891);
const bindHost = process.env.HOST || '127.0.0.1';
function validOrigin(origin:string|undefined, host:string|undefined) {
  if(!origin)return true;
  try { const url=new URL(origin); return ['http:','https:'].includes(url.protocol) && url.host===host; }
  catch { return false; }
}
type Room = { hostKey:string; joinKey:string; host?:WebSocket; phone?:WebSocket; touched:number };
const rooms = new Map<string,Room>();
const key = () => randomBytes(24).toString('base64url');
const equal = (a:unknown,b:string) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
const send = (ws:WebSocket|undefined, msg:unknown) => { if(ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 32768) ws.send(JSON.stringify(msg)); };
app.disable('x-powered-by');
app.use((_req,res,next)=>{ res.setHeader('Referrer-Policy','no-referrer'); res.setHeader('Permissions-Policy','camera=(self), microphone=()'); res.setHeader('X-Content-Type-Options','nosniff'); next(); });
app.use(express.json({limit:'2kb'}));
app.get('/healthz',(_req,res)=>res.json({status:'ok'}));
app.get('/api/config',(_req,res)=>res.json({ publicOrigin:process.env.PUBLIC_ORIGIN || '' }));
app.post('/api/rooms',(req,res)=>{
  if (!req.is('application/json')) { res.sendStatus(415); return; }
  if (!validOrigin(req.headers.origin,req.headers.host)) { res.sendStatus(403); return; }
  if (rooms.size >= 200) { res.status(429).json({error:'Слишком много комнат. Попробуйте позже.'}); return; }
  const id = randomBytes(6).toString('hex'); const room = {hostKey:key(),joinKey:key(),touched:Date.now()}; rooms.set(id,room);
  res.setHeader('Cache-Control','no-store'); res.json({id,hostKey:room.hostKey,joinKey:room.joinKey});
});
const wss = new WebSocketServer({noServer:true,maxPayload:4096});
server.on('upgrade',(req,socket,head)=>{
  if (req.url !== '/ws' || !validOrigin(req.headers.origin,req.headers.host)) { socket.destroy(); return; }
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
});
wss.on('connection',ws=>{
  let room:Room|undefined; let role:'host'|'phone'|undefined; let windowAt=Date.now(), count=0;
  let alive = true; ws.on('pong',()=>alive=true);
  const heartbeat = setInterval(()=>{ if(!alive) { ws.terminate(); return; } alive=false; ws.ping(); },15000);
  const timeout = setTimeout(()=>{if(!room) ws.close(1008,'join timeout');},8000);
  ws.on('message',data=>{
    const now=Date.now(); if(now-windowAt>1000){windowAt=now;count=0;} if(++count>80){ws.close(1008,'rate');return;}
    let msg:any; try{msg=JSON.parse(data.toString());}catch{return;} if(!msg || typeof msg!=='object' || Array.isArray(msg))return;
    if (!room) {
      const candidate=rooms.get(msg.room);
      if(msg.type!=='join'||!candidate||!['host','phone'].includes(msg.role)||!equal(msg.key,msg.role==='host'?candidate.hostKey:candidate.joinKey)){ws.close(1008,'room');return;}
      role=msg.role; room=candidate;
      const previous=room[role!]; if(previous && previous!==ws) previous.close(4001,'replaced');
      room[role!]=ws; room.touched=now; clearTimeout(timeout);
      send(ws,{type:'joined'}); send(room.host,{type:'peer',connected:room.phone?.readyState===1}); send(room.phone,{type:'host',connected:room.host?.readyState===1}); return;
    }
    room.touched=now;
    if(msg.type==='ping'){send(ws,{type:'pong',at:msg.at});return;}
    if(role==='phone' && msg.type==='pose' && Number.isInteger(msg.lane) && msg.lane>=0 && msg.lane<=3 && typeof msg.tracked==='boolean') {
      send(room.host,{type:'pose',lane:msg.lane,tracked:msg.tracked,calibrated:msg.calibrated===true,seq:Number.isSafeInteger(msg.seq)?msg.seq:0,at:now});
    } else if(role==='phone' && msg.type==='action' && ['start','pause','resume'].includes(msg.action)) send(room.host,{type:'action',action:msg.action});
    else if(role==='host' && msg.type==='state') send(room.phone,{type:'state',phase:msg.phase,score:msg.score,misses:msg.misses,reason:String(msg.reason||'').slice(0,140),input:msg.input==='motion'?'motion':'keyboard',lane:msg.lane,poseSeq:Number.isSafeInteger(msg.poseSeq)?msg.poseSeq:0});
  });
  ws.on('error',()=>{});
  ws.on('close',()=>{clearTimeout(timeout);clearInterval(heartbeat);if(room&&role&&room[role]===ws){room[role]=undefined;send(room.host,{type:'peer',connected:!!room.phone});send(room.phone,{type:'host',connected:!!room.host});}});
});
setInterval(()=>{for(const [id,r]of rooms){if(Date.now()-r.touched>3600000){r.host?.close();r.phone?.close();rooms.delete(id);}}},60000).unref();
if(production){app.use(express.static(resolve('dist')));app.get('/{*path}',(_req,res)=>res.sendFile(resolve('dist/index.html')));}
else {const {createServer:createVite}=await import('vite');const vite=await createVite({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}
server.listen(port,bindHost,()=>console.log(`Ну, погоди! http://${bindHost}:${port}`));
