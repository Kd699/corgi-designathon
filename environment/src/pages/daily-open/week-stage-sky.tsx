/* W1b — a fork of W1 Stage with the two things the team built in the meantime:
 *
 *   the sky   /clouds' Wisps engine (commit d01876f) instead of a CSS gradient. The day's
 *             own hour picks the sky preset, so Monday 08:00 is Morning and Thursday 22:30
 *             is Night — the background stops being a mood colour and becomes the actual
 *             time the read was made.
 *   the face  the motif character (commit 8625713) instead of the blob mascot, driven by
 *             deriveMotif() on the same valence/arousal derive() already produced. Its
 *             outline morphs and its expression changes card to card.
 *
 * W1 is untouched and still in the board — that is the point of a fork. What is being
 * compared is whether a real sky earns its weight against a gradient that costs nothing.
 *
 * Everything else — the card, the pager, the five views — is imported from W1, so a change
 * to the content lands in both.
 */
import { Suspense, lazy, useEffect, useState } from 'react';
import { DesktopFrame, type ScreenMode } from '../../components/v3artboard';
import { derive } from '../../engine/derive';
import MotifMascot from './MotifMascot';
import './motif.css';
import { WEEK_VIEWS, dayOf } from './week';
import { Card, Pager, WEEK_STATES } from './week-in-review';

/* The sky is three.js + R3F. Lazy so it only loads when a W1b frame is on screen — the
 * rest of the board must not pay for it. The dial mapping lives behind the same seam
 * (week-sky-canvas), because the preset table imports three. */
const WeekSky = lazy(() => import('./week-sky-canvas'));

export const WEEK_SKY_ID = 'week-stage-sky';

export const WEEK_SKY_CONFIG = {
  label: 'W1b · Stage, live sky',
  thesis: 'W1 with the real thing behind it: the /clouds Wisps engine picking its preset from the hour the card is about, and the motif character in front of it. The read is the weather, not a tint of it.',
  risk: 'A shader per frame, and a sky that is beautiful enough to stop being information. If the card is now harder to read than it was over a gradient, the gradient wins.',
};

function WeekSkyScreen({ stateId, live }: { stateId: string; live: boolean }) {
  const start = Math.max(0, WEEK_VIEWS.findIndex((v) => v.id === stateId));
  const [i, setI] = useState(start);
  const [playing, setPlaying] = useState(false);

  useEffect(() => { setI(start); }, [start]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setI((k) => (k + 1) % WEEK_VIEWS.length), 3200);
    return () => clearInterval(id);
  }, [playing]);

  const view = WEEK_VIEWS[live ? i : start];
  const day = dayOf(view.day);
  const spec = derive(day.signals);

  return (
    <div className="week-sky-stage relative h-full w-full overflow-hidden">
      {/* The sky owns the whole frame; everything else sits on top of it. */}
      <div className="absolute inset-0">
        <Suspense fallback={<div className="h-full w-full" style={{ background: spec.palette.from }} />}>
          <WeekSky hour={day.signals.hour} arousal={spec.arousal} valence={spec.valence} />
        </Suspense>
      </div>

      <div className="relative flex h-full flex-col items-center justify-center gap-8 px-16" style={{ color: 'hsl(0 0% 10%)' }}>
        <div className="relative w-full max-w-[720px]">
          <div className="absolute -top-20 left-6 z-10"><MotifMascot signals={day.signals} spec={spec} /></div>
          <Card view={view} spec={spec} />
        </div>
        {live
          ? <Pager i={i} setI={setI} playing={playing} setPlaying={setPlaying} />
          : <Pager i={start} setI={() => {}} playing={false} setPlaying={() => {}} />}
      </div>
    </div>
  );
}

export const WEEK_SKY_MODE: ScreenMode = {
  id: WEEK_SKY_ID,
  label: WEEK_SKY_CONFIG.label,
  concept: WEEK_SKY_CONFIG.label,
  description: WEEK_SKY_CONFIG.thesis,
  platforms: ['web'],
  states: WEEK_STATES,
  renderFrame: (state) => (
    <DesktopFrame url="spacetime.app/week" height={760}>
      <WeekSkyScreen stateId={state.id} live />
    </DesktopFrame>
  ),
  renderArtboardFrame: (state) => (
    <DesktopFrame url="spacetime.app/week" height={760}>
      <div className="pointer-events-none h-full"><WeekSkyScreen stateId={state.id} live={false} /></div>
    </DesktopFrame>
  ),
  floatingNavLabel: (state) => `${WEEK_SKY_CONFIG.label} · ${state.label}`,
};
