/* The day, as one object. Every widget is a pure projection of a slice of this — no widget
 * parses text, calls a model, or holds state of its own.
 *
 * The agent's whole job is to return a PATCH of this shape plus the order to show it in.
 * That is the entire contract: add a dimension here, teach the prompt about it, write a
 * widget that reads it. Nothing else changes.
 */

export interface MoodPoint {
  /** "08:20" — the clock, not a duration. */
  at: string;
  /** -1 rough .. 1 good. */
  value: number;
  /** Optional one-word cause, shown on the point. */
  note?: string;
}

/** The companion's schedule shape, kept name-for-name so events can move between them. */
export interface TimelineEvent {
  id: string;
  name: string;
  /** "09:30" */
  start: string;
  durationMinutes: number;
  kind: 'work' | 'people' | 'body' | 'rest' | 'admin';
}

export interface Person {
  name: string;
  /** -1 draining .. 1 restoring. */
  warmth: number;
  context?: string;
}

export interface FocusBlock {
  label: string;
  minutes: number;
  /** 0..1 — how deep it actually got. */
  depth: number;
}

export interface DayState {
  /** The one line the day is. The agent writes this; it is the only prose it must produce. */
  headline: string;
  /** The evidence under the headline, in the user's own terms. */
  read: string;
  mood: MoodPoint[];
  /** 0..1 at the moment of writing. */
  energy: number;
  timeline: TimelineEvent[];
  people: Person[];
  focus: FocusBlock[];
  body: { sleepHours: number | null; restingHeart: number | null; moveMinutes: number | null };
  wins: string[];
  frictions: string[];
  /** One thing for tomorrow, phrased as a question the day asks. */
  tomorrow: string;
}

export const EMPTY_DAY: DayState = {
  headline: '',
  read: '',
  mood: [],
  energy: 0,
  timeline: [],
  people: [],
  focus: [],
  body: { sleepHours: null, restingHeart: null, moveMinutes: null },
  wins: [],
  frictions: [],
  tomorrow: '',
};

export type WidgetId =
  | 'read' | 'mood' | 'energy' | 'timeline' | 'people'
  | 'focus' | 'body' | 'wins' | 'frictions' | 'tomorrow';

/** What the agent sends back. `day` is always complete — both paths merge their patch onto
 *  the board they were given, so a caller never has to think about partials. */
export interface AgentReply {
  day: DayState;
  /** Ordered. Widgets not listed are not shown — the board is the agent's choice, not a fixed grid. */
  surface: WidgetId[];
  /** One line back to the user, shown under the composer. */
  say: string;
}
