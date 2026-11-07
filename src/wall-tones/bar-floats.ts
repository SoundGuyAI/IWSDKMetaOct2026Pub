/**
 * Bars float animation (backlog 12 economy juice): a "+N" that travels from
 * the pad that earned it to the Bars icon in the panel. Flat mode animates
 * pooled HTML elements over the projected pad->icon screen path; immersive
 * (VR/MR) sessions animate pooled billboarded 3D sprites along the world
 * path. Pooled slots + scratch vectors: no allocations while a float is
 * animating (AGENTS.md perf rules); textures are created once per label.
 */
import {
  CanvasTexture,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  type Camera,
  type Scene,
} from '@iwsdk/core';

/** Seconds for a float to travel from the pad to the Bars icon. */
export const BAR_FLOAT_DURATION_S = 0.9;
/** Upward arc height (meters) of the world-space flight path. */
const FLOAT_ARC_M = 0.18;
/** Pooled floats; rapid presses reuse the oldest slot when full. */
const POOL_SIZE = 8;
/** Sprite footprint in meters (width x height before the travel scale). */
const SPRITE_W_M = 0.16;
const SPRITE_H_M = 0.08;

class FloatSlot {
  active = false;
  elapsed = 0;
  /** Label-width factor captured at spawn; update() must not re-derive it
   * from the sprite scale, which travel scaling already shrank. */
  widthScale = 1;
  readonly from = new Vector3();
  readonly to = new Vector3();
  readonly material = new SpriteMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  readonly sprite = new Sprite(this.material);
  div: HTMLDivElement | null = null;
  inScene = false;

  constructor() {
    this.sprite.visible = false;
    this.sprite.renderOrder = 999;
  }
}

export class BarFloatPool {
  private readonly slots: FloatSlot[] = [];
  private readonly textureCache = new Map<string, CanvasTexture>();
  private readonly worldScratch = new Vector3();
  private activeCount = 0;

  /** True while at least one float is animating (cheap update() skip). */
  isActive(): boolean {
    return this.activeCount > 0;
  }

  /** Launch a "+amount" float along the world-space from->to path. */
  spawn(from: Vector3, to: Vector3, amount: number, scene: Scene): void {
    if (amount <= 0) return;
    let slot = this.slots.find((s) => !s.active);
    if (slot == null) {
      if (this.slots.length < POOL_SIZE) {
        slot = new FloatSlot();
        this.slots.push(slot);
      } else {
        // Pool exhausted: reuse the oldest (first) slot.
        slot = this.slots[0]!;
      }
    }
    if (slot.active) this.activeCount -= 1;
    slot.active = true;
    this.activeCount += 1;
    slot.elapsed = 0;
    slot.from.copy(from);
    slot.to.copy(to);
    const label = `+${amount}`;
    slot.material.map = this.textureFor(label);
    slot.material.opacity = 1;
    slot.material.needsUpdate = true;
    const widthScale = 1 + Math.max(0, label.length - 2) * 0.18;
    slot.widthScale = widthScale;
    slot.sprite.scale.set(SPRITE_W_M * widthScale, SPRITE_H_M, 1);
    slot.sprite.position.copy(from);
    slot.sprite.visible = true;
    if (!slot.inScene) {
      slot.inScene = true;
      scene.add(slot.sprite);
    }
    if (slot.div != null) {
      slot.div.textContent = label;
      slot.div.style.opacity = '1';
    }
  }

  /** Advance active floats. Flat mode projects the world path to screen and
   * moves HTML labels; immersive mode moves the billboarded sprites. */
  update(delta: number, camera: Camera, flat: boolean): void {
    if (this.activeCount === 0) return;
    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.elapsed += delta;
      const t = Math.min(slot.elapsed / BAR_FLOAT_DURATION_S, 1);
      const eased = 1 - (1 - t) ** 3;
      const w = this.worldScratch;
      w.lerpVectors(slot.from, slot.to, eased);
      w.y += Math.sin(Math.PI * eased) * FLOAT_ARC_M;
      const fade = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      if (flat) {
        slot.sprite.visible = false;
        const div = this.ensureDiv(slot);
        w.project(camera);
        const x = (w.x + 1) * window.innerWidth / 2;
        const y = (1 - w.y) * window.innerHeight / 2;
        const scale = 1.15 - 0.45 * eased;
        div.style.transform =
          `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${scale})`;
        div.style.opacity = String(fade);
        div.style.display = 'block';
      } else {
        if (slot.div != null) slot.div.style.display = 'none';
        slot.sprite.visible = true;
        slot.sprite.position.copy(w);
        const scale = 1 - 0.4 * eased;
        slot.sprite.scale.set(SPRITE_W_M * slot.widthScale, SPRITE_H_M, 1)
          .multiplyScalar(scale);
        slot.material.opacity = fade;
      }
      if (t >= 1) this.deactivate(slot);
    }
  }

  /** Hide every float (experience end, mode swap cleanup). */
  clear(): void {
    for (const slot of this.slots) {
      if (slot.active) this.deactivate(slot);
    }
  }

  private deactivate(slot: FloatSlot): void {
    slot.active = false;
    this.activeCount -= 1;
    slot.sprite.visible = false;
    if (slot.div != null) slot.div.style.display = 'none';
  }

  private ensureDiv(slot: FloatSlot): HTMLDivElement {
    if (slot.div == null) {
      const div = document.createElement('div');
      div.className = 'wall-tones-bar-float';
      Object.assign(div.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        zIndex: '100001',
        color: '#f5d90a',
        font: '700 22px/1 sans-serif',
        textShadow: '0 2px 6px rgba(0,0,0,0.8)',
        pointerEvents: 'none',
        display: 'none',
        willChange: 'transform, opacity',
      });
      div.textContent = `+1`;
      document.body.appendChild(div);
      slot.div = div;
    }
    return slot.div;
  }

  private textureFor(label: string): CanvasTexture {
    let tex = this.textureCache.get(label);
    if (tex == null) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (ctx != null) {
        ctx.font = '700 72px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 12;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(label, 128, 68);
        ctx.fillStyle = '#f5d90a';
        ctx.fillText(label, 128, 68);
      }
      tex = new CanvasTexture(canvas);
      tex.colorSpace = SRGBColorSpace;
      this.textureCache.set(label, tex);
    }
    return tex;
  }

  /** Release DOM nodes, sprites and cached textures (teardown). */
  dispose(scene: Scene): void {
    for (const slot of this.slots) {
      if (slot.inScene) scene.remove(slot.sprite);
      slot.inScene = false;
      slot.material.dispose();
      slot.div?.remove();
      slot.div = null;
      slot.active = false;
    }
    this.activeCount = 0;
    for (const tex of this.textureCache.values()) tex.dispose();
    this.textureCache.clear();
  }
}
