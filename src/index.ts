/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { startInitialWorld } from './wall-tones/world-host.js';

void startInitialWorld(
  document.getElementById('scene-container') as HTMLDivElement,
);
