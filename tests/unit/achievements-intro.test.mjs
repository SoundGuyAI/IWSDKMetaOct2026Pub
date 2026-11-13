import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../../src/wall-tones/' + p, import.meta.url), 'utf8');

test('both voices embed one approved clip per platform', () => {
  for (const g of ['male', 'female']) {
    for (const p of ['pc', 'iphone', 'mr']) {
      const src = read(`achv-intro-${g}-${p}.ts`);
      const m = src.match(/'data:audio\/mpeg;base64,([A-Za-z0-9+\/=]+)'/);
      assert.ok(m, `${g} ${p} clip present`);
      assert.ok(m[1].length > 100000, `${g} ${p} clip is real audio, not a stub`);
    }
  }
});
test('approved wording per platform is the transcript', () => {
  const t = read('clip-transcripts.ts');
  const shared = "This is your achievements board. Each tile shows an achievement and its level. Dim tiles haven't been earned yet.";
  assert.ok(t.includes(shared + ' Hover over a tile to see its details.'));
  assert.ok(t.includes(shared + ' Touch a tile to see its details.'));
  assert.ok(t.includes(shared + ' Look at a tile or point at it with the ray to see its details.'));
});

test('intro plays once, first board open, voices-off respected', () => {
  const s = read('wall-tones-system.ts');
  assert.ok(s.includes("'wall-tones-achievements-intro-played'"));
  assert.ok(s.includes('if (open) this.playAchievementsIntroOnce();'));
  assert.ok(s.includes('if (voicesOffEnabled()) return;'));
  assert.ok(s.includes("'achvIntroMr' : phone ? 'achvIntroIphone' : 'achvIntroPc'"));
});
