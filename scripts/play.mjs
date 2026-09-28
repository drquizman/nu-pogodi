import { spawn } from 'node:child_process';
import { mkdir, access, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const windows=process.platform==='win32';
if(!windows)throw Error('This launcher targets Windows. See README for server deployment.');
await mkdir('.runtime',{recursive:true});
const binary=resolve('.runtime/cloudflared.exe');
try{await access(binary);}catch{
 console.log('Downloading Cloudflare Tunnel for a secure phone-camera connection…');
 const response=await fetch('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe');
 if(!response.ok)throw Error(`Download failed: ${response.status}`);
 await writeFile(binary,Buffer.from(await response.arrayBuffer()));
}
const tunnel=spawn(binary,['tunnel','--url','http://127.0.0.1:17891','--no-autoupdate'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let started=false,server;let log='';
const cleanup=()=>{server?.kill();tunnel.kill();};
process.on('SIGINT',()=>{cleanup();process.exit();});process.on('SIGTERM',()=>{cleanup();process.exit();});
const timer=setTimeout(()=>{if(!started){console.error('Could not obtain HTTPS address. Check your internet connection and try again.');cleanup();process.exitCode=1;}},60000);
function output(data){log=(log+data.toString()).slice(-12000);const match=log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(match&&!started){started=true;clearTimeout(timer);const url=match[0];
 server=spawn(process.execPath,['--import','tsx','server/index.ts','--production'],{env:{...process.env,PUBLIC_ORIGIN:url},windowsHide:true,stdio:['ignore','pipe','pipe']});
 server.stderr.pipe(process.stderr);server.stdout.on('data',chunk=>{process.stdout.write(chunk);if(chunk.toString().includes('http://localhost')){console.log(`\nOPEN GAME: ${url}\nScan the QR with Android. Keep this window open.\n`);void writeFile('.runtime/url.txt',url);}});
 server.on('exit',code=>{tunnel.kill();if(code)process.exitCode=code;});
}}
tunnel.stdout.on('data',output);tunnel.stderr.on('data',output);tunnel.on('error',error=>{console.error(error.message);cleanup();});tunnel.on('exit',code=>{if(!started)console.error(log);clearTimeout(timer);server?.kill();if(code)process.exitCode=code;});
