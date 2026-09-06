// The week the review screens are reviewing. Data only.
//
// Every view names the day it is about, and the day carries a full Signals snapshot — so
// the weather behind each view is `derive()` on real signals, not a colour someone picked.
// That is the whole argument of the week screen: the background IS the read.
import type { Signals } from '../../engine/signals';

export type DayId = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface Day {
  id: DayId;
  /** Two letters, for the arc and the filmstrip. */
  short: string;
  label: string;
  signals: Signals;
  /** What the environment logged that day, in the user's terms. */
  note: string;
}

export const WEEK: Day[] = [
  { id: 'mon', short: 'Mo', label: 'Monday',    note: 'Up early and already moving. It offered a timer and you took it.',
    signals: { heartRate: 96, motion: 0.34, hour: 8,  idleSeconds: 2,  mood: 2, feedback: 0,  objective: 'focus'  } },
  { id: 'tue', short: 'Tu', label: 'Tuesday',   note: 'Same again, quieter. You did not rate anything.',
    signals: { heartRate: 88, motion: 0.22, hour: 9,  idleSeconds: 4,  mood: null, feedback: 0, objective: 'focus' } },
  { id: 'wed', short: 'We', label: 'Wednesday', note: 'The ordinary one. Nothing to report, and it did not invent anything.',
    signals: { heartRate: 70, motion: 0.08, hour: 14, idleSeconds: 6,  mood: 3, feedback: 2,  objective: 'focus'  } },
  { id: 'thu', short: 'Th', label: 'Thursday',  note: 'Late, wound down but not settled. It read you as low and you said not quite.',
    signals: { heartRate: 62, motion: 0.02, hour: 22, idleSeconds: 20, mood: 2, feedback: -1, objective: 'settle' } },
  { id: 'fri', short: 'Fr', label: 'Friday',    note: 'Lighter by the afternoon. Prompt cards, twice.',
    signals: { heartRate: 74, motion: 0.18, hour: 16, idleSeconds: 3,  mood: 4, feedback: 1,  objective: 'wander' } },
  { id: 'sat', short: 'Sa', label: 'Saturday',  note: 'Barely opened it, which is its own kind of answer.',
    signals: { heartRate: 68, motion: 0.10, hour: 11, idleSeconds: 60, mood: 4, feedback: 0,  objective: 'wander' } },
  { id: 'sun', short: 'Su', label: 'Sunday',    note: 'Slept, rated high, nowhere to be. It did not oversell it.',
    signals: { heartRate: 66, motion: 0.12, hour: 9,  idleSeconds: 4,  mood: 5, feedback: 1,  objective: 'wander' } },
];

export const dayOf = (id: DayId): Day => WEEK.find((d) => d.id === id) ?? WEEK[2];

/** What one card in the review says. `day` picks the weather behind it. */
export interface WeekView {
  id: string;
  /** Sidebar / state label. */
  label: string;
  /** The day whose signals set the weather and the mascot for this card. */
  day: DayId;
  /** Small uppercase label at the top of the card. */
  eyebrow: string;
  /** The one line the card leads with. */
  headline: string;
  /** The evidence under it, so the claim is arguable. */
  body: string;
  /** Which extra the card carries: the seven-day arc, a single day, or the correction. */
  figure: 'arc' | 'day' | 'tally' | 'none';
}

/* Five cards, in the order you page through them. Adding a card is one entry here —
 * no concept renderer knows how many there are, and none of them branch on an id. */
export const WEEK_VIEWS: WeekView[] = [
  {
    id: 'headline', label: 'The week in one line', day: 'wed', eyebrow: 'Week of 2–8 March', figure: 'arc',
    headline: 'A hard start that flattened out.',
    body: 'Monday and Tuesday ran hot — heart in the nineties before nine. From Wednesday on, nothing stood out, which is the week doing what a week should.',
  },
  {
    id: 'steadiest', label: 'The steadiest day', day: 'wed', eyebrow: 'Steadiest', figure: 'day',
    headline: 'Wednesday asked nothing of you.',
    body: 'Heart at 70, barely moving, rated 3 out of 5. The environment showed a timer and stayed quiet. You told it twice that it had you right.',
  },
  {
    id: 'hardest', label: 'The day it got wrong', day: 'thu', eyebrow: 'Got it wrong', figure: 'tally',
    headline: 'Thursday night it read you as done.',
    body: 'Your body had wound down — heart at 62, still for twenty seconds — so it went quiet and offered breath. You said not quite. It has carried that correction since.',
  },
  {
    id: 'turn', label: 'Where it turned', day: 'fri', eyebrow: 'The turn', figure: 'day',
    headline: 'Friday afternoon it stopped bracing.',
    body: 'You rated a 4 and went wandering. Prompt cards twice, no timer, no breath. The palette warmed for the first time since Monday.',
  },
  {
    id: 'ask', label: 'What it wants to know', day: 'sun', eyebrow: 'Next week', figure: 'none',
    headline: 'Was Thursday a one-off?',
    body: 'It is holding one correction and no pattern. If late evenings read wrong again, it will stop going quiet at 22:00 and ask instead.',
  },
];
