# Button-press frame investigation (backlog 129)

Status: investigation, not a Quest fix. This is backlog item 129, not historical Rift visuals PR #129. No runtime behavior or effect has been removed.

## Question and current answer

Investigate frame drops on later, warmed-up scoring presses. The +N reward effect is a hypothesis, not an established cause.

`BarFloatPool` already acts as a factory/pool. It lazily creates at most eight reusable sprite/material slots, caches a CanvasTexture per distinct label, reuses inactive slots, and reuses an existing slot when saturated. It does not create a new sprite and texture on every warmed +1 press. Flat mode additionally reuses DOM labels. A different +N amount can allocate a new cached texture. The current saturation implementation reuses slot zero, despite its comment describing this as the oldest slot.

Every spawn sets `material.needsUpdate`. That increments material version, but does NOT demonstrate recompilation: the isolated renderer compiled once across the first render and 100 warmed repeats. Do not describe this flag as a proven per-press shader compilation bug.

## Reproducible local probe

From a clean checkout with the repo's supported Node version:

```sh
npm ci
npx playwright install chromium
npm run build
node scripts/perf/button-frame-probe.mjs /tmp/button-performance
```

The probe starts a temporary Vite preview on HTTPS port 4179, launches a fresh headless Chromium/SwiftShader context, and uses real mouse input on the four pads. The debug bridge is used to read sequence/phase and skip setup narration, never to submit scoring presses. It waits through a three-second idle-input baseline, then records 12 accepted inputs. Startup attempts are retained, not silently dropped. Coordinates assume a 1280x720 viewport and the current flat layout. If that layout changes, update the coordinates and inspect `real-input.png` before trusting results.

Outputs: `game.json` with raw RAF intervals, pointer timestamps, accepted before/after states, storage-write durations, canvas PNG encoding durations/stacks, and summary; `game.cpuprofile`; `real-input.png`; `floats.json`; `environment.json`; `server.log`. The probe always closes its browser/server. No existing browser profile or saved game is touched. Raw captures can contain URLs and storage key names; inspect before sharing.

The float microprobe bundles the actual bar-floats source, replacing only its core Three re-export with the installed Three module. It tests serial +1 reuse, 20 concurrent spawns, and a new +2 label. This isolates pool behavior, not the complete MR render pipeline. Timings are CPU submission durations without a GPU completion fence.

## Measured baseline

Baseline source: main `8cf45c42a730afdcd343b387566a0ef032d82cea`, no product changes. Chrome 156.0.8078.4, Node 22.23.5, headless SwiftShader. Compact results are in `button-frame-baseline.json`.

- Twelve real accepted mouse inputs reached streak 4, 26 Bars and 26 total score. Screenshot inspected: all four pads and the score panel visible, no menu obscuring the input path.
- Idle RAF median 50 ms, p95 66.7 ms; whole-run median 50 ms, p95 83.3 ms. This environment is already slow without presses. These numbers are not headset FPS or a Quest frame-budget result.
- Fifty-nine storage writes totaled approximately 1.7 ms, max 0.2 ms. These samples do not support a consistent storage hitch here, but do not rule it out on device.
- Float serial reuse: one slot, one texture after 101 total spawns. Warm spawn median/p95 below the clock's displayed precision; maximum 0.1 ms. Warm render submission median 0.1 ms, p95 0.3 ms, max 1.1 ms.
- Burst reuse: 20 simultaneous spawns kept eight slots/eight active floats and one texture. A new +2 label increased textures to two while slots stayed eight.
- Cold float allocation took 8.6 ms and first render submission 326.3 ms in this run. Separate runs varied widely (cold render around 11 to 326 ms), so this is not a stable performance guarantee. Cold work alone does not explain later repeated presses.
- CPU sampling identified canvas PNG serialization as a substantial occasional task. Instrumentation found a new 30x18 sequence-arrow glyph encode around 1.24 seconds and a new 276x276 UI icon encode around 1.41 seconds. This is not the +1 CanvasTexture path. Both are isolated/new-key events in a software renderer, not evidence that every later press serializes an image. Do not optimize/remove those visuals based only on these host readbacks.

No runtime fix was selected because the recurring Quest symptom has not been isolated. There is deliberately no before/after speedup claim. The added tests check the probe's percentile and post-press-window math, not physical headset performance. Post-press windows are defined by RAF end timestamps and can include an interval beginning before the press; they establish temporal correlation, not input-to-display latency or causation.

## Next discriminating capture

Keep the same build, view and quality settings. On the affected device, record steady view for 15 seconds, then ten correct presses after +1 has already appeared several times. Mark first/new-label presses separately from repeated +1s. Keep Store/Achievements closed for this pass; repeat separately with them open only if the dip depends on them.

Collect a CPU performance trace plus the headset's available CPU/GPU frame-time view. A JavaScript trace alone cannot identify GPU completion, compositor reprojection, XR frame misses, room-mesh cost or passthrough cost. Disable remote screencasting while timing, since it can reduce framerate. If a device capture is unavailable, Cursor can run the desktop probe and inspect the warm-press profile, but should not label it Quest proof.

Only after locating the recurring cost, compare one controlled change against the same warm-press baseline. Preserve the visible +N amount, 0.9-second flight, destination, overlapping reward behavior and score/economy semantics. Plausible comparison branches include disabling only the reward visualization locally for diagnosis, or avoiding redundant material invalidation, but neither is an approved conclusion or a shipping fix here.

References for capture mechanics:
- https://developer.chrome.com/docs/devtools/remote-debugging
- https://developer.chrome.com/docs/devtools/performance

## Validation

Local typecheck, production build and all 325 unit tests passed, including two new summary/window tests. The standalone probe completed with 12 real accepted inputs and inspected desktop pixels. No full existing E2E-suite result or physical Quest acceptance is claimed. This investigation does not change app code, CI configuration, credentials or workflows, and does not authorize merge/deployment.