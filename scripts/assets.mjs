import { mkdir, cp, access, writeFile } from 'node:fs/promises';
await mkdir('public/wasm',{recursive:true});
await cp('node_modules/@mediapipe/tasks-vision/wasm','public/wasm',{recursive:true});
await mkdir('public/models',{recursive:true});
try{await access('public/models/pose_landmarker_lite.task');}catch{
 console.log('Downloading the official MediaPipe Pose Landmarker Lite model…');
 const response=await fetch('https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task');
 if(!response.ok)throw Error(`Model download failed: ${response.status}`);
 await writeFile('public/models/pose_landmarker_lite.task',Buffer.from(await response.arrayBuffer()));
}
console.log('Camera model and WASM are ready.');
