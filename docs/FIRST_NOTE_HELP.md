# First-note coaching

Session-only coaching counts wrong answers at the first note of a pattern across
Retry and New Run. The third such miss replaces that occasion's generic wrong
line with the guidance recording. After the fourth miss, subsequent demonstrations
speak the actual first pad's color immediately after that note plays, before input
opens. A human correct first note clears the struggle. Mistakes later in a pattern
and ignored demonstration presses do not count. This applies to one-note and
longer patterns without changing either pattern or the existing retry cost.

The four real palette IDs map to green, red, blue and yellow. Both narrator casts
have separate guidance and color clips. A demonstration captures its narrator
before playback. The ordinary speech queue controls mute, captions and Skip;
Skip must not strand the round. Coaching is repeatable feedback and never writes
tutorial-completion memory or persistent training state. Scores, inventory,
achievements and story are untouched by the coaching state.

The correct-pad arrow is a later backlog item only, not implemented here.

## Checks

- Unit thresholds, later-note exclusions, reset-on-correct, palette mapping,
  session-only state, captured narrator, repeatability, captions, mute and cancel.
- Natural audio guidance and the dynamic color cue in both narrator casts,
  fourth-miss timing, input remaining gated until the cue ends, and clearing on a
  human match. Fixtures seed completed tutorial memory and retry inventory;
  they do not represent first-time onboarding or hardware acceptance.
- A real two-note pattern retains its sequence through assisted playback and
  period-key Skip, and a later retry still gets help until a correct first note.
- All ten new MP3s fetch and decode as real audio bytes.
- Full local case roster before publication; the unchanged long real-pointer
  journey is the sole existing CI-only local exception. Full CI still required.
