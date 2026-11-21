/**
 * Invisible depth-only hand occluders for the Rift Lab.
 *
 * Real passthrough hands do not write the WebGL depth buffer, so orbiting
 * notes always drew on top. These occluders write depth with color off:
 * capsules along every finger bone plus a fitted palm hull, so note meshes
 * that depth-test get tucked behind the whole hand, not just joint spheres.
 */
import {
  CapsuleGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Camera,
} from '@iwsdk/core';
import { type PalmPose } from './rift-hands.js';

/** WebXR joint indices in spec order (XRHand size is 25). The sparse
 * HAND_JOINT map in rift-hands.ts only covers what the pose math needs. */
const J = {
  wrist: 0,
  thumbMeta: 1,
  thumbProx: 2,
  thumbDist: 3,
  thumbTip: 4,
  indexMeta: 5,
  indexProx: 6,
  indexInter: 7,
  indexDist: 8,
  indexTip: 9,
  middleMeta: 10,
  middleProx: 11,
  middleInter: 12,
  middleDist: 13,
  middleTip: 14,
  ringMeta: 15,
  ringProx: 16,
  ringInter: 17,
  ringDist: 18,
  ringTip: 19,
  pinkyMeta: 20,
  pinkyProx: 21,
  pinkyInter: 22,
  pinkyDist: 23,
  pinkyTip: 24,
} as const;

/**
 * One depth capsule per finger bone. r/len are nominal meters for an
 * average hand; each hand is uniformly rescaled per frame from its live
 * wrist-to-middle-metacarpal span so the fixed geometries keep round caps.
 */
export const OCCLUDER_BONES: readonly {
  a: number;
  b: number;
  r: number;
  len: number;
}[] = [
  // thumb
  { a: J.thumbMeta, b: J.thumbProx, r: 0.013, len: 0.038 },
  { a: J.thumbProx, b: J.thumbDist, r: 0.012, len: 0.03 },
  { a: J.thumbDist, b: J.thumbTip, r: 0.011, len: 0.027 },
  // index
  { a: J.indexMeta, b: J.indexProx, r: 0.0105, len: 0.042 },
  { a: J.indexProx, b: J.indexInter, r: 0.0095, len: 0.027 },
  { a: J.indexInter, b: J.indexDist, r: 0.0085, len: 0.024 },
  { a: J.indexDist, b: J.indexTip, r: 0.008, len: 0.022 },
  // middle
  { a: J.middleMeta, b: J.middleProx, r: 0.0105, len: 0.044 },
  { a: J.middleProx, b: J.middleInter, r: 0.0095, len: 0.029 },
  { a: J.middleInter, b: J.middleDist, r: 0.0085, len: 0.025 },
  { a: J.middleDist, b: J.middleTip, r: 0.008, len: 0.023 },
  // ring
  { a: J.ringMeta, b: J.ringProx, r: 0.01, len: 0.04 },
  { a: J.ringProx, b: J.ringInter, r: 0.009, len: 0.026 },
  { a: J.ringInter, b: J.ringDist, r: 0.008, len: 0.023 },
  { a: J.ringDist, b: J.ringTip, r: 0.0075, len: 0.021 },
  // pinky
  { a: J.pinkyMeta, b: J.pinkyProx, r: 0.009, len: 0.034 },
  { a: J.pinkyProx, b: J.pinkyInter, r: 0.008, len: 0.021 },
  { a: J.pinkyInter, b: J.pinkyDist, r: 0.007, len: 0.019 },
  { a: J.pinkyDist, b: J.pinkyTip, r: 0.0065, len: 0.018 },
];

/** Nominal wrist to middle-metacarpal span the bone geometries size for. */
export const NOMINAL_WRIST_TO_PALM_M = 0.085;

/** Uniform hand scale from the live wrist to middle-metacarpal span. */
export function handScaleFromJoints(joints: ArrayLike<number>): number {
  const dx = joints[J.middleMeta * 3]! - joints[J.wrist * 3]!;
  const dy = joints[J.middleMeta * 3 + 1]! - joints[J.wrist * 3 + 1]!;
  const dz = joints[J.middleMeta * 3 + 2]! - joints[J.wrist * 3 + 2]!;
  const span = Math.hypot(dx, dy, dz);
  if (!(span > 0.01)) return 1;
  return span / NOMINAL_WRIST_TO_PALM_M;
}

/** Fitted palm hull: an ellipsoid over the wrist and four metacarpals. */
export type PalmHull = {
  center: [number, number, number];
  /** Across the palm (index metacarpal toward pinky metacarpal). */
  xAxis: [number, number, number];
  /** Wrist toward the fingers. */
  yAxis: [number, number, number];
  /** Palm normal. */
  zAxis: [number, number, number];
  halfX: number;
  halfY: number;
  halfZ: number;
};

function jointAt(joints: ArrayLike<number>, i: number): [number, number, number] {
  return [joints[i * 3]!, joints[i * 3 + 1]!, joints[i * 3 + 2]!];
}

function sub(a: readonly [number, number, number], b: readonly [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function len(v: readonly [number, number, number]): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function norm(v: readonly [number, number, number]): [number, number, number] | null {
  const l = len(v);
  if (l < 1e-6) return null;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross(a: readonly [number, number, number], b: readonly [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Fit the palm hull from the wrist and the index/middle/pinky metacarpals.
 * Returns null when the joints are too degenerate to orient a hull.
 */
export function computePalmHull(joints: ArrayLike<number>): PalmHull | null {
  const wrist = jointAt(joints, J.wrist);
  const indexM = jointAt(joints, J.indexMeta);
  const middleM = jointAt(joints, J.middleMeta);
  const pinkyM = jointAt(joints, J.pinkyMeta);
  const across = sub(pinkyM, indexM);
  const along = sub(middleM, wrist);
  const x = norm(across);
  const y0 = norm(along);
  if (x == null || y0 == null) return null;
  const z = norm(cross(x, y0));
  if (z == null) return null;
  // Re-orthogonalize y against the palm normal so the basis stays clean
  // when the hand is half curled.
  const y = norm(cross(z, x));
  if (y == null) return null;
  return {
    center: [
      (wrist[0] + indexM[0] + middleM[0] + pinkyM[0]) / 4,
      (wrist[1] + indexM[1] + middleM[1] + pinkyM[1]) / 4,
      (wrist[2] + indexM[2] + middleM[2] + pinkyM[2]) / 4,
    ],
    xAxis: x,
    yAxis: y,
    zAxis: z,
    halfX: len(across) * 0.62,
    halfY: len(along) * 0.68,
    halfZ: 0.024,
  };
}

const sharedSphereGeo = new SphereGeometry(1, 12, 10);
/** One capsule geometry per bone, shared by both hands. */
const boneGeos = OCCLUDER_BONES.map(
  (spec) => new CapsuleGeometry(spec.r, spec.len, 3, 8),
);

/** Shared depth-only material. Quest WebGL often ignores Material.colorWrite,
 * so we also drive Three's color-mask cache around each draw. */
const sharedOccluderMat = new MeshBasicMaterial({
  color: 0x000000,
  transparent: false,
  opacity: 1,
  colorWrite: false,
  depthWrite: true,
  depthTest: true,
  toneMapped: false,
});
sharedOccluderMat.colorWrite = false;

function bindDepthOnlyPass(mesh: Mesh): void {
  mesh.onBeforeRender = (renderer) => {
    // Update Three's cache — raw gl.colorMask leaves the next colorWrite:false
    // draw skipping its GL call and writing color again.
    renderer.state.buffers.color.setMask(false);
  };
  mesh.onAfterRender = (renderer) => {
    renderer.state.buffers.color.setMask(true);
  };
}

const Y_AXIS = new Vector3(0, 1, 0);

/** One hand's occluder meshes: bone capsules + palm hull. */
type HandRig = {
  capsules: Mesh[];
  hull: Mesh;
};

export class RiftHandOccluders {
  readonly root = new Group();
  private readonly left: HandRig;
  private readonly right: HandRig;
  private readonly pa = new Vector3();
  private readonly pb = new Vector3();
  private readonly dir = new Vector3();
  private readonly basis = new Matrix4();

  constructor() {
    this.root.name = 'RiftHandOccluders';
    this.left = this.buildHand();
    this.right = this.buildHand();
  }

  private prep(mesh: Mesh): Mesh {
    mesh.name = 'RiftHandOccluder';
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = -10;
    // Never participate in beam / pointer raycasts.
    mesh.raycast = () => {};
    bindDepthOnlyPass(mesh);
    this.root.add(mesh);
    return mesh;
  }

  private buildHand(): HandRig {
    const capsules = boneGeos.map((geo) => this.prep(new Mesh(geo, sharedOccluderMat)));
    const hull = this.prep(new Mesh(sharedSphereGeo, sharedOccluderMat));
    return { capsules, hull };
  }

  private syncHand(rig: HandRig, palm: PalmPose | null): void {
    if (palm == null) {
      for (const m of rig.capsules) m.visible = false;
      rig.hull.visible = false;
      return;
    }
    const joints = palm.joints;
    const s = handScaleFromJoints(joints);
    for (let i = 0; i < OCCLUDER_BONES.length; i++) {
      const spec = OCCLUDER_BONES[i]!;
      // PalmPose.joints is packed xyz per joint (not matrices).
      this.pa.set(joints[spec.a * 3]!, joints[spec.a * 3 + 1]!, joints[spec.a * 3 + 2]!);
      this.pb.set(joints[spec.b * 3]!, joints[spec.b * 3 + 1]!, joints[spec.b * 3 + 2]!);
      this.dir.subVectors(this.pb, this.pa);
      const boneLen = this.dir.length();
      const mesh = rig.capsules[i]!;
      if (boneLen < 1e-5) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.addVectors(this.pa, this.pb).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(Y_AXIS, this.dir.multiplyScalar(1 / boneLen));
      mesh.scale.setScalar(s);
    }
    const hull = computePalmHull(joints);
    if (hull == null) {
      rig.hull.visible = false;
      return;
    }
    rig.hull.visible = true;
    rig.hull.position.set(hull.center[0], hull.center[1], hull.center[2]);
    this.basis.makeBasis(
      new Vector3(...hull.xAxis),
      new Vector3(...hull.yAxis),
      new Vector3(...hull.zAxis),
    );
    rig.hull.quaternion.setFromRotationMatrix(this.basis);
    rig.hull.scale.set(hull.halfX, hull.halfY, hull.halfZ);
  }

  update(left: PalmPose | null, right: PalmPose | null): void {
    this.syncHand(this.left, left);
    this.syncHand(this.right, right);
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}

/** Soft front/back fade for a hand-orbit note (1 = toward camera, 0 = behind). */
export function noteFrontVisibility(
  noteX: number,
  noteY: number,
  noteZ: number,
  palm: PalmPose | null,
  camera: Camera,
  scratchPalm: Vector3,
  scratchCam: Vector3,
  scratchNote: Vector3,
): number {
  if (palm == null) return 1;
  scratchPalm.set(palm.center[0], palm.center[1], palm.center[2]);
  camera.getWorldPosition(scratchCam).sub(scratchPalm);
  const camLen = scratchCam.length();
  if (camLen < 1e-4) return 1;
  scratchCam.multiplyScalar(1 / camLen);
  scratchNote.set(noteX, noteY, noteZ).sub(scratchPalm);
  const noteLen = scratchNote.length();
  if (noteLen < 1e-4) return 1;
  scratchNote.multiplyScalar(1 / noteLen);
  // +1 note toward camera, -1 note behind the palm.
  const facing = scratchNote.dot(scratchCam);
  // Keep notes on the near hemisphere; fade across the silhouette edge.
  return Math.max(0, Math.min(1, (facing + 0.15) / 0.55));
}
