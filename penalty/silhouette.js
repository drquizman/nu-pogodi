export function drawSilhouette(canvas,points,width=640,height=480){
  canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
  const valid=i=>points[i]&&(points[i].visibility??0)>=.5;
  const point=i=>[points[i].x*width,points[i].y*height];
  ctx.clearRect(0,0,width,height);ctx.fillStyle='#d9f48f';ctx.strokeStyle='#d9f48f';ctx.lineCap='round';ctx.lineJoin='round';
  const shoulder=valid(11)&&valid(12)?Math.hypot(...point(11).map((v,i)=>v-point(12)[i])):width*.2;
  if([11,12,24,23].every(valid)){
    ctx.beginPath();[11,12,24,23].forEach((n,i)=>ctx[i?'lineTo':'moveTo'](...point(n)));ctx.closePath();ctx.fill();
  }
  ctx.lineWidth=Math.max(width*.025,shoulder*.19);
  for(const [a,b]of [[11,12],[11,13],[13,15],[12,14],[14,16],[23,25],[25,27],[24,26],[26,28],[11,23],[12,24]]){
    if(!valid(a)||!valid(b))continue;ctx.beginPath();ctx.moveTo(...point(a));ctx.lineTo(...point(b));ctx.stroke();
  }
  if(valid(0)){ctx.beginPath();ctx.arc(...point(0),Math.max(width*.025,shoulder*.23),0,Math.PI*2);ctx.fill();}
}
