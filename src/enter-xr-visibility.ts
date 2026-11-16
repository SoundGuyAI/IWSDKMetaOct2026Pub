/** Keep Enter XR off mobile flat menus; leave desktop and Quest unchanged. */
export function enterXrButtonVisible(
  is2D: boolean,
  xrEnabled: boolean,
  compactPhoneViewport: boolean,
  userAgent = '',
): boolean {
  const headset = /Quest|Oculus/i.test(userAgent);
  const mobile = !headset && /iPhone|iPad|iPod|Android/i.test(userAgent);
  return is2D && xrEnabled && !mobile && (!compactPhoneViewport || headset);
}

/**
 * Gaze + pinch settings rows are VR-headset only (Oded, 2026-11-15): the
 * two gaze options stay hidden on PC and phone menus, where gaze input
 * does not exist. The Quest browser keeps them, flat or immersive, since
 * that is where head/eye gaze + pinch actually works.
 */
export function gazePinchSettingsVisible(userAgent = ''): boolean {
  return /Quest|Oculus/i.test(userAgent);
}
