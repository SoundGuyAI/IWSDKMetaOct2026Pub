/**
 * Invisible depth-only hand occluders for the Rift Lab.
 *
 * Real passthrough hands do not write the WebGL depth buffer, so orbiting
 * notes always drew on top. These joint spheres write depth with color off,
 * so note meshes that depth-test get tucked behind the hand.
 */
import {
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
  type Camera,
} from '@iwsdk/core';
import { HAND_JOINT, type PalmPose } from './rift-hands.js';

/** WebXR thumb-tip joint index (not listed on the sparse HAND_JOINT map). */
const THUMB_TIP = 4;

/** Joints that cover palm + fingers well enough for note occlusion. */
const OCCLUDER_JOINTS: readonly { index: number; radius: number }[] = [
  { index: HAND_JOINT.wrist, radius: 0.028 },
  { index: HAND_JOINT.indexProximal, radius: 0.016 },
  { index: HAND_JOINT.indexTip, radius: 0.012 },
  { index: HAND_JOINT.middleMetacarpal, radius: 0.022 },
  { index: HAND_JOINT.middleProximal, radius: 0.016 },
  { index: HAND_JOINT.middleTip, radius: 0.012 },
  { index: HAND_JOINT.ringProximal, radius: 0.015 },
  { index: HAND_JOINT.ringTip, radius: 0.011 },
  { index: HAND_JOINT.pinkyProximal, radius: 0.014 },
  { index: HAND_JOINT.pinkyTip, radius: 0.01 },
  { index: THUMB_TIP, radius: 0.014 },
];

const sharedGeo = new SphereGeometry(1, 10, 8);

/** Depth-only joint proxy. Quest WebGL often ignores Material.colorWrite, so
 * these used to draw as solid white spheres (visible against the menu). Force
 * the GL color mask off around each draw instead. */
function makeOccluderMaterial(): MeshBasicMaterial {
  const mat = new MeshBasicMaterial({
    color: 0x000000,
    transparent: false,
    opacity: 1,
    colorWrite: false,
    depthWrite: true,
    depthTest: true,
    toneMapped: false,
  });
  mat.colorWrite = false;
  return mat;
}

function bindDepthOnlyPass(mesh: Mesh): void {
  mesh.onBeforeRender = (renderer) => {
    const gl = renderer.getContext();
    gl.colorMask(false, false, false, false);
  };
  mesh.onAfterRender = (renderer) => {
    const gl = renderer.getContext();
    gl.colorMask(true, true, true, true);
  };
}

export class RiftHandOccluders {
  readonly root = new Group();
  private readonly left: Mesh[];
  private readonly right: Mesh[];

  constructor() {
    this.root.name = 'RiftHandOccluders';
    this.left = this.buildHand();
    this.right = this.buildHand();
  }

  private buildHand(): Mesh[] {
    const meshes: Mesh[] = [];
    for (const spec of OCCLUDER_JOINTS) {
      const mesh = new Mesh(sharedGeo, makeOccluderMaterial());
      mesh.name = 'RiftHandOccluder';
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = -10;
      // Never participate in beam / pointer raycasts.
      mesh.raycast = () => {};
      bindDepthOnlyPass(mesh);
      mesh.scale.setScalar(spec.radius);
      this.root.add(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }

  private syncHand(meshes: Mesh[], palm: PalmPose | null): void {
    if (palm == null) {
      for (const m of meshes) m.visible = false;
      return;
    }
    const joints = palm.joints;
    for (let i = 0; i < OCCLUDER_JOINTS.length; i++) {
      const idx = OCCLUDER_JOINTS[i].index;
      const o = idx * 3;
      // PalmPose.joints is packed xyz per joint (not matrices).
      const mesh = meshes[i];
      mesh.visible = true;
      mesh.position.set(joints[o], joints[o + 1], joints[o + 2]);
      mesh.scale.setScalar(OCCLUDER_JOINTS[i].radius);
    }
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
