/**
 * Rift Lab sound effects.
 *
 * Round 1 (his 2026-11-17 verdicts + "layer sounds together"): approved and
 * never-rejected recordings from the audition page, played from the world
 * position of their source (rifts sound from the rifts, beam from the palm,
 * note plink from the hand). Every recorded path falls back to the original
 * synthesized design when its clip cannot be loaded or decoded, so the lab
 * never goes silent. No speech and no scripted lines here.
 *
 * Loop clips are crossfade-shaped at the loop point (see the audition page);
 * they loop through Web Audio buffer sources, which is gapless, unlike
 * <audio loop> over mp3. Assets and licenses: public/audio/rift/ATTRIBUTION.md.
 */
import { ensureAudioRunning } from '../wall-tones/audio.js';
import type { PadColorName } from './rift-energy.js';

/** Pad-color pitches: the same G R B Y order as the opening fanfare. */
export const NOTE_CHIME_HZ: Record<PadColorName, number> = {
  green: 392.0, // G4
  red: 523.25, // C5
  blue: 659.25, // E5
  yellow: 783.99, // G5
};

export type RiftSoundName = 'chime' | 'open' | 'beam' | 'seal' | 'denied';

interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

interface BeamHum {
  stopped: boolean;
  release: (() => void) | null;
  /** Latest palm position; applied to the panners once the loops exist. */
  origin: Vec3Like | undefined;
  setPosition?: (position: Vec3Like) => void;
}

let beamHum: BeamHum | null = null;
/** Test and debug hook: every effect request in order. */
export const riftSoundLog: RiftSoundName[] = [];

/* ------------------------------------------------------------------ */
/* Recorded clip engine                                                */
/* ------------------------------------------------------------------ */

const CLIP = {
  portalOnset: 'audio/rift/portal-onset-portal-login.mp3',
  portalLoop: 'audio/rift/portal-loop-oscillating-energy.mp3',
  beamBed: 'audio/rift/beam-electric-energy.mp3',
  beamCrackle: 'audio/rift/beam-jacobs-ladder.mp3',
  sealChime: 'audio/rift/seal-gleam-chime.mp3',
  sealGliss: 'audio/rift/seal-glittery-glissando.mp3',
  handPlink: 'audio/rift/hand-crystal-button.mp3',
  deniedBuzzer: 'audio/rift/denied-buzzer.mp3',
} as const;

type ClipName = keyof typeof CLIP;

const bufferCache = new Map<ClipName, Promise<AudioBuffer | null>>();

function clipUrl(name: ClipName): string {
  return new URL(CLIP[name], document.baseURI).href;
}

/** Fetch and decode a clip once per session; null on any failure. */
function loadClip(ctx: AudioContext, name: ClipName): Promise<AudioBuffer | null> {
  let pending = bufferCache.get(name);
  if (pending == null) {
    pending = fetch(clipUrl(name))
      .then((response) => {
        if (!response.ok) throw new Error(`clip ${name}: HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((bytes) => ctx.decodeAudioData(bytes))
      .catch((error) => {
        console.warn('[rift-lab] recorded clip unavailable, synth fallback', name, error);
        return null;
      });
    bufferCache.set(name, pending);
  }
  return pending;
}

interface SourceOutput {
  input: GainNode;
  /** Move an already-playing source (beam follows the palm each frame). */
  setPosition: (position: Vec3Like) => void;
}

/** Positional output for one source: rift sounds from the rifts, and so on. */
function sourceOutput(
  ctx: AudioContext,
  position: Vec3Like | undefined,
  peak: number,
): SourceOutput {
  const gain = ctx.createGain();
  gain.gain.value = peak;
  if (position != null) {
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 0.6;
    panner.rolloffFactor = 1;
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;
    gain.connect(panner).connect(ctx.destination);
    return {
      input: gain,
      setPosition: (next) => {
        const t = ctx.currentTime;
        panner.positionX.setTargetAtTime(next.x, t, 0.03);
        panner.positionY.setTargetAtTime(next.y, t, 0.03);
        panner.positionZ.setTargetAtTime(next.z, t, 0.03);
      },
    };
  }
  gain.connect(ctx.destination);
  return { input: gain, setPosition: () => undefined };
}

/** Play a recorded one-shot; returns false when the clip is unavailable. */
function snap(position: Vec3Like | undefined): Vec3Like | undefined {
  // Callers pass live scratch vectors; freeze values before async decode.
  return position != null ? { x: position.x, y: position.y, z: position.z } : undefined;
}

async function playClip(
  ctx: AudioContext,
  name: ClipName,
  at: Vec3Like | undefined,
  peak: number,
  delay = 0,
): Promise<boolean> {
  const position = snap(at);
  const buffer = await loadClip(ctx, name);
  if (buffer == null) return false;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(sourceOutput(ctx, position, peak).input);
  source.start(ctx.currentTime + delay);
  return true;
}

interface LoopHandle {
  stop: (fadeSeconds?: number) => void;
  setPosition: (position: Vec3Like) => void;
}

/** Start a gapless recorded loop with a fade-in; null when unavailable. */
async function startClipLoop(
  ctx: AudioContext,
  name: ClipName,
  at: Vec3Like | undefined,
  peak: number,
  fadeIn = 0.4,
): Promise<LoopHandle | null> {
  const position = snap(at);
  const buffer = await loadClip(ctx, name);
  if (buffer == null) return null;
  const out = sourceOutput(ctx, position, 0.0001);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(out.input);
  const now = ctx.currentTime;
  out.input.gain.cancelScheduledValues(now);
  out.input.gain.setValueAtTime(0.0001, now);
  out.input.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), now + fadeIn);
  source.start(now);
  let stopped = false;
  return {
    stop: (fadeSeconds = 0.3) => {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      out.input.gain.cancelScheduledValues(t);
      out.input.gain.setValueAtTime(Math.max(0.0001, out.input.gain.value), t);
      out.input.gain.exponentialRampToValueAtTime(0.0001, t + fadeSeconds);
      source.stop(t + fadeSeconds + 0.05);
    },
    setPosition: out.setPosition,
  };
}

/* ------------------------------------------------------------------ */
/* Positional listener                                                 */
/* ------------------------------------------------------------------ */

let lastListenerSync = 0;

/**
 * Aim the Web Audio listener from the rendered camera each frame, so the
 * positional rift/beam/hand sounds stay glued to their world sources.
 * Accepts the three.js camera without importing three (matrixWorld only).
 */
export function syncRiftAudioListener(camera: {
  matrixWorld: { elements: ArrayLike<number> };
}): void {
  const now = performance.now();
  if (now - lastListenerSync < 50) return; // ~20 Hz is plenty for panner math
  lastListenerSync = now;
  void ensureAudioRunning().then((ctx) => {
    if (ctx == null) return;
    const e = camera.matrixWorld.elements;
    const listener = ctx.listener;
    const px = e[12];
    const py = e[13];
    const pz = e[14];
    // Camera looks down its local -Z; up is local +Y.
    const fx = -e[8];
    const fy = -e[9];
    const fz = -e[10];
    const ux = e[4];
    const uy = e[5];
    const uz = e[6];
    if (listener.positionX != null) {
      const t = ctx.currentTime;
      listener.positionX.setTargetAtTime(px, t, 0.05);
      listener.positionY.setTargetAtTime(py, t, 0.05);
      listener.positionZ.setTargetAtTime(pz, t, 0.05);
      listener.forwardX.setTargetAtTime(fx, t, 0.05);
      listener.forwardY.setTargetAtTime(fy, t, 0.05);
      listener.forwardZ.setTargetAtTime(fz, t, 0.05);
      listener.upX.setTargetAtTime(ux, t, 0.05);
      listener.upY.setTargetAtTime(uy, t, 0.05);
      listener.upZ.setTargetAtTime(uz, t, 0.05);
    } else {
      // Older WebKit: deprecated but functional setters.
      const legacy = listener as unknown as {
        setPosition?: (x: number, y: number, z: number) => void;
        setOrientation?: (x: number, y: number, z: number, xUp: number, yUp: number, zUp: number) => void;
      };
      legacy.setPosition?.(px, py, pz);
      legacy.setOrientation?.(fx, fy, fz, ux, uy, uz);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Synthesized fallback designs (original placeholders)                */
/* ------------------------------------------------------------------ */

function tone(
  ctx: AudioContext,
  type: OscillatorType,
  freqStart: number,
  freqEnd: number,
  start: number,
  duration: number,
  peak: number,
  out?: AudioNode,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(out ?? ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noiseBurst(ctx: AudioContext, start: number, duration: number, peak: number): void {
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1800;
  const gain = ctx.createGain();
  gain.gain.value = peak;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(start);
}

function synthOpen(ctx: AudioContext): void {
  const t = ctx.currentTime;
  tone(ctx, 'sawtooth', 180, 45, t, 0.9, 0.12);
  tone(ctx, 'square', 90, 60, t, 0.7, 0.05);
  noiseBurst(ctx, t, 0.5, 0.12);
}

function synthSeal(ctx: AudioContext): void {
  const t = ctx.currentTime;
  tone(ctx, 'sawtooth', 60, 520, t, 0.5, 0.1);
  for (const [i, f] of [392.0, 523.25, 659.25, 783.99].entries()) {
    tone(ctx, 'sine', f, f, t + 0.45 + i * 0.04, 0.9, 0.09);
  }
  noiseBurst(ctx, t + 0.4, 0.25, 0.08);
}

function synthDenied(ctx: AudioContext): void {
  tone(ctx, 'square', 110, 90, ctx.currentTime, 0.22, 0.09);
}

async function withContext(name: RiftSoundName, play: (ctx: AudioContext) => void): Promise<void> {
  riftSoundLog.push(name);
  try {
    const ctx = await ensureAudioRunning();
    if (ctx != null) play(ctx);
  } catch (error) {
    console.warn('[rift-lab] sound unavailable', error);
  }
}

/* ------------------------------------------------------------------ */
/* Public effect API                                                   */
/* ------------------------------------------------------------------ */

/** A successful note charges the hands: bright chime in the pad's pitch,
 * layered with the recorded crystal plink from the charging hand. */
export function playNoteChime(color: PadColorName, position?: Vec3Like): Promise<void> {
  return withContext('chime', (ctx) => {
    const t = ctx.currentTime;
    const f = NOTE_CHIME_HZ[color];
    // Synth chime sounds from the hand too, not flat from the listener.
    const out = position != null ? sourceOutput(ctx, position, 1).input : undefined;
    tone(ctx, 'sine', f, f, t, 0.45, 0.16, out);
    tone(ctx, 'sine', f * 2, f * 2, t, 0.3, 0.05, out);
    // Layered texture; the pitched chime above stays the game feedback.
    void playClip(ctx, 'handPlink', position, 0.5);
  });
}

/** A rift tears open: recorded portal onset from the rift's position,
 * layered over the sustained open-rift loop (startRiftAmbience). */
export function playRiftOpen(position?: Vec3Like): Promise<void> {
  return withContext('open', (ctx) => {
    void playClip(ctx, 'portalOnset', position, 0.9).then((ok) => {
      if (!ok) synthOpen(ctx);
    });
  });
}

/** Sustained loop each open rift plays from its own position until sealed.
 * The entry exists from the moment the loop is REQUESTED: clip decode is
 * async, so a seal/stop landing mid-decode must cancel the pending start or
 * the loop would start after its rift is gone and play forever. */
interface AmbienceEntry {
  handle: LoopHandle | null;
  cancelled: boolean;
}
const riftAmbience = new Map<number, AmbienceEntry>();

export function startRiftAmbience(riftId: number, position: Vec3Like): void {
  if (riftAmbience.has(riftId)) return;
  const entry: AmbienceEntry = { handle: null, cancelled: false };
  riftAmbience.set(riftId, entry);
  void ensureAudioRunning().then(async (ctx) => {
    if (ctx == null) {
      riftAmbience.delete(riftId);
      return;
    }
    const handle = await startClipLoop(ctx, 'portalLoop', position, 0.5, 0.6);
    if (entry.cancelled || !riftAmbience.has(riftId)) {
      handle?.stop(0);
      return;
    }
    if (handle == null) {
      riftAmbience.delete(riftId);
      return;
    }
    entry.handle = handle;
  });
}

export function stopRiftAmbience(riftId: number): void {
  const entry = riftAmbience.get(riftId);
  if (entry == null) return;
  riftAmbience.delete(riftId);
  entry.cancelled = true;
  entry.handle?.stop(0.4);
}

export function stopAllRiftAmbience(): void {
  for (const entry of riftAmbience.values()) {
    entry.cancelled = true;
    entry.handle?.stop(0.3);
  }
  riftAmbience.clear();
}

/** Sealing beam: the two approved beam loops layered (steady bed plus arc
 * crackle) from the palm. Safe to call every frame. Falls back to the
 * original 140 Hz synth hum while clips load or when unavailable. */
export function startBeamHum(origin?: Vec3Like): void {
  if (beamHum != null) {
    // Called every frame while the beam is on: keep the panners on the palm.
    if (origin != null) {
      const at = snap(origin);
      if (at != null) {
        beamHum.origin = at;
        beamHum.setPosition?.(at);
      }
    }
    return;
  }
  const hum: BeamHum = { stopped: false, release: null, origin: snap(origin) };
  beamHum = hum;
  riftSoundLog.push('beam');
  void ensureAudioRunning().then(async (ctx) => {
    if (ctx == null || hum.stopped) return;
    const [bed, crackle] = await Promise.all([
      startClipLoop(ctx, 'beamBed', hum.origin, 0.5, 0.15),
      startClipLoop(ctx, 'beamCrackle', hum.origin, 0.3, 0.15),
    ]);
    if (bed != null || crackle != null) {
      hum.setPosition = (position) => {
        bed?.setPosition(position);
        crackle?.setPosition(position);
      };
      if (hum.origin != null) hum.setPosition(hum.origin);
      hum.release = () => {
        bed?.stop(0.15);
        crackle?.stop(0.15);
      };
      if (hum.stopped) hum.release();
      return;
    }
    // Synth fallback: the original 140 Hz hum.
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 140;
    lfo.frequency.value = 7;
    lfoGain.gain.value = 18;
    lfo.connect(lfoGain).connect(osc.frequency);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    lfo.start();
    hum.release = () => {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc.stop(now + 0.15);
      lfo.stop(now + 0.15);
    };
    if (hum.stopped) hum.release();
  });
}

export function stopBeamHum(): void {
  if (beamHum == null) return;
  const hum = beamHum;
  beamHum = null;
  hum.stopped = true;
  hum.release?.();
}

/** The rift closes: glittery glissando rising into the gleam chime, from the
 * sealed rift's position. Falls back to the synth sweep and chord. */
export function playRiftSeal(position?: Vec3Like): Promise<void> {
  return withContext('seal', (ctx) => {
    void (async () => {
      const gliss = await playClip(ctx, 'sealGliss', position, 0.6);
      const chime = await playClip(ctx, 'sealChime', position, 0.8, gliss ? 0.5 : 0);
      if (!gliss && !chime) synthSeal(ctx);
    })();
  });
}

/** Not enough energy: the approved buzzer from the clicked rift. */
export function playSealDenied(position?: Vec3Like): Promise<void> {
  return withContext('denied', (ctx) => {
    void playClip(ctx, 'deniedBuzzer', position, 0.9).then((ok) => {
      if (!ok) synthDenied(ctx);
    });
  });
}
