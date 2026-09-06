import { describe, expect, it } from 'vitest';
import { derive } from './derive';
import { DEFAULT_SIGNALS, type Signals } from './signals';

const sig = (o: Partial<Signals>): Signals => ({ ...DEFAULT_SIGNALS, hour: 12, ...o });

describe('derive', () => {
  it('is pure: same signals, same spec', () => {
    const a = derive(sig({ mood: 4 }));
    const b = derive(sig({ mood: 4 }));
    expect(a).toEqual(b);
  });

  it('a low mood rating turns the environment cool and heavy', () => {
    const spec = derive(sig({ mood: 1 }));
    expect(spec.valence).toBeLessThan(0);
    expect(spec.headline).toBe('Heavy.');
    expect(spec.palette.from).toMatch(/^hsl\(2\d\d /); // cool hue
  });

  it('passive heart rate alone changes the environment', () => {
    const rest = derive(sig({ heartRate: 60 }));
    const high = derive(sig({ heartRate: 110 }));
    expect(high.arousal).toBeGreaterThan(rest.arousal);
    expect(high.mascot.state).not.toBe(rest.mascot.state);
    expect(high.texture).not.toBe(rest.texture);
  });

  it('objective decides which components exist', () => {
    expect(derive(sig({ objective: 'focus' })).components).toContain('focusTimer');
    expect(derive(sig({ objective: 'focus' })).components).not.toContain('promptCards');
    expect(derive(sig({ objective: 'root' })).components).toContain('rootFlow');
  });

  it('settle surfaces Root when mood is low', () => {
    expect(derive(sig({ objective: 'settle', mood: 1 })).components).toContain('rootFlow');
    expect(derive(sig({ objective: 'settle', mood: 4 })).components).not.toContain('rootFlow');
  });

  it('feedback course-corrects but cannot override a fresh rating', () => {
    const base = derive(sig({ mood: 2 }));
    const corrected = derive(sig({ mood: 2, feedback: 3 }));
    const maxed = derive(sig({ mood: 2, feedback: 30 }));
    expect(corrected.valence).toBeGreaterThan(base.valence);
    expect(maxed.valence - base.valence).toBeLessThanOrEqual(0.3 + 1e-9);
  });

  it('long idle puts the mascot to sleep', () => {
    expect(derive(sig({ idleSeconds: 120 })).mascot.state).toBe('asleep');
  });

  it('every spec explains itself', () => {
    expect(derive(sig({})).reasons.length).toBeGreaterThan(0);
  });
});
