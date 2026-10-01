import type { Instrument } from './soundtrack';

// The soundtrack's instruments, synthesised with a handful of WebAudio nodes
// each: wooden and metal things struck and left to ring, a picked string, a
// breathy flute, a soft string bed. Small on purpose — a phone plays a few
// notes a second for as long as the game is open.

export interface Voice {
  ctx: BaseAudioContext;
  /** Where the note goes (the track's dry/wet split). */
  out: AudioNode;
  /** A second of noise, shared, for breath and percussion. */
  noise: AudioBuffer;
}

const freqOf = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** A sine partial with a struck envelope: quick rise, exponential ring-out. */
function partial(v: Voice, t: number, freq: number, peak: number, decay: number, type: OscillatorType = 'sine') {
  const { ctx } = v;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.004);
  g.gain.setTargetAtTime(0, t + 0.004, decay / 4);
  osc.connect(g).connect(v.out);
  osc.start(t);
  osc.stop(t + decay + 0.05);
}

function noiseBurst(v: Voice, t: number, filterType: BiquadFilterType, freq: number, q: number, peak: number, decay: number) {
  const { ctx } = v;
  const src = ctx.createBufferSource();
  src.buffer = v.noise;
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.003);
  g.gain.setTargetAtTime(0, t + 0.003, decay / 4);
  src.connect(f).connect(g).connect(v.out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + decay + 0.05);
}

export function playNote(v: Voice, instrument: Instrument, t: number, midi: number, velocity: number, length: number) {
  const f = freqOf(midi);
  const a = velocity;
  switch (instrument) {
    case 'kalimba':
      // A tine: a pure tone with a bright inharmonic ping on the attack.
      partial(v, t, f, 0.16 * a, 1.6);
      partial(v, t, f * 5.95, 0.05 * a, 0.12);
      partial(v, t, f * 2, 0.02 * a, 0.5);
      return;
    case 'marimba':
      // Wooden bar: fundamental, its tuned fourth partial, and a short knock.
      partial(v, t, f, 0.17 * a, 0.7);
      partial(v, t, f * 3.93, 0.045 * a, 0.18);
      partial(v, t, f * 9.2, 0.012 * a, 0.05);
      return;
    case 'glass':
      // Bell-like glass: sparse partials, long ring, kept very quiet.
      partial(v, t, f, 0.08 * a, 2.6);
      partial(v, t, f * 2.76, 0.03 * a, 1.4);
      partial(v, t, f * 5.4, 0.012 * a, 0.7);
      return;
    case 'piano':
      return piano(v, t, f, a);
    case 'pluck':
      return pluck(v, t, f, a, length);
    case 'bass':
      return bass(v, t, f, a, length);
    case 'flute':
      return flute(v, t, f, a, length);
    case 'strings':
      return strings(v, t, f, a, length);
    case 'wood':
      // A small wooden block or a knuckle on a pot.
      partial(v, t, freqOf(midi), 0.12 * a, 0.07);
      noiseBurst(v, t, 'bandpass', 2400, 3, 0.05 * a, 0.03);
      return;
    case 'drum': {
      // A soft hand drum: a falling thump.
      const { ctx } = v;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(70, t + 0.18);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.28 * a, t + 0.006);
      g.gain.setTargetAtTime(0, t + 0.006, 0.07);
      osc.connect(g).connect(v.out);
      osc.start(t);
      osc.stop(t + 0.4);
      noiseBurst(v, t, 'lowpass', 900, 0.7, 0.04 * a, 0.05);
      return;
    }
    case 'shaker':
      noiseBurst(v, t, 'highpass', 6500, 0.8, 0.05 * a, 0.06);
      return;
  }
}

/** Felt piano: a rounded hammer tone through a gentle low-pass, sustaining a while. */
function piano(v: Voice, t: number, f: number, a: number) {
  const { ctx } = v;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(Math.min(5000, f * 6), t);
  lp.frequency.setTargetAtTime(f * 2.5, t, 0.4);
  lp.connect(v.out);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.15 * a, t + 0.008);
  g.gain.setTargetAtTime(0, t + 0.008, 0.7);
  g.connect(lp);
  for (const [mult, type, level] of [[1, 'triangle', 1], [2.001, 'sine', 0.35]] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = f * mult;
    const og = ctx.createGain();
    og.gain.value = level;
    osc.connect(og).connect(g);
    osc.start(t);
    osc.stop(t + 3.2);
  }
}

/** A nylon-string pluck: bright for an instant, then warm. */
function pluck(v: Voice, t: number, f: number, a: number, length: number) {
  const { ctx } = v;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = f;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.5;
  lp.frequency.setValueAtTime(Math.min(6000, f * 8), t);
  lp.frequency.setTargetAtTime(f * 1.3, t, 0.08);
  const g = ctx.createGain();
  const ring = Math.max(0.4, Math.min(1.6, length));
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.09 * a, t + 0.003);
  g.gain.setTargetAtTime(0, t + 0.003, ring / 3.5);
  osc.connect(lp).connect(g).connect(v.out);
  osc.start(t);
  osc.stop(t + ring + 0.1);
}

/** A soft, round bass note — felt more than heard. */
function bass(v: Voice, t: number, f: number, a: number, length: number) {
  const { ctx } = v;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = f;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 400;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.2 * a, t + 0.02);
  g.gain.setTargetAtTime(0.12 * a, t + 0.02, 0.25);
  g.gain.setTargetAtTime(0, t + length, 0.15);
  osc.connect(lp).connect(g).connect(v.out);
  osc.start(t);
  osc.stop(t + length + 0.8);
}

/** A wooden flute: slow breath in, a little vibrato once the note settles. */
function flute(v: Voice, t: number, f: number, a: number, length: number) {
  const { ctx } = v;
  const dur = Math.max(0.25, length);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = f;
  const over = ctx.createOscillator();
  over.type = 'triangle';
  over.frequency.value = f * 2;
  const overG = ctx.createGain();
  overG.gain.value = 0.12;
  const vib = ctx.createOscillator();
  vib.frequency.value = 4.8;
  const vibG = ctx.createGain();
  vibG.gain.setValueAtTime(0, t);
  vibG.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.6, dur));
  vib.connect(vibG).connect(osc.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.11 * a, t + 0.09);
  g.gain.setValueAtTime(0.11 * a, t + dur);
  g.gain.setTargetAtTime(0, t + dur, 0.12);
  osc.connect(g);
  over.connect(overG).connect(g);
  g.connect(v.out);
  const end = t + dur + 0.6;
  for (const o of [osc, over, vib]) {
    o.start(t);
    o.stop(end);
  }
  // The breath at the start of the note.
  noiseBurst(v, t, 'bandpass', Math.min(8000, f * 3), 2, 0.02 * a, 0.12);
}

/** Soft strings: two detuned saws, heavily filtered, swelling in and out. */
function strings(v: Voice, t: number, f: number, a: number, length: number) {
  const { ctx } = v;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(1600, f * 3);
  const g = ctx.createGain();
  const attack = Math.min(1.5, length * 0.4);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.035 * a, t + attack);
  g.gain.setValueAtTime(0.035 * a, t + length);
  g.gain.setTargetAtTime(0, t + length, 0.5);
  lp.connect(g).connect(v.out);
  for (const detune of [-7, 6]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = f;
    osc.detune.value = detune;
    osc.connect(lp);
    osc.start(t);
    osc.stop(t + length + 2.5);
  }
}

/** A gently decaying stereo impulse for the music's shared reverb. */
export function makeImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      // Darker as it decays, like a room of wood and leaves rather than tile.
      const k = i / len;
      lp += (1 - 0.6 * k) * ((Math.random() * 2 - 1) - lp);
      data[i] = lp * Math.pow(1 - k, 3);
    }
  }
  return buf;
}

export function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
