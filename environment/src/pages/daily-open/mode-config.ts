// MODE_CONFIG for the daily-open lab. Every cross-concept literal lives here: labels, the
// argument each direction is making, what it costs when it is wrong, and the wording of the
// correction. Renderers read CONCEPT_CONFIG[id].field — no `id === 'weather' ? x : y` anywhere.

export type ConceptId = 'weather' | 'stated' | 'narrator' | 'quiet-read';

export interface ConceptCfg {
  label: string;
  /** What this direction argues. */
  thesis: string;
  /** What it costs if the read is wrong. Stated up front so the board stays honest. */
  risk: string;
  /** The correction lever's wording. Same signal either way: feedback +1 / -1. */
  correction: { positive: string; negative: string };
}

export const ALL_CONCEPTS: ConceptId[] = ['weather', 'stated', 'narrator', 'quiet-read'];

export const CONCEPT_CONFIG: Record<ConceptId, ConceptCfg> = {
  weather: {
    label: 'A · Weather',
    thesis: 'Never states the read. Palette, texture, mascot posture and which components exist ARE the message. You read the room the way you read weather out of a window.',
    risk: 'Illegible. A good read and random noise look identical, and course correction has nothing to attach to.',
    correction: { positive: 'got it', negative: 'not quite' },
  },
  stated: {
    label: 'B · The read, stated',
    thesis: 'Leads with the guess and the evidence behind it, correction sitting directly underneath. The mechanism is visible, so it can be argued with.',
    risk: 'Presumptuous. A wrong read is loud, and being told how you feel by software is a bad way to start a Monday.',
    correction: { positive: 'got it', negative: 'not quite' },
  },
  narrator: {
    label: 'C · Mascot as narrator',
    thesis: 'The environment stays quiet and the mascot carries the whole read. It asks rather than asserts, so being wrong is cheap and forgivable.',
    risk: 'Cute, and one step from the chat app the brief explicitly says not to build.',
    correction: { positive: 'yeah', negative: 'nah' },
  },
  'quiet-read': {
    label: 'D · Quiet read',
    thesis: "B's spine with C's manners. States the read and its evidence so the mechanism stays legible, but the mascot asks for the correction instead of the system demanding a rating.",
    risk: 'Two voices on one screen. If the mascot and the read disagree in tone it reads as incoherent rather than gentle.',
    correction: { positive: 'yeah', negative: 'not really' },
  },
};
