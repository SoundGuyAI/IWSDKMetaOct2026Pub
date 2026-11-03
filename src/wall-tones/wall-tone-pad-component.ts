import { Types, createComponent } from '@iwsdk/core';

export const WallTonePad = createComponent('WallTonePad', {
  padIndex: { type: Types.Int8, default: 0 },
});
