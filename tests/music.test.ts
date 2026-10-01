import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MODES, MOTIF, TRACKS, TRACK_FOR_STATE, type MusicState } from '../src/game/audio/soundtrack';
import { arrangePhrase, degreeToMidi, motifStinger, BARS_PER_PHRASE } from '../src/game/audio/arranger';
import { MusicDirector, musicStateFor, SETTLE_SECONDS } from '../src/game/audio/musicContext';
import { MusicManager, loadMusicPrefs, saveMusicPrefs, MUSIC_PREFS_KEY, DEFAULT_MUSIC_PREFS, busGainFor } from '../src/game/engine/MusicManager';
import { MusicControl } from '../src/ui/MusicControl';

const STATES: MusicState[] = ['menu', 'home', 'greenhouse', 'wild', 'deepWild', 'evening'];
const PERCUSSION = new Set(['wood', 'drum', 'shaker']);
const DAY = 1440;
const at = (h: number) => 3 * DAY + h * 60;

describe('the soundtrack', () => {
  it('has exactly one track for every musical state, each with a unique id', () => {
    for (const s of STATES) expect(TRACKS.filter((t) => t.state === s)).toHaveLength(1);
    expect(new Set(TRACKS.map((t) => t.id)).size).toBe(TRACKS.length);
    for (const s of STATES) expect(TRACK_FOR_STATE[s].state).toBe(s);
  });

  it('names only compressed, browser-playable recordings', () => {
    for (const t of TRACKS) for (const src of t.sources) expect(src).toMatch(/^music\/[a-z0-9-]+\.(m4a|mp3|ogg|webm)$/);
  });

  it('has a short motif of four to six pentatonic notes', () => {
    expect(MOTIF.degrees.length).toBeGreaterThanOrEqual(4);
    expect(MOTIF.degrees.length).toBeLessThanOrEqual(6);
    expect(MOTIF.onsets.length).toBe(MOTIF.degrees.length);
    expect(MOTIF.lengths.length).toBe(MOTIF.degrees.length);
    // 1 2 3 5 6 of the scale: it sits in every arrangement without clashing.
    for (const d of MOTIF.degrees) expect([0, 1, 2, 4, 5]).toContain(((d % 7) + 7) % 7);
    // It doesn't resolve home: it ends on a question.
    expect(MOTIF.degrees[MOTIF.degrees.length - 1]).not.toBe(0);
  });

  it('gives each state its own character (tempo, key, mode or lead instrument differ)', () => {
    const sigs = TRACKS.map((t) => `${t.arrangement.tempo}/${t.arrangement.root}/${t.arrangement.mode}/${t.arrangement.lead.instrument}`);
    expect(new Set(sigs).size).toBe(TRACKS.length);
    expect(new Set(TRACKS.map((t) => t.arrangement.lead.instrument)).size).toBeGreaterThanOrEqual(4);
  });
});

describe('the arranger', () => {
  it('is deterministic for a track and phrase', () => {
    const t = TRACKS[0];
    expect(arrangePhrase(t.id, t.arrangement, 3)).toEqual(arrangePhrase(t.id, t.arrangement, 3));
  });

  it('states the motif in every track within its first cycle', () => {
    for (const t of TRACKS) {
      const a = t.arrangement;
      const mode = MODES[a.mode];
      const motifPitchClasses = MOTIF.degrees.map((d) => degreeToMidi(a.root, mode, d) % 12);
      let found = false;
      for (let p = 0; p < a.lead.form.length && !found; p++) {
        if (a.lead.form[p] !== 'motif') continue;
        const lead = arrangePhrase(t.id, a, p).filter((n) => n.part === 'lead');
        const pcs = lead.slice(0, 5).map((n) => n.midi % 12);
        found = pcs.join() === motifPitchClasses.join();
      }
      expect(found, t.id).toBe(true);
    }
  });

  it('keeps every pitched note in the key and in a comfortable range', () => {
    for (const t of TRACKS) {
      const a = t.arrangement;
      const inMode = new Set(MODES[a.mode].map((i) => (a.root + i) % 12));
      for (let p = 0; p < 24; p++) {
        for (const n of arrangePhrase(t.id, a, p)) {
          expect(n.velocity).toBeGreaterThan(0);
          expect(n.velocity).toBeLessThanOrEqual(1);
          expect(n.at).toBeGreaterThanOrEqual(0);
          expect(n.at).toBeLessThan(a.beatsPerBar * BARS_PER_PHRASE);
          if (PERCUSSION.has(n.instrument)) continue;
          expect(inMode.has(n.midi % 12), `${t.id} phrase ${p} midi ${n.midi}`).toBe(true);
          expect(n.midi).toBeGreaterThanOrEqual(36);
          expect(n.midi).toBeLessThanOrEqual(96);
        }
      }
    }
  });

  it('leaves room to breathe: every track has phrases where the lead rests', () => {
    for (const t of TRACKS) expect(t.arrangement.lead.form, t.id).toContain('rest');
  });

  it('plays the motif as the discovery stinger, in the key of the current track', () => {
    for (const t of TRACKS) {
      const s = motifStinger(t.arrangement).filter((n) => n.part === 'lead');
      expect(s).toHaveLength(MOTIF.degrees.length);
      const mode = MODES[t.arrangement.mode];
      expect(s.map((n) => n.midi % 12)).toEqual(MOTIF.degrees.map((d) => degreeToMidi(t.arrangement.root, mode, d) % 12));
    }
  });
});

describe('musical states', () => {
  const base = { started: true, room: null, zone: 'meadow' as const, totalMinutes: at(11) };

  it('plays the theme on the title screen', () => {
    expect(musicStateFor({ ...base, started: false })).toBe('menu');
  });

  it('follows the rooms indoors, and turns to evening after dark', () => {
    expect(musicStateFor({ ...base, room: 'living', zone: 'greenhouse' })).toBe('home');
    expect(musicStateFor({ ...base, room: 'greenhouse', zone: 'greenhouse' })).toBe('greenhouse');
    expect(musicStateFor({ ...base, room: 'living', zone: 'greenhouse', totalMinutes: at(19.5) })).toBe('evening');
    expect(musicStateFor({ ...base, room: 'greenhouse', zone: 'greenhouse', totalMinutes: at(2) })).toBe('evening');
  });

  it('is wild outdoors, and the deep wild in the rare places and at night', () => {
    expect(musicStateFor(base)).toBe('wild');
    expect(musicStateFor({ ...base, zone: 'creek' })).toBe('wild');
    expect(musicStateFor({ ...base, zone: 'dampForest' })).toBe('deepWild');
    expect(musicStateFor({ ...base, zone: 'overgrownClearing' })).toBe('deepWild');
    expect(musicStateFor({ ...base, totalMinutes: at(23) })).toBe('deepWild');
  });
});

describe('the music director', () => {
  it('applies the first state at once', () => {
    const d = new MusicDirector();
    expect(d.update('menu', 0.016)).toBe('menu');
    expect(d.update('menu', 0.016)).toBeNull();
  });

  it('leaves the title screen at once', () => {
    const d = new MusicDirector();
    d.update('menu', 0.016);
    expect(d.update('home', 0.016)).toBe('home');
  });

  it('ignores a quick dash through a doorway', () => {
    const d = new MusicDirector();
    d.update('wild', 0.016);
    for (let t = 0; t < SETTLE_SECONDS - 1; t += 0.1) expect(d.update('greenhouse', 0.1)).toBeNull();
    expect(d.update('wild', 0.1)).toBeNull();
    // The clock starts over: another short visit still changes nothing.
    for (let t = 0; t < SETTLE_SECONDS - 1; t += 0.1) expect(d.update('greenhouse', 0.1)).toBeNull();
    expect(d.state).toBe('wild');
  });

  it('follows a change that holds', () => {
    const d = new MusicDirector();
    d.update('wild', 0.016);
    let switched: MusicState | null = null;
    for (let t = 0; t < SETTLE_SECONDS + 1 && !switched; t += 0.1) switched = d.update('greenhouse', 0.1);
    expect(switched).toBe('greenhouse');
    expect(d.state).toBe('greenhouse');
  });
});

describe('music preferences', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to music on at a moderate volume', () => {
    expect(loadMusicPrefs()).toEqual(DEFAULT_MUSIC_PREFS);
    expect(DEFAULT_MUSIC_PREFS.muted).toBe(false);
  });

  it('round-trips, and survives junk in storage', () => {
    saveMusicPrefs({ volume: 0.3, muted: true });
    expect(loadMusicPrefs()).toEqual({ volume: 0.3, muted: true });
    localStorage.setItem(MUSIC_PREFS_KEY, '{nope');
    expect(loadMusicPrefs()).toEqual(DEFAULT_MUSIC_PREFS);
    localStorage.setItem(MUSIC_PREFS_KEY, JSON.stringify({ volume: 7, muted: 'yes' }));
    expect(loadMusicPrefs()).toEqual({ volume: 1, muted: false });
  });

  it('is silent when muted and quietest at the bottom of the slider', () => {
    expect(busGainFor({ volume: 1, muted: true })).toBe(0);
    expect(busGainFor({ volume: 0, muted: false })).toBe(0);
    expect(busGainFor({ volume: 0.5, muted: false })).toBeLessThan(busGainFor({ volume: 1, muted: false }) / 2);
  });

  it('is kept apart from the game save', () => {
    const m = new MusicManager();
    m.setMusicVolume(0.25);
    m.muteMusic();
    expect(JSON.parse(localStorage.getItem(MUSIC_PREFS_KEY)!)).toEqual({ volume: 0.25, muted: true });
    expect(new MusicManager().getPrefs()).toEqual({ volume: 0.25, muted: true });
  });
});

// ---------- A stand-in audio context, enough to watch the manager work ----------

class FakeParam {
  value: number;
  constructor(v = 1) {
    this.value = v;
  }
  setValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number) {
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam(440);
  detune = new FakeParam(0);
  Q = new FakeParam(1);
  type = '';
  buffer: unknown = null;
  connected = true;
  constructor(private ctx: FakeContext, public kind: string) {}
  connect(n: FakeNode) {
    return n;
  }
  disconnect() {
    this.connected = false;
  }
  start() {
    if (this.kind === 'osc') this.ctx.notes++;
  }
  stop() {}
}

class FakeContext {
  currentTime = 0;
  state = 'running';
  sampleRate = 8000;
  destination = {};
  notes = 0;
  faders: FakeNode[] = [];
  createGain() {
    const g = new FakeNode(this, 'gain');
    this.faders.push(g);
    return g;
  }
  createOscillator() {
    return new FakeNode(this, 'osc');
  }
  createBiquadFilter() {
    return new FakeNode(this, 'filter');
  }
  createBufferSource() {
    return new FakeNode(this, 'src');
  }
  createConvolver() {
    return new FakeNode(this, 'conv');
  }
  createBuffer(channels: number, length: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { getChannelData: (c: number) => data[c] };
  }
  resume() {
    return Promise.resolve();
  }
}

describe('the music manager', () => {
  let ctx: FakeContext;
  let m: MusicManager;
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    ctx = new FakeContext();
    m = new MusicManager();
  });
  afterEach(() => {
    m.dispose();
    vi.useRealTimers();
  });
  const attach = () => m.attach(ctx as unknown as AudioContext, {} as AudioNode);
  const live = () => ((m as unknown as { outgoing: unknown[] }).outgoing.length + (m.getCurrentTrack() ? 1 : 0));

  it('waits for audio to be allowed, then starts the track the game is in', () => {
    m.crossfadeTo('wild');
    expect(m.getCurrentTrack()).toBeNull();
    expect(m.getWantedTrack().id).toBe('wild');
    attach();
    expect(m.getCurrentTrack()?.id).toBe('wild');
    expect(ctx.notes).toBeGreaterThan(0);
  });

  it('never restarts the track that is already playing', () => {
    attach();
    m.crossfadeTo('home');
    const before = ctx.faders.length;
    m.crossfadeTo('home');
    m.playTrack('home');
    expect(ctx.faders.length).toBe(before);
    expect(m.getCurrentTrack()?.id).toBe('home');
  });

  it('never has more than two tracks sounding, however fast the changes come', () => {
    attach();
    for (const id of ['home', 'greenhouse', 'wild', 'deep-wild', 'evening']) {
      m.crossfadeTo(id);
      expect(live()).toBeLessThanOrEqual(2);
    }
    expect(m.getCurrentTrack()?.id).toBe('evening');
    vi.advanceTimersByTime(10_000);
    expect(live()).toBe(1);
  });

  it('stops scheduling notes when muted and picks up again when unmuted', () => {
    attach();
    m.crossfadeTo('wild');
    m.muteMusic();
    vi.advanceTimersByTime(1000);
    expect(m.getCurrentTrack()).toBeNull();
    const notes = ctx.notes;
    ctx.currentTime = 30;
    vi.advanceTimersByTime(2000);
    expect(ctx.notes).toBe(notes);
    m.unmuteMusic();
    expect(m.getCurrentTrack()?.id).toBe('wild');
    expect(ctx.notes).toBeGreaterThan(notes);
  });

  it('moves with the game, and holds the theme long enough for the motif when the game begins', () => {
    attach();
    expect(m.getCurrentTrack()?.state).toBe('menu');
    const outdoors = { started: true, room: null, zone: 'meadow' as const, totalMinutes: at(10) };
    m.update(outdoors, 0.016);
    expect(m.getCurrentTrack()?.state).toBe('menu');
    expect(m.getWantedTrack().state).toBe('wild');
    ctx.currentTime = 6;
    vi.advanceTimersByTime(300);
    expect(m.getCurrentTrack()?.state).toBe('wild');
    // Opening a panel isn't a situation at all; walking indoors briefly changes nothing.
    m.update({ ...outdoors, room: 'greenhouse', zone: 'greenhouse' }, 1);
    m.update(outdoors, 1);
    expect(m.getCurrentTrack()?.state).toBe('wild');
  });

  it('rations the discovery stinger', () => {
    attach();
    expect(m.playStinger()).toBe(true);
    expect(m.playStinger()).toBe(false);
    ctx.currentTime = 200;
    expect(m.playStinger()).toBe(true);
    m.muteMusic();
    ctx.currentTime = 400;
    expect(m.playStinger()).toBe(false);
  });

  it('does nothing at all without audio', () => {
    expect(m.playStinger()).toBe(false);
    m.stopTrack();
    m.preloadTrack('home');
    expect(m.getCurrentTrack()).toBeNull();
  });
});

describe('the music control', () => {
  beforeEach(() => localStorage.clear());

  it('turns music off and on and sets its volume', () => {
    const m = new MusicManager();
    const c = new MusicControl(m);
    const toggle = c.menu.querySelector('.music-toggle') as HTMLButtonElement;
    const slider = c.menu.querySelector('.music-volume') as HTMLInputElement;
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    toggle.click();
    expect(m.isMuted()).toBe(true);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(c.button.classList.contains('muted')).toBe(true);
    slider.value = '40';
    slider.dispatchEvent(new Event('input'));
    expect(m.getMusicVolume()).toBeCloseTo(0.4);
    // Turning the volume up is taken as wanting to hear it.
    expect(m.isMuted()).toBe(false);
  });

  it('opens and closes without touching the music', () => {
    const m = new MusicManager();
    const c = new MusicControl(m);
    m.crossfadeTo('home');
    c.button.click();
    expect(c.menu.classList.contains('open')).toBe(true);
    expect(c.menu.textContent).toContain(TRACK_FOR_STATE.home.title);
    c.button.click();
    expect(c.menu.classList.contains('open')).toBe(false);
    expect(m.getWantedTrack().id).toBe('home');
  });
});
