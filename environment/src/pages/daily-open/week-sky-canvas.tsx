/* The lazy seam for W1b's sky.
 *
 * Everything that reaches three.js lives behind this module — the Wisps canvas AND the
 * preset table, because sky.ts imports three's Color and a static import of it drags the
 * whole engine into the board's main chunk (992 kB instead of 234 kB, measured). Only
 * plain numbers cross this boundary.
 */
import { SKY_PRESETS, type CloudDials, type SkyPresetName } from '../clouds/sky';
import WispsCanvas from '../clouds/clouds-wisps';
import type { MotifMood } from '../clouds/clouds-motif';
import type { ButtonSpec } from './motif';

/* The sky carries its own face dial (clouds-motif), whose five moods are the same five
 * expressions deriveMotif() produces — capitalised. Mapping them here means the read drives
 * both the character on the card and anything the sky wants to do with it. */
const MOOD_FOR: Record<ButtonSpec['face']['expression'], MotifMood> = {
  content: 'Content', excited: 'Excited', tense: 'Tense', weary: 'Weary', asleep: 'Asleep',
};

/** Nearest sky preset by solar hour, wrapping midnight. Data-driven — no day is named. */
function presetForHour(hour: number): SkyPresetName {
  const names = Object.keys(SKY_PRESETS) as SkyPresetName[];
  const distance = (h: number) => Math.abs(((h - hour + 36) % 24) - 12);
  return names.reduce((best, name) => (distance(SKY_PRESETS[name].hour) < distance(SKY_PRESETS[best].hour) ? name : best), names[0]);
}

/** The hour picks the light; the read modulates the deck. */
function dialsFor(hour: number, arousal: number, valence: number, expression: ButtonSpec['face']['expression']): CloudDials {
  return {
    engine: 'Wisps',
    sky: presetForHour(hour),
    mood: MOOD_FOR[expression],
    // A wound-up day moves faster and holds a denser deck; a light one thins out.
    speed: 0.5 + arousal * 1.2,
    fullness: 0.75 + (1 - (valence + 1) / 2) * 0.6,
    intensity: 0.8 + arousal * 0.5,
    size: 1,
    advanced: { quality: 'medium' as CloudDials['advanced']['quality'], clumping: 0.5, altitude: 750, thickness: 700 },
    view: { longitude: 0, latitude: 35, height: 300, origin: { x: 0, y: 0 }, heading: 0, pitch: -10 },
  };
}

export default function WeekSky({ hour, arousal, valence, expression }: {
  hour: number; arousal: number; valence: number; expression: ButtonSpec['face']['expression'];
}) {
  return <WispsCanvas dials={dialsFor(hour, arousal, valence, expression)} />;
}
