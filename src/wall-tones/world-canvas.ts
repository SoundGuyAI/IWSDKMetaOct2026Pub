/**
 * world.destroy() leaves the world's canvas in the scene container. A stale
 * canvas on top of the next world's canvas swallows pointer events, so after an
 * XR session the menu looks alive but never reacts. Remove it with the world.
 */
export function removeDestroyedWorldCanvas(
  canvas: { isConnected: boolean; remove(): void } | null | undefined,
): boolean {
  if (canvas == null || !canvas.isConnected) {
    return false;
  }
  canvas.remove();
  return true;
}
