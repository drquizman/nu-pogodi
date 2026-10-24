export function drawSilhouette(canvas,points,width=640,height=480,{palms=[],progress=0}={}){
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
  const edges=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
  function hand(points,map,color,lineWidth){
    ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=lineWidth;
    for(const[a,b]of edges){ctx.beginPath();ctx.moveTo(...map(points[a]));ctx.lineTo(...map(points[b]));ctx.stroke();}
    for(const p of points){ctx.beginPath();ctx.arc(...map(p),lineWidth*.75,0,Math.PI*2);ctx.fill();}
  }
  for(const palm of palms)if(palm.points?.length===21)hand(palm.points,p=>[p.x*width,p.y*height],palm.open?'#7affb0':'#f0ce7b',Math.max(2,width/220));
  const found=palms.find(p=>p.open)||palms[0];
  if(found?.points?.length===21){
    const size=Math.min(width,height)*.32,cx=width-size*.7,cy=height-size*.7,r=size*.62,color=found.open?'#7affb0':'#f0ce7b';
    ctx.fillStyle='#102822ee';ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#ffffff33';ctx.lineWidth=5;ctx.stroke();
    if(progress>0){ctx.strokeStyle='#7affb0';ctx.lineWidth=7;ctx.beginPath();ctx.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+progress*Math.PI*2);ctx.stroke();}
    const xs=found.points.map(p=>p.x),ys=found.points.map(p=>p.y),minX=Math.min(...xs),minY=Math.min(...ys),w=Math.max(...xs)-minX,h=Math.max(...ys)-minY,scale=size/Math.max(w,h,.001);
    hand(found.points,p=>[cx+(p.x-minX-w/2)*scale,cy+(p.y-minY-h/2)*scale],color,Math.max(3,width/180));
  }
}
