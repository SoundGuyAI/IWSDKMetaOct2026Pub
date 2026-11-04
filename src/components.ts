/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { defineComponents } from '@iwsdk/core';
import { Robot } from './robot-component.js';
import { WallSlotCandidate } from './wall-tones/wall-slot-candidate-component.js';
import { WallTonePad } from './wall-tones/wall-tone-pad-component.js';

export default defineComponents([Robot, WallTonePad, WallSlotCandidate]);
