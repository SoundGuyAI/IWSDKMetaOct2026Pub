import { BackgroundProgress } from './cypher-background.js';
import { getVoiceGender } from './speech.js';
import { CypherProgress, type CypherWindow } from './cypher-progress.js';
import { captureCypherCast } from './cypher-voice.js';
import {selectionPanelPose, horizontalLookAway, panelOverlapsPad, rectangleInsidePolygon} from './panel-placement.js';
import { shouldAnnounceRecord } from './record-feedback.js';
import { BarFloatPool } from './bar-floats.js';
import { AchievementCelebration } from './achievement-celebration.js';
import { achievementIconSrc, achievementTileSrc } from './achievement-icons.js';
import { MovementTracker, formatMetersNumber, movementUiVisible, readLifetimeMovementMeters } from './movement.js';
import { hearingSubtitlesEnabled, colorNamesEnabled, currentSpokenCaption, voicesOffEnabled } from './accessibility.js';
import {
ConeGeometry,
Matrix4,
Raycaster,
CylinderGeometry,
DoubleSide,
Hovered,
Mesh,
MeshBasicMaterial,
Object3D,
Pressed,
Quaternion,
RayInteractable,
Transform,
UIKit,
Visibility,
UIKitMLAsset,
VisibilityState,
Vector3,
XRAnchor,
XRMesh,
XRPlane,
createSystem,
type Entity,
} from '@iwsdk/core';
import { XRHandVisualAdapter } from '@iwsdk/xr-input';
import type { ExperienceMode } from '../app-mode.js';
import { playErrorTone, playPadTone, playPadToneFromUserAction, primeWallTonesAudioFromGesture, suspendAudioContext, needsExplicitMobileSoundUnlock, isHtmlAudioPoolUnlocked } from './audio.js';
import {
AIR_GHOST_HAND_OFFSET_M,
AIR_GHOST_MIN_HEAD_DISTANCE_M,
AIR_ORIENT_SLERP,
AIR_ORIENT_SNAP_FLAT,
AIR_ORIENT_SNAP_UPRIGHT,
AIR_PLACE_ROOM_PAD_SIZE_M,
AIR_PLACE_SITTING_PAD_SIZE_M,
TABLE_PAD_FALLBACK_SIZE_M,
TABLE_PAD_SIZE_LADDER_M,
HEAD_CAPTION_DISTANCE_M,
HEAD_CAPTION_DOWN_M,
HEAD_CAPTION_SCALE,
HEADSET_PAD_SIZE_M,
PHONE_PAD_SIZE_M,
PHONE_PANEL_FLAT,
BLINK_CUE_OFFSCREEN_DEG,
BLINK_HOLD_S,
NOTE_GAP_S,
BETWEEN_ROUNDS_DELAY_S,
IDLE_REPLAY_S,
POST_INTRO_DELAY_S,
PANEL_FOLLOW_DISTANCE_M,
PANEL_FOLLOW_SCALE,
PANEL_FOLLOW_SLERP,
PANEL_FOLLOW_Y_OFFSET_M,
PANEL_LOOK_AWAY_DEG,
PANEL_RAY_BLOCK_DEG,
PANEL_RAY_DODGE_HOLD_MS,
PANEL_RAY_DODGE_UP_M,
PANEL_DRAG_DODGE_COOLDOWN_MS,
PANEL_RAY_DODGE_MIN_DEG,
PANEL_PLAY_DISTANCE_M,
PANEL_PLAY_SCALE,
PANEL_SNAP_ARRIVE_M,
SCAN_WAIT_S,
SIMON_FANFARE_END_PAUSE_S,
SIMON_FANFARE_FIRST_PAD_REPEATS,
SIMON_FANFARE_PAD_ORDER,
SIMON_FANFARE_MID_PAUSE_S,
TOUCH_ENTER_FRAMES,
TOUCH_EXIT_FRAMES,
TOUCH_HOVER_CENTER_MARGIN_M,
TOUCH_HOVER_DEPTH_M,
TOUCH_HOVER_SCALE,
TOUCH_PRESS_CENTER_MARGIN_M,
TOUCH_PRESS_COOLDOWN_S,
TOUCH_PRESS_DEPTH_M,
TOUCH_PRESS_SCALE,
TOUCH_TIP_GRIP_MAX_M,
WALL_TONE_PADS,
WRONG_RESET_DELAY_S,
type WallTonePadId,
} from './constants.js';
import {
collectTablePlanes,
detectFloorY,
collectVerticalWalls,
generateMixedTablePadCandidates,
generateTablePadCandidates,
maxCandidatesOnOneSurface,
generateWallPadCandidates,
PHONE_FLAT_GRID,
planDesktopGridFromCamera,
type PlacedPadTransform,
type WallPadCandidate,
} from './plane-placement.js';
import {
applyPadVisualState,
createGhostPadRuntime,
createPadRuntime,
findPadById,
defaultDesktopPadSize,
defaultHeadsetPadSize,
disposePadRuntimes,
flashPad,
setPadDebugCollidersVisible,
solidifyGhostPad,
type PadRuntime,
} from './pads.js';
import {
animatePadGlow,
padGlowFadeState,
setPadGlowPower,
type PadGlowFadeState,
} from './pad-glow.js';
import {
applyRoomSetupTints,
clearRoomSetupTints,
createSlotCandidateRuntime,
createWallOverlay,
disposeSlotCandidates,
setCandidateVisualState,
type SlotCandidateRuntime,
} from './room-setup-visuals.js';
import { WallTonesSequence } from './sequence.js';
import {
WallTonesSpeech,
milestoneClipFor,
randomCheerClip,
randomNewBestClip,
randomWrongClip,
resetSpeechUnlock,
unlockSpeechFromGesture,
type WallTonesClipId,
} from './speech.js';
import { combinedPickSpeechLines } from './combined-pick-speech.js';
import {
  ACHIEVEMENT_CATEGORIES,
  AUTOPLAY_UNLOCK_HINT_LEVEL,
  LISTEN_COST,
  REPLAY_FREE_CAP,
  REPLAY_PRICE_BARS,
  TOP_SECRET_COST,
  WallTonesEconomy,
  nextOpenThreshold,
} from './economy.js';
import { storeChipGlyphSrc, storeTileSrc, type TileState as StoreTileState } from './store-icons.js';
import { SAVER_PRICE_BARS, saverRetryPlan, saverUnitsForStreak } from './consumable-values.js';
import {
getActiveWorldKind,
returnToMenuInPlace,
switchToWallTonesArWorld,
} from './world-host.js';
import { WallSlotCandidate } from './wall-slot-candidate-component.js';
import { WallTonePad } from './wall-tone-pad-component.js';

/** Preview/test aid (owner-approved 2026-11-11): ?demoBars=100 grants
 * spendable test Bars in memory only - never saved, same preview-only idea
 * as the ?demoAchievements sample view. */
function withDemoBarsFlag(eco: WallTonesEconomy): WallTonesEconomy {
const demoBars =
typeof location === 'undefined'
? null
: new URLSearchParams(location.search).get('demoBars');
if (demoBars != null) {
const amount = Number(demoBars);
if (Number.isFinite(amount) && amount > 0) {
eco.applyDemoBoost(amount);
}
}
return eco;
}

/** Stable hand order — never allocate per XR frame. */
const XR_HANDS = ['right', 'left'] as const;

const FLAT_BACKDROP_NODE_IDS = [
'studio-floor',
'stage',
'gallery-set',
'sideboard-set',
'key-light',
'fill-light',
] as const;

type WallTonesDebugBridge = {
cypherWindowsStarted: number;
backgroundLinesCompleted: number;
cypherSeamVisible: boolean;
previewCypherSeam: (visible: boolean) => void;
phase: string;
flowPhase: string;
sequence: readonly number[];
inputStep: number;
streak: number;
bestStreak: number;
bars: number;
barsTotal: number;
hintLevel: number;
hintRevealCount: number;
unlockedAchievements: string[];
purchases: number;
presses: number;
storeOpen: boolean;
/** Game Over popup is showing (a wrong note ended the run). */
gameOverOpen: boolean;
gameOverUseSaver: () => void;
gameOverBuySaver: () => void;
savers: number;
streakNow: number;
/** Test-only: the New run button action. */
gameOverNewRun: () => void;
/** Whether the run's single automatic replay is spent (test-only). */
idleReplaySpent: boolean;
/** Status line text currently shown (test-only). */
statusLineText: string;
sequenceRowVisible: boolean;
sequenceBoxesShown: number;
sequenceUnknownShown: number;
roundCardText: string;
roundCardVisibleText: string | null;
headCaptionVisibleText: string | null;
/** Test-only: drives the exact head-caption setter path tickHeadCaption uses. */
probeHeadCaptionText: (text: string) => void;
barFloatsActive: boolean;
/** Achievement unlock celebration is playing or queued (test-only). */
celebrationActive: boolean;
/** "title|name" of the showing celebration, else null (test-only). */
celebrationText: string | null;
/** Count of celebration shows that requested sound effects (test-only). */
celebrationSfxPlays: number;
infoRowVisible: boolean;
scoreInfoVisible: boolean;
/** Backlog 30 research bridge: menu line visibility + tracker readings. */
movementRowVisible: boolean;
movementSessionHeadMeters: number;
movementSessionPadMeters: number;
movementLifetimeMeters: number;
gameExplanationDisplay: unknown;
scoringUiDisplays: Record<string, string | null>;
toggleStore: () => void;
toggleAchievements: () => void;
buyHint: () => void;
buyListen: () => void;
buyAutoplay: () => void;
buyReplay: () => void;
buySaver: () => void;
buyTopSecret: () => void;
/** Test-only: plays the celebration for an arbitrary achievement def. */
demoCelebration: (id: string, label: string) => void;
/** Test-only: freezes the celebration show clock for deterministic shots. */
setCelebrationFrozen: (frozen: boolean) => void;
/** Test-only: the Achievements button's projected screen position. */
readonly achievementsButtonScreen: { x: number; y: number } | null;
/** Test-only: spends one Replay through the Repeat button path. */
repeatPattern: () => void;
/** Test-only: selects a store tile like a tap on its tile. */
selectStoreTile: (id: string) => void;
storePointerTargets: Record<string, { x: number; y: number }>;
storeSelected: string | null;
/** Whether the one-time Top Secret item is owned (test-only). */
ownsTopSecret: boolean;
/** Skill-tree store state (test-only reads). */
ownsListen: boolean;
hintUnlocked: boolean;
autoplayLevel: number;
autoplayUnlocked: boolean;
replaysFree: number;
replaysPaid: number;
replaysTotal: number;
/** In-memory ?demoBars grant (never saved). */
demoBoost: number;
/** Test-only wallet funding for e2e. */
grantBars: (amount: number) => void;
/** Test-only saver inventory seeding for e2e. */
grantSavers: (units: number) => void;
/** Test-only streak seeding for e2e Game Over cost checks. */
setStreak: (streak: number) => void;
flatAwaitingStart: boolean;
slotCandidateCount: number;
selectedSlotCount: number;
speechBusy: boolean;
submitPad: (padIndex: number) => void;
/** Emulator helper: spawn 4 ray-pickable wall slots in front of the player. */
startFakeWallPick: () => void;
selectSlot: (candidateIndex: number) => void;
skipSpeech: () => void;
padFade: (padIndex: number) => PadGlowFadeState | null;
};

declare global {
interface Window {
__wallTonesDebug?: WallTonesDebugBridge;
}
}

type SetupMode = 'room-scale' | 'sitting' | 'air' | 'combined';
type AirOrientation = 'vertical' | 'horizontal';

type FlowPhase =
| 'inactive'
| 'choose-mode'
| 'scanning'
| 'wall-picking'
| 'air-placement'
| 'playing';

export class WallTonesSystem extends createSystem({
pads: { required: [WallTonePad] },
planes: { required: [XRPlane] },
meshes: { required: [XRMesh] },
padHovered: { required: [WallTonePad, Hovered] },
padPressed: { required: [WallTonePad, Pressed] },
slotHovered: { required: [WallSlotCandidate, Hovered] },
slotPressed: { required: [WallSlotCandidate, Pressed] },
}) {
private readonly speech = new WallTonesSpeech();
/** Welcome clip plays once per Wall Tones visit, before the mode picker line. */
private welcomeSpoken = false;
/** Mode-picker line plays once per Wall Tones visit (item 42: both the enter
 * path and the XR visibility handler open the setup window - guard the
 * duplicate so the line never plays twice). */
private chooseModeSpoken = false;
/** True once the flat-entry welcome already said "Point and press one of those panels to start". */
private startPromptSpoken = false;

/** Entry voiceover: welcome the first time, then the choose-mode line. */
private speakEntryLines(): void {
if (!this.welcomeSpoken) {
this.welcomeSpoken = true;
this.speech.speak('welcome');
}
if (!this.chooseModeSpoken) {
this.chooseModeSpoken = true;
this.speech.speak('chooseMode');
}
}

private readonly game = new WallTonesSequence();
private readonly economy = withDemoBarsFlag(new WallTonesEconomy());
/** Backlog 30 research: MR headset-movement + pad-reach estimates. Session
 * values show on the menu's movement line (MR only); lifetime totals feed
 * the provisional Movement achievement. */
private readonly movement = new MovementTracker();
private movementRowHeadDm = -1;
private movementRowPadDm = -1;
private movementAchvWholeMeters = -1;
/** Last display state pushed to the menu movement row, exposed for e2e. */
public lastMovementRowVisible = false;
private storeOpen = false;
private achievementsOpen = false;
/** Game Over popup shown after a wrong note; New run starts the next run. */
private gameOverOpen = false;
// No buy-confirm arming: buying a saver is a single press that applies it when enough are held (owner request 2026-11-11).
/** Run id whose single automatic replay has been used. */
private idleReplayUsedRunId = -1;
/** Until this time the status line shows the caption-only idle nudge. */
private idleNudgeUntil = 0;
private readonly viewer = new Vector3();
private readonly captionProjection = new Vector3();
private readonly cameraForward = new Vector3();
private readonly cameraPosition = new Vector3();
private readonly tipLeft = new Vector3();
private readonly tipRight = new Vector3();
private readonly tipLocal = new Vector3();
private readonly gripWorld = new Vector3();
private readonly ghostForward = new Vector3();
private readonly ghostTarget = new Vector3();
private readonly awayFromHead = new Vector3();
private readonly handUp = new Vector3();
private readonly handForward = new Vector3();
private readonly gripQuat = new Quaternion();
private readonly ghostQuat = new Quaternion();
private readonly targetGhostQuat = new Quaternion();
private readonly scratchQuat = new Quaternion();
private readonly padWorldPos = new Vector3();
private readonly tipScratch = new Vector3();
private readonly rayOrigin = new Vector3();
private readonly rayDir = new Vector3();
private readonly rayToSlot = new Vector3();
private readonly rayClosest = new Vector3();
private readonly axisX = new Vector3(1, 0, 0);
private readonly panelFollowPos = new Vector3();
private readonly panelFollowTargetPos = new Vector3();
private readonly panelFollowQuat = new Quaternion();
private readonly panelFollowTargetQuat = new Quaternion();
private readonly headQuat = new Quaternion();
private readonly toPanel = new Vector3();
private readonly panelDodgeTargetPos = new Vector3();
private readonly panelDodgeScratchA = new Vector3();
private readonly panelDodgeScratchB = new Vector3();
private panelDodgeUntil = 0;

private experienceActive = false;
private flowPhase: FlowPhase = 'inactive';
private setupMode: SetupMode | null = null;
private pads: PadRuntime[] = [];
private playbackQueue: Promise<void> = Promise.resolve();
private readonly cypherProgress = new CypherProgress();
private readonly backgroundProgress = new BackgroundProgress();
private cypherSeam: Object3D | null = null;
private cypherSeamEntity: Entity | null = null;
private cypherFlatSeam: HTMLElement | null = null;
private scanStartedAt = -1;
/** One-shot room capture while scanning; blocks repeat initiateRoomCapture calls. */
private roomCaptureInFlight = false;
private roomCaptureAttempted = false;
/** Reused when materializing the XRPlane query (no per-frame Array.from). */
private readonly planeEntityScratch: Entity[] = [];
private airPlaceStep = 0;
private airPadSizeM = AIR_PLACE_ROOM_PAD_SIZE_M;
/** Sitting pads shrink to the fallback size when four cannot fit on one table. */
private tablePadSizeM = AIR_PLACE_SITTING_PAD_SIZE_M;
private lastChooseModeScanStatusAt = 0;
private ghostPad: PadRuntime | null = null;
private statusText = '';
private panelBound = false;
private flatBackdropHidden = false;
private wasNonImmersive = true;
private flatAwaitingStart = false;
/** After playback, ignore touches until every pad is clear (avoids stuck finger auto-hitting). */
private inputNeedsClear = false;
private airOrientation: AirOrientation = 'vertical';
/** When set, panel lock overrides hand-driven snap. */
private airOrientationLocked: AirOrientation | null = null;
private dominantHand: 'left' | 'right' | null = null;
private lastInputAt = 0;
private idleReplayQueued = false;
private panelRayRemoved = false;
private lackingSpatialData = false;
private slotCandidates: SlotCandidateRuntime[] = [];
/** Fingertip-touch arming/debounce for slot candidates (two-collider touch). */
private readonly slotTouchArmed = new Map<number, boolean>();
private readonly slotTouchEnterFrames = new Map<number, number>();
private readonly slotTouchExitFrames = new Map<number, number>();
private wallOverlayEntities: Entity[] = [];
private selectedSlotTransforms: PlacedPadTransform[] = [];
private readonly slotArmed = new Map<number, boolean>();
private slotSelectLatched = false;
private readonly touchEnterFrames = new Map<number, number>();
private readonly touchExitFrames = new Map<number, number>();
private pointerAudioBound = false;
private mobileSoundButton: HTMLButtonElement | null = null;
private mediaUnlockApplied = false;
/** Wireframe hover/press volumes on pads; VR only, off by default; opt in for tuning. */
private showTouchDebug = false;
private flatCaptions: HTMLDivElement | null = null;
private firstRun = true;
private flatLayoutValues: number[] = [];
private flatLayoutCursor = 0;
private flatLayoutDirty = true;
private sequenceIconKey = '';
/** Squares revealed so far during Listen playback (appear one per note). */
private playbackShownCount = 0;
private sequenceIconPendingPanel: UIKitMLAsset | null = null;
private sequenceIconUpdateQueued = false;
private readonly sequenceCueSquares: UIKit.Container[] = [];
private readonly sequenceCueNames: UIKit.Text[] = [];
private readonly flushSequenceIcons = () => {
this.sequenceIconUpdateQueued = false;
const panel = this.sequenceIconPendingPanel;
if (panel) this.reconcileSequenceIcons(panel);
};
private accessibilityPanel: UIKitMLAsset | undefined;
private accessibilityState: { show: boolean; flat: boolean; active: boolean; caption: string; phase: string; flow: string; status: string; names: boolean; sequence: number[]; reveal: number; shown: number; listen: boolean } | undefined;
private sequenceIconRow: UIKit.Container | null = null;
/** Setup HUD is world-anchored; look-away past a threshold re-snaps it. */
private panelWorldAnchored = false;
private panelSnapActive = false;
/** Panel drag is available in setup and play, but only a header grab starts it.
 * The per-pinch latch preserves the original role until release. */
private panelDragging = false;
/** Hands whose current pinch must NOT drag (started outside the header
 * = gameplay, button press or surface placement pinch). */
private readonly panelDragSkipHands = new Set<string>();
/** Hands whose current pinch IS dragging the panel. */
private readonly panelDragActiveHands = new Set<string>();
private readonly rayPressLatched = new Set<number>();
private readonly gazeSelectLatched = new Set<string>();
/** Last time a drag ended; briefly suppresses the ray dodge at the drop point. */
private panelDragDoneAt = 0;
private blinkCuePad: PadRuntime | null = null;
private blinkCueRoot: Object3D | null = null;
private blinkCueEntity: Entity | null = null;
/** Panel Skip voice button mirrors speech.isBusy(); polled each frame. */
private skipVoiceVisible = false;
private headCaptionVisible = false;
private headCaptionText = '';
private readonly headCaptionOffset = new Vector3();
/** Flat-mode Skip voice overlay: outside the panel HUD, bottom-right corner
 * of the screen (user feedback November 7: on phone and desktop the button
 * should not live inside the menu panel). VR/MR keep the panel button. */
private flatSkipButton: HTMLButtonElement | null = null;
/** Last view mode the skip controls were synced for (P2 codex: resync on
 * view switches, not only on busy toggles). */
private skipVoiceViewFlat: boolean | null = null;
/** Scratch pad-bounds + last applied offset (no allocations in update()). */
private readonly padScreenBoundsScratch = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
private lastFlatSkipBottom = -1;
/** Cached subtitle rects (codex P2: no per-frame getBoundingClientRect).
 * Recomputed only when caption layout/content marks them dirty. */
private flatCaptionsRect: DOMRect | null = null;
private flatCaptionsRectDirty = true;
private startupStripRect: DOMRect | null = null;
private readonly onPointerDownForAudio = (): void => {
if (needsExplicitMobileSoundUnlock() && !isHtmlAudioPoolUnlocked()) {
this.applyUserGestureMediaUnlock(false);
return;
}
primeWallTonesAudioFromGesture();
};
private readonly savedPanelPosition = new Float32Array(3);
private readonly savedPanelScale = new Float32Array(3);
private panelPositionSaved = false;

init(): void {
this.bindPanelIfNeeded();
const onModeChange = (event: Event) => {
const mode = (event as CustomEvent<{ mode: ExperienceMode }>).detail.mode;
if (mode === 'walltones') {
void this.enterWallTonesMode();
} else {
void this.leaveWallTonesMode();
}
};
window.addEventListener('experience-mode-changed', onModeChange);
// Voices-off toggle silences active and queued narration immediately.
const onAccessibilityChange = () => {
if (voicesOffEnabled()) {
this.speech.cancel();
}
};
window.addEventListener('wall-tones-accessibility-change', onAccessibilityChange);
this.wasNonImmersive =
this.world.visibilityState.peek() === VisibilityState.NonImmersive;
this.cleanupFuncs.push(
this.world.visibilityState.subscribe((state) => {
this.onVisibilityForFlatPlay(state);
}),
);
this.publishDebugBridge();
this.cleanupFuncs.push(() => {
window.removeEventListener('experience-mode-changed', onModeChange);
window.removeEventListener('wall-tones-accessibility-change', onAccessibilityChange);
delete window.__wallTonesDebug;
void this.leaveWallTonesMode();
});

// Enter XR boots the AR world while still NonImmersive. Handle awaiting
// setup BEFORE the stored-mode path, or beginFlatPlay would spawn the
// four desktop pads and leave them floating through VR choose-mode.
const awaitingMode = sessionStorage.getItem('wall-tones-awaiting-mode');
if (awaitingMode === '1' && getActiveWorldKind() === 'walltones-ar') {
sessionStorage.removeItem('wall-tones-awaiting-mode');
this.experienceActive = true;
this.game.resetAllScores();
// Backlog 18: restore the saved best streak on the AR boot path too,
// or stored records re-grant the record bonus on every XR visit.
this.game.bestStreak = this.economy.getBestStreak();
document.title = 'Wall Tones 2: too fast to wall';
this.bindPanelIfNeeded();
this.clearPads();
this.flatAwaitingStart = false;
this.flowPhase = 'choose-mode';
this.resetSetupPanelAnchor();
this.setFlatHintVisible(false);
this.setSetupUiVisible(true);
this.setRepeatUiVisible(false);
this.setRescanUiVisible(false);
this.syncDebugCollidersButton();
this.applyTouchDebugVisibility();
this.statusText = 'Choose room scale or sitting.';
this.speakEntryLines();
this.renderPanel();
} else if (sessionStorage.getItem('iwsdk-experience-mode') === 'walltones') {
void this.enterWallTonesMode();
}

const pendingSetup = sessionStorage.getItem('wall-tones-setup-mode');
if (
pendingSetup === 'room-scale' ||
pendingSetup === 'sitting' ||
pendingSetup === 'air' ||
pendingSetup === 'combined'
) {
sessionStorage.removeItem('wall-tones-setup-mode');
this.setupMode = pendingSetup;
this.experienceActive = true;
this.game.resetAllScores();
// Backlog 18: same best-streak restore for the pending-setup boot path.
this.game.bestStreak = this.economy.getBestStreak();
document.title = 'Wall Tones 2: too fast to wall';
const storedHand = sessionStorage.getItem('wall-tones-dominant-hand');
if (storedHand === 'left' || storedHand === 'right') {
this.dominantHand = storedHand;
}
this.bindPanelIfNeeded();
this.setFlatHintVisible(false);
this.setSetupUiVisible(false);
if (pendingSetup === 'air') {
this.startAirPlacement('chooseAirMenu');
} else {
this.flowPhase = 'scanning';
this.scanStartedAt = performance.now() / 1000;
this.roomCaptureInFlight = false;
this.roomCaptureAttempted = false;
this.speech.speak('lookAround');
}
}
}

update(delta: number): void {
this.updateAccessibilityCaptions();
this.tickHeadCaption();
// Backlog 30 research sampling runs before the experience-active gate so
// walking in the MR menus counts in the session estimate too.
this.tickMovementTracking();
if (!this.experienceActive) {
return;
}
this.tickSkipVoiceButton();
this.barFloats.update(delta, this.world.camera, this.isFlatView());
this.cacheAchievementsButtonHome();
this.celebration.update(delta, this.world.camera, this.world.scene, this.isFlatView());
if (this.pads.length > 0) {
const glowTime = performance.now() / 1000;
for (const pad of this.pads) {
const pressable = this.flowPhase === 'playing' &&
(this.flatAwaitingStart || this.game.phase === 'input');
// The demonstrated note still lights during playback; all other
// disabled pads look switched off until the player's turn.
setPadGlowPower(pad.glow, pressable || this.blinkCuePad === pad ||
(pad.visualState === 'pressed' && !pad.fingerInside));
animatePadGlow(pad.glow, glowTime);
}
}
this.bindPanelIfNeeded();
if (!this.useDesktopPath()) {
this.noteDominantHandFromInput();
this.tickSetupPanelFollow(delta);
this.tickPanelDrag();
this.tickBlinkCueArrow();
}
if (
this.useDesktopPath() &&
this.flowPhase === 'playing' &&
this.pads.length === 0
) {
this.spawnDesktopPads();
if (this.game.phase === 'idle') {
this.flatAwaitingStart = true;
this.statusText = 'Tap any pad to start (sound on)';
}
}
if (this.flowPhase === 'scanning') {
this.tickScan(delta);
}
if (this.flowPhase === 'choose-mode' && !this.useDesktopPath()) {
this.tickChooseModeScanStatus();
}
if (this.flowPhase === 'wall-picking') {
this.tickWallPicking();
}
if (this.flowPhase === 'air-placement') {
this.tickAirPlacement(delta);
}
if (this.useDesktopInput()) {
if (this.flatAwaitingStart || this.game.phase === 'input') {
this.readDesktopTouches();
}
} else if (
this.flowPhase === 'playing' &&
(this.game.phase === 'input' || this.inputNeedsClear)
) {
this.readFingertipTouches();
this.readRayAndGazeTouches();
}
this.tickIdleReplay();
}

/** First pinch / trigger that selects UI or places becomes the orientation hand. */
private noteDominantHandFromInput(): void {
if (this.dominantHand != null) {
return;
}
const stored = sessionStorage.getItem('wall-tones-dominant-hand');
if (stored === 'left' || stored === 'right') {
this.dominantHand = stored;
return;
}
for (const hand of XR_HANDS) {
if (this.input.xr.getSelectState(hand).start) {
this.dominantHand = hand;
sessionStorage.setItem('wall-tones-dominant-hand', hand);
return;
}
}
}

private bindPanelIfNeeded(): void {
if (this.panelBound) {
return;
}
const panel = this.world.getSceneObject<UIKitMLAsset>('wall-tones-panel');
if (panel == null) {
return;
}
this.panelBound = true;
panel.getElementById('back-to-menu-button')?.addEventListener('click', () => {
void this.onBackToMenu();
});
panel
.getElementById('mode-room-scale-button')
?.addEventListener('click', () => void this.onChooseSetup('room-scale'));
panel
.getElementById('mode-sitting-button')
?.addEventListener('click', () => void this.onChooseSetup('sitting'));
panel
.getElementById('mode-air-place-button')
?.addEventListener('click', () => void this.onChooseSetup('air'));
panel
.getElementById('mode-combined-button')
?.addEventListener('click', () => void this.onChooseSetup('combined'));
panel
.getElementById('orient-vertical-button')
?.addEventListener('click', () => this.setAirOrientation('vertical'));
panel
.getElementById('orient-horizontal-button')
?.addEventListener('click', () => this.setAirOrientation('horizontal'));
panel
.getElementById('repeat-pattern-button')
?.addEventListener('click', () => void this.onRepeatPattern());
panel
.getElementById('rescan-room-button')
?.addEventListener('click', () => void this.onRescanRoom());
// Item 46: the Debug colliders toggle lives in the main menu Settings.
this.world
.getSceneObject<UIKitMLAsset>('main-menu-panel')
?.getElementById('debug-colliders-button')
?.addEventListener('click', () => this.toggleTouchDebug());
panel
.getElementById('store-button')
?.addEventListener('click', () => this.onToggleStore());
panel.getElementById('store-popup')?.addEventListener('click', () => {
this.clearStoreSelection();
});
panel
.getElementById('achievements-button')
?.addEventListener('click', () => this.setAchievementsOpen(true));
panel
.getElementById('store-close-button')
?.addEventListener('click', () => this.onToggleStore());
panel
.getElementById('achievements-close-button')
?.addEventListener('click', () => this.setAchievementsOpen(false));
panel
.getElementById('gameover-use-saver-button')
?.addEventListener('click', () => this.onGameOverUseSaver());
panel
.getElementById('gameover-buy-saver-button')
?.addEventListener('click', () => this.onGameOverBuySaver());
panel
.getElementById('gameover-newrun-button')
?.addEventListener('click', () => this.onGameOverNewRun());

panel
.getElementById('skip-voice-button')
?.addEventListener('click', () => this.onSkipVoice());
this.syncSkipVoiceButton();
this.syncDebugCollidersButton();
this.applyTouchDebugVisibility();
if (this.experienceActive && this.useDesktopPath()) {
this.setSetupUiVisible(false);
}
// Never show Repeat during mode / placement selection.
if (this.flowPhase !== 'playing' || this.flatAwaitingStart) {
this.setRepeatUiVisible(false);
}
this.renderPanel();
}

private async enterWallTonesMode(): Promise<void> {
if (this.experienceActive) {
return;
}
this.experienceActive = true;
this.game.resetAllScores();
// Backlog 18: the best streak survives reloads and re-entries.
this.game.bestStreak = this.economy.getBestStreak();
this.firstRun = true;
document.title = 'Wall Tones 2: too fast to wall';
this.bindPanelIfNeeded();
this.bindPointerAudioUnlock();

// XR boot / world swap in progress — never spawn the flat 2×2 here.
if (sessionStorage.getItem('wall-tones-awaiting-mode') === '1') {
this.clearPads();
this.flatAwaitingStart = false;
this.flowPhase = 'choose-mode';
this.resetSetupPanelAnchor();
this.setFlatHintVisible(false);
this.setSetupUiVisible(true);
this.setRepeatUiVisible(false);
this.setRescanUiVisible(false);
this.syncDebugCollidersButton();
this.applyTouchDebugVisibility();
this.statusText = 'Opening passthrough...';
this.renderPanel();
return;
}

if (this.useDesktopPath()) {
this.beginFlatPlay();
return;
}

this.clearPads();
this.flatAwaitingStart = false;
this.flowPhase = 'choose-mode';
this.resetSetupPanelAnchor();
this.setFlatHintVisible(false);
this.setSetupUiVisible(true);
this.setRepeatUiVisible(false);
this.setRescanUiVisible(false);
this.syncDebugCollidersButton();
this.applyTouchDebugVisibility();
this.statusText = 'Choose room scale or sitting.';
this.speakEntryLines();
this.renderPanel();
}

private async leaveWallTonesMode(): Promise<void> {
if (!this.experienceActive) {
return;
}
this.experienceActive = false;
this.flowPhase = 'inactive';
this.setCypherSeam(false);
this.barFloats.clear();
this.celebration.clear(this.world.scene);
this.achievementsOpen = false;
this.storeOpen = false;
this.gameOverOpen = false;
this.syncMenuPopupVisibility();
this.roundBarsEarned = 0;
this.roundBonusEarned = 0;
this.roundCompletionEarned = 0;
this.recordBeatenThisAttempt = false;
this.barsFirstEarnedPending = false;
this.hideRoundBarsCard();
this.flatAwaitingStart = false;
this.inputNeedsClear = false;
this.mediaUnlockApplied = false;
this.airOrientationLocked = null;
this.dominantHand = null;
// Keep wall-tones-dominant-hand across in-session menu returns and any
// full hub reboot so AR restore can read it. Cleared only by switchBackToHubMenu.
sessionStorage.removeItem('wall-tones-awaiting-mode');
this.lackingSpatialData = false;
this.roomCaptureInFlight = false;
this.roomCaptureAttempted = false;
this.touchEnterFrames.clear();
this.touchExitFrames.clear();
this.playbackQueue = Promise.resolve();
this.game.phase = 'idle';
this.game.resetAllScores();
this.speech.cancel();
this.welcomeSpoken = false;
this.chooseModeSpoken = false;
this.startPromptSpoken = false;
suspendAudioContext();
resetSpeechUnlock();
this.unbindPointerAudioUnlock();
this.hideMobileSoundOverlay();
this.clearRoomSetupVisuals();
this.clearPads();
this.ghostPad = null;
this.setupMode = null;
this.setFlatHintVisible(false);
this.setWallPickHintVisible(false);
this.setAirOrientUiVisible(false);
this.setRescanUiVisible(false);
this.setRepeatUiVisible(false);
this.panelDragging = false;
this.panelDragSkipHands.clear();
this.panelDragActiveHands.clear();
this.rayPressLatched.clear();
this.gazeSelectLatched.clear();
this.setBlinkCuePad(null);
this.disposeBlinkCueArrow();
this.skipVoiceVisible = false;
this.syncSkipVoiceButton();
this.resetSetupPanelAnchor();
this.restorePanelLayout();
this.restorePanelPointerCapture();
this.showStudioBackdrop();
this.renderPanel();
}

private beginFlatPlay(): void {
if (!this.useDesktopPath()) {
return;
}
if (sessionStorage.getItem('wall-tones-awaiting-mode') === '1') {
return;
}
this.flowPhase = 'playing';
this.flatAwaitingStart = true;
this.statusText = 'Tap any pad to start (sound on)';
this.setSetupUiVisible(false);
this.setAirOrientUiVisible(false);
this.setFlatHintVisible(true);
this.setPanelHeaderVisible(true);
this.hideStudioBackdrop();
this.layoutPanelForFlatPlay();
// Keep RayInteractable so Back stays clickable; panel sits beside the pads.
this.restorePanelPointerCapture();
this.bindPointerAudioUnlock();
// Desktop entry still gets the welcome line once (chooseMode is XR-only).
if (!this.welcomeSpoken) {
// Start's trusted canvas tap unlocks audio before the spatial callback.
// Direct mobile restores still need their first gesture, so keep both
// flags pending until then rather than consuming a blocked welcome.
const speechWillPlay =
this.speech.canSpeakNow() &&
!(needsExplicitMobileSoundUnlock() && !isHtmlAudioPoolUnlocked());
if (speechWillPlay) {
this.welcomeSpoken = true;
this.speech.speak('welcome', true);
// Same sentence the how-to-play clip opens with, so say it up front.
this.speech.speak('pointAndPress');
this.startPromptSpoken = true;
}
}
this.spawnDesktopPads();
this.setRepeatUiVisible(false);
if (needsExplicitMobileSoundUnlock() && !isHtmlAudioPoolUnlocked()) {
this.statusText = 'Tap "Sound on" below, then any pad';
this.showMobileSoundOverlay();
} else {
this.statusText = 'Tap any pad to start (sound on)';
}
this.renderPanel();
}

private applyUserGestureMediaUnlock(speakLine: boolean): void {
if (this.mediaUnlockApplied && isHtmlAudioPoolUnlocked()) {
return;
}
this.mediaUnlockApplied = true;
primeWallTonesAudioFromGesture();
unlockSpeechFromGesture();
this.hideMobileSoundOverlay();
if (speakLine) {
this.speech.speak('soundReady');
}
if (this.flatAwaitingStart) {
this.statusText = 'Tap any pad to start';
}
this.renderPanel();
}

private showMobileSoundOverlay(): void {
if (!needsExplicitMobileSoundUnlock()) {
return;
}
if (this.mobileSoundButton == null) {
const button = document.createElement('button');
button.type = 'button';
button.textContent = 'Sound on — tap here';
button.id = 'wall-tones-mobile-sound';
Object.assign(button.style, {
position: 'fixed',
left: '50%',
bottom: 'max(24px, env(safe-area-inset-bottom))',
transform: 'translateX(-50%)',
zIndex: '99999',
fontSize: '18px',
padding: '14px 22px',
borderRadius: '12px',
border: 'none',
background: '#f5d90a',
color: '#1c1d20',
fontWeight: '700',
boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
});
button.addEventListener('click', (event) => {
event.preventDefault();
this.applyUserGestureMediaUnlock(true);
});
document.body.appendChild(button);
this.mobileSoundButton = button;
}
this.mobileSoundButton.style.display = 'block';
}

private hideMobileSoundOverlay(): void {
if (this.mobileSoundButton != null) {
this.mobileSoundButton.style.display = 'none';
}
}

private bindPointerAudioUnlock(): void {
if (this.pointerAudioBound) {
return;
}
this.pointerAudioBound = true;
window.addEventListener('pointerdown', this.onPointerDownForAudio, true);
window.addEventListener('touchstart', this.onPointerDownForAudio, {
capture: true,
passive: true,
});
}

private unbindPointerAudioUnlock(): void {
if (!this.pointerAudioBound) {
return;
}
this.pointerAudioBound = false;
window.removeEventListener('pointerdown', this.onPointerDownForAudio, true);
window.removeEventListener('touchstart', this.onPointerDownForAudio, true);
}

private isPhoneFlatViewport(): boolean {
if (typeof window === 'undefined') {
return false;
}
const width = window.innerWidth;
const height = window.innerHeight;
return width <= 480 || (height <= 480 && width <= 950);
}

private layoutPanelForFlatPlay(): void {
// Desktop: park right of the pad grid. Phones: HUD on top of the portrait
// frame (closer + higher) so pads sit clear below — VR follow unchanged.
if (this.isPhoneFlatViewport()) {
this.applyPanelLayout(
PHONE_PANEL_FLAT.position[0],
PHONE_PANEL_FLAT.position[1],
PHONE_PANEL_FLAT.position[2],
PHONE_PANEL_FLAT.scale,
);
return;
}
// Desktop game HUD: align its center and visual height with the pad grid,
// leaving a gap comparable to the spacing between the pads.
this.applyPanelLayout(1.15, 1.01, -1.55, 0.405);
}

private layoutPanelForMrPlay(): void {
// Park the HUD in front of the player when play starts (not a stale side offset).
this.panelDragging = false;
this.panelDragSkipHands.clear();
this.panelDragActiveHands.clear();
this.rayPressLatched.clear();
this.gazeSelectLatched.clear();
this.player.head.getWorldPosition(this.viewer);
this.player.head.getWorldQuaternion(this.headQuat);
this.ghostForward.set(0, 0, -1).applyQuaternion(this.headQuat).normalize();
if(this.setupMode!=='air'&&this.tryParkPanelOnWall())return;
this.panelFollowTargetPos
.copy(this.viewer)
.addScaledVector(this.ghostForward, PANEL_PLAY_DISTANCE_M);
this.applyPanelLayout(
this.panelFollowTargetPos.x,
this.panelFollowTargetPos.y,
this.panelFollowTargetPos.z,
PANEL_PLAY_SCALE,
this.headQuat,
);
}

/** Search front-facing wall space first, then adjacent walls; never behind. */
private tryParkPanelOnWall(): boolean {
this.planeEntityScratch.length=0;
for(const entity of this.queries.planes.entities)this.planeEntityScratch.push(entity);
const walls=collectVerticalWalls(this.planeEntityScratch,this.viewer);
const forward=this.ghostForward.clone().setY(0).normalize();
const size=this.panelWorldSize(PANEL_PLAY_SCALE);
// A side wall can have its plane origin alongside or behind the viewer
// while still offering space ahead. Rank surfaces, then gate each candidate.
const ranked=walls.map(w=>{
 const d=new Vector3(w.center.x-this.viewer.x,0,w.center.z-this.viewer.z).normalize();
 const normal=new Vector3(w.normal.x,0,w.normal.z).normalize();
 return {w,dot:d.dot(forward),front:Math.abs(normal.dot(forward))>=0.7};
}).sort((a,b)=>Number(b.front)-Number(a.front)||b.dot-a.dot);
for(const {w} of ranked){
const normal=new Vector3(w.normal.x,0,w.normal.z).normalize();
const right=new Vector3(normal.z,0,-normal.x);
const offsets=[0];
for(let x=0.25;x<=w.widthM/2;x+=0.25)offsets.push(x,-x);
for(const yOffset of [0,0.25,-0.25,0.5,-0.5,0.75,-0.75])for(const xOffset of offsets){
const pos=new Vector3(w.center.x,this.viewer.y+yOffset,w.center.z).addScaledVector(right,xOffset).addScaledVector(normal,0.08);
if(new Vector3().subVectors(pos,this.viewer).setY(0).dot(forward)<=0)continue;
let fits=true;
const corners:{x:number;z:number}[]=[];
for(const x of [-size.width/2-0.08,size.width/2+0.08])for(const y of [-size.height/2-0.08,size.height/2+0.08]){
 this.panelCorner.copy(pos).addScaledVector(right,x);this.panelCorner.y+=y;
 const surface=w.entity.object3D;
 if(surface==null){fits=false;continue;}
 surface.updateWorldMatrix(true,false);
 surface.worldToLocal(this.panelCorner);
 corners.push({x:this.panelCorner.x,z:this.panelCorner.z});
 if(this.panelCorner.x<w.localMinX||this.panelCorner.x>w.localMaxX||this.panelCorner.z<w.localMinZ||this.panelCorner.z>w.localMaxZ)fits=false;
}
if(!fits||w.plane.polygon==null||!rectangleInsidePolygon([corners[0]!,corners[1]!,corners[3]!,corners[2]!],w.plane.polygon))continue;
if(this.pads.some(p=>{p.root.getWorldPosition(this.padWorldPos);return panelOverlapsPad(pos,right,normal,size.width,size.height,this.padWorldPos,p.sizeM);}))continue;
this.panelMatrix.lookAt(pos.clone().add(normal),pos,new Vector3(0,1,0));
this.panelFollowTargetQuat.setFromRotationMatrix(this.panelMatrix);
this.applyPanelLayout(pos.x,pos.y,pos.z,PANEL_PLAY_SCALE,this.panelFollowTargetQuat);
return true;
}
}
return false;
}

private isSetupPanelFollowActive(): boolean {
return (
this.experienceActive &&
!this.useDesktopPath() &&
(this.flowPhase === 'choose-mode' ||
this.flowPhase === 'scanning' ||
this.flowPhase === 'wall-picking' ||
this.flowPhase === 'air-placement')
);
}

/**
* World-anchored setup HUD: place once in front, then only slerp-snap when the
* player looks ~PANEL_LOOK_AWAY_DEG away from the panel.
*/
private panelRaycaster = new Raycaster();
private panelRayHits: import('three').Intersection[] = [];
private panelMatrix = new Matrix4();
private panelCorner = new Vector3();

/** Read the live UIKit rectangle, including document scale, not a guessed HUD size. */
private panelWorldSize(scaleValue: number): {width:number; height:number} {
const panel=this.world.getSceneObject<UIKitMLAsset>('wall-tones-panel');
const root=panel?.document.querySelector('.panel-root');
const size=root?.size.value;
const docScale=panel?.document.scale.x ?? 1;
return {width:(size?.[0] ?? 420)/100*docScale*scaleValue,
height:(size?.[1] ?? 650)/100*docScale*scaleValue};
}

/** Per-hand ray test: a UI hand must not also select a surface or place a pad. */
private handPointsAtPanel(hand:'left'|'right', headerOnly=false): boolean {
const panel=this.world.getSceneObject<UIKitMLAsset>('wall-tones-panel');
if (panel==null) return false;
const raySpace=this.player.raySpaces[hand];
raySpace.updateWorldMatrix(true,false);
raySpace.getWorldPosition(this.panelRaycaster.ray.origin);
raySpace.getWorldQuaternion(this.gripQuat);
this.panelRaycaster.ray.direction.set(0,0,-1).applyQuaternion(this.gripQuat).normalize();
this.panelRaycaster.near=0; this.panelRaycaster.far=6;
this.panelRayHits.length=0;
const target=headerOnly?panel.getElementById('wall-tones-panel-header'):panel;
if(target==null)return false;
this.panelRaycaster.intersectObject(target,true,this.panelRayHits);
return this.panelRayHits.some(hit=>hit.distance>0.01);
}

private tickSetupPanelFollow(delta: number): void {
if (!this.isSetupPanelFollowActive()) {this.panelSnapActive=false;return;}
if (this.panelDragging) return;
const entity=this.world.getSceneEntity('wall-tones-panel');
if (entity==null)return;
const position=entity.getVectorView(Transform,'position');
const orientation=entity.getVectorView(Transform,'orientation');
const scale=entity.getVectorView(Transform,'scale');
if(!this.panelPositionSaved){this.savedPanelPosition.set(position);this.savedPanelScale.set(scale);this.panelPositionSaved=true;}
this.player.head.getWorldPosition(this.viewer);
this.player.head.getWorldQuaternion(this.headQuat);
this.ghostForward.set(0,0,-1).applyQuaternion(this.headQuat).setY(0).normalize();
if(this.ghostForward.lengthSq()<1e-6)this.ghostForward.set(0,0,-1);
this.panelFollowPos.set(position[0]!,position[1]!,position[2]!);
this.panelFollowQuat.set(orientation[0]!,orientation[1]!,orientation[2]!,orientation[3]!);
const selecting=this.flowPhase==='wall-picking'||this.flowPhase==='air-placement';
const threshold=selecting?50:PANEL_LOOK_AWAY_DEG;
// Freeze the destination for an entire snap. Head motion and a candidate ray
// can no longer write competing targets on successive frames.
if(!this.panelWorldAnchored || (!this.panelSnapActive && horizontalLookAway(this.viewer,this.ghostForward,this.panelFollowPos)>=threshold)){
if(selecting){
 const height=this.panelWorldSize(PANEL_FOLLOW_SCALE).height;
 const target=selectionPanelPose(this.viewer,this.ghostForward,height,PANEL_FOLLOW_DISTANCE_M,this.flowPhase==='air-placement');
 this.panelFollowTargetPos.set(target.x,target.y,target.z);
}else{
 this.panelFollowTargetPos.copy(this.viewer).addScaledVector(this.ghostForward,PANEL_FOLLOW_DISTANCE_M);
 this.panelFollowTargetPos.y=this.viewer.y+PANEL_FOLLOW_Y_OFFSET_M;
}
this.panelMatrix.lookAt(this.viewer,this.panelFollowTargetPos,new Vector3(0,1,0));
this.panelFollowTargetQuat.setFromRotationMatrix(this.panelMatrix);
this.panelSnapActive=true;
if(!this.panelWorldAnchored){this.panelFollowPos.copy(this.panelFollowTargetPos);this.panelFollowQuat.copy(this.panelFollowTargetQuat);this.panelWorldAnchored=true;}
}
if(!this.panelSnapActive)return;
const alpha=1-Math.pow(1-PANEL_FOLLOW_SLERP,Math.max(delta,1/120)*72);
this.panelFollowPos.lerp(this.panelFollowTargetPos,alpha);
this.panelFollowQuat.slerp(this.panelFollowTargetQuat,alpha);
position[0]=this.panelFollowPos.x;position[1]=this.panelFollowPos.y;position[2]=this.panelFollowPos.z;
orientation[0]=this.panelFollowQuat.x;orientation[1]=this.panelFollowQuat.y;orientation[2]=this.panelFollowQuat.z;orientation[3]=this.panelFollowQuat.w;
scale[0]=scale[1]=scale[2]=PANEL_FOLLOW_SCALE;
if(this.panelFollowPos.distanceTo(this.panelFollowTargetPos)<=PANEL_SNAP_ARRIVE_M)this.panelSnapActive=false;
this.restorePanelPointerCapture();
}

/**
* Ray-aware placement: when a selection ray points at (through) the setup
* panel toward the environment, swing the panel aside so the ray stays clear.
* Returns true while a dodge position is active.
*/
private tickPanelRayDodge(): boolean {
const now = performance.now();
// Only a real, unselected placement placeholder under this same hand ray can trigger
// avoidance. Pointing at empty space or the menu must leave it still.
if (this.flowPhase !== 'wall-picking' || now - this.panelDragDoneAt < PANEL_DRAG_DODGE_COOLDOWN_MS) {
this.panelDodgeUntil = 0;
return false;
}
for (const hand of XR_HANDS) {
const slot = this.findRayHoveredSlot(hand);
if (slot == null || slot.selected) continue;
// Require the ray to pass through the panel's horizontal footprint as well.
this.panelDodgeScratchA.copy(this.panelFollowPos).sub(this.rayOrigin).setY(0);
this.panelDodgeScratchB.copy(this.rayDir).setY(0);
if (this.panelDodgeScratchA.lengthSq() < 1e-6 || this.panelDodgeScratchB.lengthSq() < 1e-6) continue;
const dot = Math.max(-1, Math.min(1, this.panelDodgeScratchA.normalize().dot(this.panelDodgeScratchB.normalize())));
if (Math.acos(dot) * 180 / Math.PI >= PANEL_RAY_BLOCK_DEG) continue;
this.panelDodgeTargetPos.copy(this.panelFollowPos);
this.panelDodgeTargetPos.y = this.viewer.y + PANEL_RAY_DODGE_UP_M;
this.panelDodgeUntil = now + PANEL_RAY_DODGE_HOLD_MS;
return true;
}
// Do not retain an old ray dodge after the ray leaves all candidates.
this.panelDodgeUntil = 0;
return false;
}

private resetSetupPanelAnchor(): void {
this.panelWorldAnchored = false;
this.panelSnapActive = false;
}

private applyPanelLayout(
x: number,
y: number,
z: number,
scaleValue: number,
orientationQuat?: Quaternion,
): void {
const entity = this.world.getSceneEntity('wall-tones-panel');
if (entity == null) {
return;
}
const position = entity.getVectorView(Transform, 'position');
if (!this.panelPositionSaved) {
this.savedPanelPosition.set(position);
const scale = entity.getVectorView(Transform, 'scale');
this.savedPanelScale.set(scale);
this.panelPositionSaved = true;
}
position[0] = x;
position[1] = y;
position[2] = z;
if (orientationQuat != null) {
const orientation = entity.getVectorView(Transform, 'orientation');
orientation[0] = orientationQuat.x;
orientation[1] = orientationQuat.y;
orientation[2] = orientationQuat.z;
orientation[3] = orientationQuat.w;
}
const scale = entity.getVectorView(Transform, 'scale');
scale[0] = scaleValue;
scale[1] = scaleValue;
scale[2] = scaleValue;
// Ensure the panel stays ray-targetable in MR and on desktop.
this.restorePanelPointerCapture();
if (!entity.hasComponent(RayInteractable)) {
entity.addComponent(RayInteractable);
this.panelRayRemoved = false;
}
}

private restorePanelLayout(): void {
if (!this.panelPositionSaved) {
return;
}
const entity = this.world.getSceneEntity('wall-tones-panel');
const position = entity?.getVectorView(Transform, 'position');
if (entity == null || position == null) {
return;
}
position[0] = this.savedPanelPosition[0]!;
position[1] = this.savedPanelPosition[1]!;
position[2] = this.savedPanelPosition[2]!;
const scale = entity.getVectorView(Transform, 'scale');
scale[0] = this.savedPanelScale[0]!;
scale[1] = this.savedPanelScale[1]!;
scale[2] = this.savedPanelScale[2]!;
}

private disablePanelPointerCapture(): void {
const entity = this.world.getSceneEntity('wall-tones-panel');
if (entity == null || this.panelRayRemoved) {
return;
}
if (entity.hasComponent(RayInteractable)) {
entity.removeComponent(RayInteractable);
this.panelRayRemoved = true;
}
}

private restorePanelPointerCapture(): void {
const entity = this.world.getSceneEntity('wall-tones-panel');
if (entity == null || !this.panelRayRemoved) {
return;
}
entity.addComponent(RayInteractable);
this.panelRayRemoved = false;
}

private formatSequenceLabel(): string {
return this.game.sequence
.map((padId) => WALL_TONE_PADS[padId]?.name ?? '?')
.join(' -> ');
}

private onVisibilityForFlatPlay(state: VisibilityState): void {
const nonImmersive = state === VisibilityState.NonImmersive;
if (
this.experienceActive &&
nonImmersive &&
!this.wasNonImmersive &&
getActiveWorldKind() === 'hub-vr' &&
this.setupMode == null
) {
this.beginFlatPlay();
} else if (
this.experienceActive &&
!nonImmersive &&
this.wasNonImmersive
) {
// Always drop the flat 2×2 when entering XR — setup must not show it.
this.clearPads();
this.flatAwaitingStart = false;
this.showStudioBackdrop();
this.setFlatHintVisible(false);
if (this.setupMode == null && this.flowPhase !== 'scanning') {
this.flowPhase = 'choose-mode';
this.resetSetupPanelAnchor();
this.statusText = 'Choose room scale or sitting.';
this.setSetupUiVisible(true);
this.setRepeatUiVisible(false);
this.setRescanUiVisible(false);
this.speakEntryLines();
this.renderPanel();
}
}
this.wasNonImmersive = nonImmersive;
this.syncDebugCollidersButton();
this.applyTouchDebugVisibility();
}

private hideStudioBackdrop(): void {
if (this.flatBackdropHidden) {
return;
}
for (const nodeId of FLAT_BACKDROP_NODE_IDS) {
const entity = this.world.getSceneEntity(nodeId);
if (entity != null) {
entity.setValue(Visibility, 'isVisible', false);
}
}
this.flatBackdropHidden = true;
}

private showStudioBackdrop(): void {
if (!this.flatBackdropHidden) {
return;
}
for (const nodeId of FLAT_BACKDROP_NODE_IDS) {
const entity = this.world.getSceneEntity(nodeId);
if (entity != null) {
entity.setValue(Visibility, 'isVisible', true);
}
}
this.flatBackdropHidden = false;
}

/* The panel canvas font covers ASCII only: U+2026, curly quotes and em-dashes
 * render as tofu squares on the panel. Keep every panel-bound string ASCII. */
private setFlatHintVisible(visible: boolean): void {
// Keep the game explanation in flat play and after placement, not in MR setup.
// The panel heading remains present, so setup still has a stable anchor.
void visible;
this.syncGameExplanationVisibility();
}

private syncGameExplanationVisibility(): void {
const setup = ['choose-mode', 'scanning', 'wall-picking', 'air-placement'].includes(this.flowPhase);
this.world.getSceneObject<UIKitMLAsset>('wall-tones-panel')
?.getElementById('flat-play-hint')
?.setProperties({ display: setup ? 'none' : 'flex' });
}

private setPanelHeaderVisible(visible: boolean): void {
// User decision 2026-11-07: keep the heading always visible (eyebrow removed
// per the same feedback); the panel keeps a constant minimum size.
void visible;
this.world
.getSceneObject<UIKitMLAsset>('wall-tones-panel')
?.getElementById('wall-tones-panel-header')
?.setProperties({ display: 'flex' });
}

/** Skip voice: drop the playing and queued narration lines. */
/** Bumped when the USER skips narration, so scripted multi-line
 * announcements stop enqueueing their remaining lines. Internal
 * speech.cancel() calls (instruction replacement) do not touch this. */
private narrationInterrupt = 0;

private onSkipVoice(): void {
this.narrationInterrupt += 1;
this.speech.cancel();
}

private tickSkipVoiceButton(): void {
const busy = this.speech.isBusy();
const flat = this.isFlatView();
if (busy !== this.skipVoiceVisible || flat !== this.skipVoiceViewFlat) {
this.skipVoiceVisible = busy;
this.skipVoiceViewFlat = flat;
this.syncSkipVoiceButton();
}
this.positionFlatSkipButton();
}

private isFlatView(): boolean {
return this.world.visibilityState.peek() === VisibilityState.NonImmersive;
}

private syncSkipVoiceButton(): void {
const flat = this.isFlatView();
// VR/MR keep the in-panel button; flat mode gets the screen-corner overlay.
this.world
.getSceneObject<UIKitMLAsset>('wall-tones-panel')
?.getElementById('skip-voice-button')
?.setProperties({ display: this.skipVoiceVisible && !flat ? 'flex' : 'none' });
this.syncFlatSkipButton(flat);
}

private syncFlatSkipButton(flat: boolean): void {
if (flat && this.skipVoiceVisible) {
if (this.flatSkipButton == null) {
const button = document.createElement('button');
button.type = 'button';
button.id = 'wall-tones-skip-voice-flat';
button.textContent = 'Skip voice';
Object.assign(button.style, {
position: 'fixed',
right: 'max(12px, env(safe-area-inset-right))',
bottom: 'max(24px, env(safe-area-inset-bottom))',
zIndex: '100002',
fontSize: '16px',
padding: '12px 18px',
borderRadius: '12px',
border: 'none',
background: '#f5d90a',
color: '#1c1d20',
fontWeight: '700',
boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
cursor: 'pointer',
});
button.addEventListener('click', (event) => {
event.preventDefault();
this.onSkipVoice();
});
document.body.appendChild(button);
this.flatSkipButton = button;
}
this.flatSkipButton.style.display = 'block';
} else if (this.flatSkipButton != null) {
this.flatSkipButton.style.display = 'none';
}
}

/** Projected screen-space bounds of the pad grid, written into the scratch
 * object (false when no pads yet). No allocations in the per-frame path. */
private projectPadScreenBounds(): boolean {
if (this.pads.length === 0 || !this.experienceActive) return false;
const b = this.padScreenBoundsScratch;
b.minX = Infinity; b.maxX = -Infinity; b.minY = Infinity; b.maxY = -Infinity;
for (const pad of this.pads) {
for (let sx = -1; sx <= 1; sx += 2) {
for (let sy = -1; sy <= 1; sy += 2) {
const v = this.captionProjection.set(
sx * pad.sizeM / 2, sy * pad.sizeM / 2, 0);
pad.root.localToWorld(v); v.project(this.world.camera);
b.minX = Math.min(b.minX, (v.x + 1) * window.innerWidth / 2);
b.maxX = Math.max(b.maxX, (v.x + 1) * window.innerWidth / 2);
b.minY = Math.min(b.minY, (1 - v.y) * window.innerHeight / 2);
b.maxY = Math.max(b.maxY, (1 - v.y) * window.innerHeight / 2);
}
}
}
return true;
}

/** Bottom-right corner, but never over a subtitle strip or a pad: narration
 * and pad input can coexist, so the overlay must not steal pad taps. When
 * the corner has no room it docks at the right edge above the pad grid. */
private positionFlatSkipButton(): void {
const button = this.flatSkipButton;
if (button == null || button.style.display === 'none') return;
const w = window.innerWidth;
const h = window.innerHeight;
const bw = button.offsetWidth;
const bh = button.offsetHeight;
const RIGHT = 12;
const BASE = 24;
const M = 10;
let bottom = BASE;
// Two known strips via cached rects: no per-frame layout reads.
// The startup strip is CSS-static; read it once while it lives.
if (this.startupStripRect == null && typeof document !== 'undefined') {
const startupStrip = document.getElementById('wall-tones-startup-subtitle');
if (startupStrip != null && startupStrip.style.display !== 'none') {
this.startupStripRect = startupStrip.getBoundingClientRect();
}
}
const startupRect = this.startupStripRect;
if (startupRect != null) {
if (typeof document !== 'undefined' &&
document.getElementById('wall-tones-startup-subtitle') == null) {
this.startupStripRect = null;
} else if (startupRect.right > w - bw - RIGHT - M &&
startupRect.bottom > h - bh - BASE - M) {
bottom = Math.max(bottom, h - startupRect.top + M);
}
}
const captions = this.flatCaptions;
if (captions != null && captions.style.display !== 'none') {
if (this.flatCaptionsRectDirty || this.flatCaptionsRect == null) {
this.flatCaptionsRect = captions.getBoundingClientRect();
this.flatCaptionsRectDirty = false;
}
const r = this.flatCaptionsRect;
if (r.right > w - bw - RIGHT - M && r.bottom > h - bh - BASE - M) {
bottom = Math.max(bottom, h - r.top + M);
}
}
if (this.projectPadScreenBounds()) {
const pb = this.padScreenBoundsScratch;
const bx0 = w - RIGHT - bw;
const by0 = h - bottom - bh;
const overlapsPads =
bx0 < pb.maxX + M && w - RIGHT > pb.minX - M &&
by0 < pb.maxY + M && h - bottom > pb.minY - M;
if (overlapsPads) bottom = h - pb.minY + M;
}
const rounded = Math.round(bottom);
if (rounded !== this.lastFlatSkipBottom) {
this.lastFlatSkipBottom = rounded;
button.style.bottom = `max(${rounded}px, env(safe-area-inset-bottom))`;
}
}

private publishDebugBridge(): void {
const system = this;
window.__wallTonesDebug = {
get backgroundLinesCompleted() { return system.backgroundProgress.completedLines; },
get cypherWindowsStarted() { return system.cypherProgress.completedWindows; },
get cypherSeamVisible() { return system.cypherSeam != null; },
previewCypherSeam: (visible) => { system.setCypherSeam(visible); },
get phase() {
return system.game.phase;
},
get flowPhase() {
return system.flowPhase;
},
get sequence() {
return [...system.game.sequence];
},
get inputStep() {
return system.game.inputStep;
},
get streak() {
return system.game.streak;
},
get bestStreak() {
return system.game.bestStreak;
},
get bars() {
return system.economy.getBars();
},
get barsTotal() {
return system.economy.getBarsTotal();
},
get hintLevel() {
return system.economy.getHintLevel();
},
get hintRevealCount() {
return system.economy.getHintRevealCount();
},
get unlockedAchievements() {
return ACHIEVEMENT_CATEGORIES.flatMap((c) =>
c.levels
.filter((t) => system.economy.isUnlocked(`${c.id}-${t}`))
.map((t) => `${c.id}-${t}`),
);
},
get purchases() {
return system.economy.getPurchases();
},
get presses() {
return system.economy.getPresses();
},
get storeOpen() {
return system.storeOpen;
},
get gameOverOpen() {
return system.gameOverOpen;
},
gameOverNewRun: () => system.onGameOverNewRun(),
gameOverUseSaver: () => system.onGameOverUseSaver(),
gameOverBuySaver: () => system.onGameOverBuySaver(),
get savers() {
return system.economy.getSavers();
},
get streakNow() {
return system.game.streak;
},
get idleReplaySpent() {
return system.idleReplayUsedRunId === system.game.runId;
},
get statusLineText() {
return String(system.world.getSceneObject<UIKitMLAsset>('wall-tones-panel')
?.getElementById('wall-tones-status')?.properties.peek().text ?? '');
},
get sequenceRowVisible() {
return system.lastSequenceRowVisible;
},
get sequenceBoxesShown() {
return system.lastSequenceBoxesShown;
},
get sequenceUnknownShown() {
return system.lastSequenceUnknownShown;
},
get roundCardText() {
return system.lastRoundCardText;
},
// Live read-back of the text actually set on the rendered panel element
// (catches the uikitml empty-div compile trap, where setProperties no-ops).
get roundCardVisibleText() {
const el = system.world
.getSceneObject<UIKitMLAsset>('wall-tones-panel')
?.getElementById('wall-tones-round-card-total');
// The rendered Text child reads parentContainer.properties.value.text,
// falling back to the uikitml initial literal ('+0') when never set.
const own = (
el as { properties?: { value?: { text?: unknown } } } | null | undefined
)?.properties?.value?.text;
if (typeof own === 'string') return own;
// Never explicitly set: the rendered string is the Text child's computed
// fallback (the uikitml initial literal).
const children =
(el as { children?: { properties?: { value?: { text?: unknown } } }[] } | null)
  ?.children ?? [];
for (const child of children) {
const t = child?.properties?.value?.text;
if (typeof t === 'string') return t;
}
return null;
},
// Same live read-back for the MR head-locked caption (backlog 21): catches
// the uikitml empty-element compile trap, where setProperties no-ops.
get headCaptionVisibleText() {
const el = system.world
.getSceneObject<UIKitMLAsset>('wall-tones-head-caption')
?.getElementById('wall-tones-head-caption-text');
const own = (
el as { properties?: { value?: { text?: unknown } } } | null | undefined
)?.properties?.value?.text;
if (typeof own === 'string') return own;
const children =
(el as { children?: { properties?: { value?: { text?: unknown } } }[] } | null)
  ?.children ?? [];
for (const child of children) {
const t = child?.properties?.value?.text;
if (typeof t === 'string') return t;
}
return null;
},
// Test-only: same setter call tickHeadCaption makes, so e2e can prove the
// rendered caption text changes without an immersive session.
probeHeadCaptionText: (text: string) => {
system.world
.getSceneObject<UIKitMLAsset>('wall-tones-head-caption')
?.getElementById('wall-tones-head-caption-text')
?.setProperties({ text });
},
get infoRowVisible() {
return system.lastInfoRowVisible;
},
get gameExplanationDisplay() {
return system.world.getSceneObject<UIKitMLAsset>('wall-tones-panel')
?.getElementById('flat-play-hint')?.properties.peek().display;
},
get scoreInfoVisible() {
return system.lastScoreInfoVisible;
},
get movementRowVisible() {
return system.lastMovementRowVisible;
},
get movementSessionHeadMeters() {
return system.movement.getSessionHeadMeters();
},
get movementSessionPadMeters() {
return system.movement.getSessionPadMeters();
},
get movementLifetimeMeters() {
return readLifetimeMovementMeters();
},
get scoringUiDisplays() {
const panel = system.world.getSceneObject<UIKitMLAsset>('wall-tones-panel');
return Object.fromEntries([
'wall-tones-streak-row', 'wall-tones-score-row', 'wall-tones-round-card',
'achievements-button', 'store-button',
].map(id => {
const el = panel?.getElementById(id) as unknown as {
properties?: { value?: { display?: string } };
} | null;
return [id, el?.properties?.value?.display ?? null];
}));
},
get celebrationActive() {
return system.celebration.isActive();
},
get celebrationText() {
return system.celebration.debugText();
},
// Test-only: how many celebration shows requested their sound effects.
get celebrationSfxPlays() {
return system.celebration.debugSfxPlays();
},
// Test-only: the projected screen position of the celebration's effective
// fly target (the button's live position, or its last home position while
// a menu popup hides menu-view).
get achievementsButtonScreen() {
const target = system.achievementsButtonWorldPublic();
if (target == null) return null;
// Clone before projecting: the target aliases the cached home vector.
const p = target.clone().project(system.world.camera);
return { x: ((p.x + 1) * window.innerWidth) / 2, y: ((1 - p.y) * window.innerHeight) / 2 };
},
get barFloatsActive() {
return system.barFloats.isActive();
},
toggleStore: () => {
system.onToggleStore();
},
toggleAchievements: () => {
system.setAchievementsOpen(!system.achievementsOpen);
},
// Store purchases go through the same selection + buy path as the panel,
// so tests exercise the real gates and denial feedback. forceSelectStoreTile
// never toggles the tile off: a repeated buy* call must still buy.
buyHint: () => {
system.forceSelectStoreTile('hint');
system.onBuySelected();
},
buyListen: () => {
system.forceSelectStoreTile('listen');
system.onBuySelected();
},
buyAutoplay: () => {
system.forceSelectStoreTile('autoplay');
system.onBuySelected();
},
buyReplay: () => {
system.forceSelectStoreTile('replay');
system.onBuySelected();
},
buySaver: () => {
system.forceSelectStoreTile('saver');
system.onBuySelected();
},
buyTopSecret: () => {
system.forceSelectStoreTile('secret');
system.onBuySelected();
},
demoCelebration: (id: string, label: string) => {
system.demoCelebration(id, label);
},
setCelebrationFrozen: (frozen: boolean) => {
system.celebration.frozen = frozen;
},
repeatPattern: () => {
void system.onRepeatPattern();
},
get ownsTopSecret() {
return system.economy.ownsTopSecret();
},
get ownsListen() {
return system.economy.ownsListen();
},
get hintUnlocked() {
return system.economy.hintUnlocked();
},
get autoplayLevel() {
return system.economy.getAutoplayLevel();
},
get autoplayUnlocked() {
return system.economy.autoplayUnlocked();
},
get replaysFree() {
return system.economy.getReplaysFree();
},
get replaysPaid() {
return system.economy.getReplaysPaid();
},
get replaysTotal() {
return system.economy.getReplaysTotal();
},
get demoBoost() {
return system.economy.getDemoBoost();
},
get storePointerTargets() {
const panel = system.world.getSceneObject<UIKitMLAsset>('wall-tones-panel');
const list = panel?.getElementById<UIKit.Container>('store-tree-list');
const host = panel?.getElementById<UIKit.Container>('store-popup-card');
const targets: Record<string, { x: number; y: number }> = {};
const capture = (node: Object3D) => {
if (!node.name.startsWith('store-tile-') && node.name !== 'store-buy') return;
const p = node.getWorldPosition(new Vector3()).project(system.world.camera);
targets[node.name] = { x: (p.x + 1) * window.innerWidth / 2, y: (1 - p.y) * window.innerHeight / 2 };
};
list?.traverse(capture);
host?.traverse(capture);
return targets;
},
get storeSelected() {
return system.storeSelected;
},
selectStoreTile: (id: string) => {
system.selectStoreTile(id);
},
// Test-only: fund the wallet without grinding rounds.
grantBars: (amount: number) => {
system.debugGrantBars(amount);
},
grantSavers: (units: number) => {
system.debugGrantSavers(units);
},
setStreak: (streak: number) => {
system.debugSetStreak(streak);
},
get flatAwaitingStart() {
return system.flatAwaitingStart;
},
get slotCandidateCount() {
return system.slotCandidates.length;
},
get selectedSlotCount() {
return system.selectedSlotTransforms.length;
},
get speechBusy() {
return system.speech.isBusy();
},
submitPad: (padIndex: number) => {
system.handlePadInput(padIndex);
},
skipSpeech: () => {
system.onSkipVoice();
},
padFade: (padIndex: number) => {
return padGlowFadeState(system.pads[padIndex]?.glow);
},
startFakeWallPick: () => {
system.debugStartFakeWallPick();
},
selectSlot: (candidateIndex: number) => {
const slot = system.slotCandidates.find(
(entry) => entry.candidateIndex === candidateIndex,
);
if (slot != null) {
system.selectWallSlot(slot);
}
},
};
}

/** Emulator-only path: four 1x1m slots ahead of the headset for ray-pick tests. */
private debugStartFakeWallPick(): void {
if (!this.experienceActive) {
this.experienceActive = true;
}
this.setupMode = 'room-scale';
this.player.head.getWorldPosition(this.viewer);
this.clearRoomSetupVisuals();
this.clearPads();
this.flowPhase = 'wall-picking';
this.resetSetupPanelAnchor();
this.selectedSlotTransforms = [];
this.slotSelectLatched = false;
// Panel stays head-followed until play starts.
this.setSetupUiVisible(false);
this.setFlatHintVisible(false);
this.setAirOrientUiVisible(false);
this.setWallPickHintVisible(true);
this.setRescanUiVisible(true);
this.setRepeatUiVisible(false);
// Place a 2x2 of slots in front of the headset along -Z (common XR forward).
this.player.head.getWorldPosition(this.viewer);
const forward = new Vector3(0, 0, -1);
const right = new Vector3(1, 0, 0);
const offsets = [
[-1.1, 0.35],
[1.1, 0.35],
[-1.1, -0.95],
[1.1, -0.95],
];
const quat: [number, number, number, number] = [0, 0, 0, 1];
offsets.forEach(([ox, oy], index) => {
const pos = new Vector3(
this.viewer.x + right.x * ox + forward.x * 1.6,
this.viewer.y + oy,
this.viewer.z + right.z * ox + forward.z * 1.6,
);
const slot = createSlotCandidateRuntime(
this.world,
{
position: [pos.x, pos.y, pos.z],
quaternion: quat,
wallIndex: 0,
candidateIndex: index,
},
HEADSET_PAD_SIZE_M,
);
this.slotCandidates.push(slot);
this.slotArmed.set(index, true);
});
this.statusText = 'Debug wall pick: ray + select 4 green slots';
this.renderPanel();
}

private async onBackToMenu(): Promise<void> {
this.speech.speak('backToMenu');
await this.leaveWallTonesMode();
// #58: never destroy the live world just to show the menu. AppMode also
// binds setMode('menu') on this button so panels swap in-place; XRPlane /
// XRMesh and the immersive session stay alive in walltones-ar.
returnToMenuInPlace();
}

private async onChooseSetup(mode: SetupMode): Promise<void> {
if (!this.experienceActive || this.flowPhase !== 'choose-mode') {
return;
}
this.setupMode = mode;
sessionStorage.setItem('wall-tones-setup-mode', mode);
// Never destroy an active XR session to swap worlds — that looked like leaving MR.
// Enter XR boots the AR world up front; this path only swaps while still flat.
if (getActiveWorldKind() === 'hub-vr' && this.useDesktopPath()) {
this.statusText = 'Opening passthrough...';
this.renderPanel();
await switchToWallTonesArWorld();
return;
}
this.setSetupUiVisible(false);
this.setRescanUiVisible(false);
if (mode === 'air') {
this.startAirPlacement('chooseAirMenu');
return;
}
this.setSpatialMeshesVisible(true);
this.flowPhase = 'scanning';
this.scanStartedAt = performance.now() / 1000;
this.roomCaptureInFlight = false;
this.roomCaptureAttempted = false;
this.speech.speak('lookAround');
this.statusText = 'Scanning the room...';
this.renderPanel();
}

/** Live scan summary + rescan affordance while choosing a play mode. */
private tickChooseModeScanStatus(): void {
const now = performance.now();
if (now - this.lastChooseModeScanStatusAt < 500) {
return;
}
this.lastChooseModeScanStatusAt = now;
this.setRescanUiVisible(true);
this.player.head.getWorldPosition(this.viewer);
this.planeEntityScratch.length = 0;
for (const entity of this.queries.planes.entities) {
this.planeEntityScratch.push(entity);
}
const walls = collectVerticalWalls(this.planeEntityScratch, this.viewer);
const tables = collectTablePlanes(
this.planeEntityScratch,
this.viewer.y - 1.45,
);
const planeCount = this.queries.planes.entities.size;
const meshCount = this.queries.meshes.entities.size;
this.statusText =
planeCount === 0 && meshCount === 0
? 'Scanning the room - look around, then pick a mode.'
: `Scanned: ${walls.length} walls, ${tables.length} tables (${planeCount} planes, ${meshCount} meshes). Pick a mode, or rescan.`;
this.renderPanel();
}

private tickScan(_delta: number): void {
const elapsed = performance.now() / 1000 - this.scanStartedAt;
if (elapsed < SCAN_WAIT_S) {
const planeCount = this.queries.planes.entities.size;
const meshCount = this.queries.meshes.entities.size;
this.statusText = `Scanning... ${Math.ceil(SCAN_WAIT_S - elapsed)}s (${planeCount} planes, ${meshCount} meshes)`;
this.renderPanel();
return;
}

if (this.roomCaptureInFlight) {
return;
}

this.player.head.getWorldPosition(this.viewer);
if (this.queries.planes.entities.size === 0) {
void this.offerRoomCaptureOrAir();
return;
}

this.planeEntityScratch.length = 0;
for (const entity of this.queries.planes.entities) {
this.planeEntityScratch.push(entity);
}

if (this.setupMode === 'sitting') {
const floorY = detectFloorY(this.planeEntityScratch, this.viewer.y);
const tables = collectTablePlanes(this.planeEntityScratch, floorY);
if (tables.length === 0) {
this.startAirPlacement('noTable');
return;
}
this.startTablePicking(tables);
return;
}

if (this.setupMode === 'combined') {
const floorY = detectFloorY(this.planeEntityScratch, this.viewer.y);
const tables = collectTablePlanes(this.planeEntityScratch, floorY);
const walls = collectVerticalWalls(this.planeEntityScratch, this.viewer);
if (walls.length === 0 && tables.length === 0) {
void this.offerRoomCaptureOrAir();
return;
}
this.startCombinedPicking(walls, tables);
return;
}

const walls = collectVerticalWalls(this.planeEntityScratch, this.viewer);
if (walls.length === 0) {
void this.offerRoomCaptureOrAir();
return;
}
// Interactive pick: show wall/mesh tints + candidate 1x1m slots.
this.startWallPicking(walls);
}

private async offerRoomCaptureOrAir(): Promise<void> {
if (this.roomCaptureInFlight) {
return;
}
const session = this.xrManager.getSession() as XRSession & {
initiateRoomCapture?: () => Promise<undefined>;
};
if (
typeof session?.initiateRoomCapture === 'function' &&
!this.roomCaptureAttempted
) {
this.roomCaptureInFlight = true;
this.roomCaptureAttempted = true;
this.statusText = 'Opening room capture...';
this.renderPanel();
this.speech.speak('roomCapture');
try {
await session.initiateRoomCapture();
this.scanStartedAt = performance.now() / 1000;
} catch (error) {
console.warn('[wall-tones] room capture failed', error);
this.startAirPlacement('notEnoughWallSpace');
} finally {
this.roomCaptureInFlight = false;
}
return;
}
this.startAirPlacement('notEnoughWallSpace');
}

private startWallPicking(
walls: ReturnType<typeof collectVerticalWalls>,
): void {
this.beginSurfacePicking({
surfaces: walls,
padSizeM: HEADSET_PAD_SIZE_M,
candidates: generateWallPadCandidates(
walls,
this.viewer.y,
HEADSET_PAD_SIZE_M,
),
speech: 'pickWallSlots',
emptyFallback: () =>
this.startAirPlacement('notEnoughWallSpace'),
statusLabel: 'wall slots',
});
}

private startTablePicking(
tables: ReturnType<typeof collectTablePlanes>,
): void {
this.tablePadSizeM = AIR_PLACE_SITTING_PAD_SIZE_M;
// Each table gets its own size ladder: keep candidates on both tables.
const candidates = generateMixedTablePadCandidates(tables, TABLE_PAD_SIZE_LADDER_M);
this.beginSurfacePicking({
surfaces: tables,
padSizeM: this.tablePadSizeM,
candidates,
speech: 'pickTableSlots',
emptyFallback: () => this.startAirPlacement('noTable'),
statusLabel:
this.tablePadSizeM === AIR_PLACE_SITTING_PAD_SIZE_M
? 'table slots'
: 'smaller table slots',
});
}

/** Combined mode: pick pad spots on walls and tables in one pass. */
private startCombinedPicking(
walls: ReturnType<typeof collectVerticalWalls>,
tables: ReturnType<typeof collectTablePlanes>,
): void {
const wallCandidates = generateWallPadCandidates(
walls,
this.viewer.y,
HEADSET_PAD_SIZE_M,
);
const tableCandidates = generateTablePadCandidates(
tables,
AIR_PLACE_SITTING_PAD_SIZE_M,
);
// Reindex so candidate indices stay unique across both surface kinds.
const candidates = [...wallCandidates, ...tableCandidates].map(
(candidate, index) => ({ ...candidate, candidateIndex: index }),
);
// One combined line when both kinds are found; otherwise the matching line.
const speech = combinedPickSpeechLines(walls.length, tables.length);
this.beginSurfacePicking({
surfaces: [...walls, ...tables],
padSizeM: HEADSET_PAD_SIZE_M,
candidates,
speech,
emptyFallback: () =>
this.startAirPlacement('notEnoughWallSpace'),
statusLabel: 'wall/table slots',
});
}

private beginSurfacePicking(options: {
surfaces: ReturnType<typeof collectVerticalWalls>;
padSizeM: number;
candidates: ReturnType<typeof generateWallPadCandidates>;
speech: WallTonesClipId | WallTonesClipId[];
emptyFallback: () => void;
statusLabel: string;
}): void {
this.clearRoomSetupVisuals();
this.clearPads();
this.setSpatialMeshesVisible(true);
this.flowPhase = 'wall-picking';
this.resetSetupPanelAnchor();
this.lackingSpatialData = false;
this.selectedSlotTransforms = [];
this.slotSelectLatched = false;
this.setFlatHintVisible(false);
this.setAirOrientUiVisible(false);
this.setWallPickHintVisible(true);
this.setRescanUiVisible(true);
this.setRepeatUiVisible(false);

applyRoomSetupTints(
options.surfaces.map((surface) => surface.entity),
this.queries.meshes.entities,
);
for (const surface of options.surfaces) {
this.wallOverlayEntities.push(createWallOverlay(this.world, surface));
}

for (const candidate of options.candidates) {
const slot = createSlotCandidateRuntime(
this.world,
candidate,
candidate.sizeM ?? options.padSizeM,
);
this.slotCandidates.push(slot);
this.slotArmed.set(slot.candidateIndex, true);
this.slotTouchArmed.set(slot.candidateIndex, true);
}

// Need four distinct picks; fewer candidates traps the player in wall-picking.
if (this.slotCandidates.length < 4) {
this.clearRoomSetupVisuals();
options.emptyFallback();
return;
}

const speechLines = Array.isArray(options.speech)
? options.speech
: [options.speech];
for (const line of speechLines) {
this.speech.speak(line);
}
this.statusText = `Pick pad 1 of 4 - ${this.slotCandidates.length} ${options.statusLabel}`;
this.renderPanel();
}

private tickWallPicking(): void {
const rayHovered = this.findRayHoveredSlot();
if (
rayHovered != null &&
!rayHovered.selected &&
!this.statusText.startsWith(`Hover slot ${rayHovered.candidateIndex}`)
) {
this.statusText = `Hover slot ${rayHovered.candidateIndex} - pinch to pick (${this.selectedSlotTransforms.length}/4)`;
this.renderPanel();
}
for (const slot of this.slotCandidates) {
if (slot.selected) {
setCandidateVisualState(slot, 'selected');
continue;
}
const ecsHovered = this.entityInQuery(
slot.entity,
this.queries.slotHovered.entities,
);
// Walk-up touch: highlight when a fingertip enters the hover box...
const tipHovered = this.sampleTipInVolume(slot, 'hover') != null;
const tipPressed = this.sampleTipInVolume(slot, 'press') != null;
const hovered = ecsHovered || slot === rayHovered || tipHovered;
const ecsPressed =
ecsHovered && this.entityInQuery(slot.entity, this.queries.slotPressed.entities) &&
XR_HANDS.some(hand=>!this.handPointsAtPanel(hand) && !this.panelDragActiveHands.has(hand) &&
(this.findRayHoveredSlot(hand)===slot || this.findTipHoveredSlot(hand)===slot));
setCandidateVisualState(slot, hovered ? 'hovered' : 'idle');
if (!ecsPressed) {
this.slotArmed.set(slot.candidateIndex, true);
}
if (ecsPressed && this.slotArmed.get(slot.candidateIndex)) {
this.slotArmed.set(slot.candidateIndex, false);
this.selectWallSlot(slot);
}
// ...and select on touching the surface itself (no pinch needed).
this.tickSlotTouch(slot, tipPressed);
}

// Select via controller/hand trigger while the ray (or tip) is on a slot.
let anySelectActive = false;
for (const hand of XR_HANDS) {
const select = this.input.xr.getSelectState(hand);
if (!select.active && !select.start) {
continue;
}
anySelectActive = true;
if(this.handPointsAtPanel(hand)||this.panelDragActiveHands.has(hand))continue;
if (this.slotSelectLatched && !select.start) {
continue;
}
const aimed =
this.findRayHoveredSlot(hand) ?? this.findTipHoveredSlot(hand);
if (aimed != null && !aimed.selected) {
this.slotSelectLatched = true;
this.selectWallSlot(aimed);
return;
}
}
if (!anySelectActive) {
this.slotSelectLatched = false;
}
}

/** Rising-edge fingertip touch on a slot's press volume, mirroring pad touch. */
private tickSlotTouch(
slot: SlotCandidateRuntime,
pressInside: boolean,
): void {
const index = slot.candidateIndex;
if (!pressInside) {
const exit = (this.slotTouchExitFrames.get(index) ?? 0) + 1;
this.slotTouchExitFrames.set(index, exit);
if (exit >= TOUCH_EXIT_FRAMES) {
// Leaving the press box re-arms this slot for another touch.
this.slotTouchArmed.set(index, true);
this.slotTouchEnterFrames.set(index, 0);
}
return;
}
this.slotTouchExitFrames.set(index, 0);
const enter = (this.slotTouchEnterFrames.get(index) ?? 0) + 1;
this.slotTouchEnterFrames.set(index, enter);
if (
(this.slotTouchArmed.get(index) ?? true) &&
enter >= TOUCH_ENTER_FRAMES
) {
this.slotTouchArmed.set(index, false);
this.selectWallSlot(slot);
}
}

/** Closest slot under a controller/hand target ray within pad half-extent. */
private findRayHoveredSlot(
preferredHand?: 'left' | 'right',
): SlotCandidateRuntime | null {
let best: SlotCandidateRuntime | null = null;
let bestAlong = Number.POSITIVE_INFINITY;
for (const hand of XR_HANDS) {
if (preferredHand != null && hand !== preferredHand) {
continue;
}
const adapter = this.input.xr.visualAdapters[hand].peek();
if (adapter != null && !adapter.connected) {
continue;
}
if(this.handPointsAtPanel(hand))continue;
const raySpace = this.player.raySpaces[hand];
raySpace.updateWorldMatrix(true, false);
raySpace.getWorldPosition(this.rayOrigin);
raySpace.getWorldQuaternion(this.gripQuat);
// XR target rays point along local -Z.
this.rayDir.set(0, 0, -1).applyQuaternion(this.gripQuat).normalize();
for (const slot of this.slotCandidates) {
if (slot.selected) {
continue;
}
slot.root.getWorldPosition(this.padWorldPos);
this.rayToSlot.copy(this.padWorldPos).sub(this.rayOrigin);
const along = this.rayToSlot.dot(this.rayDir);
if (along < 0.05 || along > 6) {
continue;
}
this.rayClosest.copy(this.rayOrigin).addScaledVector(this.rayDir, along);
const lateral = this.rayClosest.distanceTo(this.padWorldPos);
const hitRadius = (slot.sizeM ?? slot.transform.sizeM ?? this.placementPadSizeM()) * 0.55;
if (lateral <= hitRadius && along < bestAlong) {
bestAlong = along;
best = slot;
}
}
}
return best;
}

private findTipHoveredSlot(
hand: 'left' | 'right',
): SlotCandidateRuntime | null {
this.player.indexTipSpaces[hand].getWorldPosition(this.tipScratch);
let best: SlotCandidateRuntime | null = null;
let bestDist = Number.POSITIVE_INFINITY;
for (const slot of this.slotCandidates) {
if (slot.selected) {
continue;
}
slot.root.getWorldPosition(this.padWorldPos);
const dist = this.tipScratch.distanceTo(this.padWorldPos);
if (dist < slot.sizeM * 0.55 && dist < bestDist) {
bestDist = dist;
best = slot;
}
}
return best;
}

private selectWallSlot(slot: SlotCandidateRuntime): void {
if (slot.selected || this.selectedSlotTransforms.length >= 4) {
return;
}
// Keep picks spread out so pads do not stack.
const tooClose = this.selectedSlotTransforms.some((prior) => {
const priorSize = prior.sizeM ?? slot.sizeM;
const dx = prior.position[0] - slot.transform.position[0];
const dy = prior.position[1] - slot.transform.position[1];
const dz = prior.position[2] - slot.transform.position[2];
return Math.hypot(dx, dy, dz) < (priorSize + slot.sizeM) * 0.5 + 0.04;
});
if (tooClose) {
this.statusText = 'Too close to another pick - choose a farther slot';
this.renderPanel();
return;
}
setCandidateVisualState(slot, 'selected');
this.selectedSlotTransforms.push({
position: slot.transform.position,
quaternion: slot.transform.quaternion,
sizeM: slot.sizeM,
kind: slot.transform.kind,
});
const count = this.selectedSlotTransforms.length;
if (count >= 4) {
const transforms = [...this.selectedSlotTransforms];
// Existing recorded lines only cover all-wall or all-table finishes; a
// mixed finish gets no lead-in rather than an inaccurate one.
const allWalls = transforms.every((t) => t.kind !== 'table');
const allTables = transforms.every((t) => t.kind === 'table');
const doneLine =
this.setupMode === 'sitting'
? 'tableFound'
: this.setupMode === 'combined'
? allTables
? 'tableFound'
: allWalls
? 'padsOnWalls'
: undefined
: 'padsOnWalls';
this.clearRoomSetupVisuals();
this.finishHeadsetPlacement(transforms, doneLine);
return;
}
this.statusText = `Pick pad ${count + 1} of 4`;
this.renderPanel();
}

private clearRoomSetupVisuals(): void {
disposeSlotCandidates(this.slotCandidates);
this.slotArmed.clear();
this.slotTouchArmed.clear();
this.slotTouchEnterFrames.clear();
this.slotTouchExitFrames.clear();
this.selectedSlotTransforms = [];
for (const entity of this.wallOverlayEntities) {
entity.dispose({ disposeResources: true });
}
this.wallOverlayEntities = [];
clearRoomSetupTints();
this.setWallPickHintVisible(false);
}

/** Hide Quest plane/mesh proxies during play so only the pads remain visible. */
private setSpatialMeshesVisible(visible: boolean): void {
for (const entity of this.queries.planes.entities) {
if (entity.object3D != null) {
entity.object3D.visible = visible;
}
}
for (const entity of this.queries.meshes.entities) {
if (entity.object3D != null) {
entity.object3D.visible = visible;
}
}
}

private placementPadSizeM(): number {
return this.setupMode === 'sitting'
? this.tablePadSizeM
: defaultHeadsetPadSize();
}

private startAirPlacement(line: WallTonesClipId): void {
this.clearRoomSetupVisuals();
this.setSpatialMeshesVisible(false);
this.flowPhase = 'air-placement';
this.resetSetupPanelAnchor();
this.airPlaceStep = 0;
this.lackingSpatialData = true;
this.airOrientationLocked = null;
// Keep dominantHand from the first panel select so ghost orientation
// follows that placing hand; only clear it when leaving the experience.
// Menu "Air place" covers both wall and table styles via hand tilt / locks.
this.airOrientation =
this.setupMode === 'sitting' ? 'horizontal' : 'vertical';
this.syncAirPadSizeFromOrientation();
this.clearPads();
this.setFlatHintVisible(false);
this.setWallPickHintVisible(false);
this.setAirOrientUiVisible(true);
this.setRescanUiVisible(false);
this.setRepeatUiVisible(false);
// Placement is already visible. Skip queued mode/orientation speeches and
// give only the existing concise first-pad positioning instruction.
this.speech.cancel();
// Keep useful failure context when automatic placement could not find space.
if (line !== 'chooseAirMenu') this.speech.speak(line);
// Item 43: explain the two placement orientations (upright / flat) before the
// pad-one instruction, like the earlier flow did.
this.speech.speak('chooseAirOrient');
this.speech.speak('airPlace1');
this.statusText =
this.setupMode === 'air'
? 'Air place: tilt for wall or table size, then pinch.'
: 'Tilt placing hand to snap flat/upright, then pinch.';
this.spawnGhostPad();
this.syncDebugCollidersButton();
this.renderPanel();
}

/** Room-scale air pads when upright; sitting-sized pads when flat. */
private syncAirPadSizeFromOrientation(): void {
if (this.setupMode === 'sitting') {
this.airPadSizeM = AIR_PLACE_SITTING_PAD_SIZE_M;
return;
}
if (this.setupMode === 'room-scale') {
this.airPadSizeM = AIR_PLACE_ROOM_PAD_SIZE_M;
return;
}
// Explicit Air place menu option: size follows orientation snap/lock.
this.airPadSizeM =
this.airOrientation === 'horizontal'
? AIR_PLACE_SITTING_PAD_SIZE_M
: AIR_PLACE_ROOM_PAD_SIZE_M;
}

private setAirOrientation(orientation: AirOrientation): void {
const sizeChanged =
this.setupMode === 'air' && orientation !== this.airOrientation;
this.airOrientation = orientation;
this.airOrientationLocked = orientation;
this.syncAirPadSizeFromOrientation();
if (sizeChanged && this.flowPhase === 'air-placement' && this.ghostPad != null) {
this.spawnGhostPad();
}
this.statusText =
orientation === 'horizontal'
? 'Locked table / flat. Pinch to place.'
: 'Locked wall / vertical. Pinch to place.';
this.renderPanel();
}

private spawnGhostPad(): void {
this.ghostPad?.entity.dispose({ disposeResources: true });
this.ghostPad = createGhostPadRuntime(
this.world,
SIMON_FANFARE_PAD_ORDER[this.airPlaceStep % 4] as WallTonePadId,
this.airPadSizeM,
);
this.applyTouchDebugVisibility();
}

private tickAirPlacement(delta: number): void {
const hand = this.resolvePlacementHand();
if (hand == null || this.ghostPad == null) {
return;
}
this.updateGhostPadPose(hand, delta);

const select = this.input.xr.getSelectState(hand);
if (!select.start || this.handPointsAtPanel(hand) || this.panelDragActiveHands.has(hand)) {
return;
}
if (this.dominantHand == null) {
this.dominantHand = hand;
sessionStorage.setItem('wall-tones-dominant-hand', hand);
}
const placed = this.ghostPad;
solidifyGhostPad(placed, this.airPadSizeM);
placed.entity.addComponent(XRAnchor);
this.pads.push(placed);
this.applyTouchDebugVisibility();
this.ghostPad = null;
this.airPlaceStep += 1;
// Every stage advance invalidates stale setup speech, including the final
// pad, which must stop its placement prompt before the game intro starts.
this.speech.cancel();
if (this.airPlaceStep >= 4) {
this.flowPhase = 'playing';
this.layoutPanelForMrPlay();
this.setAirOrientUiVisible(false);
this.setRescanUiVisible(false);
this.setRepeatUiVisible(true);
this.setSpatialMeshesVisible(false);
this.statusText = 'Get ready...';
this.beginRoundWithIntro();
this.renderPanel();
return;
}
// Short prompts for pads 2-4; the full positioning phrase only plays for
// pad 1 (airPlace1 at placement start).
const shortPrompts = [
'airPlaceShort2',
'airPlaceShort3',
'airPlaceShort4',
] as const;
this.speech.speak(shortPrompts[this.airPlaceStep - 1]!);
this.statusText = `Pinch to place outline ${this.airPlaceStep + 1} of 4.`;
this.spawnGhostPad();
this.renderPanel();
}

private updateGhostPadPose(hand: 'left' | 'right', delta: number): void {
if (this.ghostPad == null) {
return;
}
this.player.head.getWorldPosition(this.viewer);
this.player.gripSpaces[hand].getWorldPosition(this.gripWorld);
this.readGripWorldQuaternion(hand, this.gripQuat);

this.ghostForward.set(
this.gripWorld.x - this.viewer.x,
0,
this.gripWorld.z - this.viewer.z,
);
if (this.ghostForward.lengthSq() < 1e-6) {
this.player.head.getWorldDirection(this.ghostForward);
this.ghostForward.y = 0;
}
this.ghostForward.normalize();

this.ghostTarget
.copy(this.gripWorld)
.addScaledVector(this.ghostForward, AIR_GHOST_HAND_OFFSET_M);
const preferredY =
this.setupMode === 'sitting'
? this.viewer.y - 0.55
: this.viewer.y - 0.35;
this.ghostTarget.y = preferredY * 0.35 + this.gripWorld.y * 0.65;

this.awayFromHead.copy(this.ghostTarget).sub(this.viewer);
const minDist = Math.max(
AIR_GHOST_MIN_HEAD_DISTANCE_M,
this.airPadSizeM * 0.5 + 0.45,
);
if (this.awayFromHead.length() < minDist) {
if (this.awayFromHead.lengthSq() < 1e-6) {
this.awayFromHead.copy(this.ghostForward);
}
this.awayFromHead.setLength(minDist);
this.ghostTarget.copy(this.viewer).add(this.awayFromHead);
this.ghostTarget.y = preferredY * 0.35 + this.gripWorld.y * 0.65;
this.awayFromHead.copy(this.ghostTarget).sub(this.viewer);
if (this.awayFromHead.length() < minDist) {
this.awayFromHead.setLength(minDist);
this.ghostTarget.copy(this.viewer).add(this.awayFromHead);
}
}

this.ghostPad.root.position.copy(this.ghostTarget);
this.updateAirOrientationFromHand();
this.buildTargetGhostQuaternion(this.targetGhostQuat);
// Slerp in local space toward the snapped target (frame-rate independent).
const alpha = 1 - Math.pow(1 - AIR_ORIENT_SLERP, Math.max(delta, 1 / 120) * 72);
this.ghostQuat.copy(this.ghostPad.root.quaternion);
this.ghostQuat.slerp(this.targetGhostQuat, alpha);
this.ghostPad.root.quaternion.copy(this.ghostQuat);
}

private updateAirOrientationFromHand(): void {
if (this.airOrientationLocked != null) {
this.airOrientation = this.airOrientationLocked;
return;
}
// Grip local +Y follows the hand long axis: high |world Y| ⇒ upright hand ⇒ wall.
this.handUp.set(0, 1, 0).applyQuaternion(this.gripQuat).normalize();
const uprightness = Math.abs(this.handUp.y);
let next = this.airOrientation;
if (uprightness >= AIR_ORIENT_SNAP_UPRIGHT) {
next = 'vertical';
} else if (uprightness <= AIR_ORIENT_SNAP_FLAT) {
next = 'horizontal';
}
if (next !== this.airOrientation) {
this.airOrientation = next;
const prevSize = this.airPadSizeM;
this.syncAirPadSizeFromOrientation();
if (
this.setupMode === 'air' &&
this.airPadSizeM !== prevSize &&
this.ghostPad != null
) {
this.spawnGhostPad();
}
this.statusText =
next === 'horizontal'
? 'Snapped flat - pinch to place'
: 'Snapped upright - pinch to place';
this.renderPanel();
}
}

private buildTargetGhostQuaternion(out: Quaternion): void {
const yaw = Math.atan2(
this.viewer.x - this.ghostTarget.x,
this.viewer.z - this.ghostTarget.z,
);
const halfYaw = yaw * 0.5;
out.set(0, Math.sin(halfYaw), 0, Math.cos(halfYaw));
if (this.airOrientation === 'horizontal') {
this.scratchQuat.setFromAxisAngle(this.axisX, -Math.PI / 2);
out.multiply(this.scratchQuat);
}
}

private readGripWorldQuaternion(
hand: 'left' | 'right',
out: Quaternion,
): void {
const grip = this.player.gripSpaces[hand];
grip.updateWorldMatrix(true, false);
grip.getWorldQuaternion(out);
}

private resolvePlacementHand(): 'left' | 'right' | null {
if (this.dominantHand != null) {
return this.dominantHand;
}
// Prefer a connected hand (right first) until the first UI/pinch sets dominant.
for (const hand of XR_HANDS) {
const adapter = this.input.xr.visualAdapters[hand].peek();
if (adapter?.connected) {
return hand;
}
}
for (const hand of XR_HANDS) {
const adapter = this.input.xr.visualAdapters[hand].peek();
if (adapter instanceof XRHandVisualAdapter) {
return hand;
}
}
return 'right';
}

private finishHeadsetPlacement(
transforms: PlacedPadTransform[],
line: WallTonesClipId | undefined,
): void {
this.clearRoomSetupVisuals();
this.clearPads();
this.lackingSpatialData = false;
this.setWallPickHintVisible(false);
this.setRescanUiVisible(false);
this.setAirOrientUiVisible(false);
// Play mode: only the four pads — hide plane/mesh proxies.
this.setSpatialMeshesVisible(false);
transforms.forEach((transform, index) => {
const size = transform.sizeM ?? this.placementPadSizeM();
const pad = createPadRuntime(this.world, index as WallTonePadId, size, {
// RayInteractable so a controller/hand ray (and the shared Hovered/Pressed
// state) can press the pad; fingertip volumes stay the primary touch path.
rayInteractable: true,
anchor: true,
});
pad.root.position.set(...transform.position);
pad.root.quaternion.set(...transform.quaternion);
this.pads.push(pad);
});
this.applyTouchDebugVisibility();
this.flowPhase = 'playing';
this.layoutPanelForMrPlay();
this.setRescanUiVisible(false);
this.setRepeatUiVisible(true);
this.syncDebugCollidersButton();
this.statusText = 'Get ready...';
this.beginRoundWithIntro(line);
this.renderPanel();
}

private spawnDesktopPads(): void {
if (!this.useDesktopPath()) {
return;
}
this.clearPads();
this.world.camera.getWorldPosition(this.cameraPosition);
this.world.camera.getWorldDirection(this.cameraForward);
const phoneFlat = this.isPhoneFlatViewport();
const size = phoneFlat ? PHONE_PAD_SIZE_M : defaultDesktopPadSize();
const transforms = planDesktopGridFromCamera(
this.cameraPosition,
this.cameraForward,
size,
phoneFlat ? PHONE_FLAT_GRID : undefined,
);
transforms.forEach((transform, index) => {
const pad = createPadRuntime(this.world, index as WallTonePadId, size, {
rayInteractable: true,
anchor: false,
});
pad.root.position.set(...transform.position);
pad.root.quaternion.set(...transform.quaternion);
this.pads.push(pad);
});
this.applyTouchDebugVisibility();
if (!this.flatAwaitingStart) {
this.statusText = 'Watch the sequence';
}
this.renderPanel();
}

private clearPads(): void {
disposePadRuntimes(this.pads);
this.ghostPad?.entity.dispose({ disposeResources: true });
this.ghostPad = null;
// Backlog 30 research: a new layout means the old pad-reach anchor is stale.
this.movement.resetPadAnchor();
}

/**
* Simon-style startup fanfare: each pad once, pause, first pad four times,
* then a short pause before voice / the real pattern.
*/
private async playSimonStartupFanfare(): Promise<void> {
this.statusText = 'Watch the pads...';
this.renderPanel();
// Fanfare order is green, red, yellow, blue (pad ids 0, 1, 3, 2).
for (const padIndex of SIMON_FANFARE_PAD_ORDER) {
if (!this.experienceActive || this.flowPhase !== 'playing') {
return;
}
await this.blinkPadNote(padIndex);
}
await this.wait(SIMON_FANFARE_MID_PAUSE_S);
for (let repeat = 0; repeat < SIMON_FANFARE_FIRST_PAD_REPEATS; repeat += 1) {
if (!this.experienceActive || this.flowPhase !== 'playing') {
return;
}
await this.blinkPadNote(0);
}
await this.wait(SIMON_FANFARE_END_PAUSE_S);
}

/** Pads are placed in fanfare order in MR air placement, so array position
* is NOT the pad id there. Always resolve a note/press id to its pad. */
private padById(padIndex: number): PadRuntime | undefined {
return findPadById(this.pads, padIndex);
}

private async blinkPadNote(padIndex: number): Promise<void> {
const pad = this.padById(padIndex);
if (pad != null) {
this.setBlinkCuePad(pad);
flashPad(pad, true);
if (this.useDesktopInput()) {
playPadToneFromUserAction(padIndex);
} else {
await playPadTone(padIndex);
}
await this.wait(BLINK_HOLD_S);
flashPad(pad, false);
this.setBlinkCuePad(null);
}
await this.wait(NOTE_GAP_S);
}

/** Fanfare, how-to-play voice line, pause, then the first pattern note. */
private beginRoundWithIntro(leadInLine?: WallTonesClipId): void {
this.playbackQueue = this.playbackQueue.then(async () => {
if (!this.experienceActive || this.flowPhase !== 'playing') {
return;
}
this.statusText = 'Listen to the intro...';
this.renderPanel();
const narrMark = this.narrationInterrupt;
if (leadInLine != null) {
await this.speech.speakAsync(leadInLine);
await this.wait(0.35);
}
if (!this.experienceActive || this.flowPhase !== 'playing') {
return;
}
await this.playSimonStartupFanfare();
if (!this.experienceActive || this.flowPhase !== 'playing') {
return;
}
// Skip the opening "Point and press..." sentence if the welcome already said it.
// A user skip during the intro also swallows this remaining line, without
// aborting the round flow that follows.
if (narrMark === this.narrationInterrupt) {
await this.speech.speakAsync(
this.startPromptSpoken ? 'howToPlayRest' : 'howToPlay',
);
}
this.startPromptSpoken = false;
await this.wait(POST_INTRO_DELAY_S);
if (!this.experienceActive || this.flowPhase !== 'playing') {
return;
}
this.game.startNewRun();
this.renderPanel();
await this.playSequence();
});
}

private async playSequence(): Promise<void> {
if (!this.experienceActive) {
return;
}
this.game.phase = 'playback';
this.inputNeedsClear = true;
this.armAllPads();
this.statusText = 'Listen:';
// User ask (Nov 7): Listen squares appear one by one as each note plays.
this.playbackShownCount = 0;
this.renderPanel();
for (let index = 0; index < this.game.sequence.length; index += 1) {
const padId = this.game.sequence[index]!;
const pad = this.padById(padId);
if (pad != null) {
this.setBlinkCuePad(pad);
flashPad(pad, true);
this.playbackShownCount = index + 1;
this.renderPanel();
await playPadTone(padId);
await this.wait(NOTE_GAP_S + BLINK_HOLD_S + 0.2);
flashPad(pad, false);
this.setBlinkCuePad(null);
}
await this.wait(NOTE_GAP_S);
}
// Autoplay store modifier (store test values, balance TBD): after
// the Listen playback, the game plays the first level*5 notes for the
// player, capped one short of the full pattern so at least the last note
// stays manual. Auto-played notes pay no per-press Bars (no player press).
const autoCount = Math.min(
this.economy.getAutoplayNoteCount(),
this.game.sequence.length - 1,
);
if (autoCount > 0) {
this.statusText = `Auto play: first ${autoCount}`;
this.renderPanel();
for (let index = 0; index < autoCount; index += 1) {
if (!this.experienceActive || this.flowPhase !== 'playing') {
return;
}
const padId = this.game.sequence[index]!;
const pad = this.padById(padId);
if (pad != null) {
this.setBlinkCuePad(pad);
flashPad(pad, true);
await playPadTone(padId);
await this.wait(NOTE_GAP_S + BLINK_HOLD_S + 0.2);
flashPad(pad, false);
this.setBlinkCuePad(null);
}
await this.wait(NOTE_GAP_S);
}
if (!this.experienceActive || this.flowPhase !== 'playing') {
return;
}
}
this.game.phase = 'input';
this.game.inputStep = autoCount;
this.inputNeedsClear = true;
this.lastInputAt = performance.now() / 1000;
this.idleReplayQueued = false;
this.setRepeatUiVisible(true);
this.statusText = `Your turn: ${this.formatSequenceLabel()}`;
this.renderPanel();
}

private armAllPads(): void {
for (const pad of this.pads) {
pad.pointerArmed = true;
pad.fingerInside = false;
pad.hoverInside = false;
pad.pressCooldownUntil = 0;
applyPadVisualState(pad, 'idle');
}
}

private entityInQuery(entity: import('@iwsdk/core').Entity, set: Set<import('@iwsdk/core').Entity>): boolean {
for (const candidate of set) {
if (candidate === entity) {
return true;
}
}
return false;
}

private readDesktopTouches(): void {
if (this.inputNeedsClear) {
let anyPressed = false;
for (const pad of this.pads) {
const hovered = this.entityInQuery(pad.entity, this.queries.padHovered.entities);
const pressed =
hovered &&
this.entityInQuery(pad.entity, this.queries.padPressed.entities);
pad.hoverInside = hovered;
pad.fingerInside = pressed;
this.syncPadProximityVisual(pad, 0);
if (pressed) {
anyPressed = true;
}
// Re-arm on release even while still hovered (same-pad twice in a row).
if (!pressed) {
pad.pointerArmed = true;
}
}
if (!anyPressed) {
this.inputNeedsClear = false;
this.armAllPads();
}
return;
}
for (const pad of this.pads) {
const hovered = this.entityInQuery(pad.entity, this.queries.padHovered.entities);
const pressed =
hovered &&
this.entityInQuery(pad.entity, this.queries.padPressed.entities);
pad.hoverInside = hovered;
pad.fingerInside = pressed;
this.syncPadProximityVisual(pad, 0);
// Edge-trigger on press; re-arm when the button is released while hovered
// so sequences like green→green register the second press.
if (!pressed) {
pad.pointerArmed = true;
continue;
}
if (pad.pointerArmed) {
pad.pointerArmed = false;
this.handlePadInput(pad.padIndex);
}
}
}

private readFingertipTouches(): void {
const now = performance.now() / 1000;

if (this.inputNeedsClear) {
let anyPressInside = false;
for (const pad of this.pads) {
const pressDist = this.sampleTipInVolume(pad, 'press');
const hoverDist = this.sampleTipInVolume(pad, 'hover');
pad.fingerInside = pressDist != null;
pad.hoverInside = hoverDist != null;
if (pressDist != null) {
anyPressInside = true;
}
this.syncPadProximityVisual(pad, now);
}
// Must leave the smaller press box before the next note can arm.
if (!anyPressInside) {
this.inputNeedsClear = false;
this.armAllPads();
this.touchEnterFrames.clear();
this.touchExitFrames.clear();
}
return;
}

// Closest pad under the tip for press — avoids multi-pad ghosts.
let bestPress: PadRuntime | null = null;
let bestPressDist = Number.POSITIVE_INFINITY;
for (const pad of this.pads) {
const hoverDist = this.sampleTipInVolume(pad, 'hover');
pad.hoverInside = hoverDist != null;

const pressDist = this.sampleTipInVolume(pad, 'press');
if (pressDist == null) {
const exit = (this.touchExitFrames.get(pad.padIndex) ?? 0) + 1;
this.touchExitFrames.set(pad.padIndex, exit);
if (exit >= TOUCH_EXIT_FRAMES) {
// Leaving the inner box re-arms this pad (after cooldown).
pad.fingerInside = false;
pad.pointerArmed = true;
this.touchEnterFrames.set(pad.padIndex, 0);
}
this.syncPadProximityVisual(pad, now);
continue;
}
this.touchExitFrames.set(pad.padIndex, 0);
if (pressDist < bestPressDist) {
bestPressDist = pressDist;
bestPress = pad;
}
this.syncPadProximityVisual(pad, now);
}

for (const pad of this.pads) {
if (pad !== bestPress) {
if (bestPress != null) {
this.touchEnterFrames.set(pad.padIndex, 0);
}
continue;
}
const enter = (this.touchEnterFrames.get(pad.padIndex) ?? 0) + 1;
this.touchEnterFrames.set(pad.padIndex, enter);
// Rising edge only: enter the small box, never fire on exit.
if (
!pad.fingerInside &&
pad.pointerArmed &&
now >= pad.pressCooldownUntil &&
enter >= TOUCH_ENTER_FRAMES
) {
pad.fingerInside = true;
pad.pointerArmed = false;
pad.pressCooldownUntil = now + TOUCH_PRESS_COOLDOWN_S;
this.handlePadInput(pad.padIndex, true);
}
this.syncPadProximityVisual(pad, now);
}
}

// Ray, gaze and pinch presses on the play grid. The desktop grid already
// presses pads through the shared Hovered/Pressed state, and wall slots are
// picked with a hand ray plus pinch; play pads get the same far input so a
// tone can be pressed without walking up to the grid. Fingertip touch stays
// the primary path and runs first each frame; hover/press visuals merge in
// after it has reset them.
private readRayAndGazeTouches(): void {
const now = performance.now() / 1000;
// (a) Controller/hand rays: play pads are RayInteractable, so the shared
// input system already tracks ray hover and pinch press per pad. A private
// latch keeps this edge-trigger independent of the fingertip re-arm.
for (const pad of this.pads) {
const hovered = this.entityInQuery(pad.entity, this.queries.padHovered.entities);
const pressed =
hovered &&
this.entityInQuery(pad.entity, this.queries.padPressed.entities);
if (hovered && !pad.hoverInside) {
pad.hoverInside = true;
this.syncPadProximityVisual(pad, now);
}
if (!pressed) {
this.rayPressLatched.delete(pad.padIndex);
continue;
}
if (this.rayPressLatched.has(pad.padIndex)) {
continue;
}
this.rayPressLatched.add(pad.padIndex);
if (this.inputNeedsClear) {
continue;
}
const prevFinger = pad.fingerInside;
pad.fingerInside = true;
this.syncPadProximityVisual(pad, now);
pad.fingerInside = prevFinger;
this.handlePadInput(pad.padIndex);
}
// (b) Gaze: a head-forward ray against the pads, committed by a pinch from
// either hand. A pinch aimed at the panel, or one whose hand ray already
// rests on a pad, belongs to that target instead.
const gazePad = this.findGazeHoveredPad();
if (gazePad != null && !gazePad.hoverInside) {
gazePad.hoverInside = true;
this.syncPadProximityVisual(gazePad, now);
}
for (const hand of XR_HANDS) {
const select = this.input.xr.getSelectState(hand);
if (!select.active && !select.start) {
this.gazeSelectLatched.delete(hand);
continue;
}
if (this.gazeSelectLatched.has(hand) && !select.start) {
continue;
}
if (
gazePad == null ||
this.inputNeedsClear ||
this.handPointsAtPanel(hand) ||
this.panelDragActiveHands.has(hand) ||
this.findRayHoveredPad(hand) != null
) {
this.gazeSelectLatched.add(hand);
continue;
}
this.gazeSelectLatched.add(hand);
const prevFinger = gazePad.fingerInside;
gazePad.fingerInside = true;
this.syncPadProximityVisual(gazePad, now);
gazePad.fingerInside = prevFinger;
this.handlePadInput(gazePad.padIndex);
}
}

// Closest play pad under a hand's controller/hand ray, or null. Mirrors the
// slot-picking ray test.
private findRayHoveredPad(hand: 'left' | 'right'): PadRuntime | null {
const adapter = this.input.xr.visualAdapters[hand].peek();
if (adapter != null && !adapter.connected) {
return null;
}
if (this.handPointsAtPanel(hand)) {
return null;
}
const raySpace = this.player.raySpaces[hand];
raySpace.updateWorldMatrix(true, false);
raySpace.getWorldPosition(this.rayOrigin);
raySpace.getWorldQuaternion(this.gripQuat);
// XR target rays point along local -Z.
this.rayDir.set(0, 0, -1).applyQuaternion(this.gripQuat).normalize();
return this.findPadAlongRay();
}

// Closest play pad under the head-forward gaze ray, or null.
private findGazeHoveredPad(): PadRuntime | null {
this.player.head.getWorldPosition(this.rayOrigin);
this.player.head.getWorldQuaternion(this.headQuat);
this.rayDir.set(0, 0, -1).applyQuaternion(this.headQuat).normalize();
return this.findPadAlongRay();
}

private findPadAlongRay(): PadRuntime | null {
let best: PadRuntime | null = null;
let bestAlong = Number.POSITIVE_INFINITY;
for (const pad of this.pads) {
pad.root.getWorldPosition(this.padWorldPos);
this.rayToSlot.copy(this.padWorldPos).sub(this.rayOrigin);
const along = this.rayToSlot.dot(this.rayDir);
if (along < 0.05 || along > 6) {
continue;
}
this.rayClosest.copy(this.rayOrigin).addScaledVector(this.rayDir, along);
const lateral = this.rayClosest.distanceTo(this.padWorldPos);
if (lateral <= pad.sizeM * 0.55 && along < bestAlong) {
bestAlong = along;
best = pad;
}
}
return best;
}

private syncPadProximityVisual(pad: PadRuntime, _now: number): void {
if (pad.fingerInside) {
if (pad.visualState !== 'pressed') {
applyPadVisualState(pad, 'pressed');
}
return;
}
if (pad.hoverInside) {
if (pad.visualState !== 'hover') {
applyPadVisualState(pad, 'hover');
}
return;
}
if (pad.visualState !== 'idle') {
applyPadVisualState(pad, 'idle');
}
}

/**
* Distance from tip to pad center when inside hover or press volume; else null.
* Requires a connected hand tip near that hand's grip.
*/
private sampleTipInVolume(
target: Pick<PadRuntime, 'root' | 'sizeM' | 'touchVolume' | 'hoverVolume'>,
kind: 'hover' | 'press',
): number | null {
const volume = kind === 'hover' ? target.hoverVolume : target.touchVolume;
target.root.updateWorldMatrix(true, false);
volume.updateWorldMatrix(true, false);
target.root.getWorldPosition(this.padWorldPos);
const margin =
kind === 'hover'
? TOUCH_HOVER_CENTER_MARGIN_M
: TOUCH_PRESS_CENTER_MARGIN_M;
const scale = kind === 'hover' ? TOUCH_HOVER_SCALE : TOUCH_PRESS_SCALE;
const maxCenter = target.sizeM * 0.5 * Math.SQRT2 * scale + margin;
const fallbackDepth =
kind === 'hover' ? TOUCH_HOVER_DEPTH_M : TOUCH_PRESS_DEPTH_M;

for (const hand of XR_HANDS) {
const adapter = this.input.xr.visualAdapters[hand].peek();
if (adapter == null || !adapter.connected) {
continue;
}
this.player.indexTipSpaces[hand].getWorldPosition(this.tipScratch);
this.player.gripSpaces[hand].getWorldPosition(this.gripWorld);
if (this.tipScratch.distanceTo(this.gripWorld) > TOUCH_TIP_GRIP_MAX_M) {
continue;
}
const centerDist = this.tipScratch.distanceTo(this.padWorldPos);
if (centerDist > maxCenter) {
continue;
}
this.tipLocal.copy(this.tipScratch);
volume.worldToLocal(this.tipLocal);
const touchMesh = volume as import('@iwsdk/core').Mesh;
const geom = touchMesh.geometry as {
parameters?: { width?: number; height?: number; depth?: number };
};
const hx = (geom.parameters?.width ?? target.sizeM) * 0.5;
const hy = (geom.parameters?.height ?? target.sizeM) * 0.5;
const hz = (geom.parameters?.depth ?? fallbackDepth) * 0.5;
// Front-biased slab around the face; no deep punch-through.
if (
Math.abs(this.tipLocal.x) <= hx &&
Math.abs(this.tipLocal.y) <= hy &&
this.tipLocal.z >= -hz * 0.25 &&
this.tipLocal.z <= hz
) {
return centerDist;
}
}
return null;
}

private toggleTouchDebug(): void {
this.showTouchDebug = !this.showTouchDebug;
this.applyTouchDebugVisibility();
this.syncDebugCollidersButton();
}

private applyTouchDebugVisibility(): void {
// Flat/desktop: no collider wireframes. VR/MR only.
const visible = this.showTouchDebug && !this.useDesktopPath();
for (const pad of this.pads) {
setPadDebugCollidersVisible(pad, visible);
}
if (this.ghostPad != null) {
setPadDebugCollidersVisible(this.ghostPad, visible);
}
}

private syncDebugCollidersButton(): void {
// The toggle sits in the main menu Settings. Colliders exist only in VR/MR,
// so the control is hidden on flat/desktop.
const panel = this.world.getSceneObject<UIKitMLAsset>('main-menu-panel');
panel
?.getElementById('debug-colliders-button')
?.setProperties({ display: this.useDesktopPath() ? 'none' : 'flex' });
panel
?.getElementById<UIKit.Text>('debug-colliders-label')
?.setProperties({
text: this.showTouchDebug ? 'Debug colliders: ON' : 'Debug colliders: OFF',
});
}

private tickPanelDrag(): void {
if (this.useDesktopPath()) {
return;
}
// Drag/drop is explicit in both setup and play: only a pinch that STARTS
// on the panel header owns a drag until release. Gameplay, UI-button and
// surface-placement pinches must never reposition the panel.
const playingDrag = this.flowPhase === 'playing';
const setupDrag =
this.flowPhase === 'wall-picking' || this.flowPhase === 'air-placement';
if (!playingDrag && !setupDrag) {
this.panelDragSkipHands.clear();
this.panelDragActiveHands.clear();
return;
}

const distance = playingDrag ? PANEL_PLAY_DISTANCE_M : PANEL_FOLLOW_DISTANCE_M;
const scaleValue = playingDrag ? PANEL_PLAY_SCALE : PANEL_FOLLOW_SCALE;
let selectHeld = false;
for (const hand of XR_HANDS) {
const select = this.input.xr.getSelectState(hand);
if (!select.active && !select.start) {
this.panelDragSkipHands.delete(hand);
this.panelDragActiveHands.delete(hand);
continue;
}
if (select.start) {
const headerHovered=this.handPointsAtPanel(hand,true);
if (!headerHovered) {
this.panelDragSkipHands.add(hand);
this.panelDragActiveHands.delete(hand);
} else {
this.panelDragActiveHands.add(hand);
this.panelDragSkipHands.delete(hand);
}
}
if (
this.panelDragSkipHands.has(hand) ||
!this.panelDragActiveHands.has(hand)
) {
continue;
}
// A deliberate grab owns the pose until release, including orientation.
this.panelSnapActive = false;
selectHeld = true;
const raySpace = this.player.raySpaces[hand];
raySpace.getWorldPosition(this.rayOrigin);
raySpace.getWorldQuaternion(this.gripQuat);
this.rayDir.set(0, 0, -1).applyQuaternion(this.gripQuat).normalize();
this.panelFollowTargetPos
.copy(this.rayOrigin)
.addScaledVector(this.rayDir, distance);
if (setupDrag) {
this.player.head.getWorldPosition(this.viewer);
const height=this.panelWorldSize(scaleValue).height;
const clearance=this.flowPhase==='air-placement'?0.25:0.10;
this.panelFollowTargetPos.y=Math.max(this.panelFollowTargetPos.y,this.viewer.y+clearance+height/2);
// Keep the follow anchor at the drop point so the panel stays put.
this.panelFollowPos.copy(this.panelFollowTargetPos);
this.panelWorldAnchored = true;
}
this.player.head.getWorldPosition(this.viewer);
this.player.head.getWorldQuaternion(this.headQuat);
if(setupDrag){
this.panelMatrix.lookAt(this.viewer,this.panelFollowTargetPos,new Vector3(0,1,0));
this.headQuat.setFromRotationMatrix(this.panelMatrix);
}
this.applyPanelLayout(
this.panelFollowTargetPos.x,
this.panelFollowTargetPos.y,
this.panelFollowTargetPos.z,
scaleValue,
this.headQuat,
);
this.panelDragging = true;
break;
}
if (this.panelDragging && !selectHeld) {
this.panelDragging = false;
this.panelDragActiveHands.clear();
this.panelDragDoneAt = performance.now();
this.statusText = 'Panel placed';
this.renderPanel();
}
}

private setBlinkCuePad(pad: PadRuntime | null): void {
this.blinkCuePad = pad;
if (pad == null) {
if (this.blinkCueRoot != null) {
this.blinkCueRoot.visible = false;
}
}
}

private ensureBlinkCueArrow(): void {
if (this.blinkCueRoot != null) {
return;
}
const root = new Object3D();
root.name = 'wall-tones-blink-cue';
const mat = new MeshBasicMaterial({
color: 0xffffff,
transparent: true,
opacity: 0.45,
depthWrite: false,
side: DoubleSide,
});
const shaft = new Mesh(new CylinderGeometry(0.012, 0.012, 0.16, 8), mat);
shaft.position.y = 0.08;
const head = new Mesh(new ConeGeometry(0.045, 0.1, 10), mat.clone());
head.position.y = 0.2;
root.add(shaft);
root.add(head);
root.visible = false;
this.blinkCueRoot = root;
this.blinkCueEntity = this.world.createTransformEntity(root);
}

/** Tint the arrow with the color of the pad it points at (not white). */
private colorBlinkCueArrow(padIndex: number): void {
const hex = WALL_TONE_PADS[padIndex]?.color;
if (hex == null || this.blinkCueRoot == null) {
return;
}
for (const child of this.blinkCueRoot.children) {
const material = (child as Mesh).material;
if (material instanceof MeshBasicMaterial) {
material.color.setHex(hex);
}
}
}

private disposeBlinkCueArrow(): void {
this.blinkCueEntity?.dispose({ disposeResources: true });
this.blinkCueEntity = null;
this.blinkCueRoot = null;
this.blinkCuePad = null;
}

/** Half-transparent arrow in front of the headset when the blinking pad is off-screen. */
private tickBlinkCueArrow(): void {
if (
this.blinkCuePad == null ||
this.useDesktopPath() ||
this.flowPhase !== 'playing'
) {
if (this.blinkCueRoot != null) {
this.blinkCueRoot.visible = false;
}
return;
}
this.ensureBlinkCueArrow();
if (this.blinkCueRoot == null) {
return;
}
this.colorBlinkCueArrow(this.blinkCuePad.padIndex);
this.player.head.getWorldPosition(this.viewer);
this.player.head.getWorldQuaternion(this.headQuat);
this.ghostForward.set(0, 0, -1).applyQuaternion(this.headQuat).normalize();
this.blinkCuePad.root.getWorldPosition(this.padWorldPos);
this.toPanel.copy(this.padWorldPos).sub(this.viewer);
if (this.toPanel.lengthSq() < 1e-6) {
this.blinkCueRoot.visible = false;
return;
}
this.toPanel.normalize();
const lookDot = Math.min(1, Math.max(-1, this.ghostForward.dot(this.toPanel)));
const offscreenDeg = (Math.acos(lookDot) * 180) / Math.PI;
if (offscreenDeg < BLINK_CUE_OFFSCREEN_DEG) {
this.blinkCueRoot.visible = false;
return;
}
this.panelFollowTargetPos
.copy(this.viewer)
.addScaledVector(this.ghostForward, 0.85);
this.blinkCueRoot.position.copy(this.panelFollowTargetPos);
// Point the local +Y arrow toward the pad.
this.handUp.set(0, 1, 0);
this.blinkCueRoot.quaternion.setFromUnitVectors(this.handUp, this.toPanel);
this.blinkCueRoot.visible = true;
}

private handlePadInput(padIndex: number, physicalTouch = false): void {
if (this.flatAwaitingStart && this.useDesktopPath()) {
void this.startFlatPlayFromPad(padIndex);
return;
}
if (this.game.phase !== 'input') {
return;
}
this.lastInputAt = performance.now() / 1000;
this.idleReplayQueued = false;
const expected = this.game.sequence[this.game.inputStep];
if (expected == null) {
return;
}
// Lifetime pad-press counter (achievements): every eligible gameplay press
// counts, correct or wrong. Host playback, menu and setup input never get
// past the phase gate above (user-settled: presses "in the game").
this.economy.countGameplayPress(this.game.streak);
const pad = this.padById(padIndex);
if (pad != null) {
flashPad(pad, true);
// A wrong pad gets only the failure buzzer, not its musical pad note.
if (padIndex === expected) {
if (this.useDesktopInput()) {
playPadToneFromUserAction(padIndex);
} else {
void playPadTone(padIndex);
}
}
window.setTimeout(() => flashPad(pad, false), 350);
}
if (padIndex !== expected) {
void this.onWrongInput();
return;
}
// Any instruction still finishing is obsolete once a correct pad is hit.
this.speech.cancel();
// Backlog 30 research: pad-reach estimate between correct presses (MR only;
// flat pads are a fixed on-screen grid, not a reach). Physical fingertip
// touches only: ray, gaze and pinch presses are far input, the hand never
// travelled to the pad, so they add no reach (Quest feedback Nov 14).
if (pad != null && physicalTouch) {
pad.root.getWorldPosition(this.padWorldPos);
this.movement.noteCorrectPadPress(this.padWorldPos.x, this.padWorldPos.y, this.padWorldPos.z, !this.isFlatView());
}
const previousBest = this.game.bestStreak;
const completed = this.game.onCorrectInput();
if (this.game.bestStreak > previousBest) {
this.economy.saveBestStreak(this.game.bestStreak);
this.recordBeatenThisAttempt = true;
}
// Every correct press pays the current band rate (user-settled economy):
// 1 Bar at streaks 1-5, 2 at 6-10, 4 at 11-15, doubling every five. The
// amount floats from the pad to the Bars icon.
this.hideRoundBarsCard();
const pressAward = this.economy.awardForPress(this.game.streak);
this.roundBarsEarned += pressAward;
if (pressAward > 0) {
this.spawnBarFloat(padIndex, pressAward);
if (this.economy.takeFirstTime('bars-earned')) {
this.barsFirstEarnedPending = true;
}
}
this.renderPanel();
if (completed) {
if (this.cypherSeam) this.setCypherSeam(false);
// Lock input immediately so a held finger/click cannot eat the next round.
this.game.phase = 'playback';
this.inputNeedsClear = true;
// Free Replay earn milestones (owner rule 2026-11-11): one at every 5-note
// milestone past the current Hint coverage; a grant at the full cap of 2
// free Replays is lost.
let replayNote = '';
if (this.economy.isReplayMilestone(this.game.streak)) {
replayNote = this.economy.grantFreeReplay()
? ' Free Replay earned!'
: ' Free Replay grant lost - cap full.';
}
this.statusText = `Nice - streak ${this.game.streak}.${replayNote} Next pattern...`;
this.renderPanel();
const streak = this.game.streak;
const increasedRecord = shouldAnnounceRecord(streak, previousBest, this.firstRun);
// Pattern completion pays its own extra on top of the presses
// (user-settled: "each pattern completion is also another reward extra",
// band rate 1/2/4 as the provisional calibration); a completed pattern
// that beat the best streak adds the record bonus of rate x streak
// (exponential: 5 -> +5, 10 -> +20, 15 -> +60, 20 -> +160).
const { completion, bonus } = this.economy.completePattern(
streak,
this.recordBeatenThisAttempt,
);
this.recordBeatenThisAttempt = false;
if (completion > 0) {
this.roundBarsEarned += completion;
this.roundCompletionEarned += completion;
// Stagger so the completion float does not overlap the press float.
window.setTimeout(() => {
if (this.experienceActive) this.spawnBarFloat(padIndex, completion);
}, 250);
}
if (bonus > 0) {
this.roundBarsEarned += bonus;
this.roundBonusEarned += bonus;
window.setTimeout(() => {
if (this.experienceActive) this.spawnBarFloat(padIndex, bonus);
}, 500);
}
// Round summary line: total Bars earned on this pattern, with the bonus
// part (completion + record bonus) appended inline when present. One
// compact always-present line (user ask); updates at round end, resets to
// +0 on the next round. The full pads/completion/bonus breakdown stays in
// the debug bridge string for tests.
this.showRoundBarsCard(
this.roundBarsEarned,
this.roundCompletionEarned,
this.roundBonusEarned,
);
this.roundBarsEarned = 0;
this.roundCompletionEarned = 0;
this.roundBonusEarned = 0;
// Backlog 12a voice: explain the first Bars ever earned, once per install.
const explainBars = this.barsFirstEarnedPending;
this.barsFirstEarnedPending = false;
this.showAchievementToasts();
this.renderPanel();
this.playbackQueue = this.playbackQueue.then(async () => {
const narrMark = this.narrationInterrupt;
const narrIntact = () =>
this.experienceActive && this.flowPhase === 'playing' &&
narrMark === this.narrationInterrupt;
if (increasedRecord) {
await this.speech.speakAsync(randomNewBestClip(previousBest === 0));
if (!this.experienceActive || this.flowPhase !== 'playing') return;
}
if (streak > 0 && streak % 5 === 0) {
if (narrIntact()) await this.speech.speakAsync(milestoneClipFor(streak));
if (narrIntact()) {
await this.speech.speakAsync(randomCheerClip());
}
await this.wait(0.35);
} else {
if (increasedRecord && narrIntact()) await this.speech.speakAsync(randomCheerClip());
await this.wait(BETWEEN_ROUNDS_DELAY_S);
}
if (explainBars && this.experienceActive && this.flowPhase === 'playing') {
await this.speech.speakAsync('barsFirstEarn');
}
if (!this.experienceActive || this.flowPhase !== 'playing') {
return;
}
if (narrIntact()) {
const window = this.cypherProgress.beginWindow(streak);
if (window) await this.playCypherWindow(window, narrIntact);
else {
// Skip/interrupt leaves the line unheard (lineCompleted is not reached), so it retries at the next quiet pattern boundary.
const line = this.backgroundProgress.successfulPattern(this.cypherProgress.finished, !this.speech.isBusy());
if (line && narrIntact()) {
const cast = captureCypherCast(getVoiceGender());
await this.speech.speakBackgroundEffect(this.backgroundProgress.completedLines % 3 === 2 ? 'squawk' : 'open');
if (narrIntact()) await this.speech.speakBackgroundLine(line.id, cast);
if (narrIntact()) this.backgroundProgress.lineCompleted();
if (narrIntact()) await this.speech.speakBackgroundEffect('close');
}
}
}
if (!this.experienceActive || this.flowPhase !== 'playing') return;
await this.playSequence();
});
}
}

/** Between patterns only: all voices and effects share the existing Skip lifecycle. */
private async playCypherWindow(window: CypherWindow, intact: () => boolean): Promise<void> {
const cast = captureCypherCast(getVoiceGender());
if (window.seam === 'closed') this.setCypherSeam(false);
if (window.fault) {
this.statusText = 'Diagnostic: timing fault. Checking...';
this.renderPanel();
await this.speech.speakStoryEffect('glitch');
} else if (window.seam === 'closed') {
await this.speech.speakStoryEffect('shimmer');
} else if (window.speaker === 'cypher') {
await this.speech.speakStoryEffect(['next-window', 'your-machine', 'next-lock', 'longer-window'].includes(window.id) ? 'squawk' : 'open');
}
if (window.seam === 'open' && intact()) this.setCypherSeam(true);
for (const id of window.lines) {
if (!intact()) break;
await this.speech.speakStoryLine(id, cast);
if (intact()) this.cypherProgress.lineCompleted();
}
if (window.speaker === 'cypher' && intact()) await this.speech.speakStoryEffect('close');
if (!intact()) this.setCypherSeam(false);
}

/** A small fictional light seam beside the play field, never a flash or pad overlay. */
private setCypherSeam(visible: boolean): void {
this.cypherFlatSeam?.remove();
this.cypherFlatSeam = null;
if (visible && this.isFlatView()) {
const seam = document.createElement('div');
seam.id = 'wall-tones-story-seam';
seam.setAttribute('aria-hidden', 'true');
Object.assign(seam.style, {position: 'fixed', left: '12%', top: '36%', width: '12px', height: '90px', background: '#c5faff', boxShadow: '0 0 8px 2px #49c9e3', clipPath: 'polygon(25% 0, 100% 35%, 35% 55%, 90% 100%, 0 55%, 65% 35%)', pointerEvents: 'none', zIndex: '100000'});
document.body.appendChild(seam);
this.cypherFlatSeam = seam;
}
this.cypherSeamEntity?.dispose({ disposeResources: true });
this.cypherSeamEntity = null;
this.cypherSeam = null;
if (!visible) return;
const root = new Object3D();
root.name = 'CypherLightSeam';
const camera = this.world.camera;
const points = [new Vector3(0, 0.2, 0), new Vector3(0.025, 0.07, 0), new Vector3(-0.018, -0.04, 0), new Vector3(0.015, -0.2, 0)];
for (let i = 1; i < points.length; i++) {
const a = points[i - 1]!, b = points[i]!;
const mesh = new Mesh(new CylinderGeometry(0.003, 0.003, a.distanceTo(b), 6), new MeshBasicMaterial({color: 0x77dfff, depthTest: false, depthWrite: false}));
mesh.position.copy(a).add(b).multiplyScalar(0.5);
mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
mesh.updateMatrix();
root.add(mesh);
}
this.cypherSeamEntity = this.world.createTransformEntity(root);
camera.getWorldPosition(root.position);
camera.getWorldQuaternion(root.quaternion);
root.position.add(new Vector3(0, 0.9, -2).applyQuaternion(root.quaternion));
root.updateMatrix();
root.updateMatrixWorld(true);
this.cypherSeam = root;
}

private async startFlatPlayFromPad(padIndex: number): Promise<void> {
if (!this.flatAwaitingStart || !this.experienceActive) {
return;
}
this.flatAwaitingStart = false;
this.setPanelHeaderVisible(!this.isPhoneFlatViewport());
// A pad press demonstrates progress: stop any welcome / press instruction.
this.speech.cancel();
this.startPromptSpoken = true;
primeWallTonesAudioFromGesture();
// Confirm the tap briefly, then run the spoken intro before the first sequence tone.
const pad = this.padById(padIndex);
if (pad != null) {
flashPad(pad, true);
playPadToneFromUserAction(padIndex);
window.setTimeout(() => flashPad(pad, false), 280);
}
this.setRepeatUiVisible(true);
this.statusText = 'Get ready...';
this.renderPanel();
// If the welcome was still speech-locked at entry (mobile before the
// "Sound on" tap), lead with it now that this tap unlocked audio.
const leadIn = this.welcomeSpoken ? undefined : 'welcome';
this.welcomeSpoken = true;
this.beginRoundWithIntro(leadIn);
}

/** Praise a failed run only if it beat the best from before that run. */
private runEarnedCheer(): boolean {
return this.game.runImprovedBest;
}

private async onWrongInput(): Promise<void> {
this.setCypherSeam(false);
this.firstRun = false;
this.roundBarsEarned = 0;
this.roundBonusEarned = 0;
this.roundCompletionEarned = 0;
this.recordBeatenThisAttempt = false;
this.barsFirstEarnedPending = false;
this.hideRoundBarsCard();
this.game.phase = 'resetting';
this.inputNeedsClear = true;
const cheer = this.runEarnedCheer();
await playErrorTone();
this.statusText = 'Try again';
this.renderPanel();
// Codex P2: a wrong press can cross a Pad presses threshold; announce the
// unlock on this path too, not only on the reward path.
this.showAchievementToasts();
this.playbackQueue = this.playbackQueue.then(async () => {
await this.speech.speakAsync(
cheer ? randomCheerClip() : randomWrongClip(),
);
await this.wait(WRONG_RESET_DELAY_S);
if (!this.experienceActive || this.flowPhase !== 'playing') {
return;
}
// The run is over: no automatic restart. A Game Over popup (a panel in
// MR) waits for New run.
this.storeOpen = false;
this.achievementsOpen = false;
this.gameOverOpen = true;
this.statusText = 'Game Over';
this.syncMenuPopupVisibility();
this.renderGameOverSummary();
this.renderPanel();
});
}

private renderGameOverSummary(): void {
const panel = this.world.getSceneObject<UIKitMLAsset>('wall-tones-panel');
panel
?.getElementById<UIKit.Text>('gameover-summary')
?.setProperties({
text: `You reached ${this.game.streak}. Best ${this.game.bestStreak}.`,
});
const need = saverUnitsForStreak(this.game.streak);
const have = this.economy.getSavers();
panel
?.getElementById<UIKit.Text>('gameover-saver-status')
?.setProperties({ text: `Streak savers: ${have}. Retry the same pattern costs ${need}.` });
panel
?.getElementById<UIKit.Text>('gameover-use-saver-label')
?.setProperties({
text: have >= need ? `Use ${need} saver${need > 1 ? 's' : ''} - retry same pattern` : `Need ${need} saver${need > 1 ? 's' : ''} to retry`,
color: have >= need ? 0x1c1d20 : 0x8a8f98,
});
const missing = Math.max(0, need - have);
const plan = saverRetryPlan(have, need, this.economy.getBars(), SAVER_PRICE_BARS);
panel
?.getElementById<UIKit.Text>('gameover-buy-saver-label')
?.setProperties({
text: `Buy ${missing} saver${missing > 1 ? 's' : ''} & retry - ${plan.costBars}`,
color: plan.affordable ? 0x1c1d20 : 0xd43a3a,
});
}

/** One-press purchase (owner request 2026-11-11, no confirm step): buys exactly the savers missing for an immediate retry and applies them in the same press. Cost model unchanged: missing units at 18 Bars each. */
private onGameOverBuySaver(): void {
if (!this.gameOverOpen) return;
const need = saverUnitsForStreak(this.game.streak);
const plan = saverRetryPlan(this.economy.getSavers(), need, this.economy.getBars(), SAVER_PRICE_BARS);
if (!plan.affordable) {
void playErrorTone();
this.renderGameOverSummary();
return;
}
// Abort on the first failed buy so a mid-loop refusal cannot leave a
// partial stock and still call useSavers with the full need.
for (let i = 0; i < plan.buy; i++) {
if (!this.economy.buySaver(SAVER_PRICE_BARS)) {
void playErrorTone();
this.showAchievementToasts();
this.renderGameOverSummary();
this.renderPanel();
return;
}
}
this.showAchievementToasts();
if (plan.apply) {
this.onGameOverUseSaver();
return;
}
this.renderGameOverSummary();
this.renderPanel();
}

/** Spend savers and replay the same pattern; the streak and pattern stay. */
private onGameOverUseSaver(): void {
if (!this.gameOverOpen || !this.experienceActive || this.flowPhase !== 'playing') return;
const need = saverUnitsForStreak(this.game.streak);
if (!this.economy.useSavers(need)) {
void playErrorTone();
return;
}
this.gameOverOpen = false;
this.syncMenuPopupVisibility();
this.game.inputStep = 0;
this.game.phase = 'playback';
this.idleReplayQueued = false;
this.renderPanel();
this.playbackQueue = this.playbackQueue.then(async () => {
if (!this.experienceActive || this.flowPhase !== 'playing') return;
await this.playSequence();
});
}

private onGameOverNewRun(): void {
if (!this.gameOverOpen || !this.experienceActive || this.flowPhase !== 'playing') {
return;
}
this.gameOverOpen = false;
this.syncMenuPopupVisibility();
this.game.onWrongInput();
this.renderPanel();
this.playbackQueue = this.playbackQueue.then(async () => {
if (!this.experienceActive || this.flowPhase !== 'playing') {
return;
}
// Same Simon fanfare as a fresh start, pause, then the first note again.
await this.playSimonStartupFanfare();
if (!this.experienceActive || this.flowPhase !== 'playing') {
return;
}
await this.playSequence();
});
}

private useDesktopPath(): boolean {
return this.world.visibilityState.peek() === VisibilityState.NonImmersive;
}

private useDesktopInput(): boolean {
return this.useDesktopPath();
}

private setSetupUiVisible(visible: boolean): void {
const panel = this.world.getSceneObject<UIKitMLAsset>('wall-tones-panel');
panel
?.getElementById('setup-mode-row')
?.setProperties({ display: visible ? 'flex' : 'none' });
}

private setAirOrientUiVisible(visible: boolean): void {
this.world
.getSceneObject<UIKitMLAsset>('wall-tones-panel')
?.getElementById('air-orient-row')
?.setProperties({ display: visible ? 'flex' : 'none' });
}

private setRepeatUiVisible(visible: boolean): void {
this.world
.getSceneObject<UIKitMLAsset>('wall-tones-panel')
?.getElementById('repeat-pattern-button')
?.setProperties({ display: visible ? 'flex' : 'none' });
}

private setRescanUiVisible(visible: boolean): void {
this.world
.getSceneObject<UIKitMLAsset>('wall-tones-panel')
?.getElementById('rescan-room-button')
?.setProperties({ display: visible ? 'flex' : 'none' });
}

private setWallPickHintVisible(visible: boolean): void {
this.world
.getSceneObject<UIKitMLAsset>('wall-tones-panel')
?.getElementById('wall-pick-hint')
?.setProperties({ display: visible ? 'flex' : 'none' });
}

private async onRescanRoom(): Promise<void> {
if (!this.experienceActive) {
return;
}
if (this.flowPhase === 'choose-mode') {
// Rescan before play-mode selection: run the same capture + look-around
// path used mid-setup so empty plane queries can recover (#58).
this.speech.speak('rescanRoom');
this.statusText = 'Rescanning room...';
this.renderPanel();
this.roomCaptureInFlight = false;
this.roomCaptureAttempted = false;
this.lackingSpatialData = false;
const session = this.xrManager.getSession() as XRSession & {
initiateRoomCapture?: () => Promise<undefined>;
};
if (typeof session?.initiateRoomCapture === 'function') {
this.roomCaptureInFlight = true;
this.roomCaptureAttempted = true;
try {
await session.initiateRoomCapture();
} catch (error) {
console.warn('[wall-tones] rescan room capture failed', error);
} finally {
this.roomCaptureInFlight = false;
}
}
this.setSpatialMeshesVisible(true);
this.scanStartedAt = performance.now() / 1000;
this.setRescanUiVisible(true);
this.speech.speak('lookAround');
this.renderPanel();
return;
}
if (
this.flowPhase !== 'air-placement' &&
this.flowPhase !== 'playing' &&
this.flowPhase !== 'wall-picking'
) {
return;
}
this.speech.speak('rescanRoom');
this.statusText = 'Rescanning room...';
this.renderPanel();
this.clearRoomSetupVisuals();
this.clearPads();
this.ghostPad = null;
this.airPlaceStep = 0;
this.game.phase = 'idle';
this.playbackQueue = Promise.resolve();
this.roomCaptureInFlight = false;
this.roomCaptureAttempted = false;
this.setAirOrientUiVisible(false);
this.setRepeatUiVisible(false);

const session = this.xrManager.getSession() as XRSession & {
initiateRoomCapture?: () => Promise<undefined>;
};
if (typeof session?.initiateRoomCapture === 'function') {
this.roomCaptureInFlight = true;
this.roomCaptureAttempted = true;
try {
await session.initiateRoomCapture();
} catch (error) {
console.warn('[wall-tones] rescan room capture failed', error);
} finally {
this.roomCaptureInFlight = false;
}
}
this.setSpatialMeshesVisible(true);
this.flowPhase = 'scanning';
this.scanStartedAt = performance.now() / 1000;
this.lackingSpatialData = false;
this.setRescanUiVisible(false);
this.speech.speak('lookAround');
this.renderPanel();
}

private async onRepeatPattern(): Promise<void> {
if (!this.experienceActive || this.flowPhase !== 'playing') {
return;
}
if (this.game.sequence.length === 0) {
return;
}
if (this.game.phase === 'playback' || this.game.phase === 'resetting') {
return;
}
// Replay is a consumable (owner-approved 2026-11-11): the Repeat button
// spends one; free Replays are earned past the Hint coverage and paid ones
// come from the Store.
if (!this.economy.useReplay()) {
this.statusText =
'No Replay left. Earn one 5 notes past your Hint coverage, or buy one in the Store.';
this.renderPanel();
void playErrorTone();
return;
}
this.lastInputAt = performance.now() / 1000;
this.idleReplayQueued = false;
this.speech.speak('repeatPattern');
this.game.inputStep = 0;
this.game.phase = 'playback';
this.inputNeedsClear = true;
this.statusText = 'Repeating pattern...';
this.renderPanel();
this.playbackQueue = this.playbackQueue.then(async () => {
if (!this.experienceActive || this.flowPhase !== 'playing') {
return;
}
await this.playSequence();
});
}

private tickIdleReplay(): void {
if (
!this.experienceActive ||
this.flowPhase !== 'playing' ||
this.game.phase !== 'input' ||
this.game.sequence.length === 0 ||
this.idleReplayQueued
) {
return;
}
const now = performance.now() / 1000;
if (this.lastInputAt <= 0) {
this.lastInputAt = now;
return;
}
if (now - this.lastInputAt < IDLE_REPLAY_S) {
return;
}
if (this.idleReplayUsedRunId === this.game.runId) {
// The run's one automatic replay is spent: only a caption-only nudge,
// no audio and no replay.
this.lastInputAt = now;
this.idleNudgeUntil = performance.now() + 6000;
this.renderPanel();
window.setTimeout(() => this.renderPanel(), 6100);
return;
}
this.idleReplayUsedRunId = this.game.runId;
this.idleReplayQueued = true;
this.lastInputAt = now;
this.game.inputStep = 0;
this.game.phase = 'playback';
this.inputNeedsClear = true;
this.statusText = 'Still there? Replaying...';
this.renderPanel();
this.playbackQueue = this.playbackQueue.then(async () => {
await this.speech.speakAsync('idleReplay');
await this.wait(0.4);
if (!this.experienceActive || this.flowPhase !== 'playing') {
return;
}
await this.playSequence();
});
}

/** Backlog 30 research: one headset sample per frame into the movement
 * tracker, plus the change-keyed menu line refresh (per-frame text writes
 * would re-layout the panel every frame). */
private tickMovementTracking(): void {
const immersive = !this.isFlatView();
this.player.head.getWorldPosition(this.viewer);
this.movement.noteHeadPosition(this.viewer.x, this.viewer.y, this.viewer.z, immersive, performance.now() / 1000);
const headDm = Math.round(this.movement.getSessionHeadMeters() * 10);
const padDm = Math.round(this.movement.getSessionPadMeters() * 10);
// Owner scoping (Nov 11): the movement line is MR-only and follows the
// score rows' visibility (hidden during placement setup).
const rowVisible = immersive && this.experienceActive && this.lastScoreInfoVisible;
if (
headDm !== this.movementRowHeadDm ||
padDm !== this.movementRowPadDm ||
rowVisible !== this.lastMovementRowVisible
) {
this.movementRowHeadDm = headDm;
this.movementRowPadDm = padDm;
this.lastMovementRowVisible = rowVisible;
const panel = this.world.getSceneObject<UIKitMLAsset>('wall-tones-panel');
panel?.getElementById('wall-tones-movement-row')?.setProperties({
display: rowVisible ? 'flex' : 'none',
});
if (rowVisible) {
panel?.getElementById<UIKit.Text>('wall-tones-movement-head')?.setProperties({
text: formatMetersNumber(headDm / 10),
});
panel?.getElementById<UIKit.Text>('wall-tones-movement-pad')?.setProperties({
text: formatMetersNumber(padDm / 10),
});
}
}
// Movement thresholds can be crossed by walking between presses, so the
// economy re-checks achievements on each new whole meter.
const wholeMeters = Math.floor(this.movement.getLifetimeHeadMeters() + this.movement.getLifetimePadMeters());
if (wholeMeters !== this.movementAchvWholeMeters) {
this.movementAchvWholeMeters = wholeMeters;
this.economy.noteExternalProgress(this.game.streak);
this.showAchievementToasts();
}
}

private renderPanel(): void {
const panel = this.world.getSceneObject<UIKitMLAsset>('wall-tones-panel');
if (panel == null) {
return;
}
if (!this.barsIconSrcFixed) {
this.barsIconSrcFixed = true;
panel
.getElementById<UIKit.Image>('bars-icon-img')
?.setProperties({ src: `${import.meta.env.BASE_URL}ui/bars-icon.png` });
}
panel
.getElementById<UIKit.Text>('wall-tones-best-streak')
?.setProperties({ text: String(this.game.bestStreak) });
this.renderSequenceIcons(panel);
// Owner ask 2026-11-12 11:40: the Listen/Hint titles stay hidden until the
// matching store item is owned; a non-breaking space reserves the line so
// the panel never shrinks.
panel
.getElementById<UIKit.Text>('wall-tones-status')
?.setProperties({
text: this.game.phase === 'input'
? (performance.now() < this.idleNudgeUntil
? 'Still there?'
: this.economy.getHintRevealCount() > 0
? 'Hint:'
: '\u00a0')
: this.statusText === 'Listen:' && !this.economy.ownsListen()
? '\u00a0'
: this.statusText || 'Ready',
});
panel
.getElementById<UIKit.Text>('wall-tones-current-streak')
?.setProperties({ text: String(this.game.streak) });
this.renderEconomy(panel);
}

/** Store, Bars balance and achievements on the panel (backlog 12/12a/19).
 * Reconciled on a change key: tickScan calls renderPanel every frame, so the
 * labels must not rebuild while nothing economy-related changed (codex P2). */
// Primitive fields compared directly: building a key string would allocate on
// every XR scan frame (codex P2 on AGENTS.md L222).
private economyRenderBars = -1;
private economyRenderLevel = -1;
private economyRenderStoreOpen = false;
private economyRenderPresses = -1;
private economyRenderSecretOwned = false;
private economyRenderListenOwned = false;
private economyRenderAutoplayLevel = -1;
private economyRenderReplaysTotal = -1;
private economyRenderDemoBoost = -1;
private economyRenderStoreSelected: string | null = null;
private renderEconomy(panel: UIKitMLAsset): void {
const bars = this.economy.getBars();
const level = this.economy.getHintLevel();
const open = this.storeOpen;
// Codex P2: include the lifetime press counter so a wrong-input press that
// crosses a Pad presses threshold still refreshes an open achievements
// popup (bars, hint level and store state are unchanged on that path).
const presses = this.economy.getPresses();
const secretOwned = this.economy.ownsTopSecret();
const listenOwned = this.economy.ownsListen();
const autoplayLevel = this.economy.getAutoplayLevel();
const replaysTotal = this.economy.getReplaysTotal();
const demoBoost = this.economy.getDemoBoost();
const storeSelected = this.storeSelected;
if (bars === this.economyRenderBars && level === this.economyRenderLevel &&
open === this.economyRenderStoreOpen && presses === this.economyRenderPresses &&
secretOwned === this.economyRenderSecretOwned &&
listenOwned === this.economyRenderListenOwned &&
autoplayLevel === this.economyRenderAutoplayLevel &&
replaysTotal === this.economyRenderReplaysTotal &&
demoBoost === this.economyRenderDemoBoost &&
storeSelected === this.economyRenderStoreSelected) return;
this.economyRenderBars = bars;
this.economyRenderLevel = level;
this.economyRenderStoreOpen = open;
this.economyRenderPresses = presses;
this.economyRenderSecretOwned = secretOwned;
this.economyRenderListenOwned = listenOwned;
this.economyRenderAutoplayLevel = autoplayLevel;
this.economyRenderReplaysTotal = replaysTotal;
this.economyRenderDemoBoost = demoBoost;
this.economyRenderStoreSelected = storeSelected;
panel
.getElementById<UIKit.Text>('wall-tones-bars')
?.setProperties({ text: String(this.economy.getBars()) });
panel
.getElementById<UIKit.Text>('wall-tones-total-score')
?.setProperties({ text: String(this.economy.getBarsTotal()) });
panel
.getElementById<UIKit.Text>('store-button-label')
?.setProperties({ text: this.storeOpen ? 'Close store' : 'Store' });
panel
.getElementById<UIKit.Container>('store-popup')
?.setProperties({ display: this.storeOpen ? 'flex' : 'none' });
panel
.getElementById<UIKit.Text>('store-heading')
?.setProperties({
text: this.economy.getDemoBoost() > 0 ? 'Store (TEST Bars)' : 'Store',
});
panel
.getElementById<UIKit.Text>('repeat-pattern-label')
?.setProperties({
text: `Repeat pattern (${this.economy.getReplaysTotal()})`,
});
this.reconcileStore(panel);
this.reconcileAchievements(panel);
}

/** Detail card currently shown on the store popup chrome (removed on rebuild). */
private storeDetailCard: UIKit.Container | null = null;

/** Store skill tree (item 44): one square line-glyph tile per category,
 * level/count badges, and reach-level-X gates on the chain connections.
 * Rebuilt on the economy change key only (same codex P2 rule as the
 * achievements grid). */
private reconcileStore(panel: UIKitMLAsset): void {
const list = panel.getElementById<UIKit.Container>('store-tree-list');
if (list == null) return;
while (list.children.length > 0) {
list.remove(list.children[0]!);
}
// The detail card lives on the fixed popup chrome (store-popup-card), not
// in the scroll list, so scrolling the tree can never move or hide it.
const cardHost = panel.getElementById<UIKit.Container>('store-popup-card');
if (this.storeDetailCard != null) {
cardHost?.remove(this.storeDetailCard);
this.storeDetailCard = null;
}
const eco = this.economy;
interface StoreTile {
id: string;
name: string;
badge: string;
state: StoreTileState;
price: string;
/** True when the price line leads with the Bars icon (owner ask 2026-11-12). */
icon: boolean;
}
const hintLevel = eco.getHintLevel();
const autoplayLevel = eco.getAutoplayLevel();
const replaysTotal = eco.getReplaysTotal();
const savers = eco.getSavers();
const bars = eco.getBars();
// Unpurchased items render in the greyed "off" language (owner ask
// 2026-11-12: like the achievements, an item you do not own yet must look
// different); owned/leveled items are colored. The price line under the
// name repeats the next buy's cost (owner ask 2026-11-12).
const tiles: StoreTile[] = [
{
id: 'listen',
name: 'Listen',
badge: eco.ownsListen() ? '\u2713' : '',
state: eco.ownsListen() ? 'on' : 'off',
price: eco.ownsListen() ? 'Owned' : `${LISTEN_COST}`,
icon: !eco.ownsListen(),
},
{
id: 'hint',
name: 'Hint',
badge: hintLevel > 0 ? String(hintLevel) : '',
state: hintLevel > 0 ? 'on' : 'off',
price: eco.hintUnlocked()
? `L${hintLevel + 1} - ${eco.hintCost(hintLevel + 1)}`
: 'Locked',
icon: eco.hintUnlocked(),
},
{
id: 'autoplay',
name: 'Autoplay',
badge: autoplayLevel > 0 ? String(autoplayLevel) : '',
state: autoplayLevel > 0 ? 'on' : 'off',
price: eco.autoplayUnlocked()
? `L${autoplayLevel + 1} - ${eco.autoplayCost(autoplayLevel + 1)}`
: 'Locked',
icon: eco.autoplayUnlocked(),
},
{
id: 'replay',
name: 'Replay',
badge: replaysTotal > 0 ? String(replaysTotal) : '',
state: replaysTotal > 0 ? 'on' : 'off',
price: `${REPLAY_PRICE_BARS}`,
icon: true,
},
// Streak saver: no unlock prerequisites (owner rule 2026-11-11), stock is
// the shared PR #63 inventory the Game Over popup spends from.
{
id: 'saver',
name: 'Saver',
badge: savers > 0 ? String(savers) : '',
state: savers > 0 ? 'on' : 'off',
price: `${SAVER_PRICE_BARS}`,
icon: true,
},
{
id: 'secret',
name: 'Secret',
badge: eco.ownsTopSecret() ? '\u2713' : '?',
state: eco.ownsTopSecret() ? 'on' : 'off',
price: eco.ownsTopSecret() ? 'Owned' : `${TOP_SECRET_COST}`,
icon: !eco.ownsTopSecret(),
},
// Room for the modifiers the owner listed (2026-11-11): 5th/6th pads, the
// story hack, double-score multiplier and the speed modifier. Their
// phrasing is just "Locked" (owner ask 2026-11-12).
{ id: 'multiplier', name: 'x2', badge: '?', state: 'off', price: 'Locked', icon: false },
{ id: 'speed', name: 'Speed', badge: '?', state: 'off', price: 'Locked', icon: false },
{ id: 'pads56', name: 'Pads 5-6', badge: '?', state: 'off', price: 'Locked', icon: false },
{ id: 'narrator', name: 'Hack', badge: '?', state: 'off', price: 'Locked', icon: false },
];
// Skill-tree layout (owner-approved concept 2026-11-11; the lost mockup's
// caption: "each category has its own levels, with level gates on the
// connections"). Owner layout 2026-11-12: Replay + Saver on top, Listen on
// its own row, then the gated chain Hint -> Autoplay as labeled centered
// connections (single-dependency rows sit in the middle), Secret on its
// own centered bottom row below the future placeholders.
const TREE_W = 308;
const TILE_S = 70;
// Tile + name + price lines.
const TILE_H = TILE_S + 34;
const LINE_COLOR = 0x9aa4b6;
const LINE_OK = 0x4cc38a;
const byId = new Map(tiles.map((t) => [t.id, t]));
const makeTile = (t: StoreTile): UIKit.Container => {
const selected = this.storeSelected === t.id;
const tile = new UIKit.Container({
flexDirection: 'column',
alignItems: 'center',
gap: 2,
width: TILE_S,
height: TILE_H,
flexShrink: 0,
});
tile.add(
new UIKit.Image({
src: storeTileSrc(t.id, selected && t.state === 'on' ? 'sel' : t.state, t.badge),
width: TILE_S,
height: TILE_S,
}),
);
tile.add(
new UIKit.Text({
fontSize: 13,
color: t.state === 'off' ? 0x9aa4b6 : 0xffffff,
text: t.name,
}),
);
// Price line (owner ask 2026-11-12): the Bars icon in front of the number
// instead of the word "Bars"; plain text only for Owned/Locked.
if (t.icon) {
const priceRow = new UIKit.Container({
flexDirection: 'row',
alignItems: 'center',
justifyContent: 'center',
gap: 3,
width: TILE_S,
});
priceRow.add(
new UIKit.Image({
src: `${import.meta.env.BASE_URL}ui/bars-icon.png`,
width: 12,
height: 12,
}),
);
priceRow.add(new UIKit.Text({ fontSize: 11, color: 0x9aa4b6, text: t.price }));
tile.add(priceRow);
} else {
tile.add(
new UIKit.Text({
fontSize: 11,
color: 0x9aa4b6,
width: TILE_S,
textAlign: 'center',
text: t.price,
}),
);
}
tile.name = `store-tile-${t.id}`;
tile.addEventListener('click', (event) => {
event.stopPropagation();
this.selectStoreTile(t.id);
});
return tile;
};
// Connection column (owner-approved mockup variant A, 2026-11-12): spine,
// a gate chip naming the requirement (padlock + progress badge while locked,
// check once open), then a short spine and arrow into the gated tile.
const connection = (label: string, open: boolean, frac: string | null): UIKit.Container => {
const col = new UIKit.Container({
flexDirection: 'column',
alignItems: 'center',
width: TREE_W,
});
col.add(
new UIKit.Container({
width: 3,
height: 10,
backgroundColor: open ? LINE_OK : LINE_COLOR,
}),
);
const chip = new UIKit.Container({
flexDirection: 'row',
alignItems: 'center',
gap: 6,
backgroundColor: open ? 0x1e3a2c : 0x3a4150,
borderWidth: 1,
borderColor: open ? LINE_OK : 0x6b7a90,
borderRadius: 12,
padding: 5,
});
chip.add(
new UIKit.Image({
src: storeChipGlyphSrc(open ? 'check' : 'lock', open ? '#4cc38a' : '#9aa4b6'),
width: open ? 12 : 11,
height: open ? 12 : 13,
}),
);
chip.add(
new UIKit.Text({
fontSize: 12,
color: open ? LINE_OK : 0xc6cedb,
text: label,
}),
);
if (frac != null) {
const badge = new UIKit.Container({
backgroundColor: 0x24262b,
borderRadius: 8,
padding: 2,
});
badge.add(new UIKit.Text({ fontSize: 11, color: 0x9aa4b6, text: frac }));
chip.add(badge);
}
col.add(chip);
col.add(
new UIKit.Container({
width: 3,
height: 6,
backgroundColor: open ? LINE_OK : LINE_COLOR,
}),
);
col.add(
new UIKit.Image({
src: storeChipGlyphSrc('arrow', open ? '#4cc38a' : '#9aa4b6'),
width: 10,
height: 6,
}),
);
return col;
};
// Level track: one filled pip per owned level (category colour), then the
// next level outlined (the one the Buy button sells). Uncapped by design;
// the display caps at 9 pips plus a "+N" counter.
const levelTrack = (level: number, color: number): UIKit.Container => {
const track = new UIKit.Container({
flexDirection: 'row',
alignItems: 'center',
justifyContent: 'center',
gap: 4,
width: 240,
});
const shown = Math.min(level, 9);
for (let i = 0; i < shown; i += 1) {
track.add(
new UIKit.Container({
width: 12,
height: 12,
borderRadius: 3,
backgroundColor: color,
}),
);
}
if (level > 9) {
track.add(new UIKit.Text({ fontSize: 12, color, text: `+${level - 9}` }));
}
track.add(
new UIKit.Container({
width: 12,
height: 12,
borderRadius: 3,
borderWidth: 2,
borderColor: color,
}),
);
return track;
};
// Tile above, level track below, both centered (owner ask 2026-11-12:
// rows holding a single gated button sit in the middle). Row+wrap like
// the list itself (tile images mis-size inside plain columns).
const chainRow = (t: StoreTile, level: number, color: number): UIKit.Container => {
const col = new UIKit.Container({
flexDirection: 'row',
flexWrap: 'wrap',
justifyContent: 'center',
gap: 4,
width: TREE_W,
});
col.add(makeTile(t));
col.add(levelTrack(level, color));
return col;
};
const soloRow = (t: StoreTile): UIKit.Container => {
const row = new UIKit.Container({
flexDirection: 'row',
justifyContent: 'center',
width: TREE_W,
});
row.add(makeTile(t));
return row;
};
// Detail-card copy is computed before the rows. The card is a persistent
// overlay pinned to the bottom of the tree viewport on the fixed popup
// chrome (owner ask 2026-11-12: "the pop up stayed", same details pattern
// as the achievements), so it never scrolls away while the tree scrolls
// behind it. The selected row always scrolls fully into the clear band
// above the card (review 2026-11-12: tile + name + price + pips fully
// visible, the card never covers the selected row). The Buy row inside
// carries the Bars icon and greys out while unaffordable.
const sel = this.storeSelected;
let titleText = '';
let bodyText = '';
let buyText: string | null = null;
let cost: number | null = null;
if (sel != null) {
switch (sel) {
case 'listen':
titleText = 'Listen';
if (eco.ownsListen()) {
bodyText = 'Owned. The pattern boxes show during Listen playback.';
} else {
bodyText =
'Shows the pattern boxes one by one during Listen playback. Without it the row stays hidden. Adds no Your Turn hints.';
buyText = `Listen - ${LISTEN_COST}`;
cost = LISTEN_COST;
}
break;
case 'hint':
titleText = `Hint - Level ${hintLevel}`;
bodyText = !eco.hintUnlocked()
? 'Locked: buy Listen first.'
: hintLevel === 0
? 'Shows the first 5 colors of the pattern during Your Turn. Each level adds 5.'
: `First ${eco.getHintRevealCount()} colors shown during Your Turn. Next level adds 5.`;
if (eco.hintUnlocked()) {
cost = eco.hintCost(hintLevel + 1);
buyText = `Hint L${hintLevel + 1} - ${cost}`;
}
break;
case 'autoplay':
titleText = `Autoplay - Level ${autoplayLevel}`;
bodyText = !eco.ownsListen()
? 'Locked: buy Listen first.'
: !eco.autoplayUnlocked()
? `Locked: reach Hint level ${AUTOPLAY_UNLOCK_HINT_LEVEL} (now level ${hintLevel}).`
: autoplayLevel === 0
? 'Plays the first 5 notes of each pattern for you. Each level adds 5.'
: `Plays the first ${eco.getAutoplayNoteCount()} notes of each pattern for you. Next level adds 5.`;
if (eco.autoplayUnlocked()) {
cost = eco.autoplayCost(autoplayLevel + 1);
buyText = `Autoplay L${autoplayLevel + 1} - ${cost}`;
}
break;
case 'replay':
titleText = 'Replay';
bodyText =
`Re-hear the pattern (the Repeat button spends one). Held: ${eco.getReplaysFree()} free + ${eco.getReplaysPaid()} paid. ` +
`Earn a free one per 5 notes past Hint coverage (cap ${REPLAY_FREE_CAP}).`;
buyText = `Replay - ${REPLAY_PRICE_BARS}`;
cost = REPLAY_PRICE_BARS;
break;
case 'saver':
titleText = 'Streak saver';
bodyText =
'Retry the pattern when you miss (Game Over popup). Costs 1 saver per 10-streak stretch, doubling after. Held: ' + eco.getSavers() + '.';
buyText = 'Saver - ' + SAVER_PRICE_BARS;
cost = SAVER_PRICE_BARS;
break;
case 'secret':
titleText = 'Top Secret';
if (eco.ownsTopSecret()) {
bodyText = 'Secret Revealed.';
} else {
bodyText = 'A secret. It stays secret.';
buyText = `Top Secret - ${TOP_SECRET_COST}`;
cost = TOP_SECRET_COST;
}
break;
default:
titleText =
sel === 'multiplier' ? 'Multiplier x2'
: sel === 'speed' ? 'Speed'
: sel === 'pads56' ? 'Pads 5-6'
: 'Hack';
bodyText = 'Locked.';
break;
}
}
// Height follows the body length so the card leaves the clear band: title
// (~20) + gaps + padding (44), one 18px line per ~30 body chars, plus the
// Buy row when present.
const bodyLines = Math.max(1, Math.ceil(bodyText.length / 30));
const POPUP_W = 248;
const POPUP_H = 44 + 18 * bodyLines + (buyText != null ? 40 : 0);
// Must match the store-tree-list viewport height in the uikitml.
const VIEW_H = 296;
const ROW_TILE_H = TILE_H;
// spine 10 + chip ~24 + short spine 6 + arrow 6.
const ROW_CONN_H = 46;
const ROW_CHAIN_H = TILE_H + 4 + 16;
const ROW_GAP = 8;
// Top row: the no-prerequisite consumables (owner layout 2026-11-12).
const topRow = new UIKit.Container({
flexDirection: 'row',
justifyContent: 'center',
gap: 8,
width: TREE_W,
});
for (const id of ['replay', 'saver']) {
topRow.add(makeTile(byId.get(id)!));
}
// Bottom row: the future placeholders, phrased just "Locked" (owner ask
// 2026-11-12). Secret sits on its own centered row below them.
const bottomRow = new UIKit.Container({
flexDirection: 'row',
flexWrap: 'wrap',
gap: 8,
width: TREE_W,
});
for (const id of ['multiplier', 'speed', 'pads56', 'narrator']) {
bottomRow.add(makeTile(byId.get(id)!));
}
// Rows in display order; the detail card overlays the viewport bottom
// and is added after them.
const rows: { ids: string[]; node: UIKit.Container | UIKit.Text; h: number }[] = [
{ ids: ['replay', 'saver'], node: topRow, h: ROW_TILE_H },
{ ids: ['listen'], node: soloRow(byId.get('listen')!), h: ROW_TILE_H },
{ ids: [], node: connection('unlocks Hint L1', eco.hintUnlocked(), null), h: ROW_CONN_H },
{ ids: ['hint'], node: chainRow(byId.get('hint')!, hintLevel, 0xf2c14e), h: ROW_CHAIN_H },
{
ids: [],
// Listen ownership is part of autoplayUnlocked(); without it a legacy
// Hint L4 save would otherwise show "4/4" on a still-locked gate.
node: !eco.ownsListen()
? connection('Buy Listen first', false, null)
: connection(
eco.autoplayUnlocked() ? 'Autoplay unlocked' : `Reach Hint Lv ${AUTOPLAY_UNLOCK_HINT_LEVEL}`,
eco.autoplayUnlocked(),
eco.autoplayUnlocked()
? null
: `${Math.min(hintLevel, AUTOPLAY_UNLOCK_HINT_LEVEL)}/${AUTOPLAY_UNLOCK_HINT_LEVEL}`,
),
h: ROW_CONN_H,
},
{ ids: ['autoplay'], node: chainRow(byId.get('autoplay')!, autoplayLevel, 0x4cc38a), h: ROW_CHAIN_H },
// No standalone 'Locked' caption between Autoplay and the modifiers row:
// each future tile already says 'Locked' under its name, and a floating
// label here reads as Autoplay's own state even after purchase.
{ ids: ['multiplier', 'speed', 'pads56', 'narrator'], node: bottomRow, h: ROW_TILE_H },
{ ids: ['secret'], node: soloRow(byId.get('secret')!), h: ROW_TILE_H },
];
// The detail card itself. popup-card geometry (uikitml px): 12 padding +
// 26 heading + 6 gap put the list top at 44; the viewport bottom is
// 44 + VIEW_H. The card pins 4px above it; horizontally it centers on
// the list (12 padding + half the list/card width difference).
let popupLine: UIKit.Container | null = null;
if (sel != null) {
const card = new UIKit.Container({
positionType: 'absolute',
positionLeft: 12 + Math.max(0, Math.floor((TREE_W - POPUP_W) / 2)),
positionTop: 44 + VIEW_H - POPUP_H - 4,
zIndex: 20,
width: POPUP_W,
height: POPUP_H,
flexDirection: 'column',
gap: 4,
padding: 8,
borderRadius: 12,
borderWidth: 1,
borderColor: 0x6b7a90,
backgroundColor: 0x222c3a,
});
card.add(new UIKit.Text({ fontSize: 15, color: 0xfafaf7, text: titleText }));
card.add(new UIKit.Text({ fontSize: 13, color: 0xaab6c6, text: bodyText }));
if (buyText != null) {
const affordable = cost != null && bars >= cost;
const buyRow = new UIKit.Container({
flexDirection: 'row',
alignItems: 'center',
justifyContent: 'center',
gap: 6,
padding: 8,
borderRadius: 10,
backgroundColor: affordable ? 0xf5d90a : 0x3a4150,
});
buyRow.add(
new UIKit.Image({
src: `${import.meta.env.BASE_URL}ui/bars-icon.png`,
width: 16,
height: 16,
}),
);
buyRow.add(
new UIKit.Text({
fontSize: 14,
color: affordable ? 0x1c1d20 : 0x9aa4b6,
text: buyText,
}),
);
buyRow.name = 'store-buy';
buyRow.addEventListener('click', (event) => {
event.stopPropagation();
this.onBuySelected();
});
card.add(buyRow);
}
// Details and Buy are not empty space. Keep the selection when used.
card.addEventListener('click', (event) => event.stopPropagation());
popupLine = card;
}
let selTop = 0;
let cursorY = 0;
for (const row of rows) {
const hit = sel != null && row.ids.includes(sel);
if (hit) selTop = cursorY;
list.add(row.node);
cursorY += row.h + ROW_GAP;
}
list.setProperties({ overflow: 'scroll' });
if (popupLine != null && cardHost != null) {
cardHost.add(popupLine);
this.storeDetailCard = popupLine;
// Bottom spacer sized to the pinned card: the scroll clamp
// cursorY - ROW_GAP - VIEW_H then still lets the LAST rows (bottom row,
// secret) rise fully into the clear band above the card instead of
// stopping with the selected row hidden behind it.
const spacer = new UIKit.Container({ width: TREE_W, height: POPUP_H + 8 });
list.add(spacer);
cursorY += POPUP_H + 8 + ROW_GAP;
}
if (sel != null) {
// Scroll so the selected row (tile + name + price + pips) sits fully in
// the clear band above the pinned card with an 8px top margin. The card
// is sized so the band always holds the row, so the row never slides out
// of view and the rows above scroll fully out of the way (clamped at the
// content end so the last row cannot overscroll).
const maxScroll = Math.max(0, cursorY - ROW_GAP - VIEW_H);
const scrollTarget = Math.max(0, Math.min(selTop - 8, maxScroll));
list.scrollPosition.value = [0, scrollTarget];
} else {
list.scrollPosition.value = [0, 0];
}
}

/** Last values pushed to the pattern row, exposed for e2e assertions. */
private lastSequenceRowVisible = false;
private lastSequenceBoxesShown = 0;
private lastSequenceUnknownShown = 0;
/** Last text shown on the round-results card ('' while hidden). */
public lastRoundCardText = '';
/** Last display state pushed to the info row (status + hint boxes). */
public lastInfoRowVisible = false;
/** Last display state pushed to the scoring rows (streak, Bars, total score, this-round card). */
public lastScoreInfoVisible = true;
/** Change keys for the achievements list; counters move progress text even
 * between unlocks, so the key spans every displayed value (no allocation). */
private achievementKeyCount = -1;
private achievementKeyBarsTotal = -1;
private achievementKeyBestStreak = -1;
private achievementKeyPurchases = -1;
private achievementKeyPresses = -1;
/** Bars icon src resolved against the app base once (codex P3: nested previews). */
private barsIconSrcFixed = false;
private reconcileAchievements(panel: UIKitMLAsset): void {
const list = panel.getElementById<UIKit.Container>('achievements-screen-list');
if (list == null) return;
const eco = this.economy;
if (
eco.getUnlockedCount() === this.achievementKeyCount &&
eco.getBarsTotal() === this.achievementKeyBarsTotal &&
eco.getBestStreak() === this.achievementKeyBestStreak &&
eco.getPurchases() === this.achievementKeyPurchases &&
eco.getPresses() === this.achievementKeyPresses
) {
return;
}
this.achievementKeyCount = eco.getUnlockedCount();
this.achievementKeyBarsTotal = eco.getBarsTotal();
this.achievementKeyBestStreak = eco.getBestStreak();
this.achievementKeyPurchases = eco.getPurchases();
this.achievementKeyPresses = eco.getPresses();
while (list.children.length > 0) {
list.remove(list.children[0]!);
}
const TILE = 92;
const TILE_H = TILE + 18;
const SHORT_NAMES: Record<string, string> = {
streak: 'Streak',
bars: 'Bars',
score: 'Score',
store: 'Store',
presses: 'Presses',
movement: 'Movement',
secret: 'Secret',
};
// Details are a floating overlay on top of the grid, so the window keeps one
// fixed height whether or not details are showing. It follows the pointer
// (PC mouse, MR ray) and pins on a tap (iPhone).
const GRID_W = 308;
const COLS = 3;
const ROW_H = TILE_H + 8;
const POPUP_W = 190;
const POPUP_H = 124;
const VIEW_H = 232;
const gridLeft = Math.floor((GRID_W - (COLS * TILE + (COLS - 1) * 8)) / 2);
const popup = new UIKit.Container({
display: 'none',
positionType: 'absolute',
positionLeft: 0,
positionTop: 0,
zIndex: 20,
pointerEvents: 'none',
width: POPUP_W,
height: POPUP_H,
flexDirection: 'column',
gap: 4,
padding: 10,
borderRadius: 12,
borderWidth: 1,
borderColor: 0x6b7a90,
backgroundColor: 0x222c3a,
});
const popupTitle = new UIKit.Text({ fontSize: 15, color: 0xfafaf7, text: '' });
const popupBody = new UIKit.Text({ fontSize: 13, color: 0xaab6c6, text: '' });
popup.add(popupTitle);
popup.add(popupBody);
let activeCat: string | null = null;
// Only a click makes a tile "sticky". pointerenter (which touch fires just
// before the click) must not count, otherwise tapping a second tile looks
// like a second tap on the open one and closes it.
let stickyCat: string | null = null;
const place = (col: number, row: number, uvx: number, uvy: number): void => {
// Pointer position in scroll-content space: tile origin + tile-local uv.
// Never mixes in screen or button sizes.
const px = gridLeft + col * (TILE + 8) + uvx * TILE;
const py = row * ROW_H + (1 - uvy) * TILE_H;
const sy = list.scrollPosition?.value?.[1] ?? 0;
// One rule, no flipping: the card sits just right/below the pointer and is
// clamped into the visible area, so it slides smoothly and never jumps.
popup.setProperties({
positionLeft: Math.max(0, Math.min(GRID_W - POPUP_W, px + 14)),
positionTop: Math.max(sy + 2, Math.min(sy + VIEW_H - POPUP_H - 2, py + 14)),
});
};
const tileSetters = new Map<string, (on: boolean) => void>();
const hide = (): void => {
if (stickyCat != null) tileSetters.get(stickyCat)?.(false);
activeCat = null;
stickyCat = null;
popup.setProperties({ display: 'none' });
};
// Preview-only sample view (?demoAchievements=1, or =many for extra sample
// tiles to test scrolling). It changes only what this screen draws: no
// progress, no stored data and no achievement rules are touched.
const demoParam = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('demoAchievements');
const demoLevels: Record<string, number> = { streak: 3, bars: 4, score: 1, presses: 2 };
type TileCat = { id: string; label: string; description: string; levels: readonly number[]; hidden?: boolean; glyph?: string };
const showMovement = movementUiVisible({
immersive: this.world.visibilityState.peek() !== VisibilityState.NonImmersive,
userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
});
const tileCats: TileCat[] = showMovement
? [...ACHIEVEMENT_CATEGORIES]
: ACHIEVEMENT_CATEGORIES.filter((c) => c.id !== 'movement');
if (demoParam === 'many') {
const glyphs = ['streak', 'bars', 'store', 'presses', 'score', 'secret'];
for (let i = 0; i < 6; i++) {
tileCats.push({ id: `sample-${i + 1}`, label: `Sample ${i + 1}`, description: 'Sample tile for testing the scroll area.', levels: [5, 10, 25], glyph: glyphs[i]! });
demoLevels[`sample-${i + 1}`] = i % 3;
}
}
let tileIndex = 0;
for (const cat of tileCats) {
const col = tileIndex % COLS;
const row = Math.floor(tileIndex / COLS);
tileIndex += 1;
let { value, level, next } = demoParam == null || cat.id === 'secret'
? eco.getCategoryProgress(cat.id, this.game.streak)
: { value: 0, level: 0, next: cat.levels[0] ?? null };
if (demoParam != null && cat.id !== 'secret') {
level = demoLevels[cat.id] ?? 0;
// Mirror the real rule: levels are open-ended past the listed ones
// (10/25/50 per decade), so the sample view must never claim a top level
// for a normal category, and the sample value follows the same pattern.
const ths: number[] = [...cat.levels];
while (ths.length < level) ths.push(nextOpenThreshold(ths[ths.length - 1] ?? 0));
value = level > 0 ? ths[level - 1]! : 0;
next = cat.hidden === true
? null
: (level < ths.length ? ths[level]! : nextOpenThreshold(ths[ths.length - 1] ?? 0));
}
const locked = level === 0;
const secret = cat.hidden === true && locked;
const glyphId = cat.glyph ?? cat.id;
const title = secret ? '???' : `${cat.label} - Level ${level}`;
const body = secret
? 'A secret. It stays secret.'
: (demoParam != null ? 'TEST VIEW (sample levels, not saved). ' : '') + `${cat.description}` +
(next == null ? ' Top level reached.' : ` Next level: ${next} (now ${value}).`);
const tile = new UIKit.Container({
flexDirection: 'column',
alignItems: 'center',
gap: 2,
width: TILE,
height: TILE_H,
});
const tileImg = new UIKit.Image({
src: achievementTileSrc(glyphId, locked ? 'off' : 'on', level),
width: TILE,
height: TILE,
});
tile.add(tileImg);

tile.add(new UIKit.Text({
fontSize: 14,
color: locked ? 0x9aa4b6 : 0xffffff,
text: secret ? 'Secret' : (SHORT_NAMES[cat.id] ?? cat.label),
}));
const setSel = (on: boolean): void => {
tileImg.setProperties({ src: achievementTileSrc(glyphId, locked ? 'off' : (on ? 'sel' : 'on'), level) });
};
tileSetters.set(cat.id, setSel);
const show = (uv?: { x: number; y: number }): void => {
activeCat = cat.id;
popupTitle.setProperties({ text: title });
popupBody.setProperties({ text: body });
place(col, row, uv?.x ?? 0.5, uv?.y ?? 0.5);
popup.setProperties({ display: 'flex' });
};
// PC hover and MR gaze/ray arrive as pointerenter/pointerleave; iPhone
// touch (and a ray click) arrives as click and keeps the details open until
// the next tap on the same tile; another tile switches the details.
tile.addEventListener('pointerenter', (e) => show(e.uv));
// Follow the pointer over the tile (mouse or ray) unless a tap pinned
// another tile's details.
tile.addEventListener('pointermove', (e) => {
if (stickyCat != null && stickyCat !== cat.id) return;
if (stickyCat === cat.id) return;
if (e.uv != null) place(col, row, e.uv.x, e.uv.y);
});
tile.addEventListener('pointerleave', () => {
if (stickyCat == null && activeCat === cat.id) hide();
});
tile.addEventListener('click', (e) => {
if (stickyCat === cat.id) {
hide();
return;
}
if (stickyCat != null) tileSetters.get(stickyCat)?.(false);
show(e.uv);
stickyCat = cat.id;
setSel(true);
});
list.add(tile);
}
list.add(popup);
list.setProperties({ overflow: 'scroll', onScroll: () => { hide(); } });
}

/** Achievement unlock celebration (item 54): visual-only flare; voice stays
 * milestone-only (user rule). */
public readonly celebration = new AchievementCelebration();
private readonly celebrationTarget = new Vector3();
/** Bars float animation pool + scratch (no per-frame allocations). */
public readonly barFloats = new BarFloatPool();
private readonly barFloatFrom = new Vector3();
private readonly barFloatTo = new Vector3();
/** Bars earned on the current pattern attempt, shown as the round summary. */
private roundBarsEarned = 0;
/** Record-bonus part of roundBarsEarned (round-card breakdown line). */
private roundBonusEarned = 0;
/** Pattern-completion part of roundBarsEarned (round-card breakdown). */
private roundCompletionEarned = 0;
/** Set when any press this attempt pushed past the previous best streak. */
private recordBeatenThisAttempt = false;
/** First-ever Bars landed on a press; the voice line waits for pattern end. */
private barsFirstEarnedPending = false;
private showAchievementToasts(): void {
const toasts = this.economy.drainToasts();
if (toasts.length === 0) return;
for (const toast of toasts) this.celebration.show(toast, this.achievementsButtonWorld());
}
// Item 54: the approved celebration replaces the plain panel text toast.
// The fly-in targets the Achievements button (world position; the flat
// overlay projects it to the screen, MR flies to it directly).
// Owner call 2026-11-13: the celebration stays in FRONT of an open menu
// popup - the popup keeps its state and is not dismissed. But an open
// popup (store/achievements/game-over) hides menu-view, which collapses
// the button's layout to the panel corner, so while one is open the fly
// target is the button's last home position from before the popup opened.
private readonly achievementsButtonHome = new Vector3();
private achievementsButtonHomeValid = false;
private achievementsButtonWorld(): Vector3 | null {
if (this.storeOpen || this.achievementsOpen || this.gameOverOpen) {
return this.achievementsButtonHomeValid
? this.achievementsButtonHome
: this.readAchievementsButtonWorld();
}
return this.readAchievementsButtonWorld();
}
private readAchievementsButtonWorld(): Vector3 | null {
const button = this.world
.getSceneObject<UIKitMLAsset>('wall-tones-panel')
?.getElementById('achievements-button');
return button == null
? null
: button.getWorldPosition(this.celebrationTarget) as Vector3;
}
/** Refresh the button's home position while no popup hides menu-view
 * (runs in update(); copies into a preallocated vector, no allocation). */
private cacheAchievementsButtonHome(): void {
if (this.storeOpen || this.achievementsOpen || this.gameOverOpen) return;
const live = this.readAchievementsButtonWorld();
if (live == null) return;
this.achievementsButtonHome.copy(live);
this.achievementsButtonHomeValid = true;
}
/** Test-only: play the celebration for an arbitrary achievement without
 * touching unlock state (visual verification driver). */
public demoCelebration(id: string, label: string): void {
this.celebration.show({ id, label, description: '' }, this.achievementsButtonWorld());
}
/** Test-only: expose the effective fly target for the debug bridge
 * (aliases internal state; callers must not mutate the returned vector). */
public achievementsButtonWorldPublic(): Vector3 | null {
return this.achievementsButtonWorld();
}

/** +N Bars earned at a pad: float the amount from the pad to the panel's
 * Bars icon (HTML overlay in flat mode, billboarded 3D sprite in MR). */
private spawnBarFloat(padIndex: number, amount: number): void {
if (amount <= 0) return;
const pad = this.pads.find((p) => p.padIndex === padIndex);
const panel = this.world.getSceneObject<UIKitMLAsset>('wall-tones-panel');
const icon = panel?.getElementById('bars-icon-img');
if (pad == null || panel == null || icon == null) return;
pad.root.getWorldPosition(this.barFloatFrom);
icon.getWorldPosition(this.barFloatTo);
this.barFloats.spawn(
this.barFloatFrom,
this.barFloatTo,
amount,
this.world.scene,
);
}

/** Round-end results card in the panel: big total earned this round with a
 * smaller pads / record-bonus breakdown (user-settled UI: a card in the
 * existing menu, not a modal; same panel in MR and flat; nonblocking).
 * Persists until the next round's first press or a wrong input. */
private showRoundBarsCard(
total: number,
completion: number,
bonus: number,
): void {
if (total <= 0) return;
const panel = this.world.getSceneObject<UIKitMLAsset>('wall-tones-panel');
if (panel == null) return;
// User ask (Nov 7): show the bonus part inline - one compact line.
const extra = completion + bonus;
panel
.getElementById<UIKit.Text>('wall-tones-round-card-total')
?.setProperties({ text: extra > 0 ? `+${total} (+${extra} bonus)` : `+${total}` });
const pads = total - completion - bonus;
const parts = [`Pads +${pads}`];
if (completion > 0) parts.push(`Completion +${completion}`);
if (bonus > 0) parts.push(`Record bonus +${bonus}`);
const breakdown = parts.join(' - ');
this.lastRoundCardText = `+${total} (${breakdown})`;
}

private hideRoundBarsCard(): void {
this.lastRoundCardText = '';
this.world
.getSceneObject<UIKitMLAsset>('wall-tones-panel')
?.getElementById<UIKit.Text>('wall-tones-round-card-total')
?.setProperties({ text: '+0' });
}

/** Test-only wallet funding for the e2e debug bridge. */
private debugGrantBars(amount: number): void {
if (amount > 0) {
this.economy.debugGrant(amount);
this.renderPanel();
}
}

private debugGrantSavers(units: number): void {
this.economy.debugGrantSavers(units);
this.renderPanel();
}

private debugSetStreak(streak: number): void {
if (!Number.isFinite(streak) || streak < 0) return;
this.game.streak = Math.floor(streak);
if (this.game.streak > this.game.bestStreak) {
this.game.bestStreak = this.game.streak;
}
this.renderPanel();
}

private setAchievementsOpen(open: boolean): void {
if (this.achievementsOpen === open) return;
this.achievementsOpen = open;
if (open) this.storeOpen = false;
this.syncMenuPopupVisibility();
const panel = this.world.getSceneObject<UIKitMLAsset>('wall-tones-panel');
if (open && panel != null) this.reconcileAchievements(panel);
if (open) this.playAchievementsIntroOnce();
this.renderPanel();
}

/** Approved intro (user, Nov 11): spoken once ever, the first time the board
 * opens, with the instruction for the platform in use. Voices-off and Skip
 * voice still apply; when voices are off nothing plays and nothing is
 * marked, so it can still play after voices are turned back on. */
private playAchievementsIntroOnce(): void {
const key = 'wall-tones-achievements-intro-played';
try {
if (globalThis.localStorage?.getItem(key) === '1') return;
} catch {
/* private mode: fall through, session-only */
}
if (voicesOffEnabled()) return;
const immersive = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
const phone = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
const id = immersive ? 'achvIntroMr' : phone ? 'achvIntroIphone' : 'achvIntroPc';
try {
globalThis.localStorage?.setItem(key, '1');
} catch {
/* private mode */
}
this.speech.speak(id);
}

private syncMenuPopupVisibility(): void {
const panel = this.world.getSceneObject<UIKitMLAsset>('wall-tones-panel');
const popupOpen = this.storeOpen || this.achievementsOpen || this.gameOverOpen;
panel
?.getElementById<UIKit.Container>('menu-view')
?.setProperties({ display: popupOpen ? 'none' : 'flex' });
panel
?.getElementById<UIKit.Container>('store-popup')
?.setProperties({ display: this.storeOpen ? 'flex' : 'none' });
panel
?.getElementById<UIKit.Container>('achievements-popup')
?.setProperties({ display: this.achievementsOpen ? 'flex' : 'none' });
panel
?.getElementById<UIKit.Container>('gameover-popup')
?.setProperties({ display: this.gameOverOpen ? 'flex' : 'none' });
}

private onToggleStore(): void {
this.storeOpen = !this.storeOpen;
if (this.storeOpen) this.achievementsOpen = false;
this.syncMenuPopupVisibility();
if (this.storeOpen && this.economy.takeFirstTime('store-open')) {
// Approved onboarding pair: welcome, then how hints work (once ever).
this.speech.speak('storeWelcome');
this.speech.speak('storeHints');
}
this.renderPanel();
}

/** Deny animation for an unaffordable store purchase: quick horizontal shake of the popup card. */
private shakeTimers: number[] = [];
private shakeStorePopup(): void {
const panel = this.world.getSceneObject<UIKitMLAsset>('wall-tones-panel');
const card = panel?.getElementById<UIKit.Container>('store-popup');
if (card == null) return;
for (const t of this.shakeTimers) window.clearTimeout(t);
this.shakeTimers = [];
const offsets = [0, -8, 8, -6, 6, -3, 3, 0];
offsets.forEach((x, i) => {
this.shakeTimers.push(window.setTimeout(() => {
card.setProperties({ transformTranslateX: x });
}, i * 40));
});
}

/** Store skill-tree selection (sticky tile the details + Buy button act on). */
private storeSelected: string | null = null;

/** Select a store tile (tap, ray click, or the debug bridge). Tapping the
 * open tile again closes its details (same pin/unpin rule as the
 * achievements popup). */
private selectStoreTile(id: string): void {
this.storeSelected = this.storeSelected === id ? null : id;
this.renderPanel();
// A new selection resets the status line, so a previous tile's "Bought."
// or denial never lingers over another item's details.
this.world
.getSceneObject<UIKitMLAsset>('wall-tones-panel')
?.getElementById<UIKit.Text>('store-detail-status')
?.setProperties({ text: 'Prices are test values.' });
}

private clearStoreSelection(): void {
if (this.storeSelected == null) return;
this.storeSelected = null;
this.renderPanel();
}

/** Bridge-only select that never toggles off (repeat buy* calls must buy). */
private forceSelectStoreTile(id: string): void {
if (this.storeSelected !== id) {
this.selectStoreTile(id);
}
}

/** Buy the selected store tile. Gates and denial feedback live here so the
 * economy methods stay single-purpose. */
private onBuySelected(): void {
const id = this.storeSelected;
if (id == null) return;
const panel = this.world.getSceneObject<UIKitMLAsset>('wall-tones-panel');
const status = panel?.getElementById<UIKit.Text>('store-detail-status');
const deny = (text: string): void => {
status?.setProperties({ text });
void playErrorTone();
this.shakeStorePopup();
};
if (id === 'hint' && !this.economy.hintUnlocked()) {
deny('Locked: buy Listen first.');
return;
}
if (id === 'autoplay' && !this.economy.autoplayUnlocked()) {
deny(
!this.economy.ownsListen()
? 'Locked: buy Listen first.'
: `Locked: reach Hint level ${AUTOPLAY_UNLOCK_HINT_LEVEL} (now level ${this.economy.getHintLevel()}).`,
);
return;
}
const ok =
id === 'listen' ? this.economy.buyListen()
: id === 'hint' ? this.economy.buyNextHintLevel()
: id === 'autoplay' ? this.economy.buyNextAutoplayLevel()
: id === 'replay' ? this.economy.buyReplay()
: id === 'saver' ? this.economy.buySaver(SAVER_PRICE_BARS)
: id === 'secret' ? this.economy.buyTopSecret()
: false;
if (!ok) {
deny('Not enough Bars yet. Complete more patterns!');
return;
}
status?.setProperties({ text: 'Bought. Prices are test values.' });
this.showAchievementToasts();
this.renderPanel();
}

/** Real colored geometry avoids emoji / font fallback rendering white boxes. */
private renderSequenceIcons(panel: UIKitMLAsset): void {
this.sequenceIconPendingPanel = panel;
if (this.sequenceIconUpdateQueued) return;
this.sequenceIconUpdateQueued = true;
queueMicrotask(this.flushSequenceIcons);
}

/** Reconcile after the frame callback; retain cues instead of rebuilding each round. */
private reconcileSequenceIcons(panel: UIKitMLAsset): void {
const row = panel.getElementById<UIKit.Container>('wall-tones-sequence-icons');
if (row == null) return;
// Backlog 12a: during Your Turn the pattern row only appears when a hint
// level is owned, revealing the first 5 boxes per level; subtitles alone no
// longer show it. The Listen-phase row needs the Listen store item (owner
// rule 2026-11-11: no Listen item, no listen line).
const listening = this.statusText === 'Listen:';
const reveal = this.economy.getHintRevealCount();
const yourTurn = this.game.phase === 'input' && !listening;
const visible =
(listening && this.economy.ownsListen()) ||
(this.game.phase === 'input' && reveal > 0);
const names = colorNamesEnabled();
// yourTurn must key the cache: after Listen of a longer-than-owned pattern the
// row stays visible while the beyond-hint boxes must hide on the phase flip.
const key = this.game.sequence.join(',') + ':' + names + ':' + visible + ':' + reveal + ':' + (yourTurn ? '1' : '0') + ':' + (listening ? this.playbackShownCount : -1);
if (this.sequenceIconRow === row && this.sequenceIconKey === key) return;
if (this.sequenceIconRow !== row) {
this.sequenceCueSquares.length = 0;
this.sequenceCueNames.length = 0;
this.sequenceIconRow = row;
}
this.sequenceIconKey = key;
row.setProperties({ display: visible ? 'flex' : 'none' });
this.lastSequenceRowVisible = visible;
for (let i = 0; i < this.game.sequence.length; i++) {
if (!this.sequenceCueSquares[i]) {
const square = new UIKit.Container({width: 16, height: 16, borderRadius: 2, flexShrink: 0});
const name = new UIKit.Text({fontSize: 15, color: 0xffffff});
this.sequenceCueSquares.push(square);
this.sequenceCueNames.push(name);
row.add(square); row.add(name);
}
}
let shown = 0;
let unknownShown = 0;
for (let i = 0; i < this.sequenceCueSquares.length; i++) {
const id = this.game.sequence[i];
const beyondHint = yourTurn && i >= reveal;
const notYetPlayed = listening && i >= this.playbackShownCount;
// User ask (Nov 7): when the pattern runs past the owned hint prefix,
// mark the hidden tail with up to 5 grey "?" squares instead of nothing.
const unknown = beyondHint && id != null && unknownShown < 5;
if (visible && id != null && !beyondHint && !notYetPlayed) shown += 1;
if (visible && unknown) unknownShown += 1;
this.sequenceCueSquares[i]!.setProperties({
display: id == null || (beyondHint && !unknown) || notYetPlayed ? 'none' : 'flex',
backgroundColor: id == null ? 0 : unknown ? 0x8a8f98 : WALL_TONE_PADS[id].color,
});
this.sequenceCueNames[i]!.setProperties({
display: id != null && !notYetPlayed && ((names && !beyondHint) || unknown) ? 'flex' : 'none',
text: id == null ? '' : unknown ? '?' : WALL_TONE_PADS[id].name,
});
}
this.lastSequenceBoxesShown = shown;
this.lastSequenceUnknownShown = unknownShown;
}

private trackFlatLayout(value: number): void {
const i = this.flatLayoutCursor++;
if (this.flatLayoutValues[i] !== value) {
this.flatLayoutValues[i] = value;
this.flatLayoutDirty = true;
}
}

private flatCaptionLayoutChanged(): boolean {
this.flatLayoutDirty = false;
this.flatLayoutCursor = 0;
this.trackFlatLayout(window.innerWidth);
this.trackFlatLayout(window.innerHeight);
this.trackFlatLayout(this.experienceActive ? 1 : 0);
this.trackFlatLayout(this.pads.length);
const camera = this.world.camera;
for (let i = 0; i < 16; i++) {
this.trackFlatLayout(camera.matrixWorldInverse.elements[i]!);
this.trackFlatLayout(camera.projectionMatrix.elements[i]!);
}
for (const pad of this.pads) {
pad.root.updateWorldMatrix(true, false);
this.trackFlatLayout(pad.sizeM);
for (let i = 0; i < 16; i++) this.trackFlatLayout(pad.root.matrixWorld.elements[i]!);
}
return this.flatLayoutDirty;
}

/** Flat captions are anchored under the pad grid, never on top of a pad. */
/**
* Backlog 21: in MR the subtitles ride the head, pinned to the bottom of the
* view, instead of living on the world-anchored game panel. Flat play keeps
* the DOM overlay; the panel line below stays as the fallback when the node
* is absent from the scene.
*/
private tickHeadCaption(): void {
const entity = this.world.getSceneEntity('wall-tones-head-caption');
if (entity == null) {
return;
}
const immersive = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
const caption = currentSpokenCaption();
const show = immersive && hearingSubtitlesEnabled() && caption.length > 0;
if (entity.object3D != null && entity.object3D.visible !== show) {
entity.object3D.visible = show;
}
this.headCaptionVisible = show;
if (!show) {
this.headCaptionText = '';
return;
}
this.player.head.getWorldPosition(this.viewer);
this.player.head.getWorldQuaternion(this.headQuat);
this.headCaptionOffset
.set(0, -HEAD_CAPTION_DOWN_M, -HEAD_CAPTION_DISTANCE_M)
.applyQuaternion(this.headQuat);
const position = entity.getVectorView(Transform, 'position');
position[0] = this.viewer.x + this.headCaptionOffset.x;
position[1] = this.viewer.y + this.headCaptionOffset.y;
position[2] = this.viewer.z + this.headCaptionOffset.z;
const orientation = entity.getVectorView(Transform, 'orientation');
orientation[0] = this.headQuat.x;
orientation[1] = this.headQuat.y;
orientation[2] = this.headQuat.z;
orientation[3] = this.headQuat.w;
const scale = entity.getVectorView(Transform, 'scale');
scale[0] = HEAD_CAPTION_SCALE;
scale[1] = HEAD_CAPTION_SCALE;
scale[2] = HEAD_CAPTION_SCALE;
if (caption !== this.headCaptionText) {
this.headCaptionText = caption;
this.world
.getSceneObject<UIKitMLAsset>('wall-tones-head-caption')
?.getElementById('wall-tones-head-caption-text')
?.setProperties({ text: caption });
}
}

private updateAccessibilityCaptions(): void {
const enabled = hearingSubtitlesEnabled();
const flat = this.world.visibilityState.peek() === VisibilityState.NonImmersive;
const show = enabled && this.experienceActive;
const panel = this.world.getSceneObject<UIKitMLAsset>('wall-tones-panel');
const caption = currentSpokenCaption();
const names = colorNamesEnabled();
const previous = this.accessibilityState;
let sequenceChanged = !previous || previous.sequence.length !== this.game.sequence.length;
if (previous && !sequenceChanged) {
for (let i = 0; i < this.game.sequence.length; i++) {
if (previous.sequence[i] !== this.game.sequence[i]) { sequenceChanged = true; break; }
}
}
const accessibilityChanged = this.accessibilityPanel !== panel || !previous ||
previous.show !== show || previous.flat !== flat ||
previous.active !== this.experienceActive || previous.caption !== caption ||
previous.phase !== this.game.phase || previous.flow !== this.flowPhase || previous.status !== this.statusText ||
previous.names !== names || previous.reveal !== this.economy.getHintRevealCount() ||
previous.shown !== this.playbackShownCount || previous.listen !== this.economy.ownsListen() || sequenceChanged;
if (accessibilityChanged) {
this.accessibilityPanel = panel;
this.accessibilityState = { show, flat, active: this.experienceActive, caption,
phase: this.game.phase, flow: this.flowPhase, status: this.statusText, names, sequence: [...this.game.sequence],
reveal: this.economy.getHintRevealCount(), shown: this.playbackShownCount, listen: this.economy.ownsListen() };
if (panel && this.experienceActive) this.renderSequenceIcons(panel);
// Bug fix (user report): the info row holds the Your Turn hint boxes; it
// used to be hidden unless subtitles were on AND the session was immersive,
// so a purchased hint was invisible in flat play and with subtitles off.
// The row now shows whenever the experience is active; only the
// spoken-caption line below stays subtitle-gated.
panel?.getElementById('wall-tones-info-row')?.setProperties({
display: this.experienceActive ? 'flex' : 'none',
});
this.lastInfoRowVisible = this.experienceActive;
// Backlog 23: setup is the MR placement flow, not an idle game phase.
// Show scoring during the intro after placement, and leave flat play unchanged.
this.syncGameExplanationVisibility();
const scoreInfoVisible = ![
'choose-mode', 'scanning', 'wall-picking', 'air-placement',
].includes(this.flowPhase);
panel?.getElementById('wall-tones-streak-row')?.setProperties({
display: scoreInfoVisible ? 'flex' : 'none',
});
panel?.getElementById('wall-tones-score-row')?.setProperties({
display: scoreInfoVisible ? 'flex' : 'none',
});
panel?.getElementById('wall-tones-round-card')?.setProperties({
display: scoreInfoVisible ? 'flex' : 'none',
});
panel?.getElementById('store-button')?.setProperties({
display: scoreInfoVisible ? 'flex' : 'none',
});
panel?.getElementById('achievements-button')?.setProperties({
display: scoreInfoVisible ? 'flex' : 'none',
});
this.lastScoreInfoVisible = scoreInfoVisible;
const headCaptionPresent = this.world.getSceneEntity('wall-tones-head-caption') != null;
panel?.getElementById<UIKit.Text>('wall-tones-spoken-caption')?.setProperties({
display: show && !flat && !headCaptionPresent && caption ? 'flex' : 'none', text: caption,
});
}
const menuCaption = enabled && flat && !this.experienceActive && Boolean(caption);
if ((!show && !menuCaption) || !flat) {
if (this.flatCaptions && this.flatCaptions.style.display !== 'none') this.flatCaptions.style.display = 'none';
this.flatCaptionsRect = null;
return;
}
if (!this.flatCaptions) {
document.getElementById('wall-tones-flat-subtitles')?.remove();
this.flatCaptions = document.createElement('div');
this.flatCaptions.id = 'wall-tones-flat-subtitles';
this.flatCaptions.setAttribute('aria-live', 'polite');
Object.assign(this.flatCaptions.style, {
position: 'fixed', zIndex: '30', color: '#fff', background: '#081019e8',
padding: '10px 14px', borderRadius: '10px', font: '16px/1.4 sans-serif',
textAlign: 'center', pointerEvents: 'none', boxSizing: 'border-box',
transform: 'translateX(-50%)',
});
document.body.appendChild(this.flatCaptions);
this.flatLayoutValues.length = 0;
}
if (this.flatCaptions.style.display !== 'block') this.flatCaptions.style.display = 'block';
document.getElementById('wall-tones-startup-subtitle')?.remove();
if (this.flatCaptionLayoutChanged()) {
let minX = Infinity, maxX = -Infinity, bottom = 0;
for (const pad of this.pads) {
for (let side = -1; side <= 1; side += 2) {
const v = this.captionProjection.set(side * pad.sizeM / 2, -pad.sizeM / 2, 0);
pad.root.localToWorld(v); v.project(this.world.camera);
const x = (v.x + 1) * window.innerWidth / 2;
minX = Math.min(minX, x); maxX = Math.max(maxX, x);
bottom = Math.max(bottom, (1 - v.y) * window.innerHeight / 2);
}
}
const phone = this.isPhoneFlatViewport();
if (this.pads.length === 0 || !this.experienceActive) { minX = window.innerWidth * 0.2; maxX = window.innerWidth * 0.8; bottom = window.innerHeight - 160; }
const width = phone ? window.innerWidth - 24 : Math.min(window.innerWidth - 24, Math.max(300, maxX - minX));
this.flatCaptions.style.fontSize = phone ? '13px' : '16px';
this.flatCaptions.style.lineHeight = phone ? '1.25' : '1.4';
this.flatCaptions.style.width = `${width}px`;
this.flatCaptions.style.left = `${Math.max(width / 2 + 12, Math.min(window.innerWidth - width / 2 - 12, (minX + maxX) / 2))}px`;
this.flatCaptions.style.top = `${bottom + 14}px`;
this.flatCaptionsRectDirty = true;
}
// Backlog 12a applies here too (codex P2): during Your Turn the subtitle
// sequence only reveals the owned hint prefix; no hint, no sequence. The
// Listen-phase strip needs the Listen store item (owner rule 2026-11-11).
const captionListening = this.statusText === 'Listen:';
const captionReveal = this.economy.getHintRevealCount();
const captionYourTurn = this.game.phase === 'input' && !captionListening;
const seqVisible = this.experienceActive &&
((captionListening && this.economy.ownsListen()) ||
(this.game.phase === 'input' && captionReveal > 0));
// Same owner ask as the panel status: no Listen/Hint title before purchase;
// the blank line keeps the strip height unchanged.
const info = !this.experienceActive
? ''
: this.game.phase === 'input'
? (captionReveal > 0 ? 'Hint:' : '\u00a0')
: this.statusText === 'Listen:' && !this.economy.ownsListen()
? '\u00a0'
: this.statusText;
if (!accessibilityChanged && this.flatCaptions.childElementCount > 0) return;
this.flatCaptions.replaceChildren();
const line = document.createElement('div');
Object.assign(line.style, { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' });
const label = document.createElement('span'); label.textContent = info; line.append(label);
if (seqVisible) for (let i = 0; i < this.game.sequence.length; i++) {
if (captionListening && i >= this.playbackShownCount) break;
const unknown = captionYourTurn && i >= captionReveal;
if (unknown && i - captionReveal >= 5) break; // cap the grey "?" tail at 5
const id = this.game.sequence[i]!;
const square = document.createElement('span');
Object.assign(square.style, { width: '16px', height: '16px', borderRadius: '2px', background: unknown ? '#8a8f98' : `#${WALL_TONE_PADS[id].color.toString(16).padStart(6, '0')}`, display: 'inline-block', flexShrink: '0' });
if (unknown) {
square.textContent = '?';
square.setAttribute('data-unknown', '1');
square.setAttribute('aria-label', 'Unknown note');
Object.assign(square.style, { color: '#fff', fontSize: '11px', lineHeight: '16px', textAlign: 'center' });
} else {
square.setAttribute('aria-label', WALL_TONE_PADS[id].name);
}
line.append(square);
if (!unknown && colorNamesEnabled()) { const word = document.createElement('span'); word.textContent = WALL_TONE_PADS[id].name; line.append(word); }
}
this.flatCaptions.append(line);
if (caption) { const text = document.createElement('div'); text.textContent = caption; text.style.marginTop = '5px'; this.flatCaptions.append(text); }
this.flatCaptionsRectDirty = true;
}

private wait(seconds: number): Promise<void> {
return new Promise((resolve) => {
window.setTimeout(resolve, seconds * 1000);
});
}
  }
