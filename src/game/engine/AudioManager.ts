import type { ZoneId } from '../types';
import type { MusicSituation } from '../audio/musicContext';
import { MusicManager } from './MusicManager';

// A small procedural ambience + cue engine using WebAudio noise/oscillators.
// No external audio assets: each environment gets a distinct filtered-noise
// "bed" plus sparse tonal cues, and discoveries get a single soft chime
// rather than an arcade jingle.
//
// Music has its own bus and its own manager (MusicManager), sharing this
// audio context but mixed separately, so the soundtrack can be turned down
// or off without touching the ambience and sound effects.

interface ZoneAudioProfile {
  windGain: number;
  windCutoff: number;
  sparkleRate: number; // chance per second of a soft high tick (birds/insects)
}

const PROFILES: Record<ZoneId, ZoneAudioProfile> = {
  greenhouse: { windGain: 0.02, windCutoff: 400, sparkleRate: 0.04 },
  meadow: { windGain: 0.09, windCutoff: 1400, sparkleRate: 0.25 },
  woodland: { windGain: 0.07, windCutoff: 900, sparkleRate: 0.15 },
  creek: { windGain: 0.05, windCutoff: 2200, sparkleRate: 0.08 },
  dampForest: { windGain: 0.03, windCutoff: 500, sparkleRate: 0.05 },
  rockyClearing: { windGain: 0.11, windCutoff: 1800, sparkleRate: 0.1 },
  overgrownClearing: { windGain: 0.06, windCutoff: 1000, sparkleRate: 0.18 },
};

/**
 * Scales every zone's wind bed. Turned well down: at full level the wind
 * read as a constant hiss over everything. 0 removes it entirely.
 */
export const WIND_LEVEL = 0.2;

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private rainGain: GainNode | null = null;
  private currentZone: ZoneId = 'meadow';
  private sparkleTimer = 0;
  private enabled = true;
  private noise: AudioBuffer | null = null;
  /** October: seconds until the next owl, creak or gust may sound. */
  private octTimer = 20;
  readonly music = new MusicManager();

  /**
   * Starts audio, or wakes it again. Safe to call on every tap: browsers
   * (iOS above all) only allow sound to start from a user gesture, and iOS
   * suspends — "interrupts" — the context when the app goes to the
   * background or a call comes in, so each tap is a chance to resume.
   */
  init() {
    if (this.ctx) {
      if (this.ctx.state !== 'running' && !document.hidden) this.ctx.resume().catch(() => {});
      this.music.unlock();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    try {
      this.ctx = new Ctx();
    } catch {
      return;
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.music.attach(this.ctx, this.ctx.destination);
    this.music.unlock();
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      // In the background nothing should play or burn battery; coming back,
      // everything picks up where it was.
      if (document.hidden) {
        this.music.pause();
        this.ctx.suspend().catch(() => {});
      } else {
        this.ctx.resume().catch(() => {});
        this.music.resume();
      }
    });

    const noiseBuffer = this.makeNoiseBuffer(2);
    this.noise = noiseBuffer;

    // Wind bed
    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = noiseBuffer;
    windSrc.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 800;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    windSrc.connect(this.windFilter).connect(this.windGain).connect(this.master);
    windSrc.start();

    // Rain bed
    const rainSrc = this.ctx.createBufferSource();
    rainSrc.buffer = noiseBuffer;
    rainSrc.loop = true;
    const rainFilter = this.ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 2200;
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0;
    rainSrc.connect(rainFilter).connect(this.rainGain).connect(this.master);
    rainSrc.start();

    // No steady drone: a pure low tone that never stops reads as machinery
    // (a fridge, a server room), not bees or warm glass.
  }

  private makeNoiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  setZone(zone: ZoneId, isRaining: boolean, dt: number) {
    if (!this.ctx || !this.windGain || !this.windFilter || !this.rainGain) return;
    this.currentZone = zone;
    const p = PROFILES[zone];
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(this.enabled ? p.windGain * WIND_LEVEL : 0, t, 1.2);
    this.windFilter.frequency.setTargetAtTime(p.windCutoff, t, 1.2);
    this.rainGain.gain.setTargetAtTime(this.enabled && isRaining ? 0.06 : 0, t, 2);

    this.sparkleTimer -= dt;
    if (this.sparkleTimer <= 0) {
      this.sparkleTimer = 1;
      if (Math.random() < p.sparkleRate) this.sparkle();
    }
  }

  private sparkle() {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const freq = 900 + Math.random() * 900;
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.value = 0;
    osc.connect(g).connect(this.master);
    const t = this.ctx.currentTime;
    g.gain.linearRampToValueAtTime(0.03, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  playDiscoveryChime() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    [0, 0.09].forEach((delay, i) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === 0 ? 660 : 990;
      g.gain.value = 0;
      osc.connect(g).connect(this.master!);
      g.gain.linearRampToValueAtTime(0.05, t + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.6);
      osc.start(t + delay);
      osc.stop(t + delay + 0.65);
    });
  }

  playToolChime() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.linearRampToValueAtTime(880, t + 0.2);
    g.gain.value = 0;
    osc.connect(g).connect(this.master);
    g.gain.linearRampToValueAtTime(0.06, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.start(t);
    osc.stop(t + 0.55);
  }

  // ---- October: a few sounds, far apart, and none of them loud ----

  /** A note shaped by a gain envelope, through a lowpass so it sounds far off. */
  private tone(type: OscillatorType, from: number, to: number, at: number, len: number, peak: number, cutoff = 2000) {
    if (!this.ctx || !this.master || !this.enabled) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + len);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.08, len * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    osc.connect(f).connect(g).connect(this.master);
    osc.start(at);
    osc.stop(at + len + 0.05);
  }

  /** Filtered noise, swelling and falling: leaves, or a breath of wind. */
  private breath(type: BiquadFilterType, freq: number, q: number, len: number, peak: number) {
    if (!this.ctx || !this.master || !this.noise || !this.enabled) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + len * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + len + 0.05);
  }

  /** An owl, some way off: hoo … hoo-hoo. */
  playOwl() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone('sine', 400, 370, t, 0.42, 0.022, 900);
    this.tone('sine', 390, 360, t + 0.75, 0.22, 0.016, 900);
    this.tone('sine', 395, 355, t + 1.02, 0.45, 0.02, 900);
  }

  /** A branch, creaking, somewhere you can't see. */
  playCreak() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone('sawtooth', 120, 82, t, 0.9, 0.006, 700);
  }

  /** Leaves shifting in a bush, with nothing in it. */
  playRustle() {
    this.breath('bandpass', 3200, 1.2, 0.55, 0.05);
  }

  /** Something calling, a long way off. Twice. */
  playDistantCall() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone('triangle', 720, 520, t, 0.18, 0.01, 1100);
    this.tone('triangle', 700, 500, t + 0.32, 0.2, 0.009, 1100);
  }

  /** The air going very still, then a breath of wind. */
  playHush() {
    this.breath('lowpass', 420, 0.7, 2.6, 0.035);
  }

  /** One soft high note, far away. */
  playSoftChime() {
    if (!this.ctx) return;
    this.tone('sine', 1318, 1310, this.ctx.currentTime, 2.2, 0.018, 4000);
  }

  /**
   * October's night sounds outdoors: now and then an owl, a creak or a gust;
   * very rarely, a single note from a music box nobody's winding.
   */
  octoberAmbience(dt: number, darkness: number, outdoors: boolean) {
    if (!this.ctx || !this.enabled) return;
    this.octTimer -= dt;
    if (this.octTimer > 0) return;
    this.octTimer = 25 + Math.random() * 50;
    if (!outdoors) {
      if (darkness > 0.5 && Math.random() < 0.25) this.playCreak();
      return;
    }
    const r = Math.random();
    if (darkness > 0.5) {
      if (r < 0.4) this.playOwl();
      else if (r < 0.6) this.playCreak();
      else if (r < 0.85) this.breath('lowpass', 600, 0.6, 3.2, 0.03);
      else if (r < 0.88) this.tone('triangle', 1568, 1560, this.ctx.currentTime, 1.6, 0.008, 5000);
    } else if (r < 0.3) this.breath('lowpass', 700, 0.6, 3, 0.025);
  }

  /** Lets the music follow where Ellen is and what time it is. */
  updateMusic(situation: MusicSituation, dtSeconds: number) {
    this.music.update(situation, dtSeconds);
  }

  setEnabled(v: boolean) {
    this.enabled = v;
  }
}
