import { Types, createComponent } from '@iwsdk/core';

/** Ray-selectable 1x1m pad candidate on a detected wall during room-scale setup. */
export const WallSlotCandidate = createComponent('WallSlotCandidate', {
  candidateIndex: { type: Types.Int16, default: 0 },
  wallIndex: { type: Types.Int16, default: 0 },
  selected: { type: Types.Boolean, default: false },
});
