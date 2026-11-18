import { classify, parseCommand, speechError } from './logic.js';

// Recognition front ends for the Voice Lab. The local method runs the vendored
// TensorFlow.js speech-commands model entirely on-device, loading the 18-word
// BROWSER_FFT model from this same origin. The browser methods wrap the Web
// Speech API for comparison. Only one method listens at a time.
export class Receiver {
  constructor(onWord, onStatus, onError, threshold) {
    Object.assign(this, { onWord, onStatus, onError, threshold });
    this.active = false;
    this.prepared = null;
    this.local = null;
    this.recognition = null;
    this.generation = 0;
    this.backend = null;
  }

  async prepare(method) {
    this.prepared = null;
    if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw Error('This page needs HTTPS (or localhost) and a browser with microphone access.');
    }
    if (method === 'local') {
      this.onStatus('Loading local word model...');
      const tf = globalThis.tf;
      const speechCommands = globalThis.speechCommands;
      if (!tf || !speechCommands) throw Error('Vendored TensorFlow scripts did not load. Check the network and reload.');
      await tf.ready();
      this.backend = tf.getBackend();
      // speech-commands 0.5.4 rejects relative URLs, so resolve the same-origin
      // model files against the page URL before handing them over.
      this.local ||= speechCommands.create(
        'BROWSER_FFT',
        null,
        new URL('./model/model.json', globalThis.location.href).href,
        new URL('./model/metadata.json', globalThis.location.href).href,
      );
      await this.local.ensureModelLoaded();
    } else {
      const API = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
      if (!API) throw Error('Browser speech recognition is not available here. Try the local model.');
      if (method === 'device') {
        if (!('processLocally' in API.prototype) || typeof API.available !== 'function') {
          throw Error('This browser does not expose on-device speech recognition.');
        }
        const state = await API.available({ langs: ['en-US'], processLocally: true });
        if (state !== 'available') throw Error(`On-device English is ${state}. No pack was installed. Try another method.`);
      }
    }
    this.prepared = method;
    this.onStatus('Receiver ready. On-device testing still required.');
  }

  async start(method) {
    if (this.prepared !== method) throw Error('Prepare this receiver first.');
    this.active = true;
    const generation = ++this.generation;
    if (method === 'local') {
      try {
        await this.local.listen(
          (result) => {
            if (!this.active || generation !== this.generation) return;
            const data = classify(this.local.wordLabels(), Array.from(result.scores), this.threshold());
            this.onWord(data.word, data);
          },
          { probabilityThreshold: 0, invokeCallbackOnNoiseAndUnknown: true, overlapFactor: 0.5 },
        );
        if (!this.active || generation !== this.generation) {
          if (this.local.isListening()) await this.local.stopListening();
        }
      } catch (error) {
        if (generation === this.generation) this.active = false;
        throw error;
      }
    }
  }

  listenWindow() {
    if (!this.active || this.prepared === 'local') return;
    const API = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    const recognition = new API();
    this.recognition = recognition;
    const generation = this.generation;
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    if (this.prepared === 'device') recognition.processLocally = true;
    recognition.onresult = (event) => {
      if (!this.active || generation !== this.generation || this.recognition !== recognition) return;
      const item = event.results[event.resultIndex];
      if (item?.isFinal) {
        const transcript = item[0].transcript;
        this.onWord(parseCommand(transcript), { top: transcript, score: item[0].confidence });
      }
    };
    recognition.onerror = (event) => {
      if (this.active && generation === this.generation && this.recognition === recognition && event.error !== 'aborted') {
        this.onError(speechError(event.error));
      }
    };
    recognition.onend = () => {
      if (this.active && generation === this.generation && this.recognition === recognition) {
        this.recognition = null;
        this.onStatus('Browser listening ended. No automatic answer.');
      }
    };
    try {
      recognition.start();
    } catch (error) {
      this.onError(`Microphone start failed: ${error.message}.`);
    }
  }

  closeWindow() {
    const recognition = this.recognition;
    this.recognition = null;
    recognition?.abort();
  }

  async stop() {
    this.active = false;
    ++this.generation;
    this.closeWindow();
    if (this.local?.isListening()) await this.local.stopListening();
  }
}
