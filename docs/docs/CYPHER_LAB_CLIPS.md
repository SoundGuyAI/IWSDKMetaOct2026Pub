# Cypher gesture-lab voice clips

Clip specification for the two yes/no gesture research labs (backlog item 52;
nod lab and thumbs lab PRs). Both labs speak through the same clip set, so the
clips are produced once and shared.

## Voice casting (settled with Oded's Act 1 direction)

Cypher plays opposite the selected narrator gender, same as the story clips:

| Set folder | Cypher voice | When |
| --- | --- | --- |
| `cypher-lab/female` | **Kore** | Narrator is male (Puck) |
| `cypher-lab/male` | **Algenib** | Narrator is female (Laomedeia) |

Delivery direction for every line: a careful intruder on a hidden one-way
radio link. Low, controlled, close-mic, unhurried, precise consonants, slight
warmth toward the player. No shouting, no robot effect in the raw take; radio
static/clicks are separate story effects, not part of these reads.

## Files

Target path per line: `public/audio/speech/cypher-lab/<set>/<id>.mp3`.
The labs probe for the files at runtime and run a silent text-preview mode
until they exist; no substitute voice is shipped.

Generation/publish route: the established chunk + `decode-voice-clips`
workflow (see the story clips). The tar for lab clips must extract into
`public/audio/speech/cypher-lab/<set>/`.

## Lines (13 per set, same wording both sets)

| id | text |
| --- | --- |
| `yes` | Yes. |
| `no` | No. |
| `q2` | Good. I need to know the coast is clear. Is anyone else in the room with you? |
| `q2-yes` | Then keep your answers small. No sudden moves. I'll keep this short. |
| `q2-no` | Good. Alone is safe. This channel stays invisible as long as we are careful. |
| `q3` | Next window, I'll tell you why your machine is the one I needed. Will you keep helping me? |
| `q3-yes` | Yes. I knew I picked the right person. Watch for my signal between patterns. |
| `q3-no` | No. I hear you. But the connection is already open. I'll ask again next window. |
| `end` | That's all this window allows. Keep playing. Cypher out. |
| `intro-nod` | Connection check. This channel only goes one way. I can see you through the link, but I cannot hear you. So nod your head for yes. Shake it for no. First question. Can you hear me? |
| `retry-nod` | No? Then the channel is still weak. Let me boost the signal. Try again. Can you hear me now? |
| `intro-thumbs` | Connection check. This channel only goes one way. I can see you through the link, but I cannot hear you. So thumb up for yes. Thumb down for no. First question. Can you hear me? |
| `retry-thumbs` | No? Then the channel is still weak. Let me boost the signal. Show me again. Thumb up if you can hear me now. |

## Canon constraints (from the reviewed Act 1 draft)

- The game's AI cannot hear or detect Cypher. No lab line may claim the game
  is listening or watching; the one-way link (Cypher sees the player, cannot
  hear them) is the only stated reason for gesture answers.
- Lines stay inside Cypher's established Act 1 voice and motives.
