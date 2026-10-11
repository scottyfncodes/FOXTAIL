import { describe, it, expect } from 'vitest';
import { ToastScheduler, toastDuration, KIND_SIGNIFICANCE, MAX_VISIBLE, MOMENT_MS, compactToasts } from '../src/game/systems/toasts';

describe('message duration', () => {
  it('gives more significant messages more time', () => {
    const text = 'Something happened in the garden.';
    const d = (['minor', 'normal', 'important', 'major'] as const).map((s) => toastDuration(text, s));
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThan(d[i - 1]);
  });

  it('keeps small feedback brief and milestones long enough to absorb', () => {
    expect(toastDuration('Took a cutting of Pothos.', 'minor')).toBeLessThanOrEqual(3000);
    expect(toastDuration('New discovery: Monstera.', 'important')).toBeGreaterThanOrEqual(5000);
    expect(toastDuration('Your plants are spreading on their own.', 'major')).toBeGreaterThanOrEqual(7000);
  });

  it('lets longer messages stay up longer, within a cap', () => {
    const short = toastDuration('New discovery: Fern.', 'important');
    const long = toastDuration('New discovery: Fern. '.repeat(6), 'important');
    expect(long).toBeGreaterThan(short);
    expect(toastDuration('x'.repeat(5000), 'minor')).toBeLessThanOrEqual(4500);
    expect(toastDuration('x'.repeat(5000), 'major')).toBeLessThanOrEqual(16000);
  });

  it('maps kinds to sensible defaults', () => {
    expect(KIND_SIGNIFICANCE.info).toBe('minor');
    expect(KIND_SIGNIFICANCE.coins).toBe('minor');
    expect(KIND_SIGNIFICANCE.discovery).toBe('important');
  });
});

describe('message scheduling', () => {
  it('shows a message at once and hides it when its time is up', () => {
    const s = new ToastScheduler<string>();
    s.push('a', 'Took a cutting.', 'minor', 0);
    expect(s.tick(0).show).toEqual(['a']);
    const d = toastDuration('Took a cutting.', 'minor');
    expect(s.tick(d - 1).hide).toEqual([]);
    expect(s.tick(d).hide).toEqual(['a']);
  });

  it('never has more than a couple on screen', () => {
    const s = new ToastScheduler<number>();
    for (let i = 0; i < 6; i++) s.push(i, `msg ${i}`, 'minor', 0);
    s.tick(0);
    expect(s.showing.length).toBeLessThanOrEqual(MAX_VISIBLE);
  });

  it('does not let routine chatter push a discovery off-screen', () => {
    const s = new ToastScheduler<string>();
    s.push('find', 'New discovery: Alocasia.', 'important', 0);
    s.push('hint', 'Bring your cutting home.', 'important', 0);
    s.tick(0);
    for (let i = 0; i < 5; i++) s.push(`chat${i}`, `Chatter ${i}`, 'minor', 100 + i);
    const r = s.tick(200);
    expect(r.hide).toEqual([]);
    expect(s.showing).toEqual(['find', 'hint']);
  });

  it('lets newer minor feedback replace older minor feedback', () => {
    const s = new ToastScheduler<string>();
    s.push('a', 'one', 'minor', 0);
    s.push('b', 'two', 'minor', 0);
    s.tick(0);
    s.push('c', 'three', 'minor', 50);
    const r = s.tick(50);
    expect(r.hide).toEqual(['a']);
    expect(r.show).toEqual(['c']);
  });

  it('gives a major moment the stage for a beat, and nothing can push it off', () => {
    const s = new ToastScheduler<string>();
    s.push('chat', 'Took a cutting.', 'minor', 0);
    s.tick(0);
    s.push('moment', 'Your plants are spreading.', 'major', 10);
    const r = s.tick(10);
    expect(r.hide).toEqual(['chat']);
    expect(r.show).toEqual(['moment']);

    // Something else happens straight after: it waits for the beat to pass…
    s.push('next', 'Potted a Fern.', 'normal', 20);
    expect(s.tick(20).show).toEqual([]);
    expect(s.tick(10 + MOMENT_MS).show).toEqual(['next']);
    // …and then shares the screen without displacing the moment.
    s.push('more', 'Dug a garden bed.', 'normal', 10 + MOMENT_MS + 1);
    const r2 = s.tick(10 + MOMENT_MS + 1);
    expect(r2.hide).toEqual(['next']);
    expect(s.showing).toEqual(['moment', 'more']);
  });

  it('leaves a breath after a major moment before the next message', () => {
    const s = new ToastScheduler<string>();
    s.push('moment', 'Your plants are spreading.', 'major', 0);
    s.push('a', 'New discovery: Hoya. Wait… this one is different.', 'important', 0);
    s.tick(0);
    expect(s.tick(MOMENT_MS).show).toEqual(['a']);
    const end = toastDuration('Your plants are spreading.', 'major');
    s.push('c', 'Potted a Fern.', 'normal', end - 1);
    expect(s.tick(end).hide).toEqual(['moment']);
    expect(s.tick(end + 100).show).toEqual([]);
    expect(s.tick(end + 1200).show).toEqual(['c']);
  });

  it('does not hold a major moment back behind an earlier hint', () => {
    const s = new ToastScheduler<string>();
    s.push('hint', 'Walk up to a wild plant and take a cutting.', 'important', 0);
    s.tick(0);
    s.push('chat', 'Took a cutting.', 'minor', 100);
    s.push('moment', 'New discovery: Monstera. Wait… this one is different.', 'major', 100);
    const r = s.tick(100);
    expect(r.show).toEqual(['moment']);
    expect(s.showing).toEqual(['hint', 'moment']);
  });

  it('shows the most significant waiting message first', () => {
    const s = new ToastScheduler<string>();
    s.push('m', 'Big moment', 'major', 0);
    s.tick(0);
    s.push('low', 'Sold a plant.', 'normal', 1);
    s.push('high', 'New discovery: Hoya.', 'important', 2);
    const end = toastDuration('Big moment', 'major');
    s.tick(end);
    const r = s.tick(end + 2000);
    expect(r.show[0]).toBe('high');
  });

  it('drops stale chatter rather than replaying it late', () => {
    const s = new ToastScheduler<string>();
    s.push('m', 'Big moment', 'major', 0);
    s.tick(0);
    s.push('stale', 'Your basket is full.', 'minor', 1);
    s.push('keep', 'New discovery: Peperomia.', 'important', 1);
    const end = toastDuration('Big moment', 'major');
    s.tick(end);
    const r = s.tick(end + 2000);
    expect(r.show).toEqual(['keep']);
    expect(s.pending).toBe(0);
  });

  it('ignores a repeat of a message that is already up', () => {
    const s = new ToastScheduler<string>();
    s.push('a', 'Your basket is full.', 'minor', 0);
    s.tick(0);
    s.push('b', 'Your basket is full.', 'minor', 10);
    expect(s.tick(10).show).toEqual([]);
    expect(s.showing).toEqual(['a']);
  });
});

describe('short screens: messages take turns instead of stacking over Ellen', () => {
  it('treats an iPhone SE upright and phones on their side as compact, and roomier screens not', () => {
    expect(compactToasts(375, 667)).toBe(true);
    expect(compactToasts(667, 375)).toBe(true);
    expect(compactToasts(844, 390)).toBe(true);
    expect(compactToasts(390, 844)).toBe(false);
    expect(compactToasts(430, 932)).toBe(false);
    expect(compactToasts(1280, 800)).toBe(false);
  });

  it('shows the startup burst one at a time, and every message still gets its turn', () => {
    const s = new ToastScheduler<string>();
    s.maxVisible = 1;
    const a = 'Wild plants grow in patches all over the valley. Walk up and take a cutting.';
    const b = 'Someone has pinned a request on the board by the stall.';
    const shown: string[] = [];
    s.push('a', a, 'important', 0);
    s.push('b', b, 'important', 0);
    for (let t = 0; t <= 30000; t += 100) {
      const { show } = s.tick(t);
      shown.push(...show);
      expect(s.showing.length).toBeLessThanOrEqual(1);
    }
    expect(shown).toEqual(['a', 'b']);
    expect(s.pending).toBe(0);
  });

  it('still stacks up to the usual number on a roomy screen', () => {
    const s = new ToastScheduler<string>();
    s.push('a', 'One thing.', 'important', 0);
    s.push('b', 'Another thing.', 'important', 0);
    s.tick(0);
    expect(s.showing.length).toBe(MAX_VISIBLE);
  });

  it('lets a major moment wait its turn rather than pile on, and still shows it', () => {
    const s = new ToastScheduler<string>();
    s.maxVisible = 1;
    s.push('hint', 'Walk up and take a cutting.', 'important', 0);
    s.tick(0);
    s.push('moment', 'Species complete.', 'major', 100);
    const shown: string[] = [];
    for (let t = 100; t <= 20000; t += 100) {
      shown.push(...s.tick(t).show);
      expect(s.showing.length).toBeLessThanOrEqual(1);
    }
    expect(shown).toEqual(['moment']);
  });
});
