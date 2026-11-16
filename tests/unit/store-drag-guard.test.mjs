import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const src = readFileSync(new URL('../../src/wall-tones/store-drag-guard.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext }}).outputText;
const guard = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const { exceedsTapSlop, resetStorePress, storePressWasDrag, storeListOnScroll, attachStoreDragGuard, storeTapHandledOnRelease } = guard;

test('small jitter stays a tap, a real drag does not', () => {
  assert.equal(exceedsTapSlop(3, 4), false);
  assert.equal(exceedsTapSlop(0, 14), false);
  assert.equal(exceedsTapSlop(0, 15), true);
});

test('tiny scroll delta cannot poison a tap; repeated native-event drags remain enabled', () => {
  const flag = Symbol('was-scrolled');
  const nativeEvent = { [flag]: true };
  resetStorePress();
  storeListOnScroll(0, 0.01, { value: [0, 0] }, { nativeEvent });
  assert.equal(storePressWasDrag(), false);
  assert.equal(nativeEvent[flag], undefined);
  nativeEvent[flag] = true;
  storeListOnScroll(0, 100, { value: [0, 0] }, { nativeEvent });
  assert.equal(nativeEvent[flag], undefined);
});

test('release selects once for jitter but not a drag or cancellation; next press resets', () => {
  const handlers = {};
  const list = {
    size: { value: [100, 100] },
    worldToLocal: p => p,
    addEventListener: (name, fn) => { handlers[name] = fn; },
  };
  attachStoreDragGuard(list);
  const event = (y) => ({ point: { clone: () => ({ x: 0, y }) } });
  let selections = 0;
  const press = () => { resetStorePress(() => selections++); handlers.pointerdown(event(0)); };
  press(); handlers.pointermove(event(0.02)); handlers.pointerup();
  assert.equal(selections, 1);
  // Rebuilding a large UIKit tree can block the synthetic click >1 second.
  assert.equal(storeTapHandledOnRelease(performance.now() + 1500), true);
  assert.equal(storeTapHandledOnRelease(), false);
  press(); handlers.pointermove(event(0.5)); handlers.pointerup();
  assert.equal(selections, 1);
  assert.equal(storePressWasDrag(), true);
  press(); handlers.pointercancel(); handlers.pointerup();
  assert.equal(selections, 1);
  press(); handlers.pointerup();
  assert.equal(selections, 2);
  assert.equal(storeTapHandledOnRelease(performance.now() + 5000), false);
});
