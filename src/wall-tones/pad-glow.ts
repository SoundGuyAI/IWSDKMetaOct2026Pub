/**
 * PROTOTYPE "glass instrument" pad look: ONE analytic shader quad per pad.
 * No textures, no post-processing. Rim, glass gradient, edge-light and press
 * ripple are all computed from a rounded-box distance function.
 * Hover/press/blink hue still comes from pads.ts via the face color.
 */
import {
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
} from '@iwsdk/core';

const QUAD_SCALE = 1.22;
const GLOW_Z = 0.0125;
const FACE_Z = 0.0105;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor;
uniform float uTime;
uniform float uPhase;
uniform float uHover;
uniform float uPress;   // seconds since last press, large when none
const float QS = ${QUAD_SCALE.toFixed(2)};
const float R = 0.15;

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 q = (vUv - 0.5) * QS;                 // face edge sits at +-0.5
  float d = sdRoundBox(q, vec2(0.5), R);     // <0 inside the pad
  float aa = 0.006;
  float inside = (1.0 - smoothstep(-aa, aa, d));

  vec3 hue = uColor;
  vec3 light = mix(hue, vec3(1.0), 0.22);    // small lift only, never white

  // Glass face: vertical gradient, slightly lighter at the top.
  vec3 face = hue * mix(0.62, 1.0, vUv.y);
  // Edge brightening (a cheap distance-to-edge approximation, not true Fresnel).
  float edgeIn = exp(d * 16.0) * step(d, 0.0);
  face += hue * edgeIn * (0.35 + 0.45 * uHover);
  // One soft diagonal sheen that slowly travels across.
  float s = fract((q.x * 0.8 + q.y * 0.6) * 0.9 - uTime * 0.07 + uPhase);
  float sheen = exp(-pow((s - 0.5) / 0.09, 2.0)) * 0.20;
  face += light * sheen;

  // Crisp rim just inside the edge.
  float rim = (1.0 - smoothstep(0.0, 0.016, abs(d + 0.012)));
  float outer = exp(-max(d, 0.0) * 30.0) * 0.55 * step(0.0, d);

  // One bright highlight travelling around the rim at a steady speed.
  float ang = atan(q.y, q.x);
  float da = mod(ang - (uTime * 0.8 + uPhase * 2.0) + 3.14159265, 6.2831853) - 3.14159265;
  float runner = exp(-da * da * 5.0) * (1.0 - smoothstep(0.0, 0.035, abs(d + 0.012)));

  // Press: ripple from the pad center plus a short rim flash.
  float pt = uPress;
  float live = step(pt, 0.9);
  float k = clamp(1.0 - pt / 0.9, 0.0, 1.0) * live;
  float ring = exp(-pow((length(q) - pt * 0.85) / 0.05, 2.0)) * k;
  float flash = k * k;

  float rimI = rim * (0.9 + 0.5 * uHover + 1.0 * flash) + runner * (0.9 + 0.5 * uHover);
  vec3 col = face * inside;
  col += light * (rimI * inside + ring * inside * 0.9);
  col += hue * outer * (1.0 + 0.6 * uHover + 1.2 * flash);

  float alpha = clamp(inside * 0.82 + rim * 0.9 + outer + runner * 0.6 + ring * 0.5, 0.0, 1.0);
  gl_FragColor = vec4(col / max(alpha, 0.001), alpha);
  #include <colorspace_fragment>
}`;

export type PadGlow = {
  mesh: Mesh;
  material: ShaderMaterial;
  faceMaterial: MeshBasicMaterial;
  now: number;
  pressAt: number;
  state: 'idle' | 'hover' | 'pressed';
  hover: number;
};

/** Hide the flat face and draw one shader quad over it (child, so it scales on blink). */
export function createPadGlow(
  face: Mesh,
  faceMaterial: MeshBasicMaterial,
  sizeM: number,
  padIndex: number,
): PadGlow {
  face.position.z = FACE_Z;
  // Keep the face mesh for hit testing; just stop it drawing. It is switched
  // back on below if the shader does not compile, so pads never disappear.
  faceMaterial.visible = false;
  const material = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uColor: { value: new Color().copy(faceMaterial.color) },
      uTime: { value: 0 },
      uPhase: { value: padIndex * 0.37 },
      uHover: { value: 0 },
      uPress: { value: 99 },
    },
    transparent: true,
    blending: NormalBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(new PlaneGeometry(sizeM * QUAD_SCALE, sizeM * QUAD_SCALE), material);
  mesh.name = 'glass';
  mesh.renderOrder = 12;
  mesh.position.z = GLOW_Z - FACE_Z;
  mesh.raycast = () => {};

  // Safe fallback: if the shader program fails to build (or never becomes ready
  // within ~2 s of draws) show the original flat colored face instead.
  let draws = 0;
  let settled = false;
  mesh.onAfterRender = (renderer) => {
    if (settled) {
      return;
    }
    draws += 1;
    const program = (
      renderer as unknown as {
        properties: { get(m: unknown): { currentProgram?: { diagnostics?: { runnable?: boolean }; isReady?: () => boolean } } };
      }
    ).properties.get(material).currentProgram;
    const failed = program?.diagnostics?.runnable === false;
    const ready = program != null && !failed && (program.isReady?.() ?? true);
    if (ready) {
      settled = true;
    } else if (failed || draws > 120) {
      settled = true;
      faceMaterial.visible = true;
      mesh.visible = false;
      console.warn('[wall-tones] glass pad shader unavailable, using flat pads');
    }
  };
  face.add(mesh);
  return { mesh, material, faceMaterial, now: 0, pressAt: -99, state: 'idle', hover: 0 };
}

export function syncPadGlow(
  padGlow: PadGlow | undefined,
  faceMaterial: MeshBasicMaterial,
  state: 'idle' | 'hover' | 'pressed',
): void {
  if (padGlow == null) {
    return;
  }
  (padGlow.material.uniforms.uColor!.value as Color).copy(faceMaterial.color);
  if (state === 'pressed' && padGlow.state !== 'pressed') {
    padGlow.pressAt = padGlow.now;
  }
  padGlow.state = state;
}

export function animatePadGlow(padGlow: PadGlow | undefined, timeS: number): void {
  if (padGlow == null) {
    return;
  }
  padGlow.now = timeS;
  const target = padGlow.state === 'idle' ? 0 : 1;
  padGlow.hover += (target - padGlow.hover) * 0.15;
  const u = padGlow.material.uniforms;
  u.uTime!.value = timeS;
  u.uHover!.value = padGlow.hover;
  u.uPress!.value = timeS - padGlow.pressAt;
}
