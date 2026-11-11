/**
 * Pure thumbs up/down gesture classification for the thumbs yes/no lab.
 *
 * No three.js or IWSDK imports: the system layer samples XRHand joint poses
 * from the active XR frame and feeds plain vectors here, which keeps the
 * classifier unit-testable in plain node.
 *
 * Model per hand: the thumb direction (proximal phalanx to tip) is compared
 * with world up; the thumb must be extended (tip farther from the wrist than
 * its base joint) and the index and middle fingers must be curled (tips
 * closer to the wrist than their knuckles). A pose held for `holdSec`
 * reports the gesture, then a cooldown follows.
 *
 * Known limits (docs/THUMBS_LAB_RESEARCH.md): the world-up assumption breaks
 * when the arm points far up or down; relaxed hands can sit between curled
 * and extended. Thresholds are starting values for headset tuning.
 */

export type YesNoAnswer = 'yes' | 'no';

export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Joints the classifier reads (WebXR hand joint names). */
export interface ThumbHandJoints {
  readonly wrist: Vec3Like;
  readonly thumbProximal: Vec3Like;
  readonly thumbTip: Vec3Like;
  readonly indexProximal: Vec3Like;
  readonly indexTip: Vec3Like;
  readonly middleProximal: Vec3Like;
  readonly middleTip: Vec3Like;
}

export const THUMB_JOINT_NAMES = {
  wrist: 'wrist',
  thumbProximal: 'thumb-phalanx-proximal',
  thumbTip: 'thumb-tip',
  indexProximal: 'index-finger-phalanx-proximal',
  indexTip: 'index-finger-tip',
  middleProximal: 'middle-finger-phalanx-proximal',
  middleTip: 'middle-finger-tip',
} as const;

export type ThumbPose = 'up' | 'down' | 'none';

export interface ThumbGestureConfig {
  /** dot(thumb direction, world up) magnitude that counts as vertical. */
  readonly alignmentMin: number;
  /** thumb tip must be this factor farther from the wrist than its base. */
  readonly extensionRatio: number;
  /** finger tip must be within this factor of its knuckle's wrist distance. */
  readonly curlRatio: number;
  /** time a pose must hold before it reports (seconds). */
  readonly holdSec: number;
  /** quiet time after a reported gesture (seconds). */
  readonly cooldownSec: number;
}

export const DEFAULT_THUMB_GESTURE_CONFIG: ThumbGestureConfig = {
  alignmentMin: 0.65,
  extensionRatio: 1.08,
  curlRatio: 1.12,
  holdSec: 0.3,
  cooldownSec: 1.2,
};

function sub(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function length(v: Vec3Like): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/** Per-frame pose read for one hand. */
export function classifyThumbPose(
  joints: ThumbHandJoints,
  config: ThumbGestureConfig = DEFAULT_THUMB_GESTURE_CONFIG,
): { pose: ThumbPose; alignment: number } {
  const thumbDir = sub(joints.thumbTip, joints.thumbProximal);
  const thumbLen = length(thumbDir);
  if (thumbLen < 1e-4) {
    return { pose: 'none', alignment: 0 };
  }
  // Thumb straightened: its tip reaches farther from the wrist than its base.
  const tipReach = length(sub(joints.thumbTip, joints.wrist));
  const baseReach = length(sub(joints.thumbProximal, joints.wrist));
  const extended = tipReach > baseReach * config.extensionRatio;
  // Fist: index and middle tips tucked to (or past) their knuckles.
  const curled =
    length(sub(joints.indexTip, joints.wrist)) <
      length(sub(joints.indexProximal, joints.wrist)) * config.curlRatio &&
    length(sub(joints.middleTip, joints.wrist)) <
      length(sub(joints.middleProximal, joints.wrist)) * config.curlRatio;
  const alignment = (thumbDir.y / thumbLen);
  if (!extended || !curled) {
    return { pose: 'none', alignment };
  }
  if (alignment >= config.alignmentMin) {
    return { pose: 'up', alignment };
  }
  if (alignment <= -config.alignmentMin) {
    return { pose: 'down', alignment };
  }
  return { pose: 'none', alignment };
}

export interface ThumbGestureEvent {
  readonly answer: YesNoAnswer;
  readonly hand: 'left' | 'right';
  readonly alignment: number;
  readonly at: number;
}

interface HandState {
  candidate: ThumbPose;
  since: number;
  lastAlignment: number;
}

export class ThumbGestureDetector {
  private readonly hands: Record<'left' | 'right', HandState> = {
    left: { candidate: 'none', since: -1, lastAlignment: 0 },
    right: { candidate: 'none', since: -1, lastAlignment: 0 },
  };
  private lastEventAt = -Infinity;
  private enabled = false;

  constructor(
    private readonly config: ThumbGestureConfig = DEFAULT_THUMB_GESTURE_CONFIG,
  ) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.reset();
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  reset(): void {
    for (const hand of ['left', 'right'] as const) {
      this.hands[hand] = { candidate: 'none', since: -1, lastAlignment: 0 };
    }
  }

  /** Latest classifier read for the panel telemetry. */
  handAlignment(hand: 'left' | 'right'): number {
    return this.hands[hand].lastAlignment;
  }

  /** Feed one frame; joints are null when that hand is not tracked. */
  feed(
    left: ThumbHandJoints | null,
    right: ThumbHandJoints | null,
    now: number,
  ): ThumbGestureEvent | null {
    if (!this.enabled) {
      return null;
    }
    const samples: Array<['left' | 'right', ThumbHandJoints | null]> = [
      ['left', left],
      ['right', right],
    ];
    for (const [hand, joints] of samples) {
      const state = this.hands[hand];
      const reading =
        joints == null
          ? { pose: 'none' as ThumbPose, alignment: 0 }
          : classifyThumbPose(joints, this.config);
      state.lastAlignment = reading.alignment;
      if (reading.pose === 'none') {
        state.candidate = 'none';
        state.since = -1;
        continue;
      }
      if (state.candidate !== reading.pose) {
        state.candidate = reading.pose;
        state.since = now;
        continue;
      }
      if (
        now - state.since >= this.config.holdSec &&
        now - this.lastEventAt >= this.config.cooldownSec
      ) {
        this.lastEventAt = now;
        this.setEnabled(false);
        return {
          answer: reading.pose === 'up' ? 'yes' : 'no',
          hand,
          alignment: reading.alignment,
          at: now,
        };
      }
    }
    return null;
  }
          }
