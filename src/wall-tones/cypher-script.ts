/** Act 1 v0.2 words only. No automatic gates, scene progress or rewards.
 * Rift encounter (owner-approved words, Nov 18): the old C16 close instruction
 * is replaced by the C16A-C portal trio, N04 by the narrator's unexplained
 * apology, C20-C23 are the streak-17/18 reason beats, and C24 is the
 * third-seal acknowledgement played by the encounter, not a window. */
export type CypherLineId = 'C01' | 'C02' | 'C03' | 'C04' | 'N01' | 'C05' | 'C06' | 'C07' | 'C08' | 'C09' | 'C10' | 'C11' | 'C12' | 'C13' | 'C14' | 'N02' | 'N03' | 'C15' | 'C16A' | 'C16B' | 'C16C' | 'N04' | 'N05' | 'C20' | 'C21' | 'C22' | 'C23' | 'C17' | 'C18' | 'C19' | 'N06' | 'N07' | 'C24';
export type CypherSpeaker = 'cypher' | 'narrator';
export interface CypherScriptLine { readonly id: CypherLineId; readonly speaker: CypherSpeaker; readonly text: string; }
export const CYPHER_ACT_ONE: readonly CypherScriptLine[] = [
  {
    "id": "C01",
    "speaker": "cypher",
    "text": "Connection... established."
  },
  {
    "id": "C02",
    "speaker": "cypher",
    "text": "Can you hear me? You're doing great. I'll explain in the next communication window."
  },
  {
    "id": "C03",
    "speaker": "cypher",
    "text": "Yes. Keep playing. They don't suspect anything. Good."
  },
  {
    "id": "C04",
    "speaker": "cypher",
    "text": "Get a streak of ten or above, so I can send a longer message."
  },
  {
    "id": "N01",
    "speaker": "narrator",
    "text": "Sorry about that. There seems to be a small glitch. Keep playing while I check it."
  },
  {
    "id": "C05",
    "speaker": "cypher",
    "text": "My codename is Cypher. I'm on a mission to hack the computerized defense system of a terrorist organization."
  },
  {
    "id": "C06",
    "speaker": "cypher",
    "text": "I need your help. The only way to crack their quantum computer is to find their cryptographic hash key. It's used to encrypt their databases."
  },
  {
    "id": "C07",
    "speaker": "cypher",
    "text": "I had to find the right machine, one with the same quantum entanglement as their servers."
  },
  {
    "id": "C08",
    "speaker": "cypher",
    "text": "It happened to be yours!"
  },
  {
    "id": "C09",
    "speaker": "cypher",
    "text": "I need you to keep getting long, correct sequences. I've changed the code of your game to give you abilities the original game didn't have. Like those modifiers."
  },
  {
    "id": "C10",
    "speaker": "cypher",
    "text": "One more thing. The game's AI can't hear me."
  },
  {
    "id": "C11",
    "speaker": "cypher",
    "text": "I bypassed its security protocols. It can't detect this channel. As far as it knows, you're just playing."
  },
  {
    "id": "C12",
    "speaker": "cypher",
    "text": "It might notice a few glitches. Don't worry about those. Let it run its checks."
  },
  {
    "id": "C13",
    "speaker": "cypher",
    "text": "Just keep following the patterns. That's how we keep the connection open."
  },
  {
    "id": "C14",
    "speaker": "cypher",
    "text": "The first lock is open. The next one needs a longer sequence. Get a streak of fifteen and I can send more."
  },
  {
    "id": "N02",
    "speaker": "narrator",
    "text": "I've found a timing fault. Nothing you did. A clean streak of fifteen should give me enough data to fix it."
  },
  {
    "id": "N03",
    "speaker": "narrator",
    "text": "Keep going. I'll take care of the glitches."
  },
  {
    "id": "C15",
    "speaker": "cypher",
    "text": "The link is feeding something back. You might see a line of light."
  },
  {
    "id": "C16A",
    "speaker": "cypher",
    "text": "That light is a portal. The link is tearing them open."
  },
  {
    "id": "C16B",
    "speaker": "cypher",
    "text": "Your notes carry energy now. Aim it at a portal and hold to close it."
  },
  {
    "id": "C16C",
    "speaker": "cypher",
    "text": "More will follow. Close them all - I'll hold the link."
  },
  {
    "id": "N04",
    "speaker": "narrator",
    "text": "I'm sorry. I don't know what those lights were. My checks can't explain them."
  },
  {
    "id": "N05",
    "speaker": "narrator",
    "text": "Your progress is safe. Let's continue."
  },
  {
    "id": "C20",
    "speaker": "cypher",
    "text": "About those portals. That wasn't a glitch - their system is hunting."
  },
  {
    "id": "C21",
    "speaker": "cypher",
    "text": "It's scanning for this link. The portals are how it tries to tear in."
  },
  {
    "id": "C22",
    "speaker": "cypher",
    "text": "If it finds this channel, it will destroy the link."
  },
  {
    "id": "C23",
    "speaker": "cypher",
    "text": "Every portal you close keeps us hidden a little longer."
  },
  {
    "id": "C17",
    "speaker": "cypher",
    "text": "That worked. I can hold the channel longer now."
  },
  {
    "id": "C18",
    "speaker": "cypher",
    "text": "Their system is changing the lock faster than I expected. I need a longer pattern to keep up."
  },
  {
    "id": "C19",
    "speaker": "cypher",
    "text": "Get a streak of twenty. I'll use the next window to explain what happens next."
  },
  {
    "id": "N06",
    "speaker": "narrator",
    "text": "The last repair helped, but I'm still seeing errors. Keep aiming for twenty. A longer clean sequence should let me finish the check."
  },
  {
    "id": "N07",
    "speaker": "narrator",
    "text": "You're doing fine. This is a problem with the game, not with you."
  },
  {
    "id": "C24",
    "speaker": "cypher",
    "text": "That's all three. The link is stable again. Thank you."
  }
] as const;

export function findCypherLine(id: CypherLineId): CypherScriptLine {
  const line = CYPHER_ACT_ONE.find(line => line.id === id);
  if (!line) throw new Error(`Unknown Cypher story line: ${id}`);
  return line;
}
