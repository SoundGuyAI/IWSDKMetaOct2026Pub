# WebXR-to-native - exploration notes

Exploration only. Nothing here changes the shipped game, signs anything, or
goes near a store. Requested by Oded on 2026-11-18, from Florian Isikci's
LinkedIn post about bringing his own WebXR game to the Meta Quest Store as a
native app. Separate from the Horizon PWA packaging track.

## What the project is

**webxr-to-native** (<https://github.com/Srile/webxr-to-native>) by Florian
Isikci (WebXR game developer, ex-Vhite Rabbit / Wonderland Engine). Announced
2026-11-09; first tagged release v0.1.0 on 2026-11-10. **MIT licence.**

It is a native runtime that runs an **unmodified WebXR build** (the `dist/`
Vite produces) as an ordinary native Android APK for Meta Quest, with no
browser and no WebView underneath:

- JavaScript runs on V8 (JIT on Android).
- WebGL 2 is bound straight to the headset's GLES driver, on its own GL
  thread by default.
- WebXR is Meta's IWER in host mode, driven by OpenXR frames.
- WebAudio is a native audio graph (`decodeAudioData` handles WAV, Ogg,
  WebM, MP3).
- You write one `host.json` and get a release-signed APK that Meta's
  `ovr-platform-util` accepts as-is.

The author's claim, from his IWSDK benchmark on Quest 2: roughly **2x the
draw calls per frame** of Quest Browser, because GL calls skip the browser.
Tested upstream with three.js + IWSDK and Wonderland Engine on Quest 2 and
Quest 3 (72-120 Hz, multiview, controllers and hands). Passthrough AR and
plane/mesh detection are built but flagged "less tested" upstream.

It also exposes `navigator.horizon` - Meta Platform SDK features
(entitlement, user identity, leaderboards, achievements) when the app
bundles a Meta app id.

Caveats stated by the author: it is early; it draws no HTML/CSS; expect
rough edges. The README credits Claude (Anthropic) with writing much of the
code and running most on-device verification - the project is days old and
effectively single-maintainer, so treat it as promising, not proven.

## Why it fits Wall Tones unusually well

Our stack is exactly what the author tests against: `@iwsdk/core`
1.1.0-rc.2, `super-three` 0.185, Vite, and in-scene UI via uikit/uikitml.
Audited against `main` at `baa3e8b`:

**Works with the runtime as documented:**

- **All game UI is in-scene** (uikit panels, uikitml) - the "no HTML/CSS"
  limitation does not touch menus, Store, Achievements, settings, or the
  game panel.
- **Voice and pad audio use WebAudio**: speech clips are `fetch` +
  `decodeAudioData` (MP3, supported); pad tones are synthesized through an
  `AudioContext`. Assets are bundled (~23 MB of `public/audio`), so the game
  runs fully offline in the APK.
- **Persistence is `localStorage`** (settings, accessibility, economy,
  voice gender) - supported natively by the runtime.
- **No IndexedDB, service worker, WebSocket, WebRTC, camera, or video**
  anywhere in the game code.
- Canvas 2D is used for icon/label textures (store icons, achievement
  icons, bar floats, rift note visuals, armband buttons) - the runtime has
  a Canvas 2D subset built for exactly this.

**Gaps found in the audit (each has a known route, none verified on
device):**

1. **`sessionStorage` is used but not listed as supported.** App mode,
  lab test controls, dominant hand, and setup mode keys live there
  (`src/app-mode.ts`, `src/wall-tones/wall-tones-system.ts`). Route: small
  `web.inject` boot shim mapping `sessionStorage` onto in-memory storage,
  or migrate those keys to `localStorage`. Session-scoped by design, so an
  in-memory shim is semantically fine.
2. **HTMLAudioElement paths exist for mobile sound unlock and rift-lab
  ambience.** The runtime has no `<audio>` playback. The Quest path already
  prefers WebAudio (`needsExplicitMobileSoundUnlock()` gates the HTML pool
  to mobile), but the rift-lab looping sounds
  (`src/rift-lab/rift-sounds.ts`) are `<audio loop>` over MP3 - they would
  be silent in a native build until ported to WebAudio buffer loops.
3. **The HTML loading card, audio-start-gate and startup DOM captions will
  never draw** (no layout engine). They should not crash - the runtime has
  a light DOM - but a native build needs `xr.autoEnter` plus a `web.inject`
  boot script to bypass the mobile sound gate, and `app.splash` for the
  loading window. The audio gate exists for mobile browser autoplay rules
  and should be unnecessary in a native XR session.
4. **Canvas text needs `web.canvasText: true` and a real font.** Several
  textures draw text with generic `sans-serif` (`fillText`); upstream uses
  stb_truetype with `FontFace` fonts, so a default sans may need bundling.
  Expect icon/label texture QA.
5. **Passthrough + plane/mesh detection are the least-tested upstream
  area**, and they are core to Wall Tones MR setup (wall/table placement).
  Headset QA before any commitment.
6. **Microphone is opt-in (`media.microphone`)** and only used by the
  experimental breath/gaze lab (`src/guided-sensing.ts`) - leave off for
  the game build.

**Billing / store relevance (compared to the PWA track):**

- A native APK goes through Meta's standard native submission
  (`ovr-platform-util`), where **paid apps are a normal store option** -
  the PWA route's older free-to-play-only constraint does not obviously
  apply. Verify Meta's current paid-app policy before deciding anything.
- `navigator.horizon` documents entitlement, user, leaderboards and
  achievements. **An IAP purchase flow is not documented in v0.1.0** - open
  question if we want in-app purchases natively rather than a paid
  download.
- Both tracks can coexist: the same `dist/` feeds Bubblewrap (PWA) and
  webxr-to-native (APK). Choosing between them, or shipping both, is Oded's
  call after a device test.

## What trying it takes

- A Mac (arm64/x64) or x86_64 Linux machine with Node 18+ (we pin 22.12.0),
  CMake 3.22+ and Ninja.
- `tools/setup.sh` downloads the Android SDK/NDK, V8, OpenXR loader etc.
  into the toolkit repo and **accepts the Android SDK licence on your
  behalf** - read <https://developer.android.com/studio/terms> first; that
  acceptance is Oded's decision.
- A Quest in developer mode over USB for debug builds.
- Release builds need a signing keystore - a secret that never enters this
  repo; generate and decide storage separately when we get there.
- A square PNG icon (`app.icon`) - the repo currently has only
  `wall-tones-icon.svg`; produce `icon-512.png` when we do a first pack.
- `app.package` in `native/host.json` is a **placeholder**
  (`com.corbomite.walltones2`) - Oded confirms the real application id.
- `app.metaAppId` stays empty until a Meta developer app exists for this
  route.

## Suggested exploration sequence

1. Set up the toolkit on a build machine; run its `hello-xr` and
   `hello-js` samples on Oded's Quest to prove the toolchain end to end.
2. Pack our real `dist/` with `native/host.json` as a **debug** build and
   sideload it.
3. On-device QA checklist: menu and Store/Achievements panels render;
   narrator + pad audio play; icon/label canvas textures show text; MR
   wall/table placement works; rift ambience silence confirmed (known
   gap); `tools/bridge.mjs stats` for frame cost vs Quest Browser.
4. Fix sessionStorage (shim or migrate) and the rift-lab audio path behind
   app-mode flags, each in its own PR.
5. Only then: release signing, Meta app id, store listing - all separate
   owner decisions, none pre-authorized by this exploration.

## Sources

- LinkedIn post (the one Oded sent, 2026-11-09):
  <https://www.linkedin.com/posts/florian-isikci_dear-webxr-developers-for-the-last-few-share-7525631295213916160-oniE/>
- Project repo and README:
  <https://github.com/Srile/webxr-to-native>
- v0.1.0 release notes (2026-11-10):
  <https://github.com/Srile/webxr-to-native/releases>
- Licence (MIT):
  <https://github.com/Srile/webxr-to-native/blob/main/LICENSE>
- IWER (Meta's WebXR emulation runtime, MIT), the WebXR layer it drives:
  <https://github.com/meta-quest/immersive-web-emulation-runtime>
