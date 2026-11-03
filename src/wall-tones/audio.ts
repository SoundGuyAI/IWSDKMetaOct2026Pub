import { WALL_TONE_PADS, NOTE_DURATION_S } from './constants.js';

let sharedContext: AudioContext | null = null;
let unlockPromise: Promise<boolean> | null = null;

function createContext(): AudioContext {
  sharedContext = new AudioContext();
  return sharedContext;
}

function getContext(): AudioContext {
  if (sharedContext == null) {
    return createContext();
  }
  return sharedContext;
}

/** Call from a user gesture (menu click, pad tap) before scheduled tones. */
export async function unlockWallTonesAudio(): Promise<boolean> {
  if (unlockPromise != null) {
    return unlockPromise;
  }
  unlockPromise = (async () => {
    const context = getContext();
    if (context.state === 'suspended') {
      try {
        await context.resume();
      } catch (error) {
        console.warn('[wall-tones] AudioContext resume failed', error);
      }
    }
    if (context.state !== 'running') {
      unlockPromise = null;
      return false;
    }
    const start = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(0.04, start + 0.01);
    gain.gain.linearRampToValueAtTime(0.0001, start + 0.04);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.05);
    return true;
  })();
  return unlockPromise;
}

export async function playPadTone(
  padId: number,
  durationS = NOTE_DURATION_S,
): Promise<void> {
  await unlockWallTonesAudio();
  const pad = WALL_TONE_PADS[padId];
  if (pad == null) {
    return;
  }
  const context = getContext();
  if (context.state !== 'running') {
    return;
  }
  const start = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(pad.frequencyHz, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.38, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationS);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + durationS + 0.05);
}

export async function playErrorTone(): Promise<void> {
  await unlockWallTonesAudio();
  const context = getContext();
  if (context.state !== 'running') {
    return;
  }
  const start = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(180, start);
  oscillator.frequency.exponentialRampToValueAtTime(120, start + 0.25);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.28, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + 0.4);
}

export function suspendAudioContext(): void {
  void sharedContext?.close();
  sharedContext = null;
  unlockPromise = null;
}
