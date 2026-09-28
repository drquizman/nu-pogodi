import type { Lane } from './game';
export const basketEnds = [[350,245],[350,365],[610,245],[610,365]] as const;
// Measured open-rim heights in the complete paired illustrations.
const rimUpper=205, rimLower=520;
const scale=(basketEnds[1][1]-basketEnds[0][1])/(rimLower-rimUpper);
const top=basketEnds[0][1]-rimUpper*scale;
export function wolfPose(lane:Lane){
 const low=lane%2===1;
 return {sourceX:low?825:0,width:low?711:825,cellOrigin:low?768:0,
  facing:lane>=2?1:-1,scale,top,rimY:low?rimLower:rimUpper};
}
