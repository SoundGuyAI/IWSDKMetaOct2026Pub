// Pure decision logic for the Wall Tones Voice Lab workbench.
// Mirrors the proven VoiceDriver lab rules: the model's 18 words are narrowed
// to four accepted commands, and a word counts only when it is the model's top
// class at or above the acceptance threshold.

export const COMMANDS = ['yes', 'no', 'left', 'right'];

export function parseCommand(text) {
  const word = String(text).toLowerCase().trim().replace(/[.!?,]+$/u, '');
  return COMMANDS.includes(word) ? word : null;
}

export function classify(labels, scores, threshold = 0.8) {
  if (!labels.length || labels.length !== scores.length || scores.some((x) => !Number.isFinite(x))) {
    return { word: null, top: 'invalid', score: 0 };
  }
  const index = scores.indexOf(Math.max(...scores));
  const accepted = scores[index] >= threshold && COMMANDS.includes(labels[index]);
  return { word: accepted ? labels[index] : null, top: labels[index], score: scores[index] };
}

export function speechError(code) {
  const messages = {
    'not-allowed': 'Microphone or speech permission denied. Check the browser permission prompt and site settings.',
    'service-not-allowed': 'This browser speech service is unavailable or blocked.',
    'audio-capture': 'No microphone is available.',
    network: 'Browser speech network service failed.',
    'language-not-supported': 'English recognition is not installed or supported.',
    'no-speech': 'No speech detected. No answer was chosen.',
  };
  return messages[code] || `Speech recognition stopped (${code}).`;
}
