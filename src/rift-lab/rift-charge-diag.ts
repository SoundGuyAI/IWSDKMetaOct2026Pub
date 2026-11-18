/**
 * Read-only diagnostics for the Rift Lab charge-orbit cloud (WALL_TONES_TODO
 * item 118: white cloud at the session-start pose). Nothing here changes what
 * is drawn. It reports where the visible charge notes are relative to the
 * head and the tracked palms, so a headset run can say whether the cloud is
 * parked at the start pose or riding a hand.
 */
export type Vec3 = readonly [number, number, number];

export interface ChargeCloudDiagInput {
  immersive: boolean;
  /** Tracked palm centers (null = no palm pose this frame). */
  leftPalm: Vec3 | null;
  rightPalm: Vec3 | null;
  head: Vec3;
  /** Total charge notes in the model. */
  totalNotes: number;
  /** World positions of note meshes that are actually visible this frame. */
  visibleNotePositions: readonly Vec3[];
}

export interface ChargeCloudDiag {
  immersive: boolean;
  leftTracked: boolean;
  rightTracked: boolean;
  totalNotes: number;
  visibleNotes: number;
  centroid: Vec3 | null;
  /** Centroid distance from the head, meters. */
  centroidFromHeadM: number | null;
  /** Centroid distance from the nearest tracked palm, meters. */
  centroidFromPalmM: number | null;
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function summarizeChargeCloud(input: ChargeCloudDiagInput): ChargeCloudDiag {
  const n = input.visibleNotePositions.length;
  let centroid: Vec3 | null = null;
  if (n > 0) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const p of input.visibleNotePositions) {
      x += p[0];
      y += p[1];
      z += p[2];
    }
    centroid = [x / n, y / n, z / n];
  }
  const palms = [input.leftPalm, input.rightPalm].filter(
    (p): p is Vec3 => p != null,
  );
  let fromPalm: number | null = null;
  if (centroid != null && palms.length > 0) {
    fromPalm = Math.min(...palms.map((p) => dist(centroid as Vec3, p)));
  }
  return {
    immersive: input.immersive,
    leftTracked: input.leftPalm != null,
    rightTracked: input.rightPalm != null,
    totalNotes: input.totalNotes,
    visibleNotes: n,
    centroid,
    centroidFromHeadM: centroid != null ? dist(centroid, input.head) : null,
    centroidFromPalmM: fromPalm,
  };
}

/** One short line for the Lab panel (opt-in via ?riftDiag=1). */
export function formatChargeCloudDiag(d: ChargeCloudDiag): string {
  const m = (v: number | null): string => (v == null ? 'n/a' : `${v.toFixed(2)} m`);
  const hands = `L ${d.leftTracked ? 'tracked' : 'none'}, R ${d.rightTracked ? 'tracked' : 'none'}`;
  return (
    `Diag: ${d.immersive ? 'XR' : 'flat'}, hands ${hands}, ` +
    `charge notes shown ${d.visibleNotes}/${d.totalNotes}, ` +
    `cloud ${m(d.centroidFromHeadM)} from head, ${m(d.centroidFromPalmM)} from palm`
  );
}
