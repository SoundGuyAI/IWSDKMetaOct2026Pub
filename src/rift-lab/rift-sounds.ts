/**
 * Rift Lab sound effects (his 22:06 device test: "add sounds").
 *
 * Effects only, synthesized with Web Audio on the shared Wall Tones audio
 * context (already unlocked by the menu tap). No speech and no scripted
 * lines here. These are placeholder effect designs for headset tuning.
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

interface BeamHum {
  stopped: boolean;
  release: (() => void) | null;
}

let beamHum: BeamHum | null = null;
/** Test and debug hook: every effect request in order. */
export const riftSoundLog: RiftSoundName[] = [];

function tone(
  ctx: AudioContext,
  type: OscillatorType,
  freqStart: number,
  freqEnd: number,
  start: number,
  duration: number,
  peak: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
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

async function withContext(name: RiftSoundName, play: (ctx: AudioContext) => void): Promise<void> {
  riftSoundLog.push(name);
  try {
    const ctx = await ensureAudioRunning();
    if (ctx != null) play(ctx);
  } catch (error) {
    console.warn('[rift-lab] sound unavailable', error);
  }
}

/** A successful note charges the hands: bright chime in the pad's pitch. */
export function playNoteChime(color: PadColorName): Promise<void> {
  return withContext('chime', (ctx) => {
    const t = ctx.currentTime;
    const f = NOTE_CHIME_HZ[color];
    tone(ctx, 'sine', f, f, t, 0.45, 0.16);
    tone(ctx, 'sine', f * 2, f * 2, t, 0.3, 0.05);
  });
}

/** A rift tears open: low rumble sweep plus a crackle. */
export function playRiftOpen(): Promise<void> {
  return withContext('open', (ctx) => {
    const t = ctx.currentTime;
    tone(ctx, 'sawtooth', 180, 45, t, 0.9, 0.12);
    tone(ctx, 'square', 90, 60, t, 0.7, 0.05);
    noiseBurst(ctx, t, 0.5, 0.12);
  });
}

/** Sealing beam hums while it is firing. Safe to call every frame. */
export function startBeamHum(): void {
  if (beamHum != null) return;
  const hum: BeamHum = { stopped: false, release: null };
  beamHum = hum;
  riftSoundLog.push('beam');
  void ensureAudioRunning().then((ctx) => {
    if (ctx == null || hum.stopped) return;
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

/** The rift closes: rising sweep into a resolved chord. */
export function playRiftSeal(): Promise<void> {
  return withContext('seal', (ctx) => {
    const t = ctx.currentTime;
    tone(ctx, 'sawtooth', 60, 520, t, 0.5, 0.1);
    for (const [i, f] of [392.0, 523.25, 659.25, 783.99].entries()) {
      tone(ctx, 'sine', f, f, t + 0.45 + i * 0.04, 0.9, 0.09);
    }
    noiseBurst(ctx, t + 0.4, 0.25, 0.08);
  });
}

/** Not enough energy: short low buzz. */
export function playSealDenied(): Promise<void> {
  return withContext('denied', (ctx) => {
    const t = ctx.currentTime;
    tone(ctx, 'square', 110, 90, t, 0.22, 0.09);
  });
}
