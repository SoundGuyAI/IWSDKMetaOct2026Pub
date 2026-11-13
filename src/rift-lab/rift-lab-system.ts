/**
 * Rift-sealing Lab mini-game (backlog item 75): IWSDK side.
 *
 * Lab-only prototype reached from the shared Lab menu. Placeholder rifts
 * (four-color fracture, style picked 12:27) spawn in the room; successful
 * notes charge the hands with energy shown as note particles in the four pad
 * colors orbiting both hands, densest on the firing one (his 12:20). Sealing
 * aims a hand-energy beam at a rift: open palm in XR (his 12:15), drag from
 * the fixed charge spot on mobile (settled 12:25). Final animated rift art
 * (particles/shaders/glows) is a later dedicated PR.
 *
 * Settled inputs (13:38): desktop clicks the rift itself with enough energy
 * (notes fly pointer-to-rift, no hold); the enough-energy gate is shared by
 * every platform (SEAL_ENERGY_REQUIRED, number provisional); while a rift is
 * open, score/bars carry a fractional multiplier until cleared (fraction
 * provisional).
 *
 * XR: real hand tracking. When the world is immersive and a hand is tracked,
 * notes orbit the live palm and an open palm fires the beam along the
 * fingers' direction; closing the hand or losing tracking stops it. Palm
 * thresholds and rift placement on real room surfaces are the on-headset
 * tuning this Lab exists for.
 */

import {
  createSystem,
  UIKit,
  UIKitMLAsset,
  VisibilityState,
} from '@iwsdk/core';
import { XRHandVisualAdapter } from '@iwsdk/xr-input';
import { readPalmPose, type PalmPose } from './rift-hands.js';
import {
  AdditiveBlending,
  BufferGeometry,
  CircleGeometry,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import {
  PAD_COLORS,
  PAD_COLOR_NAMES,
  RiftLabGame,
  type PadColorName,
  type Rift,
} from './rift-energy.js';
import { SEAL_ENERGY_REQUIRED } from './rift-energy.js';

/** Virtual hand anchors in flat mode (meters, hub scene space). */
const FLAT_RIGHT_HAND = new Vector3(0.45, 1.35, -1.9);
const FLAT_LEFT_HAND = new Vector3(-0.45, 1.35, -1.9);
/** Fixed mobile charge spot (his settled mobile input): bottom-center drag. */
const CHARGE_SPOT_Y_FRAC = 0.82;
const CHARGE_SPOT_X_TOL_FRAC = 0.25;
/** Placeholder rift ring placement in front of the panel area. */
const RIFT_POSITIONS = [
  new Vector3(1.1, 1.7, -2.4),
  new Vector3(-1.1, 1.6, -2.4),
  new Vector3(0, 2.05, -2.6),
];
const RIFT_RING_RADIUS_M = 0.22;
const RIFT_SPAWN_INTERVAL_MS = 6000;
const MAX_OPEN_RIFTS = 3;
/** Beam hit test: ray-to-rift distance under this counts as contact. */
const BEAM_HIT_RADIUS_M = 0.3;

const NOTE_SIZE_M = 0.03;

export interface RiftLabDebugSnapshot {
  active: boolean;
  running: boolean;
  energy: number;
  noteCount: number;
  openRifts: number;
  modifierActive: boolean;
  beamActive: boolean;
}

declare global {
  interface Window {
    __riftLabDebug?: {
      snapshot: () => RiftLabDebugSnapshot;
      enter: () => void;
      start: () => void;
      playNote: (color: PadColorName, hand?: 'left' | 'right') => void;
      spawnRift: () => void;
      sealFirstRift: () => void;
    };
  }
}

interface RiftView {
  rift: Rift;
  group: Group;
  position: Vector3;
}

export class RiftLabSystem extends createSystem({}) {
  private readonly game = new RiftLabGame();
  private panel: UIKitMLAsset | null = null;
  private statusText: UIKit.Text | null = null;
  private energyText: UIKit.Text | null = null;
  private telemetryText: UIKit.Text | null = null;
  private active = false;
  private running = false;
  private lastSpawnAt = 0;
  private readonly root = new Group();
  private readonly noteMeshes = new Map<number, Mesh>();
  private readonly riftViews = new Map<number, RiftView>();
  private dragging = false;
  private dragStart = { x: 0, y: 0 };
  private aimNdc = { x: 0, y: 0 };
  private lastUiUpdate = 0;
  /** Live XR palm poses per hand, refreshed each update; null when flat or
   * the hand is untracked. */
  private readonly palms: Record<'left' | 'right', PalmPose | null> = {
    left: null,
    right: null,
  };
  /** True while the active beam was opened by an XR open palm (so only XR
   * logic stops it on palm close / tracking loss). */
  private xrBeamActive = false;
  private beamLine: Line | null = null;
  private readonly palmAnchorLeft = new Vector3();
  private readonly palmAnchorRight = new Vector3();
  private readonly headPos = new Vector3();

  init(): void {
    this.root.visible = false;
    this.world.scene.add(this.root);
    this.panel = this.world.getSceneObject<UIKitMLAsset>('rift-lab-panel') ?? null;
    if (this.panel == null) {
      console.warn('[rift-lab] rift-lab-panel scene object missing');
      return;
    }
    const panel = this.panel;
    this.statusText = panel.getElementById<UIKit.Text>('rift-lab-status');
    this.energyText = panel.getElementById<UIKit.Text>('rift-lab-energy');
    this.telemetryText = panel.getElementById<UIKit.Text>('rift-lab-telemetry');

    panel
      .getElementById('rift-lab-start-button')
      ?.addEventListener('click', () => this.startRun());
    // Stand-in for main-game successful notes until integration (Lab-only).
    panel
      .getElementById('rift-lab-note-button')
      ?.addEventListener('click', () => this.playNote());
    panel
      .getElementById('rift-lab-back-button')
      ?.addEventListener('click', () => this.stopRun());

    const canvas = this.world.renderer.domElement;
    const onPointerDown = (event: PointerEvent) => {
      if (!this.active || !this.running) return;
      const fracX = event.clientX / window.innerWidth;
      const fracY = event.clientY / window.innerHeight;
      const nearChargeSpot =
        fracY >= CHARGE_SPOT_Y_FRAC - 0.08 &&
        Math.abs(fracX - 0.5) <= CHARGE_SPOT_X_TOL_FRAC;
      if (nearChargeSpot) {
        // Mobile/flat: drag from the fixed charge spot aims and fires.
        this.dragging = true;
        this.dragStart = { x: fracX, y: fracY };
        this.game.startBeam({ kind: 'mobile-drag', dx: 0, dy: 0 });
      } else {
        // Desktop (settled 13:38): click the rift itself with enough energy;
        // notes fly pointer-to-rift and it seals. No hold duration.
        const clickTarget = new Vector3(
          ((event.clientX / window.innerWidth) * 2 - 1) * 2.2,
          1.6 + (-((event.clientY / window.innerHeight) * 2 - 1)) * 1.2,
          -2.5,
        );
        let best: RiftView | null = null;
        let bestDist = BEAM_HIT_RADIUS_M;
        for (const view of this.riftViews.values()) {
          const d = view.position.distanceTo(clickTarget);
          if (d <= bestDist) {
            best = view;
            bestDist = d;
          }
        }
        if (best != null) {
          const fired = this.game.pcClickRift(best.rift.id);
          this.renderPanel(
            fired
              ? 'Notes fly to the rift.'
              : `Not enough energy (need ${SEAL_ENERGY_REQUIRED}).`,
          );
        }
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      this.aimNdc = {
        x: (event.clientX / window.innerWidth) * 2 - 1,
        y: -((event.clientY / window.innerHeight) * 2 - 1),
      };
    };
    const onPointerUp = () => {
      if (this.dragging) {
        this.dragging = false;
        this.game.stopBeam();
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const onModeChange = (event: Event) => {
      const mode = (event as CustomEvent<{ mode: string }>).detail.mode;
      this.setActive(mode === 'riftlab');
    };
    window.addEventListener('experience-mode-changed', onModeChange);
    this.setActive(
      (window.sessionStorage.getItem('iwsdk-experience-mode') ?? 'menu') ===
        'riftlab',
    );

    this.cleanupFuncs.push(() => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('experience-mode-changed', onModeChange);
      this.setActive(false);
      this.world.scene.remove(this.root);
      delete window.__riftLabDebug;
    });

    window.__riftLabDebug = {
      snapshot: () => this.debugSnapshot(),
      enter: () => this.setActive(true),
      start: () => this.startRun(),
      playNote: (color, hand) => this.playNote(color, hand),
      spawnRift: () => this.spawnRift(),
      sealFirstRift: () => this.debugSealFirstRift(),
    };
    this.renderPanel('Press Start. Successful notes charge your hands.');
  }

  private setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.root.visible = active;
    if (!active) {
      this.stopRun();
    } else {
      this.renderPanel('Press Start. Successful notes charge your hands.');
    }
  }

  private startRun(): void {
    this.running = true;
    this.lastSpawnAt = performance.now();
    this.spawnRift();
    this.renderPanel('A rift is open. Charge up and seal it.');
  }

  private stopRun(): void {
    this.running = false;
    this.dragging = false;
    this.xrBeamActive = false;
    if (this.beamLine != null) {
      this.beamLine.visible = false;
    }
    this.game.stopBeam();
    for (const id of [...this.riftViews.keys()]) {
      this.removeRiftView(id);
    }
    this.game.clearSealed();
  }

  private playNote(color?: PadColorName, hand?: 'left' | 'right'): void {
    const picked =
      color ?? PAD_COLOR_NAMES[Math.floor(Math.random() * PAD_COLOR_NAMES.length)];
    this.game.addNoteEnergy(picked, hand);
    this.renderPanel();
  }

  private spawnRift(): void {
    if (this.riftViews.size >= MAX_OPEN_RIFTS) return;
    const rift = this.game.spawnRift();
    const position =
      RIFT_POSITIONS[(rift.id - 1) % RIFT_POSITIONS.length].clone();
    let face: Vector3 | null = null;
    if (this.isImmersive()) {
      // MR: hang rifts in the room around the player, not at hub-scene
      // coords. Roughly 2m out, spread laterally, at chest-to-head height;
      // real room-surface placement is on-headset tuning.
      this.player.head.getWorldPosition(this.headPos);
      const forward = new Vector3();
      this.world.camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
      forward.normalize();
      const side = new Vector3(-forward.z, 0, forward.x);
      const offsets = [0, -0.8, 0.8];
      const heights = [0.1, -0.15, 0.3];
      const idx = (rift.id - 1) % 3;
      position
        .copy(this.headPos)
        .add(forward.multiplyScalar(2))
        .add(side.multiplyScalar(offsets[idx]));
      position.y = this.headPos.y + heights[idx];
      face = this.headPos.clone();
    }
    const group = new Group();
    // Placeholder fracture: a jagged four-edge ring, each edge a pad color.
    const points: Vector3[] = [];
    const SEGMENTS = 8;
    for (let i = 0; i <= SEGMENTS; i++) {
      const angle = (i / SEGMENTS) * Math.PI * 2;
      const jitter = 0.75 + ((rift.id * 31 + i * 17) % 10) / 20;
      points.push(
        new Vector3(
          Math.cos(angle) * RIFT_RING_RADIUS_M * jitter,
          Math.sin(angle) * RIFT_RING_RADIUS_M * jitter,
          0,
        ),
      );
    }
    for (let edge = 0; edge < 4; edge++) {
      const edgePoints = points.slice(edge * 2, edge * 2 + 3);
      const material = new LineBasicMaterial({
        color: new Color(PAD_COLORS[rift.edgeColors[edge]]),
      });
      group.add(new Line(new BufferGeometry().setFromPoints(edgePoints), material));
    }
    group.position.copy(position);
    if (face != null) {
      group.lookAt(face);
    }
    this.root.add(group);
    this.riftViews.set(rift.id, { rift, group, position });
    this.renderPanel();
  }

  private removeRiftView(id: number): void {
    const view = this.riftViews.get(id);
    if (view == null) return;
    this.root.remove(view.group);
    this.riftViews.delete(id);
  }

  private isImmersive(): boolean {
    return this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
  }

  /** Refresh live palm poses from the hand-tracking adapters. No-ops to
   * nulls when flat or untracked, so flat input paths are untouched. */
  private updateXrHands(): void {
    if (!this.isImmersive()) {
      this.palms.left = null;
      this.palms.right = null;
      return;
    }
    for (const hand of ['right', 'left'] as const) {
      const adapter = this.input.xr.visualAdapters[hand].peek();
      if (adapter instanceof XRHandVisualAdapter) {
        const grip = this.player.gripSpaces[hand];
        grip.updateWorldMatrix(true, false);
        this.palms[hand] = readPalmPose(
          adapter.jointTransforms,
          grip.matrixWorld.elements,
        );
      } else {
        this.palms[hand] = null;
      }
    }
  }

  /** Open-palm beam control (his 12:15 input): an open palm with enough
   * energy starts the beam; closing the hand or losing tracking stops it. */
  private updateXrBeam(): void {
    if (this.palms.left == null && this.palms.right == null) {
      if (this.xrBeamActive) {
        this.xrBeamActive = false;
        this.game.stopBeam();
      }
      return;
    }
    if (this.xrBeamActive) {
      const palm = this.palms[this.game.getFiringHand()];
      if (palm == null || !palm.open) {
        this.xrBeamActive = false;
        this.game.stopBeam();
      }
      return;
    }
    if (this.game.isBeamActive()) {
      return; // a flat (drag) beam is already running
    }
    for (const hand of ['right', 'left'] as const) {
      const palm = this.palms[hand];
      if (palm != null && palm.open && this.game.canFireBeam()) {
        this.xrBeamActive = this.game.startBeam({
          kind: 'xr-open-palm',
          hand,
        });
        if (this.xrBeamActive) {
          this.renderPanel('Palm beam firing. Aim at a rift.');
          break;
        }
      }
    }
  }

  private handAnchor(hand: 'left' | 'right'): Vector3 {
    const palm = this.palms[hand];
    if (palm != null) {
      const scratch =
        hand === 'right' ? this.palmAnchorRight : this.palmAnchorLeft;
      return scratch.set(palm.center[0], palm.center[1], palm.center[2]);
    }
    return hand === 'right' ? FLAT_RIGHT_HAND : FLAT_LEFT_HAND;
  }

  /** Beam ray for the active beam: live palm aim in XR, flat aim point
   * otherwise. */
  private beamRay(out: { origin: Vector3; direction: Vector3 }): void {
    out.origin.copy(this.handAnchor(this.game.getFiringHand()));
    if (this.xrBeamActive) {
      const palm = this.palms[this.game.getFiringHand()];
      if (palm != null) {
        out.direction.set(
          palm.direction[0],
          palm.direction[1],
          palm.direction[2],
        );
        return;
      }
    }
    const target = new Vector3(
      this.aimNdc.x * 2.2,
      1.6 + this.aimNdc.y * 1.2,
      -2.5,
    );
    out.direction.copy(target.sub(out.origin)).normalize();
  }

  private ensureBeamLine(): Line {
    if (this.beamLine == null) {
      this.beamLine = new Line(
        new BufferGeometry().setFromPoints([new Vector3(), new Vector3()]),
        new LineBasicMaterial({
          color: new Color('#ffe9a8'),
          blending: AdditiveBlending,
          transparent: true,
          opacity: 0.9,
        }),
      );
      this.beamLine.visible = false;
      this.root.add(this.beamLine);
    }
    return this.beamLine;
  }

  private readonly beamRayScratch = {
    origin: new Vector3(),
    direction: new Vector3(),
  };

  update(delta: number): void {
    if (!this.active) return;
    this.updateXrHands();
    this.game.updateOrbit(delta);

    // Sync orbit note meshes with the logic model.
    const seen = new Set<number>();
    for (const note of this.game.getNotes()) {
      seen.add(note.id);
      let mesh = this.noteMeshes.get(note.id);
      if (mesh == null) {
        mesh = new Mesh(
          new CircleGeometry(NOTE_SIZE_M, 12),
          new MeshBasicMaterial({
            color: new Color(PAD_COLORS[note.color]),
            blending: AdditiveBlending,
            transparent: true,
          }),
        );
        this.noteMeshes.set(note.id, mesh);
        this.root.add(mesh);
      }
      const anchor = this.handAnchor(note.hand);
      const ox = anchor.x + Math.cos(note.angle) * note.radius;
      const oy = anchor.y + Math.sin(note.angle) * note.radius;
      const sealingView = [...this.riftViews.values()].find(
        (view) => view.rift.state === 'sealing',
      );
      if (sealingView != null) {
        // Settled desktop seal visual: notes move from the pointer/hand
        // toward the rift while the flight runs.
        const u = Math.min(
          1,
          sealingView.rift.sealProgressMs / 800,
        );
        mesh.position.set(
          ox + (sealingView.position.x - ox) * u,
          oy + (sealingView.position.y - oy) * u,
          anchor.z + (sealingView.position.z - anchor.z) * u,
        );
      } else {
        mesh.position.set(ox, oy, anchor.z);
      }
      // Notes face the viewer (billboard), in XR and flat alike.
      mesh.quaternion.copy(this.world.camera.quaternion);
    }
    for (const [id, mesh] of this.noteMeshes) {
      if (!seen.has(id)) {
        this.root.remove(mesh);
        this.noteMeshes.delete(id);
      }
    }

    if (this.running) {
      this.updateXrBeam();
      const now = performance.now();
      if (
        this.riftViews.size < MAX_OPEN_RIFTS &&
        now - this.lastSpawnAt >= RIFT_SPAWN_INTERVAL_MS
      ) {
        this.lastSpawnAt = now;
        this.spawnRift();
      }

      // Beam: live palm aim in XR (open palm), the flat aim point otherwise.
      if (this.game.isBeamActive()) {
        const ray = this.beamRayScratch;
        this.beamRay(ray);
        const line = this.ensureBeamLine();
        line.visible = true;
        const end = ray.origin
          .clone()
          .add(ray.direction.clone().multiplyScalar(3.5));
        line.geometry.setFromPoints([ray.origin, end]);
        for (const view of this.riftViews.values()) {
          const toRift = view.position.clone().sub(ray.origin);
          const along = toRift.dot(ray.direction);
          if (along <= 0) continue;
          const closest = ray.origin
            .clone()
            .add(ray.direction.clone().multiplyScalar(along));
          if (closest.distanceTo(view.position) <= BEAM_HIT_RADIUS_M) {
            this.game.applyBeamOnRift(view.rift.id, delta * 1000);
            break;
          }
        }
      } else if (this.beamLine != null) {
        this.beamLine.visible = false;
      }

      // Desktop notes-flight seals advance without the beam.
      for (const view of this.riftViews.values()) {
        this.game.updateDesktopSeal(view.rift.id, delta * 1000);
      }

      const cleared = this.game.clearSealed();
      if (cleared > 0) {
        for (const [id, view] of this.riftViews) {
          if (view.rift.state === 'sealed') {
            this.removeRiftView(id);
          }
        }
        this.renderPanel('Rift sealed.');
      }
    }

    if (performance.now() - this.lastUiUpdate >= 250) {
      this.renderPanel();
    }
  }

  private renderPanel(statusOverride?: string): void {
    this.lastUiUpdate = performance.now();
    if (statusOverride != null) {
      this.statusText?.setProperties({ text: statusOverride } as never);
    }
    this.energyText?.setProperties({
      text: `Energy: ${Math.round(this.game.getEnergy())}`,
    } as never);
    const open = this.game
      .getRifts()
      .filter((rift) => rift.state === 'open' || rift.state === 'sealing').length;
    const modifier = this.game.openRiftModifierActive()
      ? `Score/bars x${this.game.openRiftScoreMultiplier()} while a rift is open (fraction provisional)`
      : 'Open-rift modifier: off';
    this.telemetryText?.setProperties({
      text: `Rifts open: ${open}. ${modifier}.`,
    } as never);
  }

  private debugSealFirstRift(): void {
    const first = [...this.riftViews.keys()][0];
    if (first == null) return;
    if (!this.game.isBeamActive()) {
      this.game.startBeam({ kind: 'mobile-drag', dx: 0, dy: 0 });
    }
    this.game.applyBeamOnRift(first, 100000);
    this.game.clearSealed();
    this.removeRiftView(first);
    this.renderPanel('Rift sealed.');
  }

  private debugSnapshot(): RiftLabDebugSnapshot {
    return {
      active: this.active,
      running: this.running,
      energy: this.game.getEnergy(),
      noteCount: this.game.getNotes().length,
      openRifts: this.game
        .getRifts()
        .filter((rift) => rift.state === 'open' || rift.state === 'sealing')
        .length,
      modifierActive: this.game.openRiftModifierActive(),
      beamActive: this.game.isBeamActive(),
    };
  }
}
