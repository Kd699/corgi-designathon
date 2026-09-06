// derive(signals) -> EnvSpec. The ONLY place that decides what the environment looks like.
// Pure: no DOM, no clock, no storage. Renderers read the spec's fields directly and never
// branch on raw signals. Adding a visual axis = adding a field here, not an `if` in JSX.

import type { Objective, Signals } from './signals';

export type Texture = 'none' | 'grain' | 'grid' | 'ripple' | 'scatter';
export type MascotState = 'asleep' | 'calm' | 'curious' | 'alert' | 'frazzled';
export type Motion = 'still' | 'breathe' | 'bob' | 'jitter';
export type Component = 'moodRater' | 'breath' | 'rootFlow' | 'focusTimer' | 'promptCards' | 'signalsPanel';

export interface EnvSpec {
  /** -1..1 unpleasant..pleasant */
  valence: number;
  /** 0..1 calm..activated */
  arousal: number;
  palette: { from: string; to: string; ink: string; accent: string };
  texture: Texture;
  /** Typography follows arousal: activated = tighter, denser. */
  type: { size: number; weight: number; tracking: string };
  mascot: { state: MascotState; motion: Motion; line: string };
  /** Which components exist right now, in render order. */
  components: Component[];
  /** One sentence the environment says about itself. Makes the reaction legible. */
  headline: string;
  /** The read, with its evidence named. Longer than headline: says WHY it thinks this. */
  read: string;
  /** The correction, phrased as something the mascot asks rather than a rating the system demands. */
  ask: string;
  /** Why it looks like this. Shown in the Signals panel so teammates can tune the rules. */
  reasons: string[];
}

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

export function deriveArousal(s: Signals, reasons: string[]): number {
  // Resting ~60, activated ~110. Motion adds. Late night subtracts.
  let a = clamp((s.heartRate - 55) / 55);
  reasons.push(`heart rate ${s.heartRate} -> arousal ${a.toFixed(2)}`);
  if (s.motion > 0.15) { a = clamp(a + s.motion * 0.4); reasons.push(`motion ${s.motion.toFixed(2)} raises arousal`); }
  if (s.hour >= 22 || s.hour < 6) { a = clamp(a - 0.2); reasons.push('late hour lowers arousal'); }
  if (s.idleSeconds > 45) { a = clamp(a - 0.15); reasons.push(`idle ${s.idleSeconds}s lowers arousal`); }
  return a;
}

export function deriveValence(s: Signals, reasons: string[]): number {
  let v = 0;
  if (s.mood !== null) { v = (s.mood - 3) / 2; reasons.push(`mood ${s.mood}/5 -> valence ${v.toFixed(2)}`); }
  else reasons.push('no mood rated; valence neutral');
  // Course correction: feedback nudges the read. Capped so it cannot override a fresh rating.
  const nudge = clamp(s.feedback * 0.1, -0.3, 0.3);
  if (nudge !== 0) { v = clamp(v + nudge, -1, 1); reasons.push(`feedback ${s.feedback >= 0 ? '+' : ''}${s.feedback} nudges valence by ${nudge.toFixed(2)}`); }
  return v;
}

function palette(valence: number, arousal: number, hour: number) {
  // Hue: valence picks warm vs cool. Lightness: arousal + time of day.
  const hue = valence >= 0 ? 35 + valence * 20 : 230 - valence * 40; // warm amber .. cool indigo
  const night = hour >= 21 || hour < 6;
  const l1 = night ? 14 + arousal * 10 : 78 - arousal * 25;
  const l2 = night ? 8 + arousal * 6 : 92 - arousal * 30;
  const sat = 30 + Math.abs(valence) * 40 + arousal * 20;
  const ink = l1 > 50 ? 'hsl(0 0% 10%)' : 'hsl(0 0% 96%)';
  return {
    from: `hsl(${hue} ${sat}% ${l1}%)`,
    to: `hsl(${hue + 25} ${sat * 0.8}% ${l2}%)`,
    ink,
    accent: `hsl(${(hue + 180) % 360} 70% ${l1 > 50 ? 40 : 65}%)`,
  };
}

function texture(valence: number, arousal: number): Texture {
  if (arousal > 0.7) return 'scatter';
  if (arousal < 0.25) return 'ripple';
  if (valence < -0.3) return 'grain';
  if (valence > 0.3) return 'grid';
  return 'none';
}

function mascot(valence: number, arousal: number, s: Signals): EnvSpec['mascot'] {
  if (s.idleSeconds > 90) return { state: 'asleep', motion: 'breathe', line: 'zzz' };
  if (arousal > 0.75 && valence < 0) return { state: 'frazzled', motion: 'jitter', line: 'a lot going on. want to slow down?' };
  if (arousal > 0.6) return { state: 'alert', motion: 'bob', line: 'you are up. use it.' };
  if (valence > 0.3) return { state: 'curious', motion: 'bob', line: 'good day for something new?' };
  return { state: 'calm', motion: 'breathe', line: 'here with you.' };
}

function componentsFor(objective: Objective, arousal: number, valence: number, reasons: string[]): Component[] {
  const base: Component[] = ['moodRater'];
  switch (objective) {
    case 'settle':
      reasons.push('objective settle: breath first');
      return [...base, 'breath', ...(valence < -0.2 ? (['rootFlow'] as Component[]) : [])];
    case 'focus':
      reasons.push('objective focus: timer only');
      return arousal > 0.8 ? [...base, 'breath', 'focusTimer'] : [...base, 'focusTimer'];
    case 'wander':
      reasons.push('objective wander: prompt cards');
      return [...base, 'promptCards'];
    case 'root':
      reasons.push('objective root: recursive questioning');
      return [...base, 'rootFlow'];
  }
}

/** The read: one sentence that names the evidence, so a wrong read is arguable rather than mysterious. */
function readSentence(s: Signals, valence: number, arousal: number, state: MascotState): string {
  const mood = s.mood === null ? null : `${s.mood}/5`;
  const night = s.hour >= 21 || s.hour < 6;
  if (state === 'asleep') return 'You have been still a while. Nothing moved while you were gone.';
  if (arousal > 0.7 && valence < 0) return `Heart at ${s.heartRate} and you have been moving. This does not look like the good kind of busy.`;
  if (arousal > 0.7) return `Heart at ${s.heartRate}. You are running hot and it seems to be working.`;
  if (valence > 0.3) return mood ? `You put yourself at ${mood} and nothing since has argued with it.` : 'Your signals are pointing up and nothing is contradicting them.';
  if (valence < -0.3) return mood ? `You put yourself at ${mood}. Heart is only ${s.heartRate}, so it is not your body.` : `Something is reading low. Heart is only ${s.heartRate}, so it is not your body.`;
  if (arousal < 0.25) return night ? `Late, and your pulse has dropped to ${s.heartRate}. The day is over whether or not you agree.` : `Low tide. Heart at ${s.heartRate}, barely moving.`;
  return `Heart at ${s.heartRate}, ordinary hour, nothing standing out.`;
}

/** Correction as a question. Same lever as thumbs up/down, asked instead of demanded. */
const ASK: Record<MascotState, string> = {
  asleep: 'still there?',
  frazzled: 'want to slow this down?',
  alert: 'ride it, or rein it in?',
  curious: 'want something new?',
  calm: 'have I got you right?',
};

export function derive(s: Signals): EnvSpec {
  const reasons: string[] = [];
  const arousal = deriveArousal(s, reasons);
  const valence = deriveValence(s, reasons);
  const components = componentsFor(s.objective, arousal, valence, reasons);
  const m = mascot(valence, arousal, s);
  const headline =
    m.state === 'asleep' ? 'Quiet.' :
    arousal > 0.7 ? (valence < 0 ? 'Charged, and not in a good way.' : 'Charged.') :
    valence > 0.3 ? 'Light.' : valence < -0.3 ? 'Heavy.' :
    arousal < 0.25 ? 'Low tide.' : 'Steady.';
  return {
    valence,
    arousal,
    palette: palette(valence, arousal, s.hour),
    texture: texture(valence, arousal),
    type: { size: 16 + Math.round((1 - arousal) * 4), weight: arousal > 0.6 ? 600 : 400, tracking: arousal > 0.6 ? '-0.01em' : '0.01em' },
    mascot: m,
    components: [...components, 'signalsPanel'],
    headline,
    read: readSentence(s, valence, arousal, m.state),
    ask: ASK[m.state],
    reasons,
  };
}
