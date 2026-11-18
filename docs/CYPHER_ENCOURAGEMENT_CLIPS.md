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
order with long pauses between them), generated with the recipe's direction
sentence word for word, split at the pauses, then the recipe's radio chain,
static bed (seed 23), per-clip level repair and a single 80 kbps 24 kHz mono
MP3 encode. This is the second batch. The first batch used a paraphrased
direction and was replaced.

Deviations from the recipe, stated plainly:
- Splitting used silence gaps, not faster-whisper word timestamps (not
  installed). Each clip's transcript was checked with an audio transcript
  reader and matches its line.
- The recipe's safety limiter ceiling is 0.85. The final MP3 true peak must be
  at or under -1.5 dBTP, so the limiter ceiling is 0.82 on seven clips and 0.70
  on `male/enc2`. The recipe's own true-peak rule wins over its safety value.

Measured after encode: integrated loudness -18.1 to -18.4 LUFS (band -17 to
-19), true peak -1.8 to -2.6 dBTP, 24 kHz mono, 80 kbps.

Measured brightness (share of energy above 3.4 kHz; recipe fingerprint is about
0.7%, approved clips measured by the same method):

| Set | These clips | Approved lab clips | Approved story clips |
| --- | --- | --- | --- |
| female (Kore) | 1.7 to 10.1% (median 6.5) | 0.3 to 6.4% (median 2.3) | 2.6 to 9.9% (median 4.1) |
| male (Algenib) | 13.0 to 17.2% (median 15.4) | 0.5 to 20.3% (median 5.7) | 3.7 to 20.0% (median 9.5) |

The female clips are inside the approved range, with one clip just above it.
The male clips are inside the approved range but at its bright end. These are
measurements, not an acceptance result.

The acceptance test in the recipe is an A/B listen against an old approved
Cypher clip. That has NOT been done: no one has listened to these clips.
