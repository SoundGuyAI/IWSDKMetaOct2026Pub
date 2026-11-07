/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * THIRD_PARTY_NOTICES file in the root directory of this source tree.
 */

/**
 * Build identity injected by vite.config.ts `define`. Unit-style tests import
 * source modules under plain Node, where the Vite globals do not exist, so
 * guard with typeof and fall back to 'dev'.
 */
const version =
  typeof __WALL_TONES_VERSION__ !== 'undefined' ? __WALL_TONES_VERSION__ : 'dev';
const commit =
  typeof __WALL_TONES_COMMIT__ !== 'undefined' ? __WALL_TONES_COMMIT__ : 'dev';

export const WALL_TONES_BUILD_INFO = { version, commit } as const;
export const WALL_TONES_BUILD_LABEL = `v${version} - ${commit}`;
