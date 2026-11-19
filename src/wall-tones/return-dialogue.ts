/** Reviewed returning-player lines. Narrator clean; Cypher uses the radio recipe. */
export const RETURN_DIALOGUE = {
  "N-R01": {
    "speaker": "narrator",
    "text": "Welcome back to Wall Tones."
  },
  "N-R02": {
    "speaker": "narrator",
    "text": "Would you like a reminder of how to play?"
  },
  "N-R05": {
    "speaker": "narrator",
    "text": "Would you like a reminder of how the store works?"
  },
  "N-R06": {
    "speaker": "narrator",
    "text": "Would you like a reminder of how achievements work?"
  },
  "N-R04": {
    "speaker": "narrator",
    "text": "All right. Pick up where you left off."
  },
  "C-R01": {
    "speaker": "cypher",
    "text": "You came back. Good. Keep the pattern going. I need a stronger connection."
  },
  "C-R02": {
    "speaker": "cypher",
    "text": "The channel is still open. Keep building your streak. There is more I need to tell you."
  },
  "C-R03": {
    "speaker": "cypher",
    "text": "You know who I am now. Keep the pattern going. We need the next window."
  },
  "C-R04": {
    "speaker": "cypher",
    "text": "The Rifts are still open. Gather energy from the notes, then use it to seal them."
  },
  "C-R05": {
    "speaker": "cypher",
    "text": "The Rifts are sealed. Keep the pattern going. I still have more to tell you."
  },
  "C-R06": {
    "speaker": "cypher",
    "text": "You kept the channel open. For now, keep playing. I will be here."
  }
} as const;
export type ReturnLineId = keyof typeof RETURN_DIALOGUE;
