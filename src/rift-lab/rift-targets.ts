/**
 * Shared, read-only view of where open rifts are, so the panel system can
 * swing the Rift Lab panel aside when a hand ray points at a rift through it
 * (same idea as the setup window's ray dodge). Written by RiftLabSystem.
 */
export const riftTargetPositions: { x: number; y: number; z: number }[] = [];

/**
 * Open-hand aim rays (world space), published each frame by RiftLabSystem
 * from the tracked palms. The beam aims along the palm direction, not the UI
 * pointer ray, so the panel dodge must read these (the 00:19 Quest test:
 * a dodge keyed to the UI ray never triggered while aiming with a palm).
 */
export const riftAimRays: {
  ox: number; oy: number; oz: number;
  dx: number; dy: number; dz: number;
}[] = [];
