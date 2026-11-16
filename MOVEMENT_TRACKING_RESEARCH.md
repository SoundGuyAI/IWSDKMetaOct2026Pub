# Movement tracking research (backlog item 30)

Owner request (Nov 7): research whether the SDK can track how much a player
moves in wall or mixed wall+table modes, fitness-tracker style; if not,
estimate from the distances between the placed pads, for later score use.
No health or calorie claims.

Owner direction (Nov 11): combine the headset movement and the pad distance
into a movement score, save it, and give an achievement for it. Keep the two
measurements separate internally so the score can be tuned without counting
the same movement twice. In the development stage, display both measurements
on the game menu on one line, with no developer labels; the movement
achievement lives on the Achievements screen. Nothing appears on mobile for
now (phone step tracking would be a separate native-app question, out of
scope here).

## What this prototype measures

1. **Headset movement ("Movement")**: the horizontal (XZ) distance the
   headset travels while in an immersive session, sampled once per frame.
   Vertical motion is ignored on purpose: it is sway, nodding or crouching,
   not locomotion.
2. **Pad reach ("Pad reach")**: the 3D distance between consecutive
   correctly pressed pads, counted for physical fingertip touches only.
   Ray, gaze and pinch presses are far input: the hand never travelled to
   the pad, so they add no reach (Quest feedback Nov 14). This is a reach
   estimate across the placed layout, not walking distance. The first
   correct press after a (re)placement only anchors; flat-mode pads are a
   fixed on-screen grid and never count.

Both are estimates. This is not a step counter, not a fitness measurement,
and makes no health or calorie claims.

## Filtering model

- **Dead-zone**: head travel only counts once it leaves a 5 cm radius around
  the last committed point, so micro-sway never accumulates.
- **Speed cap**: horizontal head motion faster than 2.5 m/s is treated as
  re-centering or tracking loss; the sample re-anchors and counts nothing.
- **Session gaps**: leaving the immersive session (browser break, flat mode)
  clears the anchor, so re-entering XR elsewhere is not counted as a jump.
- **Pad sanity cap**: a pad-to-pad jump over 25 m counts nothing (pads live
  in one room; a larger jump is a bad sample).

The constants live at the top of `src/wall-tones/movement.ts` and need
headset tuning.

## Display, persistence and privacy

- The in-game menu shows the session values (`Movement`, `Pad reach`) on
  one line plus a `Total movement` line with the lifetime total, following
  the score rows' visibility. MR only: the lines never show in flat
  desktop/phone play. (Owner Nov 14: show this session and total.)
- Device visibility (user Nov 14: "Movement on pc - there is none but there
  is on mobile and XR"; later Nov 14: hide it on iPhone too, until iPhone
  movement is implemented): the Movement achievement tile is hidden on
  desktop PCs and iOS devices in flat mode (`movementUiVisible`); XR
  sessions and Android devices keep it. Phone movement collection itself is
  still out of scope here.
- The Movement achievement's progress is the lifetime total
  (headset + pad reach), not the session (owner Nov 14).
- Two running lifetime totals persist in localStorage
  (`wall-tones-move-head-m`, `wall-tones-move-pad-m`), same pattern as the
  economy. They are per browser/device, have no sync, and clearing browser
  data erases them. The Settings > Accessibility stat reset clears them too.
- No position history is recorded; nothing leaves the device.

## Achievement

A provisional **Movement** category on the Achievements screen uses the
combined lifetime meters (headset + pad reach) with placeholder levels
10 / 25 / 50 m, then the open-ended 10/25/50-per-decade pattern. The
combined formula and the targets are deliberately unsettled: they are test
values to react to, locked only after headset validation.

## Headset validation checklist (Quest, MR)

1. Walk a known distance (e.g. 3 m taped on the floor) and compare the
   Movement reading; repeat at slow and fast walking speeds.
2. Stand still and look around for a minute: the Movement reading should
   stay near zero (dead-zone check).
3. Nod, crouch and sway in place: readings should stay near zero (vertical
   and sway filtering).
4. Re-center the view or trigger the guardian boundary mid-walk: no jump in
   the reading.
5. Exit to the browser and come back: no jump in the reading.
6. Play a wall layout and a table layout: compare Pad reach against the
   known pad spacing; check the first press after re-placement adds nothing.
   Hit pads with the hand ray and with gaze+pinch: Pad reach must not move;
   touch the same pads physically: it does.
7. Reload the page: lifetime totals and the Movement achievement level
   persist; the session line restarts at 0.0 m.
8. Confirm the movement line never appears in the phone/desktop flat mode.

After these, settle the dead-zone/cap constants, the combined score formula,
and the achievement targets with real numbers.

## Explicit non-claims

- Not a step count, distance-truth, calorie or fitness measurement.
- Not validated on hardware yet; all values are research estimates.
- Not a history or heatmap of the player's room: two totals only.
