import { describe, expect, it } from 'vitest';
import { derive } from './derive';
import { DEFAULT_SIGNALS, type Signals } from './signals';
import { SCENARIOS } from './scenarios';

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

  it('the four energy/mood quadrants have distinct shapes, motion and sound', () => {
    const states = ['high-unpleasant', 'high-pleasant', 'low-unpleasant', 'low-pleasant']
      .map(id => derive(SCENARIOS.find(s => s.id === id)!.signals).buttons);
    expect(new Set(states.map(s => s.polygons[0])).size).toBe(4);
    expect(new Set(states.map(s => s.motion)).size).toBe(4);
    expect(new Set(states.map(s => s.sound.name)).size).toBe(4);
    expect(states.map(s => s.face.expression)).toEqual(['tense', 'excited', 'weary', 'content']);
    expect(states[0].face.mouthCurve).toBeLessThan(0);
    expect(states[1].face.mouthCurve).toBeGreaterThan(0);
    expect(states[0].face.eyeHeight).toBeGreaterThan(states[2].face.eyeHeight);
    expect(states[0].duration).toBeLessThan(states[2].duration);
    expect(states[1].sound.frequency).toBeGreaterThan(states[3].sound.frequency);
    for (const state of states) {
      expect(state.polygons).toHaveLength(3);
      // A stable number of vertices is required for interpolated morphs.
      state.polygons.forEach(p => expect(p.split(',')).toHaveLength(64));
    }
  });

  it('idle stops button motion and sound; night lowers volume', () => {
    const day = derive(sig({ hour: 12 })).buttons;
    const night = derive(sig({ hour: 23 })).buttons;
    const idle = derive(sig({ idleSeconds: 120 })).buttons;
    expect(night.sound.gain).toBeLessThan(day.sound.gain);
    expect(idle.motion).toBe('still');
    expect(idle.sound.gain).toBe(0);
    expect(idle.face.expression).toBe('asleep');
    expect(idle.face.asleep).toBe(true);
  });
});
