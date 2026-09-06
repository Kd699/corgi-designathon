/* The weather behind the D-series.
 *
 * W1b put the /clouds Wisps sky behind the week screen and picked its preset from the hour
 * the card was about. The dayboard gets the same sky, driven by the day being written: the
 * preset follows the latest thing you logged (or the clock, before you have), and the deck
 * thickens or thins with how the day reads. Type "stressed by four" and the sky moves.
 *
 * Same lazy seam as W1b — nothing that reaches three.js loads until a D-series frame is on
 * screen — and the same five expressions, so the mascot vocabulary is shared end to end.
 */
import { Suspense, lazy, useMemo } from 'react';
import { deriveMotif } from './motif';
import type { DayState } from '../dayboard/types';
import type { Signals } from '../../engine/signals';

const WeekSky = lazy(() => import('./week-sky-canvas'));

/** Read the day back into the signals shape derive()/deriveMotif() expect. */
function signalsFor(day: DayState): Signals {
  const last = day.timeline[day.timeline.length - 1];
  const hour = last ? Number(last.start.slice(0, 2)) : new Date().getHours();
  const mood = day.mood.length ? day.mood.reduce((a, m) => a + m.value, 0) / day.mood.length : 0;
  return {
    hour,
    heartRate: 55 + Math.round(day.energy * 55),
    motion: day.timeline.length > 4 ? 0.3 : 0.05,
    idleSeconds: 0,
    mood: day.mood.length ? Math.round((mood + 1) * 2) + 1 : null,
    feedback: 0,
    objective: 'focus',
  };
}

export default function DaySky({ day }: { day: DayState }) {
  const { hour, arousal, valence, expression } = useMemo(() => {
    const s = signalsFor(day);
    const valence = day.mood.length ? day.mood.reduce((a, m) => a + m.value, 0) / day.mood.length : 0;
    const arousal = day.energy;
    return { hour: s.hour, arousal, valence, expression: deriveMotif(s, valence, arousal).face.expression };
  }, [day]);
  return (
    <div className="absolute inset-0" aria-hidden>
      <Suspense fallback={<div className="h-full w-full" style={{ background: 'linear-gradient(160deg,#bcd9f5,#e8f3fc)' }} />}>
        <WeekSky hour={hour} arousal={arousal} valence={valence} expression={expression} />
      </Suspense>
    </div>
  );
}
