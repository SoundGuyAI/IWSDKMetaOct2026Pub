# Cypher encouragement lines (voice assets)

Four short Cypher lines for the stage where the player is working toward the
streak-10 backstory and has not heard it yet. Requested by Oded 2026-11-18 11:44
(backlog item 119), wording shown to him and approved with "yes. you can
generate the voices and prep them in a PR already" (11:47).

These are assets only. They are NOT wired into gameplay: when and how often
Cypher says them ("every two lines") is still undecided, so nothing plays them.

| id | text |
| --- | --- |
| `enc1` | Good. They don't suspect anything. |
| `enc2` | Keep going. I'm still here. |
| `enc3` | Steady. We're getting closer. |
| `enc4` | That's it. Keep the rhythm. |

## Files

`public/audio/speech/cypher-encourage/<set>/enc1.mp3` ... `enc4.mp3`

| Set folder | Cypher voice | Plays when |
| --- | --- | --- |
| `female` | Kore | narrator is male (Puck) |
| `male` | Algenib | narrator is female (Laomedeia) |

## How they were made

Per `docs/CYPHER_VOICE_RECIPE.md`: one continuous read per voice (four lines in
order with long pauses between them), split at the pauses, then the recipe's
radio chain, static bed (seed 23), per-clip level repair and a single 80 kbps
24 kHz mono MP3 encode.

Deviations from the recipe, stated plainly:
- The raw reads used a paraphrased version of the recipe's direction sentence,
  not the verbatim one.
- Splitting used silence gaps, not faster-whisper word timestamps (not
  installed). Each clip's transcript was checked with an audio transcript
  reader and matches its line.
- Final true-peak limiter ceiling is 0.78 (about -2 dBFS) so the MP3 stays at
  or under -1.5 dBTP.

Measured after encode: integrated loudness -18.3 to -18.8 LUFS, true peak -2.1
to -2.6 dBTP, 24 kHz mono, 80 kbps.

The acceptance test in the recipe is an A/B listen against an old approved
Cypher clip. That has NOT been done: no one has listened to these clips.
