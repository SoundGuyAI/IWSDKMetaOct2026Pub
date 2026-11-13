/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * THIRD_PARTY_NOTICES file in the root directory of this source tree.
 */

/**
 * Store tree scrolling (critical MR bug, owner report 2026-11-14): the skill
 * tree outgrows its fixed viewport, but the only scroll gesture uikit offers
 * is a sustained pointer drag (touch-style pointerdown + move) or a mouse
 * wheel. In MR neither is reliable: gaze/dwell and head-direction selection
 * emit plain clicks with no held drag, and pinch-drags are exactly what the
 * owner's device drops (backlog 77). The chevron buttons scroll by a fixed
 * step on plain clicks, which every MR input mode can produce; drag and
 * wheel scrolling stay as they are.
 */

/** One chevron press scrolls the store tree by most of a viewport (296px). */
export const STORE_SCROLL_STEP = 232;

/** Clamp a requested scroll target into the list's scrollable range. */
export const clampStoreScroll = (
  y: number,
  maxY: number,
  delta: number,
): number => Math.max(0, Math.min(Math.max(0, maxY), y + delta));

/** Chevron enabled state at a scroll position (ends dim the dead button). */
export const storeScrollEnabled = (
  y: number,
  maxY: number,
): { up: boolean; down: boolean } => ({
  up: y > 0.5,
  down: maxY > 0.5 && y < maxY - 0.5,
});
