/// <reference lib="webworker" />
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
let pose:PoseLandmarker;
self.onmessage=async(e:MessageEvent)=>{
 if(e.data.type==='init'){try{const files=await FilesetResolver.forVisionTasks(import.meta.env.BASE_URL+'wasm');pose=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:import.meta.env.BASE_URL+'models/pose_landmarker_lite.task',delegate:'CPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.6,minPosePresenceConfidence:.6,minTrackingConfidence:.6});self.postMessage({type:'ready'});}catch(error){self.postMessage({type:'error',message:String(error)});}}
 if(e.data.type==='frame'){const frame=e.data.frame as ImageBitmap;try{const result=pose.detectForVideo(frame,e.data.at);self.postMessage({type:'pose',points:result.landmarks[0]||[]});}catch(error){self.postMessage({type:'error',message:String(error)});}finally{frame.close();}}
};
