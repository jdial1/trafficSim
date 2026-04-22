export const vibrate = (pattern: number | number[]) => {
  if (typeof window !== 'undefined' && 'navigator' in window && navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      // Ignore errors if vibrate isn't allowed or throws
    }
  }
};

let audioCtx: AudioContext | null = null;
const initAudio = () => {
  if (!audioCtx && typeof window !== 'undefined' && window.AudioContext) {
    audioCtx = new window.AudioContext();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

export const playMechanicalClick = () => {
  return; // Audio disabled for now
  const ctx = initAudio();
  if (!ctx) return;

  const t = ctx.currentTime;
  
  // Oscillator for the "clack" body
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.05);

  // Noise buffer for the harsh texture
  const bufferSize = ctx.sampleRate * 0.05; // 50ms of noise
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  
  // Bandpass filter to make it sound mechanical/metallic
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1000;
  filter.Q.value = 1;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.4, t);
  gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);

  osc.connect(gain);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(t);
  osc.stop(t + 0.05);
  noise.start(t);
  noise.stop(t + 0.05);
};

export const hapticTap = () => {
  playMechanicalClick();
  vibrate(10);
};
export const hapticDrag = () => vibrate(5); // tiny bumps for dragging
export const hapticHeavy = () => {
  playMechanicalClick();
  vibrate([30, 50, 30]);
};
export const hapticError = () => {
  vibrate([80, 50, 80]); // compilation error
};
export const hapticCrash = () => vibrate([50, 100, 50, 100, 200, 50, 300]); // harsh buzz

export const playThunk = () => {
  return; // Audio disabled for now
  const ctx = initAudio();
  if (!ctx) return;

  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(80, t);
  osc.frequency.exponentialRampToValueAtTime(20, t + 0.2);

  gain.gain.setValueAtTime(0.6, t);
  gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(t);
  osc.stop(t + 0.25);
};

let humGain: GainNode | null = null;
let humOsc1: OscillatorNode | null = null;
let humOsc2: OscillatorNode | null = null;

export const startAtmosphericHum = () => {
  return; // Audio disabled for now
  const ctx = initAudio();
  if (!ctx || humGain) return;

  humGain = ctx.createGain();
  humGain.gain.value = 0.04; // Very low volume

  humOsc1 = ctx.createOscillator();
  humOsc1.type = 'sine';
  humOsc1.frequency.value = 50; // Low transformer hum (50Hz)

  humOsc2 = ctx.createOscillator();
  humOsc2.type = 'sine';
  humOsc2.frequency.value = 50.5; // Slight detune for phasing

  humOsc1.connect(humGain);
  humOsc2.connect(humGain);
  humGain.connect(ctx.destination);

  humOsc1.start();
  humOsc2.start();
};

export const stopAtmosphericHum = () => {
  if (humOsc1) {
    humOsc1.stop();
    humOsc1.disconnect();
    humOsc1 = null;
  }
  if (humOsc2) {
    humOsc2.stop();
    humOsc2.disconnect();
    humOsc2 = null;
  }
  if (humGain) {
    humGain.disconnect();
    humGain = null;
  }
};
