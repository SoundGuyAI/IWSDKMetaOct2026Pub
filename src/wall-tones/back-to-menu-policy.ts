export type BackToMenuWorldKind = 'hub-vr' | 'walltones-ar';

/**
 * Pure #58 policy: in-session Back to menu never destroys the active world.
 * Full hub reboot remains available via `switchBackToHubMenu` for rare exits.
 */
export function backToMenuDestroysWorld(_kind: BackToMenuWorldKind): boolean {
  return false;
}
