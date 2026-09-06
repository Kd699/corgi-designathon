// Daily-open scenarios. Each is a full Signals snapshot of a moment where the environment
// ALREADY knows you: history exists, passive inputs are live, a read has been made before you looked.
// Data only. Adding a scenario is one entry here, never a change to a renderer.
import type { Signals } from '../engine/signals';

export interface Preset {
  id: string;
  /** When this is, in the user's words. */
  label: string;
  /** What the person is actually walking in with. Sets up what a good read would be. */
  note: string;
  signals: Signals;
}

export const PRESETS: Preset[] = [
  {
    id: 'monday-wound-up',
    label: 'Monday 07:40',
    note: 'Up early, already moving, rated themselves low last night. Opens the app on the way in.',
    signals: { heartRate: 96, motion: 0.34, hour: 8, idleSeconds: 2, mood: 2, feedback: 0, objective: 'focus' },
  },
  {
    id: 'wednesday-steady',
    label: 'Wednesday 14:10',
    note: 'Mid-afternoon, nothing wrong, nothing special. The ordinary case the design has to survive.',
    signals: { heartRate: 70, motion: 0.08, hour: 14, idleSeconds: 6, mood: 3, feedback: 2, objective: 'focus' },
  },
  {
    id: 'thursday-heavy',
    label: 'Thursday 22:30',
    note: 'Late, body has wound down but the mood has not. The read most likely to land wrong.',
    signals: { heartRate: 62, motion: 0.02, hour: 22, idleSeconds: 20, mood: 2, feedback: -1, objective: 'settle' },
  },
  {
    id: 'sunday-light',
    label: 'Sunday 09:15',
    note: 'Slept, rated high, nowhere to be. The environment has good news and has to not oversell it.',
    signals: { heartRate: 66, motion: 0.12, hour: 9, idleSeconds: 4, mood: 5, feedback: 1, objective: 'wander' },
  },
];
