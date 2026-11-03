import { WALL_TONE_PADS, NOTE_DURATION_S } from './constants.js';

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext {
  if (sharedContext == null) {
    sharedContext = new AudioContext();
  }
  void sharedContext.resume();
  return sharedContext;
}

export function playPadTone(padId: number, durationS = NOTE_DURATION_S): void {
  const pad = WALL_TONE_PADS[padId];
  if (pad == null) {
    return;
  }
  const context = getContext();
  const start = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(pad.frequencyHz, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationS);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + durationS + 0.05);
}

export function playErrorTone(): void {
  const context = getContext();
  const start = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(180, start);
  oscillator.frequency.exponentialRampToValueAtTime(120, start + 0.25);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + 0.4);
}

export function suspendAudioContext(): void {
  void sharedContext?.close();
  sharedContext = null;
}
