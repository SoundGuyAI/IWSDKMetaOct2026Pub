import { WALL_TONE_PADS, NOTE_DURATION_S } from './constants.js';

let sharedContext: AudioContext | null = null;
const htmlToneCache = new Map<number, string>();
const htmlAudioPool: HTMLAudioElement[] = [];
let htmlPoolUnlocked = false;
let webAudioPrimed = false;

function createContext(): AudioContext {
  const Ctx =
    globalThis.AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (Ctx == null) {
    throw new Error('[wall-tones] Web Audio not available');
  }
  sharedContext = new Ctx();
  return sharedContext;
}

function getContext(): AudioContext {
  if (sharedContext == null || sharedContext.state === 'closed') {
    return createContext();
  }
  return sharedContext;
}

/** iPhone / iPad Safari needs HTML audio unlocked from a real tap before tones or TTS work reliably. */
export function needsExplicitMobileSoundUnlock(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent;
  const ios =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.maxTouchPoints > 0 && /MacIntel/i.test(navigator.platform));
  const android = /Android/i.test(ua);
  return ios || android;
}

export function isHtmlAudioPoolUnlocked(): boolean {
  return htmlPoolUnlocked;
}

function playSilentBlip(context: AudioContext): void {
  const start = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(0.03, start + 0.008);
  gain.gain.linearRampToValueAtTime(0.0001, start + 0.035);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + 0.04);
}

function schedulePadToneWebAudio(
  context: AudioContext,
  padId: number,
  durationS = NOTE_DURATION_S,
): void {
  const pad = WALL_TONE_PADS[padId];
  if (pad == null) {
    return;
  }
  const start = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(pad.frequencyHz, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.45, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationS);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + durationS + 0.05);
}

function wavDataUrlForTone(frequencyHz: number, durationS: number): string {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * durationS);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < numSamples; i += 1) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t * 40) * Math.max(0, 1 - (t - 0.05) * 8);
    const sample =
      Math.sin(2 * Math.PI * frequencyHz * t) * envelope * 0.55 * 32767;
    view.setInt16(44 + i * 2, sample, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function htmlToneUrl(padId: number): string {
  let url = htmlToneCache.get(padId);
  if (url == null) {
    const pad = WALL_TONE_PADS[padId];
    url = wavDataUrlForTone(pad?.frequencyHz ?? 440, NOTE_DURATION_S);
    htmlToneCache.set(padId, url);
  }
  return url;
}

function ensureHtmlAudioPool(): void {
  if (htmlAudioPool.length >= 4) {
    return;
  }
  for (let padId = 0; padId < 4; padId += 1) {
    const audio = new Audio(htmlToneUrl(padId));
    audio.preload = 'auto';
    htmlAudioPool[padId] = audio;
  }
}

/**
 * Unlock HTMLAudio on a user gesture. Must stay inaudible — an earlier version
 * played pad 0 at audible volume on every pointerdown ("tone anywhere" + doubles).
 */
export function unlockHtmlAudioPoolFromGesture(): boolean {
  ensureHtmlAudioPool();
  if (htmlPoolUnlocked) {
    return true;
  }
  let started = false;
  for (let padId = 0; padId < htmlAudioPool.length; padId += 1) {
    const audio = htmlAudioPool[padId];
    if (audio == null) {
      continue;
    }
    audio.volume = 0.0001;
    audio.currentTime = 0;
    try {
      const pending = audio.play();
      started = true;
      if (pending != null) {
        void pending
          .then(() => {
            htmlPoolUnlocked = true;
            audio.pause();
            audio.currentTime = 0;
          })
          .catch(() => {
            /* retry on next gesture */
          });
      }
    } catch {
      /* ignored */
    }
  }
  if (started) {
    htmlPoolUnlocked = true;
  }
  return started;
}

function playPooledPadTone(padId: number): void {
  ensureHtmlAudioPool();
  const audio = htmlAudioPool[padId];
  if (audio == null || !htmlPoolUnlocked) {
    playHtmlPadTone(padId);
    return;
  }
  audio.volume = 0.95;
  audio.currentTime = 0;
  void audio.play().catch(() => {
    playHtmlPadTone(padId);
  });
}

function playHtmlPadTone(padId: number): void {
  try {
    const audio = new Audio(htmlToneUrl(padId));
    audio.volume = 0.95;
    void audio.play().catch(() => {
      /* ignored */
    });
  } catch {
    /* ignored */
  }
}

function playPadToneInternal(padId: number, durationS = NOTE_DURATION_S): void {
  if (needsExplicitMobileSoundUnlock() || htmlPoolUnlocked) {
    if (htmlPoolUnlocked) {
      playPooledPadTone(padId);
      return;
    }
  }
  const context = getContext();
  if (context.state === 'running') {
    schedulePadToneWebAudio(context, padId, durationS);
    return;
  }
  void context.resume().then(() => {
    if (context.state === 'running') {
      schedulePadToneWebAudio(context, padId, durationS);
    } else {
      playHtmlPadTone(padId);
    }
  });
}

/** Call synchronously inside touchstart / click — resume only, no audible blip. */
export function primeWallTonesAudioFromGesture(): void {
  unlockHtmlAudioPoolFromGesture();
  const context = getContext();
  if (context.state === 'suspended') {
    void context.resume().then(() => {
      // One near-silent tick only on the first successful resume.
      if (context.state === 'running' && !webAudioPrimed) {
        webAudioPrimed = true;
        playSilentBlip(context);
      }
    });
  }
}

export async function ensureAudioRunning(): Promise<AudioContext | null> {
  const context = getContext();
  if (context.state === 'suspended') {
    try {
      await context.resume();
    } catch (error) {
      console.warn('[wall-tones] AudioContext resume failed', error);
    }
  }
  return context.state === 'running' ? context : null;
}

export function playPadToneFromUserAction(padId: number): void {
  playPadToneInternal(padId);
}

export async function unlockWallTonesAudio(): Promise<boolean> {
  primeWallTonesAudioFromGesture();
  const context = await ensureAudioRunning();
  return context != null || htmlPoolUnlocked;
}

export async function playPadTone(
  padId: number,
  durationS = NOTE_DURATION_S,
): Promise<void> {
  if (htmlPoolUnlocked) {
    playPooledPadTone(padId);
    return;
  }
  const context = await ensureAudioRunning();
  if (context != null) {
    schedulePadToneWebAudio(context, padId, durationS);
    return;
  }
  playHtmlPadTone(padId);
}

export async function playErrorTone(): Promise<void> {
  if (htmlPoolUnlocked) {
    playPooledPadTone(0);
    window.setTimeout(() => playPooledPadTone(0), 120);
    return;
  }
  const context = await ensureAudioRunning();
  if (context == null) {
    playHtmlPadTone(0);
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
  htmlToneCache.clear();
  htmlAudioPool.length = 0;
  htmlPoolUnlocked = false;
  webAudioPrimed = false;
}
