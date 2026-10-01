import { arrangePhrase, motifStinger, phraseLengthBeats, secondsPerBeat, STINGER_TEMPO } from '../audio/arranger';
import { makeImpulse, makeNoise, playNote, type Voice } from '../audio/instruments';
import { MusicDirector, musicStateFor, type MusicSituation } from '../audio/musicContext';
import { findTrack, TRACK_FOR_STATE, TRACKS, type MusicState, type TrackDef } from '../audio/soundtrack';

// The music service. It owns the music bus (separate from the ambience and
// sound effects in AudioManager), follows the game's musical state, and
// crossfades between tracks — one track at a time, plus the one fading out.
//
// A track plays its recorded file when it has one, and its live arrangement
// otherwise (or if the file won't load or won't play). Music preferences —
// volume and on/off — are saved on this device, apart from the game save.

export const MUSIC_PREFS_KEY = 'foxtail-music';

export interface MusicPrefs {
  /** 0–1, as the slider shows it. */
  volume: number;
  muted: boolean;
}

export const DEFAULT_MUSIC_PREFS: MusicPrefs = { volume: 0.6, muted: false };

export function loadMusicPrefs(): MusicPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(MUSIC_PREFS_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_MUSIC_PREFS };
    const volume = typeof raw.volume === 'number' && Number.isFinite(raw.volume) ? clamp01(raw.volume) : DEFAULT_MUSIC_PREFS.volume;
    return { volume, muted: raw.muted === true };
  } catch {
    return { ...DEFAULT_MUSIC_PREFS };
  }
}

export function saveMusicPrefs(p: MusicPrefs) {
  try {
    localStorage.setItem(MUSIC_PREFS_KEY, JSON.stringify(p));
  } catch {
    // Private browsing or storage full: the setting just won't stick.
  }
}

/**
 * The whole music bus at full volume. Music sits under the ambience and the
 * sound effects, never on top of them.
 */
export const MUSIC_HEADROOM = 0.5;
/** Perceptual volume curve: the slider's middle sounds like the middle. */
export function busGainFor(p: MusicPrefs): number {
  return p.muted ? 0 : MUSIC_HEADROOM * p.volume * p.volume;
}

const CROSSFADE_SECONDS = 4;
/** Leaving the title screen, the theme lingers into the game. */
const FROM_MENU_SECONDS = 6;
/** How long the theme plays before handing over: long enough for the motif. */
const THEME_OPENING_SECONDS = 5.5;
const LOOKAHEAD_SECONDS = 1.5;
const TICK_MS = 250;
/** A discovery stinger plays at most this often. */
export const STINGER_COOLDOWN_SECONDS = 90;
/** A track picked up again within this long resumes where it was. */
const RESUME_WITHIN_MS = 10 * 60 * 1000;
/** How long a recording gets to start before the arrangement takes over. */
const FILE_START_TIMEOUT_MS = 5000;

// A few milliseconds of silence, played once in a tap so iOS lets these
// audio elements start later without one.
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

interface Deck {
  el: HTMLAudioElement;
  gain: GainNode;
  unlocked: boolean;
  owner: Playing | null;
}

interface Playing {
  track: TrackDef;
  fader: GainNode;
  wet: GainNode;
  mode: 'arranged' | 'loading' | 'file';
  phrase: number;
  nextTime: number;
  deck: Deck | null;
  /** Set when fading out: nothing new is scheduled past this time. */
  stopAt: number | null;
  /** Audio-clock time the track started. */
  startedAt: number;
}

export class MusicManager {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private duck: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private noise: AudioBuffer | null = null;
  private current: Playing | null = null;
  private outgoing: Playing[] = [];
  private decks: Deck[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private prefs: MusicPrefs = loadMusicPrefs();
  private director = new MusicDirector();
  /** The track the game wants, even before audio is allowed to start. */
  private wanted: TrackDef = TRACK_FOR_STATE.menu;
  private failed = new Set<string>();
  private positions = new Map<string, { phrase: number; fileTime: number; at: number }>();
  private lastStingerAt = -Infinity;
  private hidden = false;
  private preloaded = new Map<string, HTMLAudioElement>();
  /** A crossfade waiting for the title theme to finish its opening. */
  private pendingSwitch: { id: string; seconds: number; at: number } | null = null;

  /** Notified whenever what's playing or the preferences change (for the settings popover). */
  onChange: (() => void) | null = null;

  /** Connects the music bus to an audio context; called once audio is allowed. */
  attach(ctx: AudioContext, destination: AudioNode) {
    if (this.ctx) return;
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = busGainFor(this.prefs);
    this.bus.connect(destination);
    this.duck = ctx.createGain();
    this.duck.connect(this.bus);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx, 2.6);
    this.reverb.connect(this.duck);
    this.noise = makeNoise(ctx);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    if (!this.prefs.muted) this.start(this.wanted, 2.5);
  }

  /**
   * Called from a user gesture: lets file playback start on iOS, and retries
   * a recording that was blocked for want of one.
   */
  unlock() {
    if (!this.ctx || !TRACKS.some((t) => t.sources.length)) return;
    if (!this.decks.length) this.decks = [this.makeDeck(), this.makeDeck()].filter((d): d is Deck => !!d);
    for (const d of this.decks) {
      if (d.unlocked || d.owner) continue;
      d.el.src = SILENT_WAV;
      d.el.play().then(
        () => {
          d.unlocked = true;
          if (!d.owner) d.el.pause();
        },
        () => {}
      );
    }
    const c = this.current;
    if (c?.mode === 'file' && c.deck?.el.paused && !this.prefs.muted && !this.hidden) c.deck.el.play().catch(() => {});
  }

  private makeDeck(): Deck | null {
    const ctx = this.ctx!;
    try {
      const el = new Audio();
      el.preload = 'none';
      el.loop = true;
      el.setAttribute('playsinline', '');
      const gain = ctx.createGain();
      gain.gain.value = 0;
      // Routed through WebAudio: iOS ignores an audio element's own volume.
      ctx.createMediaElementSource(el).connect(gain);
      gain.connect(this.duck!);
      return { el, gain, unlocked: false, owner: null };
    } catch {
      return null;
    }
  }

  // ---------- The game's side ----------

  /** Follows the game: works out the musical state and moves to its track when it settles. */
  update(situation: MusicSituation, dtSeconds: number) {
    const from = this.director.state;
    const next = this.director.update(musicStateFor(situation), dtSeconds);
    if (!next) return;
    const id = TRACK_FOR_STATE[next].id;
    const c = this.current;
    if ((from === null || from === 'menu') && c && c.track.state === 'menu' && this.ctx) {
      // Stepping out from the title screen: let the theme finish saying the
      // motif before it hands over, so every session opens on it.
      const at = c.startedAt + THEME_OPENING_SECONDS;
      if (this.ctx.currentTime < at) {
        this.pendingSwitch = { id, seconds: FROM_MENU_SECONDS, at };
        this.wanted = TRACK_FOR_STATE[next];
        this.onChange?.();
        return;
      }
      return this.crossfadeTo(id, FROM_MENU_SECONDS);
    }
    this.crossfadeTo(id, CROSSFADE_SECONDS);
  }

  get state(): MusicState | null {
    return this.director.state;
  }

  // ---------- Playback ----------

  /** Starts a track straight away (a short fade), replacing whatever plays. */
  playTrack(id: string) {
    this.crossfadeTo(id, 0.6);
  }

  /** Fades from the current track to another. Asking for the track already playing does nothing. */
  crossfadeTo(id: string, seconds = CROSSFADE_SECONDS) {
    const track = findTrack(id);
    if (!track) return;
    this.pendingSwitch = null;
    if (this.current?.track.id === id) {
      this.wanted = track;
      return;
    }
    const changed = this.wanted.id !== id;
    this.wanted = track;
    if (!this.ctx || this.prefs.muted) {
      if (changed) this.onChange?.();
      return;
    }
    this.fadeOutCurrent(seconds);
    this.start(track, seconds);
  }

  /** Fades the music out and leaves silence until another track is asked for. */
  stopTrack(seconds = CROSSFADE_SECONDS) {
    this.fadeOutCurrent(seconds);
    this.onChange?.();
  }

  getCurrentTrack(): TrackDef | null {
    return this.current?.track ?? null;
  }

  /** The track the game is in, playing or not (muted, or before the first tap). */
  getWantedTrack(): TrackDef {
    return this.wanted;
  }

  /** Warms the browser's cache for a track's recording, if it has one. */
  preloadTrack(id: string) {
    const track = findTrack(id);
    const src = track && this.pickSource(track);
    if (!src || this.preloaded.has(src) || this.failed.has(id)) return;
    try {
      const el = new Audio();
      el.preload = 'auto';
      el.src = src;
      // Keep one warm at a time: a phone has no room for a library.
      for (const [k, old] of this.preloaded) {
        old.removeAttribute('src');
        this.preloaded.delete(k);
      }
      this.preloaded.set(src, el);
    } catch {
      // No audio element support: nothing to warm.
    }
  }

  private pickSource(track: TrackDef): string | null {
    if (!track.sources.length) return null;
    let probe: HTMLAudioElement;
    try {
      probe = new Audio();
    } catch {
      return null;
    }
    const type = (s: string) => (s.endsWith('.m4a') || s.endsWith('.aac') ? 'audio/mp4' : s.endsWith('.ogg') ? 'audio/ogg' : s.endsWith('.mp3') ? 'audio/mpeg' : s.endsWith('.webm') ? 'audio/webm' : '');
    const found = track.sources.find((s) => probe.canPlayType(type(s)) !== '');
    return found ? `${import.meta.env.BASE_URL}${found}` : null;
  }

  private start(track: TrackDef, fadeSeconds: number) {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const fader = ctx.createGain();
    fader.gain.setValueAtTime(0, now);
    fader.gain.linearRampToValueAtTime(track.gain, now + Math.max(0.05, fadeSeconds));
    fader.connect(this.duck!);
    const wet = ctx.createGain();
    wet.gain.value = track.arrangement.reverb;
    fader.connect(wet).connect(this.reverb!);

    const saved = this.positions.get(track.id);
    const resume = saved && Date.now() - saved.at < RESUME_WITHIN_MS ? saved : null;
    const p: Playing = { track, fader, wet, mode: 'arranged', phrase: resume?.phrase ?? 0, nextTime: now + 0.05, deck: null, stopAt: null, startedAt: now };
    this.current = p;
    const src = !this.failed.has(track.id) && this.pickSource(track);
    if (src) this.startFile(p, src, resume?.fileTime ?? 0, fadeSeconds);
    this.tick();
    this.onChange?.();
  }

  private startFile(p: Playing, src: string, fromTime: number, fadeSeconds: number) {
    const deck = this.decks.find((d) => !d.owner && d.unlocked) ?? this.decks.find((d) => !d.owner);
    if (!deck) return;
    deck.owner = p;
    p.deck = deck;
    p.mode = 'loading';
    const el = deck.el;
    const ctx = this.ctx!;
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      this.failed.add(p.track.id);
      this.releaseDeck(p);
      // The live arrangement steps in, so the moment still has its music.
      if (p.stopAt === null) {
        p.mode = 'arranged';
        p.nextTime = ctx.currentTime + 0.05;
        this.tick();
      }
    };
    const timeout = setTimeout(fail, FILE_START_TIMEOUT_MS);
    el.onerror = fail;
    el.src = src;
    try {
      el.currentTime = fromTime;
    } catch {
      // Not seekable until metadata loads; starting from the top is fine.
    }
    el.play().then(
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        // Already on its way out before it could start: stay silent.
        if (p.stopAt !== null) return el.pause();
        p.mode = 'file';
        const now = ctx.currentTime;
        deck.gain.gain.cancelScheduledValues(now);
        deck.gain.gain.setValueAtTime(0, now);
        deck.gain.gain.linearRampToValueAtTime(1, now + Math.max(0.05, fadeSeconds));
        if (this.prefs.muted || this.hidden) el.pause();
      },
      fail
    );
  }

  private releaseDeck(p: Playing) {
    const d = p.deck;
    if (!d) return;
    if (p.mode === 'file') this.remember(p);
    d.el.onerror = null;
    d.el.pause();
    d.gain.gain.cancelScheduledValues(0);
    d.gain.gain.value = 0;
    d.owner = null;
    p.deck = null;
  }

  private remember(p: Playing) {
    this.positions.set(p.track.id, { phrase: p.phrase, fileTime: p.deck?.el.currentTime ?? 0, at: Date.now() });
  }

  private fadeOutCurrent(seconds: number) {
    const ctx = this.ctx;
    const p = this.current;
    this.current = null;
    if (!ctx || !p) return;
    // Never more than two tracks sounding: anything still fading goes now.
    for (const old of this.outgoing) this.finish(old, 0.3);
    this.outgoing = [];
    this.finish(p, seconds);
    this.outgoing.push(p);
  }

  private finish(p: Playing, seconds: number) {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    p.stopAt = now + seconds;
    this.remember(p);
    for (const g of [p.fader.gain, p.deck?.gain.gain]) {
      if (!g) continue;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + Math.max(0.05, seconds));
    }
    setTimeout(() => {
      this.releaseDeck(p);
      p.fader.disconnect();
      p.wet.disconnect();
      this.outgoing = this.outgoing.filter((o) => o !== p);
    }, seconds * 1000 + 300);
  }

  /** Schedules the next stretch of each arranged track, a little ahead of time. */
  private tick() {
    const ctx = this.ctx;
    if (!ctx || this.hidden || this.prefs.muted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const sw = this.pendingSwitch;
    if (sw && now >= sw.at) return this.crossfadeTo(sw.id, sw.seconds);
    for (const p of [this.current, ...this.outgoing]) {
      if (!p || p.mode !== 'arranged') continue;
      const a = p.track.arrangement;
      const spb = secondsPerBeat(a);
      const phraseSeconds = phraseLengthBeats(a) * spb;
      // Coming back from a pause, pick up from now rather than racing to catch up.
      if (p.nextTime < now - 0.05) p.nextTime = now + 0.05;
      while (p.nextTime < now + LOOKAHEAD_SECONDS && (p.stopAt === null || p.nextTime < p.stopAt)) {
        const voice: Voice = { ctx, out: p.fader, noise: this.noise! };
        for (const n of arrangePhrase(p.track.id, a, p.phrase)) {
          playNote(voice, n.instrument, p.nextTime + n.at * spb, n.midi, n.velocity, n.length * spb);
        }
        p.phrase++;
        p.nextTime += phraseSeconds;
      }
    }
  }

  /**
   * The motif, briefly, over whatever is playing — for a discovery that
   * matters. Rate-limited so it stays special. Returns whether it played.
   */
  playStinger(delaySeconds = 0.35): boolean {
    const ctx = this.ctx;
    if (!ctx || !this.duck || this.prefs.muted || this.hidden || ctx.state !== 'running') return false;
    const now = ctx.currentTime;
    if (now - this.lastStingerAt < STINGER_COOLDOWN_SECONDS) return false;
    this.lastStingerAt = now;
    const t0 = now + delaySeconds;
    const a = (this.current?.track ?? this.wanted).arrangement;
    // Let the stinger through by softening the music under it.
    const d = this.duck.gain;
    d.cancelScheduledValues(now);
    d.setValueAtTime(d.value, now);
    d.linearRampToValueAtTime(0.35, t0);
    d.setValueAtTime(0.35, t0 + 2.4);
    d.linearRampToValueAtTime(1, t0 + 4.5);
    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(this.bus!);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    out.connect(wet).connect(this.reverb!);
    const spb = 60 / STINGER_TEMPO;
    const voice: Voice = { ctx, out, noise: this.noise! };
    for (const n of motifStinger(a)) playNote(voice, n.instrument, t0 + n.at * spb, n.midi, n.velocity, n.length * spb);
    setTimeout(() => {
      out.disconnect();
      wet.disconnect();
    }, (delaySeconds + 8) * 1000);
    return true;
  }

  // ---------- Preferences ----------

  getPrefs(): MusicPrefs {
    return { ...this.prefs };
  }

  setMusicVolume(volume: number) {
    this.prefs.volume = clamp01(volume);
    this.applyPrefs();
  }

  getMusicVolume(): number {
    return this.prefs.volume;
  }

  muteMusic() {
    if (this.prefs.muted) return;
    this.prefs.muted = true;
    this.applyPrefs();
    // Let the fade finish, then stop for real: nothing playing, nothing scheduled.
    const ctx = this.ctx;
    if (!ctx) return;
    setTimeout(() => {
      if (!this.prefs.muted) return;
      this.fadeOutCurrent(0.1);
    }, 400);
  }

  unmuteMusic() {
    if (!this.prefs.muted) return;
    this.prefs.muted = false;
    this.applyPrefs();
    if (this.ctx && !this.current) this.start(this.wanted, 2);
    this.unlock();
  }

  isMuted(): boolean {
    return this.prefs.muted;
  }

  private applyPrefs() {
    saveMusicPrefs(this.prefs);
    if (this.ctx && this.bus) this.bus.gain.setTargetAtTime(busGainFor(this.prefs), this.ctx.currentTime, 0.08);
    this.onChange?.();
  }

  // ---------- Page visibility ----------

  /** The page went to the background (another tab, the home screen). */
  pause() {
    this.hidden = true;
    for (const p of [this.current, ...this.outgoing]) p?.deck?.el.pause();
  }

  /** Back in front: carry on from where the music was, never from the top. */
  resume() {
    this.hidden = false;
    if (!this.prefs.muted) this.current?.deck?.el.play().catch(() => {});
    this.tick();
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}
