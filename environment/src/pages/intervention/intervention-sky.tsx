/* The lazy seam, same rule as W1b's: everything that reaches three.js lives on this side of
 * it, including sky.ts's preset table (it imports three's Color) and ease(). Only plain
 * strings and numbers cross.
 *
 * Subtlety is mostly not ours: WispsCanvas already tweens hour, stars, fullness and
 * intensity toward whatever dials it is handed, with sky.ts's ease-in-out from rest and
 * ease-out mid-flight — so a preset change here reads as the light moving rather than the
 * sky cutting. Speed is the one dial it reads raw each frame, so it is eased here, on the
 * same curve, or a wound-up sentence would visibly snap the deck's velocity.
 */
import { useEffect, useRef, useState } from 'react';
import WispsCanvas from '../clouds/clouds-wisps';
import { ease, type CloudDials, type SkyPresetName } from '../clouds/sky';
import type { MotifMood } from '../clouds/clouds-motif';
import type { Expression } from './protocol';

const MOOD_FOR: Record<Expression, MotifMood> = {
  content: 'Content', excited: 'Excited', tense: 'Tense', weary: 'Weary', asleep: 'Asleep',
};

const SPEED_TWEEN_MS = 1400;

export default function InterventionSky({ sky, mascot, speed, fullness, intensity }: {
  sky: SkyPresetName; mascot: Expression; speed: number; fullness: number; intensity: number;
}) {
  const [eased, setEased] = useState(speed);
  /* The tween reads its own departure point from a ref rather than from state: following
   * `eased` as a dependency would restart the tween on the frame it just advanced. */
  const current = useRef(speed);
  const inFlight = useRef(false);

  useEffect(() => {
    if (Math.abs(speed - current.current) < 0.01) return;
    const from = current.current;
    const started = performance.now();
    // Interrupting a tween gets the ease-out curve; starting from stillness gets the calm one.
    const fromRest = !inFlight.current;
    inFlight.current = true;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / SPEED_TWEEN_MS);
      current.current = from + (speed - from) * ease(t, fromRest);
      setEased(current.current);
      if (t < 1) raf = requestAnimationFrame(tick);
      else inFlight.current = false;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speed]);

  const dials: CloudDials = {
    engine: 'Wisps',
    sky,
    mood: MOOD_FOR[mascot],
    invert: false,
    smile: false,
    speed: eased,
    fullness,
    intensity,
    size: 1,
    advanced: { quality: 'medium', clumping: 0.5, altitude: 750, thickness: 700 },
    view: { longitude: 0, latitude: 35, height: 300, origin: { x: 0, y: 0 }, heading: 0, pitch: -10 },
  };
  return <WispsCanvas dials={dials} />;
}
