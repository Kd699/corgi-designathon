/* The intervention's spine: a cognitive-restructuring sequence, as data.
 *
 * Display records what happened. This side acts on you while you are still speaking, and
 * the thing it is running is a CBT protocol — one step at a time, each one a question with
 * its own weather. Reframe is deliberately first: the user opens by naming the thought they
 * want to put down, and everything after it is the work of earning that reframe rather than
 * asserting it. The classic supporting moves follow — where it happened, what the thought
 * actually was, the evidence either way, the kinder second read, and what gets done.
 *
 * Adding, cutting or reordering a step is ONE edit to this array. Nothing that renders a
 * step is allowed to know a step's id: every visual axis a step can move is its own field
 * here, resolved at definition time. If a step needs to look different, it gets a number in
 * this file, not a branch in the page.
 */
import type { SkyPresetName } from '../clouds/sky';
import type { ButtonSpec } from '../daily-open/motif';

export type Expression = ButtonSpec['face']['expression'];

export interface ProtocolStep {
  id: string;
  /** Shown as the step's name in the rail. */
  title: string;
  /** Spoken to the user — the question the step is actually asking. */
  prompt: string;
  /** What this step listens for, in the user's words. Rendered as the input's hint. */
  listeningFor: string;
  /** Where the sky sits before a word is said. The step has a mood of its own. */
  sky: SkyPresetName;
  /** The mascot's resting expression for this step, same five deriveMotif() produces. */
  mascot: Expression;
  /** Dial bias multiplied into whatever the words ask for. A step that wants stillness
   *  damps the deck; a step that wants heat lets it run. */
  speed: number;
  fullness: number;
  intensity: number;
  /** 0..1 — how far the words may pull this step off its own sky. The opening step is
   *  almost entirely the user's weather; the closing step holds its own, because the point
   *  of landing on a plan is that the room stops moving. */
  pull: number;
}

export const PROTOCOL: ProtocolStep[] = [
  {
    id: 'reframe',
    title: 'Reframe',
    prompt: 'Say the thought you want to put down.',
    listeningFor: 'the sentence you keep going back to',
    sky: 'Dusk',
    mascot: 'tense',
    speed: 1.15,
    fullness: 1.15,
    intensity: 1.1,
    pull: 1,
  },
  {
    id: 'situation',
    title: 'Situation',
    prompt: 'Where were you when it landed? Who was there, what time?',
    listeningFor: 'place, people, the hour it happened',
    sky: 'Afternoon',
    mascot: 'weary',
    speed: 0.9,
    fullness: 1,
    intensity: 0.95,
    pull: 0.85,
  },
  {
    id: 'thought',
    title: 'The thought',
    prompt: 'What exactly went through your head? The words, not the summary.',
    listeningFor: 'the literal thought, in the first person',
    sky: 'Dusk',
    mascot: 'tense',
    speed: 1.1,
    fullness: 1.2,
    intensity: 1.15,
    pull: 0.95,
  },
  {
    id: 'evidence-for',
    title: 'Evidence for',
    prompt: 'What makes that thought look true? Take it seriously.',
    listeningFor: 'facts, not feelings — what actually happened',
    sky: 'Sunset',
    mascot: 'weary',
    speed: 0.85,
    fullness: 1.1,
    intensity: 1,
    pull: 0.7,
  },
  {
    id: 'evidence-against',
    title: 'Evidence against',
    prompt: 'And what does it not account for?',
    listeningFor: 'the parts the thought skipped',
    sky: 'Morning',
    mascot: 'content',
    speed: 0.8,
    fullness: 0.9,
    intensity: 0.9,
    pull: 0.6,
  },
  {
    id: 'kinder-read',
    title: 'Kinder read',
    prompt: 'Say it again the way you would say it to someone you like.',
    listeningFor: 'the same event, said gently',
    sky: 'Sunrise',
    mascot: 'content',
    speed: 0.7,
    fullness: 0.95,
    intensity: 0.9,
    pull: 0.45,
  },
  {
    id: 'action',
    title: 'What you will do',
    prompt: 'One thing, today, small enough that you will actually do it.',
    listeningFor: 'a verb and a time',
    sky: 'Midday',
    mascot: 'excited',
    speed: 0.75,
    fullness: 0.75,
    intensity: 0.95,
    pull: 0.3,
  },
];
