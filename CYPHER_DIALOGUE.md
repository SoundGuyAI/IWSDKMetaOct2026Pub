# Cypher: first contact

Wall Tones · Current script draft v0.2 · 11 November 2026

For Oded's reread. Documentation only. No story gameplay, voices or effects are implemented. This revision follows the Act 1 direction: the narrator cannot hear Cypher. Act 2 dialogue remains unwritten; the updated three-act direction is recorded below.

The previous complete v0.1 script is preserved, unchanged, in `CYPHER_DIALOGUE_V01_INSPIRATION.md`. It is an inspiration backup, not the current story or an approved Act 2. Its partner, rescue, shared narrator conversations and ending are not carried into this version.

## What changed

- The first Cypher transmissions now stay close to the supplied lines, with spelling and punctuation cleaned for spoken delivery rather than a new opening.
- Cypher tells the player that they bypassed the game's AI security protocols. In the story, the AI cannot detect their voice or the radio channel.
- Throughout Act 1, the narrator addresses only the player. It notices glitches, apologizes, encourages play and gives repair instructions. It never answers, quotes, challenges or acknowledges Cypher.
- Some narrator instructions independently match Cypher's streak target. Those moments have two separate explanations: Cypher needs a communication window; the narrator expects a longer clean sequence to fix the glitches.
- No partner, ally, captive or other unseen character is introduced. The enemy organization remains part of the user's premise, not an added speaking cast.
- Act 2 could develop a larger discovery story between the narrator and Cypher. Act 3 brings the narrator, Cypher and player together against the terrorists and ends at streak 1024, as Oded specified. The Act 2 transition and intermediate gates remain open.

## Act 1 rules

These are writing rules for this draft, not implemented mechanics.

1. **Two separate channels:** Cypher talks privately to the player. The narrator talks to the player through the game's normal channel. No narrator line requires knowledge of anything Cypher said.
2. **A glitch is not a voice:** the narrator can notice unstable graphics, a timing fault or a damaged diagnostic result. It cannot identify an intruder, a spy, a radio transmission or another speaker in Act 1.
3. **Do not make accidental replies:** leave a pattern, a visual cue or another clear boundary between a Cypher transmission and a narrator line. If the narrator speaks soon afterward, its line must explicitly refer to the visible fault or the player's game state, not sound like an answer to Cypher.
4. **Keep the pads clear:** static and speech belong between patterns, never over the listen or response phase. Dialogue can be heavy without masking the memory task.
5. **Five and ten are the requested anchors:** the delay after streak five, the later 15/20 gates below, same-run versus cumulative progress, saving, retry and skip rules remain proposals. No reward or Bars cost is added by this script.
6. **Comfort and access:** captions need speaker labels and meaningful sound cues. No jump in static volume; cracks should not obscure pads or captions. Voice-off, reduced effects, pause, replay and failure handling need approval before gameplay work.
7. **Fiction:** quantum keys, entanglement signatures and the AI security bypass are character claims inside a science-fiction story. They are not real computing or hacking instructions.

## Sound and staging key

- **RADIO OPEN:** brief static, a carrier click or radio squawk, then Cypher. The game narrator never reacts to this cue.
- **RADIO CLOSE:** a clipped carrier chirp, followed by clean silence before gameplay.
- **GAME FAULT:** a separate visual glitch or diagnostic cue visible to the game's AI. This is what can motivate a narrator line.
- **CRACK:** a narrow luminous seam on the desktop page or, later, a suitable MR wall. Completing a pattern closes it, as requested. Exact trigger and failure fallback remain open.
- No clips have been generated. Levels, filters and cue lengths are proposed production notes.

## Act 1: the private channel

Cypher line IDs use the C-series and narrator lines the N-series. The current v0.2 document is the authority for these IDs; the backup keeps its own older IDs. Stage cues are not spoken. New continuation and narrator lines are editorial draft writing.

### 01 · Connection

**Requested anchor:** a few rounds after a five-pattern streak. Exact delay remains open.

[Short static burst. A carrier catches, slips, then holds for two words.]

**C01 · CYPHER:** "Connection... established."

[The radio cuts out. The narrator says nothing. Complete another pattern before the next contact.]

### 02 · The next window

**Proposed cue:** a later safe pattern boundary. Close to the supplied wording.

[Radio squawk. Cypher is low and controlled, relieved that the channel works.]

**C02 · CYPHER:** "Can you hear me? You're doing great. I'll explain in the next communication window."

[Carrier closes. No spoken player response is required by this draft. The narrator does not hear the question.]

### 03 · Keep playing

**Proposed cue:** another safe boundary. Close to the supplied wording.

**C03 · CYPHER:** "Yes. Keep playing. They don't suspect anything. Good."

[Radio closes. The next pattern proceeds normally.]

### 04 · Ten

**Requested anchor:** ask the player for a streak of ten or above. Close to the supplied wording.

**C04 · CYPHER:** "Get a streak of ten or above, so I can send a longer message."

[Carrier closes. Later, a small visual stutter gives the narrator its own independent reason to speak.]

**N01 · NARRATOR, to the player:** "Sorry about that. There seems to be a small glitch. Keep playing while I check it."

[No reference to the radio, the unknown speaker or a message.]

### 05 · Codename

**Requested gate:** after a streak of ten. Split the longer communication across safe boundaries rather than one uninterrupted monologue.

[Radio opens with less static.]

**C05 · CYPHER:** "My codename is Cypher. I'm on a mission to hack the computerized defense system of a terrorist organization."

**C06 · CYPHER:** "I need your help. The only way to crack their quantum computer is to find their cryptographic hash key. It's used to encrypt their databases."

[This stays close to the user's proposed exposition. It is Cypher's fictional explanation, not a factual claim about quantum computers. Radio closes; play a pattern before the next part.]

### 06 · It happened to be yours

[Next clear communication window.]

**C07 · CYPHER:** "I had to find the right machine, one with the same quantum entanglement as their servers."

[Small pause.]

**C08 · CYPHER:** "It happened to be yours!"

**C09 · CYPHER:** "I need you to keep getting long, correct sequences. I've changed the code of your game to give you abilities the original game didn't have. Like those modifiers."

[Keep the reveal as the character's claim. Whether story mode actually gives new modifiers, or only explains existing ones in fiction, is still undecided. Radio closes.]

### 07 · Hidden from the game

**New continuation following Oded's Act 1 direction.**

**C10 · CYPHER:** "One more thing. The game's AI can't hear me."

**C11 · CYPHER:** "I bypassed its security protocols. It can't detect this channel. As far as it knows, you're just playing."

**C12 · CYPHER:** "It might notice a few glitches. Don't worry about those. Let it run its checks."

**C13 · CYPHER:** "Just keep following the patterns. That's how we keep the connection open."

[Radio closes. The narrator stays silent here. Do not append a line that sounds like it overheard this explanation.]

### 08 · Routine repair

**Proposed gate for the next longer window:** fifteen. Exact target awaits review.

**C14 · CYPHER:** "The first lock is open. The next one needs a longer sequence. Get a streak of fifteen and I can send more."

[Carrier closes. At a later game boundary, a visible flicker occurs. The game AI sees the fault, not Cypher.]

**N02 · NARRATOR, to the player:** "I've found a timing fault. Nothing you did. A clean streak of fifteen should give me enough data to fix it."

**N03 · NARRATOR, to the player:** "Keep going. I'll take care of the glitches."

[Both voices want fifteen for different reasons. The narrator does not say "as they said," "I agree" or anything that implies another voice exists.]

### 09 · The seam

**Proposed cue:** a later window at or after fifteen. Introduce the requested crack as a draft visual beat.

[A thin crack of light appears away from the pads. No loud impact and no implication of real structural damage. Cypher can react to their own link diagnostics; no new camera or room-surveillance capability is implied.]

**C15 · CYPHER:** "The link is feeding something back. You might see a line of light."

**C16 · CYPHER:** "Finish the next pattern. That should close it."

[Radio closes. The player completes the pattern; the light seam disappears. At a separate game boundary, the narrator reports the visible effect in its own terms.]

**N04 · NARRATOR, to the player:** "Sorry. That visual error should not have been there. It looks stable again now."

**N05 · NARRATOR, to the player:** "Your progress is safe. Let's continue."

["Progress is safe" is a proposed player-facing promise. Ship it only if the eventual save/failure behavior supports it. A miss must not strand a persistent crack; the exact recovery behavior remains open.]

### 10 · A longer window

**Proposed next gate:** twenty. No new unseen character or narrator discovery.

**C17 · CYPHER:** "That worked. I can hold the channel longer now."

**C18 · CYPHER:** "Their system is changing the lock faster than I expected. I need a longer pattern to keep up."

**C19 · CYPHER:** "Get a streak of twenty. I'll use the next window to explain what happens next."

[Radio closes. After another pattern and an independent diagnostic cue, the game's narrator returns.]

**N06 · NARRATOR, to the player:** "The last repair helped, but I'm still seeing errors. Keep aiming for twenty. A longer clean sequence should let me finish the check."

**N07 · NARRATOR, to the player:** "You're doing fine. This is a problem with the game, not with you."

[End of the current Act 1 draft. Leave the next window unwritten for Oded's Act 2 ideas. The narrator still has no awareness of Cypher.]

## Three-act direction

### Act 1 · A private channel

The current dialogue above covers the first contacts and early glitches. Cypher remains undetected by the narrator. The player alone hears both explanations. The endpoint and exact duration of Act 1 remain open; this is the current writing slice, not a decision that Act 1 ends at twenty.

### Act 2 · Discovery between the two voices

Oded's direction: Act 2 could have a larger story of discovery between the narrator and Cypher. A possible bridge is Cypher telling the player that they need to get the game on board, after which the narrator could hear Cypher. That exact reveal is still tentative.

Proposed questions to develop, not approved plot: what does the narrator think the game is for; what does Cypher actually know about the connection; why do both explanations of the glitches seem to work? Once contact is chosen, let their relationship develop through discoveries and disagreements rather than an immediate alliance. No final Act 2 dialogue, new character or fixed twist is supplied here.

### Act 3 · Working together

Oded's direction: the narrator, Cypher and the player all work together to bring the terrorists down. **Act 3 ends when the player reaches a streak of 1024.** This is the requested ending target, not thirty and not a substitute target selected for convenience.

The scene at 1024, the steps leading to it, the game world's explanation and the meaning of a streak across sessions still need design. Do not silently turn 1024 into cumulative points, a lifetime count or an easier adaptive ending. A very long finale target needs an explicit decision about saving, retries and accessibility; those choices should support the intent without changing the number behind Oded's back.

No additional unseen characters are chosen. The former partner/rescue story is only in the inspiration backup. Do not carry it forward by implication. All Act 2/3 expansion below the broad direction is for future drafting, not implemented gameplay.

The previously requested drone remains an unplaced future possibility: in MR it could appear above the player after a period of looking down; Cypher could ask for a streak to disable it, and it could break apart on the floor. The flat presentation, act, trigger, exact streak, floor placement and comfort rules are undecided. There is no drone scene in this Act 1 draft and no promise that it is implemented.

## Hidden story achievements: added scope

Oded requested hidden story achievements in this PR, including an achievement for defeating drones. This starter records the design and implementation task now; it does not claim a runtime achievement or a drone encounter already exists.

- **Requested beat:** defeat a story drone. Unlock only from the actual successful story encounter event, not from reaching a streak alone or opening a demo view.
- **Proposed name:** "Signal severed". Name, icon and description await review.
- **Other proposed beats:** first private communication; closing the first crack; the eventual narrator/Cypher alliance; completing Act 3 at streak 1024. Only the drone example and general hidden-story-achievement scope were explicitly requested; the other beats are proposals.
- **Hidden behavior to decide:** omit unearned story achievements entirely, or show a spoiler-free unknown tile. Do not reveal drone, alliance or ending details in locked names/tooltips, ordinary progress popups or achievement notifications before the relevant scene.
- **Implementation checks for this feature:** grant once; save/reload without duplicate unlock; distinguish encounter completion from a failed attempt; define story reset versus achievement reset; never unlock from test fixtures or skipped scenes unless approved. Confirm how these integrate with existing achievement levels before coding.
- **Dependency:** define and implement the story encounter events first. Adding an arbitrary drone-kill counter without a drone completion event would invent gameplay. Runtime integration remains pending those story decisions and implementation.

## Decisions still open

1. How many rounds after streak five should the first connection arrive? Do "rounds" mean patterns or separate runs?
2. Are later communication gates same-run streaks, persistent milestones, or something else? Fifteen and twenty are proposals here.
3. How should failure, skip, replay, reload and streak savers affect story progress? No punishment or lost scene is silently added.
4. Does story mode unlock automatically, through a toggle, or through the store? Backlog items 14 and 31 remain relevant.
5. Are Cypher's modifiers purely a story explanation of existing features, or new story rewards? No economy change is approved here.
6. How does the narrator first hear Cypher, and what do they discover in Act 2? How does their joint mission build to the requested streak-1024 ending of Act 3? Extra characters remain undecided.
7. Voice, head-gesture and thumbs-up/down yes/no input remain a later feasibility task, backlog 52, after Cypher gameplay is added. No microphone or gesture feature is assumed by this script.
8. Approve the words and distinct Cypher casting before generating voices. Cypher stays opposite gender to the selected narrator and distinct from both existing narrator performances.

## Starter status

PR64 remains a documentation-only review draft. Backlog 51 covers Cypher; backlog 52 covers the separate later yes/no experiment. No gameplay, sound assets, deployment or merge is part of this revision.

## Appendix: original supplied dialogue

The original words, spelling and spacing are retained below. Current performed wording is above; this appendix is source material, not extra scenes.

> "connection.... established.."
>
> "Can you hear me? You're doing great. I'll explain In the next communication window "
>
> "Yes, Keep playing. they don't' suspect anything.. good"
>
> "Get a  streak of 10  and above. So i can send a longer message."
>
> "My codename is Cypher. I'm on a mission to hack the computerized defense system of a terrorist ogranization."
>
> "I need your help. The only way to crack a quantom computer is to find a thier cryptographical hash key that is used to encrypt thier databses. "
>
> "I had to find the right machine that has the same quantum entanglemment that thier servers have.
>
> It happened to be yours!"
>
> "I need you to keep getting long correct sequences.  I've changes the code of your game to give you certain abilities  that the original game you had didn't have. like those modifiers .
> "

Source: Oded's story brief and follow-up asking for a Markdown dialogue file, 11 November 2026. Editorial additions are all draft material for review.
