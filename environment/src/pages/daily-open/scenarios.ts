// Daily-open scenarios. Each is a full Signals snapshot of a moment where the environment
// ALREADY knows you: history exists, passive inputs are live, a read has been made before you looked.
// Data only. Adding a scenario is one entry here and one ScreenState, never a renderer change.
import type { ScreenState } from '../../components/v3artboard';
import type { Signals } from '../../engine/signals';

export type ScenarioId = 'monday-wound-up' | 'wednesday-steady' | 'thursday-heavy' | 'sunday-light';

export const SCENARIO_SIGNALS: Record<ScenarioId, Signals> = {
  'monday-wound-up': { heartRate: 96, motion: 0.34, hour: 8, idleSeconds: 2, mood: 2, feedback: 0, objective: 'focus' },
  'wednesday-steady': { heartRate: 70, motion: 0.08, hour: 14, idleSeconds: 6, mood: 3, feedback: 2, objective: 'focus' },
  'thursday-heavy': { heartRate: 62, motion: 0.02, hour: 22, idleSeconds: 20, mood: 2, feedback: -1, objective: 'settle' },
  'sunday-light': { heartRate: 66, motion: 0.12, hour: 9, idleSeconds: 4, mood: 5, feedback: 1, objective: 'wander' },
};

export const SCENARIOS: ScreenState[] = [
  { id: 'monday-wound-up', label: 'Monday 07:40', description: 'Up early, already moving, rated low last night. Opens the app on the way in.' },
  { id: 'wednesday-steady', label: 'Wednesday 14:10', description: 'Nothing wrong, nothing special. The ordinary case the design has to survive.' },
  { id: 'thursday-heavy', label: 'Thursday 22:30', description: 'Late. Body has wound down but the mood has not. The read most likely to land wrong.' },
  { id: 'sunday-light', label: 'Sunday 09:15', description: 'Slept, rated high, nowhere to be. Good news, and it has to not oversell it.' },
];

export const signalsFor = (stateId: string): Signals =>
  SCENARIO_SIGNALS[stateId as ScenarioId] ?? SCENARIO_SIGNALS['wednesday-steady'];
