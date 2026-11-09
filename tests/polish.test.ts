import { describe, it, expect, beforeEach } from 'vitest';
import { joystickVector, JOYSTICK_DEADZONE } from '../src/game/engine/Input';
import { StartOverlay } from '../src/ui/StartOverlay';
import { coin } from '../src/ui/common';

describe('joystick deadzone', () => {
  it('ignores a thumb resting near the centre', () => {
    expect(joystickVector(0, 0)).toEqual({ x: 0, y: 0 });
    expect(joystickVector(JOYSTICK_DEADZONE * 0.9, 0)).toEqual({ x: 0, y: 0 });
    expect(joystickVector(0.05, -0.08)).toEqual({ x: 0, y: 0 });
  });

  it('ramps from zero past the deadzone and reaches full speed at the rim', () => {
    const justPast = joystickVector(JOYSTICK_DEADZONE + 0.01, 0);
    expect(justPast.x).toBeGreaterThan(0);
    expect(justPast.x).toBeLessThan(0.05);
    const full = joystickVector(0, -1);
    expect(full.x).toBeCloseTo(0);
    expect(full.y).toBeCloseTo(-1);
  });

  it('keeps the direction the thumb points', () => {
    const v = joystickVector(0.6, 0.6);
    expect(v.x).toBeCloseTo(v.y);
    expect(Math.hypot(v.x, v.y)).toBeLessThanOrEqual(1);
  });
});

describe('title screen', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('carries a quiet maker credit linking to HaveAnApp', () => {
    const overlay = new StartOverlay(() => {}, () => {}, true);
    const credit = overlay.root.querySelector('[data-haveanapp]') as HTMLAnchorElement;
    expect(credit).not.toBeNull();
    expect(credit.textContent).toBe('by HaveAnApp');
    expect(credit.getAttribute('href')).toBe('https://haveanapp.com');
    expect(credit.getAttribute('rel')).toContain('noopener');
    // Still credits the cast above it.
    expect(overlay.root.querySelector('.start-cast')?.textContent).toContain('and the fox');
  });
});

describe('accessible labels', () => {
  it('gives the coin glyph an image role so its label is read', () => {
    const c = coin();
    expect(c.getAttribute('role')).toBe('img');
    expect(c.getAttribute('aria-label')).toBe('coins');
  });
});
