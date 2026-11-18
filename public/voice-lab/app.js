import { Receiver } from './receiver.js';

const $ = (id) => document.getElementById(id);
let listening = false;
let timer = null;

const receiver = new Receiver(onWord, setState, fail, () => Number($('threshold').value));

const privacyNotes = {
  local: 'Local inference on this device. Initial model download needs internet. No audio upload by this page.',
  browser: 'Browser speech may send audio to its vendor for processing. This page does not store audio or send it to our servers.',
  device: 'Experimental browser on-device speech. Requires an already-installed English pack. Never silently falls back to a server.',
};

function setState(text) {
  $('state').textContent = text;
}

function log(text) {
  const li = document.createElement('li');
  li.textContent = `${new Date().toLocaleTimeString()} · ${text}`;
  $('log').prepend(li);
  while ($('log').children.length > 30) $('log').lastChild.remove();
}

function controls() {
  $('prepare').disabled = listening;
  $('listen').disabled = listening || receiver.prepared !== $('engine').value;
  $('stop').disabled = !listening;
  $('engine').disabled = listening;
}

function capability() {
  const API = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  $('privacy').textContent = privacyNotes[$('engine').value];
  const backend = receiver.backend ? ` TensorFlow backend: ${receiver.backend}.` : '';
  $('capability').textContent =
    `Secure context: ${isSecureContext ? 'yes' : 'no'}. ` +
    `Microphone API: ${navigator.mediaDevices?.getUserMedia ? 'present' : 'absent'}. ` +
    `Browser speech: ${API ? 'present (not a reliability guarantee)' : 'absent'}.` + backend;
}

async function prepare() {
  try {
    $('prepare').disabled = true;
    await receiver.prepare($('engine').value);
    capability();
    setState(receiver.backend ? `Receiver ready (backend: ${receiver.backend})` : 'Receiver ready');
    $('result').textContent = 'Receiver ready. Listen, then say yes, no, left or right.';
  } catch (error) {
    setState('Receiver not ready');
    $('result').textContent = error.message;
    log(error.message);
  } finally {
    controls();
  }
}

async function stop(message = 'Stopped.') {
  listening = false;
  clearTimeout(timer);
  timer = null;
  await receiver.stop();
  setState(message);
  controls();
}

function fail(message) {
  log(message);
  $('result').textContent = message;
  void stop('Stopped after an error.');
}

function onWord(word, data) {
  if (!listening) return;
  const verdict = word ? `accepted ${word}` : 'rejected';
  $('result').textContent = `Top: ${data.top} · score ${Number(data.score).toFixed(2)} · ${verdict}`;
  log(verdict === 'rejected' ? `Rejected ${data.top} (${Number(data.score).toFixed(2)})` : `Accepted ${word} (${Number(data.score).toFixed(2)})`);
}

async function listen() {
  if (receiver.prepared !== $('engine').value) {
    $('result').textContent = 'Prepare the selected receiver first.';
    return;
  }
  listening = true;
  controls();
  setState('Requesting microphone...');
  $('result').textContent = 'Starting receiver... Allow microphone access if asked.';
  timer = setTimeout(() => fail('Microphone did not start within 15 seconds. Check browser permissions, then try again.'), 15000);
  const method = $('engine').value;
  try {
    const starting = receiver.start(method);
    if (method !== 'local') receiver.listenWindow();
    await starting;
    if (!listening) return;
    clearTimeout(timer);
    setState('Listening');
    $('result').textContent = 'Listening. Say yes, no, left or right.';
    timer = setTimeout(() => {
      log('12 seconds up. Nothing was chosen automatically.');
      void stop('Workbench finished');
      $('result').textContent = $('result').textContent || 'No speech accepted.';
    }, 12000);
  } catch (error) {
    fail(error.message);
  }
}

$('prepare').onclick = () => void prepare();
$('listen').onclick = () => void listen();
$('stop').onclick = () => void stop();
$('clear').onclick = () => {
  $('log').replaceChildren();
  $('result').textContent = 'No results yet.';
};
$('engine').onchange = () => {
  capability();
  controls();
};
$('threshold').oninput = () => {
  $('thresholdValue').value = Number($('threshold').value).toFixed(2);
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden && listening) void stop('Paused: page left the foreground.');
});
window.addEventListener('pagehide', () => void stop());

capability();
controls();
