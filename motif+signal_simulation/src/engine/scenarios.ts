import type { Signals } from './signals';

export interface Scenario { id: string; name: string; description: string; signals: Signals }

// Complete snapshots: selecting a scenario never inherits inputs from the previous one.
export const SCENARIOS: Scenario[] = [
  { id: 'morning', name: 'Quiet morning', description: 'Resting pulse, good mood, a moment to settle.', signals: { heartRate: 60, motion: 0, hour: 8, idleSeconds: 0, mood: 4, feedback: 0, objective: 'settle' } },
  { id: 'focus', name: 'Work session', description: 'A steady afternoon with one thing to focus on.', signals: { heartRate: 72, motion: 0.1, hour: 14, idleSeconds: 0, mood: 3, feedback: 0, objective: 'focus' } },
  { id: 'charged', name: 'Charged moment', description: 'High pulse and movement, low self-rated mood.', signals: { heartRate: 110, motion: 0.65, hour: 15, idleSeconds: 0, mood: 2, feedback: 0, objective: 'focus' } },
  { id: 'low', name: 'Heavy afternoon', description: 'Low mood while looking for a moment to settle.', signals: { heartRate: 70, motion: 0, hour: 16, idleSeconds: 0, mood: 1, feedback: 0, objective: 'settle' } },
  { id: 'explore', name: 'Time to explore', description: 'Positive mood, moderate activity, room to wander.', signals: { heartRate: 78, motion: 0.2, hour: 18, idleSeconds: 0, mood: 5, feedback: 0, objective: 'wander' } },
  { id: 'night', name: 'Away at night', description: 'Late hour, no recent interaction, mood unknown.', signals: { heartRate: 58, motion: 0, hour: 23, idleSeconds: 120, mood: null, feedback: 0, objective: 'settle' } },
  // Hold context constant to compare the four energy / pleasantness combinations.
  { id: 'high-unpleasant', name: 'High Energy Unpleasant', description: 'High energy and low mood. Midday, with the objective held at Settle.', signals: { heartRate: 110, motion: 0.5, hour: 12, idleSeconds: 0, mood: 1, feedback: 0, objective: 'settle' } },
  { id: 'high-pleasant', name: 'High Energy Pleasant', description: 'High energy and positive mood. Midday, with the objective held at Settle.', signals: { heartRate: 110, motion: 0.5, hour: 12, idleSeconds: 0, mood: 5, feedback: 0, objective: 'settle' } },
  { id: 'low-unpleasant', name: 'Low Energy Unpleasant', description: 'Low energy and low mood. Midday, with the objective held at Settle.', signals: { heartRate: 60, motion: 0, hour: 12, idleSeconds: 0, mood: 1, feedback: 0, objective: 'settle' } },
  { id: 'low-pleasant', name: 'Low Energy Pleasant', description: 'Low energy and positive mood. Midday, with the objective held at Settle.', signals: { heartRate: 60, motion: 0, hour: 12, idleSeconds: 0, mood: 5, feedback: 0, objective: 'settle' } },
];
