import { hintWindowStart, HINT_WINDOW_SIZE } from './hint-window.js';
/** The armband preference is independent of the player's input/dominant hand. */
export type ArmbandHand = 'left' | 'right';
const HAND_KEY = 'wall-tones-armband-hand';
let sessionHand: ArmbandHand | undefined;
export function armbandHand(): ArmbandHand {
  if (sessionHand) return sessionHand;
  try { return localStorage.getItem(HAND_KEY) === 'right' ? 'right' : 'left'; }
  catch { return 'left'; }
}
export function setArmbandHand(hand: ArmbandHand): void {
  sessionHand = hand;
  try { localStorage.setItem(HAND_KEY, hand); } catch { /* Keep the session preference. */ }
  window.dispatchEvent(new Event('wall-tones-accessibility-change'));
}

import { Matrix4, Quaternion, Vector3, UIKit, type UIKitMLAsset } from '@iwsdk/core';
import { WALL_TONE_PADS } from './constants.js';

/** Wrist-local offset: above the wrist, extending back along the forearm. */
export const ARMBAND_OFFSET = { x: 0, y: 0.042, z: 0.075 };
export const ARMBAND_SCALE = 0.0438;
export interface ArmbandReadout {
  streak: number; best: number; phase: string; inputStep: number;
  sequence: readonly number[]; hintCount: number; listen: boolean;
  playbackShown: number; replays: number; autoplay: number; colorNames: boolean;
}
/** No free hints: the same ownership/phase rules as the game-board strip. */
export function armbandCueIds(state: ArmbandReadout): readonly number[] {
  if (state.phase === 'input' && state.hintCount > 0) return state.sequence.slice(0, state.hintCount);
  if (state.phase === 'playback' && state.listen) return state.sequence.slice(0, state.playbackShown);
  return [];
}

/** Shared by hand joints and controller grip poses; never billboarded to the head. */
export class ArmbandDisplay {
  readonly position = new Vector3();
  readonly orientation = new Quaternion();
  private readonly offset = new Vector3();
  private readonly panelRotation = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  private readonly readableRotation = new Quaternion();
  private readonly screenAxis = new Vector3(0, 0, 1);
  private readonly matrix = new Matrix4();
  private key = '';
  private squares: UIKit.Container[] = [];
  constructor(readonly panel: UIKitMLAsset) {}
  applyPose(position: {x: number; y: number; z: number}, orientation: {x: number; y: number; z: number; w: number}): void {
    this.orientation.set(orientation.x, orientation.y, orientation.z, orientation.w);
    this.offset.set(ARMBAND_OFFSET.x, ARMBAND_OFFSET.y, ARMBAND_OFFSET.z).applyQuaternion(this.orientation);
    this.position.set(position.x, position.y, position.z).add(this.offset);
    this.orientation.multiply(this.panelRotation);
    this.readableRotation.setFromAxisAngle(this.screenAxis, armbandHand() === 'left' ? Math.PI / 2 : -Math.PI / 2);
    this.orientation.multiply(this.readableRotation);
  }
  /** A joint transform is in XR reference coordinates; include the player's rig. */
  applyReferencePose(matrix: ArrayLike<number>, rig: import('@iwsdk/core').Object3D): void {
    this.matrix.fromArray(matrix);
    this.matrix.premultiply(rig.matrixWorld);
    this.position.setFromMatrixPosition(this.matrix);
    this.orientation.setFromRotationMatrix(this.matrix);
    this.applyPose(this.position, this.orientation);
  }
  render(state: ArmbandReadout): void {
    const cues = armbandCueIds(state);
    const key = [armbandHand(), state.streak, state.best, state.phase, state.inputStep, state.sequence.length,
      state.hintCount, state.replays, state.autoplay, state.colorNames, cues.join(',')].join(':');
    if (this.key === key) return;
    this.key = key;
    const set = (id: string, text: string) => this.panel.getElementById(id)?.setProperties({ text });
    set('armband-hand-label', armbandHand() === 'left' ? 'LEFT ARM' : 'RIGHT ARM');
    set('armband-streak', `Streak: ${state.streak} | Best: ${state.best}`);
    set('armband-phase', state.phase === 'input' ? `Your turn: ${state.inputStep + 1}/${state.sequence.length}` : state.phase === 'playback' ? 'Listen' : 'Ready');
    set('armband-repeat-label', `Repeat (${state.replays})`);
    this.panel.getElementById('armband-repeat')?.setProperties({
      disabled: state.phase !== 'input' || state.replays < 1,
    } as never);
    set('armband-autoplay-label', state.autoplay > 0 ? `Autoplay L${state.autoplay}` : 'Autoplay upgrade');
    set('armband-hint', state.phase === 'playback' && state.listen ? 'Listen: notes played so far' : state.hintCount > 0 ? `Hint: ${state.hintCount} notes owned` : 'Hint not owned');
    const row = this.panel.getElementById<UIKit.Container>('armband-sequence');
    if (!row) return;
    // Window long owned strips around current progress; never reveal unowned notes.
    const start = hintWindowStart(cues.length, state.phase === 'playback' ? state.playbackShown - 1 : state.inputStep);
    const shown = cues.slice(start, start + HINT_WINDOW_SIZE);
    if (cues.length > HINT_WINDOW_SIZE) set('armband-hint', `${state.phase === 'playback' ? 'Listen' : 'Hint'} ${start + 1}-${Math.min(start + HINT_WINDOW_SIZE, cues.length)} of ${cues.length}`);
    const currentCue = cues[state.inputStep];
    set('armband-instructions', state.colorNames && currentCue != null && state.phase === 'input'
      ? `Note ${state.inputStep + 1}: ${WALL_TONE_PADS[currentCue]!.name}` : 'Use your other hand to press');
    for (let i = this.squares.length; i < 20; i++) {
      const square = new UIKit.Container({ width: 22, height: 20, borderRadius: 2, justifyContent: 'center', alignItems: 'center' });
      square.add(new UIKit.Text({ text: '', fontSize: 15, color: 0xffffff }));
      this.squares.push(square); row.add(square);
    }
    for (let i = 0; i < 20; i++) {
      const id = shown[i];
      this.squares[i]!.setProperties({ display: id == null ? 'none' : 'flex', borderWidth: start + i === state.inputStep && state.phase === 'input' ? 2 : 0, borderColor: 0xffffff, backgroundColor: id == null ? 0 : WALL_TONE_PADS[id]!.color });
      (this.squares[i]!.children[0] as UIKit.Text).setProperties({ text: id == null ? '' : String(id + 1) });

    }
  }
}
