// Sky → signals → mood, on the motif+signal_simulation's own rules.
//
// The simulation (motif+signal_simulation/src/engine) reads signals —
// heart rate, motion, hour, idle, self-rated mood — derives arousal and
// valence, and its buttonSpec maps that pair to an expression. This module
// vendors those exact formulas (deriveArousal / deriveValence / the
// expression conditional, unchanged) and gives each sky stop the signal
// bundle a day plausibly produces at that hour: asleep before dawn, a
// sunrise run, the post-lunch dip, a brooding dusk. Picking a sky then
// DERIVES the motif's mood instead of asserting it — the same read the
// simulation would make, pointed at the sky's hour.

import { SKY_PRESETS, type SkyPresetName } from "./sky";
import type { MotifMood } from "./clouds-motif";

type SimSignals = {
  heartRate: number;
  motion: number;
  hour: number;
  idleSeconds: number;
  /** Self-rated 1..5, null = not rated (valence neutral). */
  mood: number | null;
  feedback: number;
};

// One day, told in signals. Each bundle is what the simulator's sliders
// would plausibly show at that stop's hour; the derivation below turns
// them into the expression.
const SKY_SIGNALS: Record<SkyPresetName, SimSignals> = {
  "Pre-dawn": { heartRate: 58, motion: 0, hour: 4.3, idleSeconds: 120, mood: null, feedback: 0 }, // still asleep
  Sunrise: { heartRate: 95, motion: 0.3, hour: 5.4, idleSeconds: 0, mood: 4, feedback: 0 }, // sunrise run
  Morning: { heartRate: 72, motion: 0.1, hour: 9, idleSeconds: 0, mood: 4, feedback: 0 }, // fresh, settled
  Midday: { heartRate: 90, motion: 0.35, hour: 13, idleSeconds: 0, mood: 4, feedback: 0 }, // peak of the day
  Afternoon: { heartRate: 62, motion: 0.05, hour: 16.5, idleSeconds: 60, mood: 2, feedback: 0 }, // post-lunch dip
  Sunset: { heartRate: 64, motion: 0, hour: 19.0, idleSeconds: 0, mood: 4, feedback: 0 }, // winding down, pleased
  Dusk: { heartRate: 92, motion: 0.2, hour: 19.6, idleSeconds: 0, mood: 2, feedback: 0 }, // the brooding hour
  Night: { heartRate: 60, motion: 0, hour: 0.5, idleSeconds: 150, mood: null, feedback: 0 }, // out cold
};

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

/** derive.ts#deriveArousal, verbatim minus the reasons log. */
function deriveArousal(s: SimSignals): number {
  let a = clamp((s.heartRate - 55) / 55);
  if (s.motion > 0.15) a = clamp(a + s.motion * 0.4);
  if (s.hour >= 22 || s.hour < 6) a = clamp(a - 0.2);
  if (s.idleSeconds > 45) a = clamp(a - 0.15);
  return a;
}

/** derive.ts#deriveValence, verbatim minus the reasons log. */
function deriveValence(s: SimSignals): number {
  let v = 0;
  if (s.mood !== null) v = (s.mood - 3) / 2;
  const nudge = clamp(s.feedback * 0.1, -0.3, 0.3);
  if (nudge !== 0) v = clamp(v + nudge, -1, 1);
  return v;
}

/** Live rides the visitor's clock: the nearer bracketing stop's signals,
 *  matching how liveSky() picks the nearer stop's heading. */
function nearestPreset(hour: number): SkyPresetName {
  const stops = (Object.entries(SKY_PRESETS) as [SkyPresetName, { hour: number }][])
    .slice()
    .sort((a, b) => a[1].hour - b[1].hour);
  let before = stops[stops.length - 1];
  let after = stops[0];
  for (const stop of stops) {
    if (stop[1].hour <= hour) before = stop;
    if (stop[1].hour > hour) {
      after = stop;
      break;
    }
  }
  const span = (after[1].hour - before[1].hour + 24) % 24 || 24;
  const t = ((hour - before[1].hour + 24) % 24) / span;
  return t < 0.5 ? before[0] : after[0];
}

/** A summary sentence with the signals it cites marked as pills. */
export type ReadSegment = string | { pill: string };
export type SkyRead = { mood: MotifMood; summary: ReadSegment[] };

const bpm = (s: SimSignals) => ({ pill: `${s.heartRate} bpm` });
const rated = (s: SimSignals) => ({ pill: `${s.mood}/5` });
const idleFor = (s: SimSignals) => ({ pill: `idle ${s.idleSeconds}s` });

// One line per stop: how the day feels there and why, citing the same
// signal bundle the mood was derived from — so the pills are receipts,
// not decoration.
const SUMMARIES: Record<SkyPresetName, (s: SimSignals) => ReadSegment[]> = {
  "Pre-dawn": (s) => ["Still under: nothing has moved for ", idleFor(s), " and your heart rate is resting at ", bpm(s), "."],
  Sunrise: (s) => ["Up with the sun and running: your heart rate was last ", bpm(s), ", and you rated the morning ", rated(s), "."],
  Morning: (s) => ["Settled into the day, heart rate steady at ", bpm(s), ", feeling ", rated(s), "."],
  Midday: (s) => ["Peak of the day and moving: your heart rate was last ", bpm(s), ", feeling ", rated(s), "."],
  Afternoon: (s) => ["The post-lunch dip: heart rate down to ", bpm(s), ", and you rated this stretch ", rated(s), "."],
  Sunset: (s) => ["Winding down, pleased with it: heart rate at ", bpm(s), ", feeling ", rated(s), "."],
  Dusk: (s) => ["Wound up as the light goes: your heart rate was last ", bpm(s), ", and you rated the evening ", rated(s), "."],
  Night: (s) => ["Out cold: ", idleFor(s), ", heart rate down at ", bpm(s), "."],
};

/** The full read for a sky: buttonSpec.ts's expression conditional
 *  (idle → asleep; high arousal splits excited/tense on valence; low
 *  arousal splits content/weary), plus the summary line citing the
 *  signals that produced it. */
export function readForSky(sky: "Live" | SkyPresetName): SkyRead {
  const name =
    sky === "Live"
      ? nearestPreset(new Date().getHours() + new Date().getMinutes() / 60)
      : sky;
  const s = SKY_SIGNALS[name];
  const arousal = deriveArousal(s);
  const valence = deriveValence(s);
  const idle = s.idleSeconds > 90;
  const high = arousal > 0.6;
  const positive = valence >= 0;
  const mood: MotifMood = idle ? "Asleep" : high ? (positive ? "Excited" : "Tense") : positive ? "Content" : "Weary";
  return { mood, summary: SUMMARIES[name](s) };
}

export function moodForSky(sky: "Live" | SkyPresetName): MotifMood {
  return readForSky(sky).mood;
}
