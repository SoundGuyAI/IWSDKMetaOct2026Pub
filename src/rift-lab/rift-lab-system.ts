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
 * UNRESOLVED, held for Oded (no defaults invented):
 *  - PC click target: canvas clicks route to RiftLabGame.onPcClick(), a
 *    deliberate no-op, and the panel says so.
 *  - Open-rift negative modifier identity: the game tracks the until-cleared
 *    gate; the effect is OPEN_RIFT_MODIFIER_EFFECT (null no-op).
 *
 * Headset tuning (hand anchors, palm pose thresholds, rift placement on room
 * surfaces) is the point of this Lab PR, same as the other lab demos.
 */

import {
  createSystem,
  UIKit,
  UIKitMLAsset,
} from '@iwsdk/core';
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
        // UNRESOLVED: PC click target. Deliberate no-op until Oded picks.
        this.game.onPcClick();
        this.renderPanel('PC click target is still awaiting Oded\'s decision.');
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

  private handAnchor(hand: 'left' | 'right'): Vector3 {
    // Placeholder anchors; XR hand-joint anchors are the headset-tuning half
    // of this Lab PR (hand tracking is only requested in the AR world).
    return hand === 'right' ? FLAT_RIGHT_HAND : FLAT_LEFT_HAND;
  }

  update(delta: number): void {
    if (!this.active) return;
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
      mesh.position.set(
        anchor.x + Math.cos(note.angle) * note.radius,
        anchor.y + Math.sin(note.angle) * note.radius,
        anchor.z,
      );
    }
    for (const [id, mesh] of this.noteMeshes) {
      if (!seen.has(id)) {
        this.root.remove(mesh);
        this.noteMeshes.delete(id);
      }
    }

    if (this.running) {
      const now = performance.now();
      if (
        this.riftViews.size < MAX_OPEN_RIFTS &&
        now - this.lastSpawnAt >= RIFT_SPAWN_INTERVAL_MS
      ) {
        this.lastSpawnAt = now;
        this.spawnRift();
      }

      // Beam: from the firing-hand anchor toward the flat aim point; seal on
      // sustained contact. XR open-palm input is the headset-tuning half.
      if (this.game.isBeamActive()) {
        const origin = this.handAnchor(this.game.getFiringHand());
        const target = new Vector3(
          this.aimNdc.x * 2.2,
          1.6 + this.aimNdc.y * 1.2,
          -2.5,
        );
        const direction = target.clone().sub(origin).normalize();
        for (const view of this.riftViews.values()) {
          const toRift = view.position.clone().sub(origin);
          const along = toRift.dot(direction);
          if (along <= 0) continue;
          const closest = origin.clone().add(direction.clone().multiplyScalar(along));
          if (closest.distanceTo(view.position) <= BEAM_HIT_RADIUS_M) {
            this.game.applyBeamOnRift(view.rift.id, delta * 1000);
            break;
          }
        }
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
      ? 'Open-rift modifier: ACTIVE (effect awaiting Oded)'
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
