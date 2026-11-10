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
