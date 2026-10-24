let pose;
self.onmessage=async e=>{
  if(e.data.type==='init'){
    try{
      const {FilesetResolver,PoseLandmarker}=await import('./vendor/mediapipe/vision_bundle.mjs');
      const files=await FilesetResolver.forVisionTasks('./vendor/mediapipe/wasm');
      pose=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'./assets/models/pose_landmarker_lite.task',delegate:'CPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.55,minPosePresenceConfidence:.55,minTrackingConfidence:.55});
      self.postMessage({type:'ready'});
    }catch(e){self.postMessage({type:'error',message:String(e)});}
  }
  if(e.data.type==='frame'){
    const frame=e.data.frame;
    try{const result=pose.detectForVideo(frame,e.data.at);self.postMessage({type:'pose',points:result.landmarks[0]||[],at:e.data.at});}
    catch(e){self.postMessage({type:'error',message:String(e)});}finally{frame.close();}
  }
};
