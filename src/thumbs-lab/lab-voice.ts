/**
 * Cypher voice playback for the gesture labs.
 *
 * Clips live under public/audio/speech/cypher-lab/<set>/<clipId>.mp3 and are
 * produced by the voice pipeline in docs/CYPHER_LAB_CLIPS.md. Until they
 * land, the lab runs in an honest text-preview mode: every line shows as
 * panel text and captions, nothing speaks, and the panel says the Cypher
 * voice is pending. No substitute voice is passed off as Cypher.
 */

import {
  endSpokenCaption,
  hearingSubtitlesEnabled,
  startSpokenCaption,
  voicesOffEnabled,
} from '../wall-tones/accessibility.js';
import { getVoiceGender } from '../wall-tones/speech.js';
import { labLineReadingMs, type LabScriptLine } from './lab-script.js';

/** Cypher speaks opposite the selected narrator gender (owner, Nov 11). */
export type CypherLabVoiceSet = 'male' | 'female';

export function cypherLabVoiceSet(): CypherLabVoiceSet {
  return getVoiceGender() === 'female' ? 'male' : 'female';
}

export function cypherLabClipUrl(set: CypherLabVoiceSet, clipId: string): string {
  return new URL(`audio/speech/cypher-lab/${set}/${clipId}.mp3`, document.baseURI).href;
}

const availabilityCache = new Map<string, Promise<boolean>>();

async function probeClip(url: string): Promise<boolean> {
  let cached = availabilityCache.get(url);
  if (cached == null) {
    cached = (async () => {
      try {
        const response = await fetch(url, { method: 'GET', cache: 'no-store' });
        const type = response.headers.get('content-type') ?? '';
        // Dev/preview servers answer a missing public file with the SPA
        // fallback page; only a real audio payload counts as present.
        return response.ok && type.includes('audio');
      } catch {
        return false;
      }
    })();
    availabilityCache.set(url, cached);
  }
  return cached;
}

export type LabVoiceStatus =
  | { kind: 'ready'; set: CypherLabVoiceSet }
  | { kind: 'pending'; set: CypherLabVoiceSet }
  | { kind: 'voices-off' };

export class CypherLabVoice {
  private audio: HTMLAudioElement | null = null;
  private activeCaption: number | null = null;
  private playToken = 0;

  /** Probed once per lab open; drives the panel voice status line. */
  async status(): Promise<LabVoiceStatus> {
    if (voicesOffEnabled()) {
      return { kind: 'voices-off' };
    }
    const set = cypherLabVoiceSet();
    const ready = await probeClip(cypherLabClipUrl(set, 'yes'));
    return ready ? { kind: 'ready', set } : { kind: 'pending', set };
  }

  cancel(): void {
    this.playToken += 1;
    this.audio?.pause();
    if (this.activeCaption != null) {
      endSpokenCaption(this.activeCaption);
      this.activeCaption = null;
    }
  }

  /**
   * Play one line, resolving when it finishes (real clip) or when its
   * caption reading time elapses (voices off / clips pending).
   */
  async speak(set: CypherLabVoiceSet, line: LabScriptLine): Promise<void> {
    this.cancel();
    const token = ++this.playToken;
    const silent = voicesOffEnabled();
    const url = cypherLabClipUrl(set, line.clipId);
    const available = silent ? false : await probeClip(url);
    if (token !== this.playToken) {
      return;
    }
    const showCaption = !available || hearingSubtitlesEnabled() || silent;
    if (showCaption) {
      this.activeCaption = startSpokenCaption(line.text);
    }
    const finish = () => {
      if (this.activeCaption != null) {
        endSpokenCaption(this.activeCaption);
        this.activeCaption = null;
      }
    };
    if (!available) {
      // Test hook: e2e sets window.__labLineReadingMs to fast-forward the
      // silent caption pacing instead of waiting out real reading time.
      const override = (
        window as unknown as { __labLineReadingMs?: number }
      ).__labLineReadingMs;
      const waitMs = override ?? labLineReadingMs(line.text);
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, waitMs);
      });
      if (token === this.playToken) {
        finish();
      }
      return;
    }
    if (this.audio == null) {
      this.audio = new Audio();
      this.audio.preload = 'auto';
    }
    const audio = this.audio;
    audio.src = url;
    audio.currentTime = 0;
    await new Promise<void>((resolve) => {
      const done = () => {
        audio.removeEventListener('ended', done);
        audio.removeEventListener('error', done);
        if (token === this.playToken) {
          finish();
        }
        resolve();
      };
      audio.addEventListener('ended', done);
      audio.addEventListener('error', done);
      // Never wedge the dialogue on a decode hiccup.
      window.setTimeout(done, 20000);
      void audio.play().catch(done);
    });
  }
}
