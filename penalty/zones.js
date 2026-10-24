export const BALL_RADIUS=.43;
export const KEEPER_Z=-6.04;
const rows=[['QWER','йцук',1.96,'верх'],['ASDF','фыва',1.22,'середина'],['ZXCV','ячсм',.45,'низ']];
// Columns run left to right on the screen when looking from behind the goal.
export const ZONES=rows.flatMap(([latin,cyrillic,y,rowName],row)=>[...latin].map((key,col)=>({
  index:row*4+col,row,col,key,ru:cyrillic[col],code:'Key'+key,
  x:[2.85,.95,-.95,-2.85][col],y,z:KEEPER_Z,
  hands:col===0||col===3?2:1,
  label:`${rowName}, ${col+1}-я точка`,
})));
export function zoneForKey(event){
  if(event.ctrlKey||event.metaKey||event.altKey)return undefined;
  return ZONES.find(z=>z.code===event.code)||ZONES.find(z=>z.key.toLowerCase()===event.key?.toLowerCase()||z.ru===event.key?.toLowerCase());
}
// The enlarged ball may overlap neighbouring poses. A discrete shot can only
// be saved by the matching zone, after the defense animation has reached it.
export function canSaveShot(shotZone,defenseZone,weight){
  return shotZone===null||(shotZone===defenseZone&&weight>=.7);
}
export function defenseWeight(defense,time){
  if(!defense)return 0;
  const smooth=u=>{u=Math.max(0,Math.min(1,u));return u*u*(3-2*u);};
  const end=defense.releaseAt===null?Infinity:Math.max(defense.start+1.7,defense.releaseAt+.30);
  return smooth((time-defense.start)/.22)*(1-smooth((time-end)/.30));
}
