type Range = { min:number; max:number; step?:number };
type CameraCapabilities = MediaTrackCapabilities & { zoom?:Range; resizeMode?:string[] };
type CameraSettings = MediaTrackSettings & { zoom?:number; resizeMode?:string };
type CameraConstraints = MediaTrackConstraints & { resizeMode?:ConstrainDOMString };
export function cameraConstraints(deviceId?:string): CameraConstraints {
  // Prefer a native, uncropped camera format. Resolution is not field of view.
  return { ...(deviceId?{deviceId:{exact:deviceId}}:{facingMode:{ideal:'user'}}),
    width:{ideal:640},height:{ideal:480},frameRate:{ideal:20,max:30},resizeMode:{ideal:'none'} };
}
export async function widestView(track:MediaStreamTrack):Promise<string> {
  const caps:CameraCapabilities=track.getCapabilities?.()||{};
  const constraints=track.getConstraints();
  if(caps.resizeMode?.includes('none')) {
    try { await track.applyConstraints({...constraints,resizeMode:'none'} as MediaTrackConstraints); } catch { /* Camera may only expose scaled formats. */ }
  }
  if(caps.zoom && Number.isFinite(caps.zoom.min)) {
    try { await track.applyConstraints({...track.getConstraints(),advanced:[{zoom:caps.zoom.min} as MediaTrackConstraintSet]}); }
    catch { return 'Браузер не разрешил изменить масштаб. Можно выбрать другую камеру.'; }
    const settings=track.getSettings() as CameraSettings;
    if(settings.zoom!==undefined && Math.abs(settings.zoom-caps.zoom.min)<.01) return `Минимальный масштаб этой камеры: ${settings.zoom}×. Для более широкого обзора выбери другой объектив, если он есть в списке.`;
    return 'Минимальный масштаб запрошен, но браузер не подтвердил его значение.';
  }
  return 'Масштаб этой камеры недоступен браузеру. Если есть широкоугольный объектив, выбери его в списке камер.';
}
