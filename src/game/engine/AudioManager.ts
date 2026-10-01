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

  /** Lets the music follow where Ellen is and what time it is. */
  updateMusic(situation: MusicSituation, dtSeconds: number) {
    this.music.update(situation, dtSeconds);
  }

  setEnabled(v: boolean) {
    this.enabled = v;
  }
}
