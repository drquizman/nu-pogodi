/// <reference lib="webworker" />
import { FilesetResolver, PoseLandmarker, GestureRecognizer } from '@mediapipe/tasks-vision';
let pose:PoseLandmarker, gesture:GestureRecognizer, lastGesture=-Infinity;
self.onmessage=async(e:MessageEvent)=>{
 if(e.data.type==='init'){
  try{
   const files=await FilesetResolver.forVisionTasks(import.meta.env.BASE_URL+'wasm');
   pose=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:import.meta.env.BASE_URL+'models/pose_landmarker_lite.task',delegate:'CPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.6,minPosePresenceConfidence:.6,minTrackingConfidence:.6});
   gesture=await GestureRecognizer.createFromOptions(files,{baseOptions:{modelAssetPath:import.meta.env.BASE_URL+'models/gesture_recognizer.task',delegate:'CPU'},runningMode:'VIDEO',numHands:2,cannedGesturesClassifierOptions:{categoryAllowlist:['Open_Palm'],scoreThreshold:.7}});
   self.postMessage({type:'ready'});
  }catch(error){self.postMessage({type:'error',message:String(error)});}
 }
 if(e.data.type==='frame'){
  const frame=e.data.frame as ImageBitmap;
  try{
   const result=pose.detectForVideo(frame,e.data.at);
   let palm:boolean|undefined;
   // Hand inference only in the lobby, at 5 Hz; no extra work during play.
   if(e.data.gestures && e.data.at-lastGesture>=200){lastGesture=e.data.at;palm=gesture.recognizeForVideo(frame,e.data.at).gestures.some(hand=>hand.some(g=>g.categoryName==='Open_Palm'&&g.score>=.7));}
   self.postMessage({type:'pose',points:result.landmarks[0]||[],palm});
  }catch(error){self.postMessage({type:'error',message:String(error)});}finally{frame.close();}
 }
};
