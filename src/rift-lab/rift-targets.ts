/**
 * Shared, read-only view of where open rifts are, so the panel system can
 * swing the Rift Lab panel aside when a hand ray points at a rift through it
 * (same idea as the setup window's ray dodge). Written by RiftLabSystem.
 */
export const riftTargetPositions: { x: number; y: number; z: number }[] = [];
