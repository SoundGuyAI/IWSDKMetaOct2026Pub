# Cypher voice recipe (approved)

Approved by Oded on 2026-11-14 after a direct A/B listen against the original
2026-11-12 clips ("These are good"). This is the only approved way to make or
change a Cypher voice clip. Two Nov 14 batches that deviated from it were
rejected by ear; do not improvise the chain.

## Casting

- Cypher female: **Kore** (plays when the selected narrator is male, Puck).
- Cypher male: **Algenib** (plays when the selected narrator is female,
  Laomedeia).
- Cypher is always the opposite gender of the selected narrator and never one
  of the narrator voices.

## Generation

- Generate **one continuous performance per voice** containing every line in
  the manifest's split order, then align and split at word timestamps
  (faster-whisper) and QC each clip's transcript against the verbatim line.
- Do **not** generate lines as separate one-line clips. Separate generations
  drift apart in read character; the rejected Nov 14 batch was made that way.
- Direction, verbatim, as the style instructions:

  > A careful intruder on a hidden one-way radio link: low, controlled,
  > close-mic, unhurried, precise consonants, slight warmth toward the player.
  > No shouting. No radio static or robot effect in the raw read; effects are
  > added later.

- Keep the untouched raw masters alongside the processed clips.

## Radio processing (exact chain)

Voice chain (ffmpeg), then resample to 24 kHz mono:

```
highpass=f=300,lowpass=f=3300,acompressor=threshold=-20dB:ratio=3:attack=8:release=120,acrusher=level_in=1:level_out=0.9:bits=12:mode=log:aa=0.4,volume=1.5
```

Static bed, deterministic (same seed reproduces it):

```
anoisesrc=color=pink:duration=600:amplitude=0.32:seed=23:sample_rate=44100
  -> highpass=f=450,lowpass=f=3600,tremolo=f=6:d=0.25 (stereo)
```

Cut a 20 s loop with `afade=t=in:st=0:d=0.3,afade=t=out:st=19:d=1`
(`static_bed_loop20s.wav`).

Mix per clip: bed trimmed to the clip length, `afade` in 0.15 s and out over
the last 0.5 s, `volume=0.5`, 24 kHz mono; `amix=inputs=2:normalize=0` with
the voice; `alimiter=limit=0.95`.

Level repair per clip: measure integrated loudness, apply **static gain** to
reach about -18 LUFS (approved band -17 to -19), keep true peak at or below
-1.5 dBFS, `alimiter=limit=0.85:level=false` as safety only. Encode once:
MP3, 24 kHz mono, 80 kbps (libmp3lame). Verify every clip after encoding
(loudness, true peak, transcript). Never blind-apply one uniform gain to a
set.

## Narrator lines are not Cypher

Narrators stay clean: `highpass=f=90`,
`acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120`, `volume=1.3`.
No radio EQ, no crusher, no static bed.

## Fingerprint of the approved sound (measured on the shipped clips)

- Integrated loudness about -18.7 LUFS, true peak about -1.5 dBFS.
- Continuous static bed audible about 15 dB under the voice (quiet floor
  about -33 dBFS), with light crackle from the 12-bit crusher.
- Dark, band-limited voice: about 0.7% of energy above 3.4 kHz.

## Pitfalls (each of these actually happened and was rejected)

- Shipping the raw read or a clean chain: the radio character **is** the
  chain plus the bed. Notes that say "effects are separate" describe the raw
  reads only; the shipped clips always have the bed baked in.
- Bed too quiet: about 13 dB under the approved level reads as "no radio".
- Double MP3 transcodes (48k then 32k) and `loudnorm` to -20: measurable and
  audible quality loss. Single 80 kbps encode from the processed master.
- Per-line separate generations: inconsistent reads across lines.
- Trusting matching parameters or transcripts instead of an A/B listen
  against an old approved clip. The ear check against the old clips is the
  acceptance test.

## Provenance

Recovered 2026-11-14 from the original generation session (2026-11-11 23:21
and 2026-11-12 00:52 / 01:35 IST) and verified against the shipped clips in
`public/audio/speech/cypher-lab/`. Pilot clip (new desktop intro read through
this exact chain) approved by Oded 2026-11-14.
