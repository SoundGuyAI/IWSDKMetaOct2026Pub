# Wall Tones

Wall Tones is a Simon-style memory game built with the Immersive Web SDK
(IWSDK) and Vite. Four colored pads light up and play a tone in a growing
sequence. Repeat the sequence by touching the pads in the same order. A wrong
pad ends the run and starts a fresh one. Your best streak is kept.

Live build (GitHub Pages): https://soundguyai.github.io/IWSDKMetaOct2026Pub/

## Play

- **Start Wall Tones** plays on a flat screen. Click a pad to begin.
- **Enter XR** launches an immersive session and starts Wall Tones in your room.
  Setup modes are room scale (pick four wall slots), sitting (table), and air
  placement (place pads with your hand).
- **Settings** (gear button on the main menu) opens the voice submenu, where you
  pick a male or female host voice. The choice is remembered in the browser.
- A recorded host voice introduces the game, cheers on a run that made progress,
  and calls out milestones every 5 patterns.

Planning notes live in `WALL_TONES_PLAN.md` and `WALL_TONES_TODO.md`.

## Project layout

- `src/wall-tones/` - game logic, pads, audio, speech and room placement.
  `wall-tones-system.ts` runs the game, `speech.ts` plays the voice clips.
- `src/app-mode.ts` - main menu wiring, including the Settings submenu.
- `public/ui/` - UIKitML panels (`main-menu.uikitml`, `wall-tones-placeholder.uikitml`).
- `public/audio/speech/{male,female}/` - prerecorded voice clips, one set per voice.
- `iwsdk.config.json` - IWSDK scene, asset and XR configuration.

## Develop

This is an IWSDK project, so it is configured by `iwsdk.config.json` and run
through the IWSDK CLI rather than plain `vite`. Application systems are
registered in `src/index.ts`.

```sh
npm install
npm run dev
```

Other scripts: `npm run typecheck` and `npm run build`.

Use the Runtime and Editor controls in the managed browser to switch between
the running experience and its authored scene.

## Starter template notes

The repo started from the IWSDK starter. Its demo content (robot, welcome panel
and the three numbered stations) is still in the scene.

The robot and welcome panel are small examples of authored scene content plus
runtime systems. The robot turns toward the player's head and plays a sound
when pressed. To remove the robot, delete its scene node, its `RobotSystem`
registration from `src/index.ts` or `src/index.js`, and its `Robot` registration
from `src/components.ts` or `src/components.js`; you can then delete the unused
robot component and system files. To remove the welcome panel, delete its scene
node and its `PanelSystem` registration from the application entry point.

The robot stands on the second of three numbered stations. The first holds dark
pieces you can grab and move, and the third holds a ring you can spin in place.
The studio props (the plinths and the dark pieces, plus the floor and stage in VR
and Desktop 3D) are built in code in `src/scene-assets/studio.scene-asset.ts` or
`.js`. The VR and Desktop 3D background furniture is built the same way in
`src/scene-assets/decor.scene-asset.ts` or `.js`, so the starter downloads no
extra models. To remove any of them, delete their scene nodes and their entries
in `src/assets.ts` or `src/assets.js`, then delete the files you no longer use.
The station labels are `public/ui/label-*.uikitml`.

The rest of the look is built-in components in the scene, which you can edit in
the editor without code. The soft light on every object is the scene root's
`IBLGradient` (select the Level Root to edit it), and the soft shadows under
each object are `ContactShadow` nodes. In VR and Desktop 3D, the sky is the
scene root's `DomeGradient` (its colors, tilt and dither are also on the Level
Root), and the floor fades into it through the `DomeFade` on the floor node. AR
projects have no sky or floor, so passthrough stays visible, and a
`ShadowCatcher` node grounds the stations.

- Minimal scene walkthrough: https://iwsdk.dev/guides/01b-minimal-scene.html
- XR-enabled projects — IWER emulator controls: https://iwsdk.dev/guides/02-testing-experience.html#iwer-controls
