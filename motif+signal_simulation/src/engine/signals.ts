// Signals are everything the environment is allowed to react to.
// Two kinds: PASSIVE (the world feeds them in, the user does nothing) and EXPLICIT (the user told us).
// Keep each one a plain number or enum so any source (real sensor, simulation, teammate's mock) can supply it.

export type Objective = 'settle' | 'focus' | 'wander' | 'root';

export interface Signals {
  // --- passive ---
  /** Heart rate, bpm. Smartwatch in the real thing; simulated here. */
  heartRate: number;
  /** 0..1 how much the device / cursor is moving right now. */
  motion: number;
  /** Local hour 0..23. */
  hour: number;
  /** Seconds since the user last touched anything. */
  idleSeconds: number;

  // --- explicit ---
  /** Self-rated mood 1..5 (3 = neutral). null = not rated yet. */
  mood: number | null;
  /** Running feedback score: sum of thumbs up (+1) / down (-1). The course-correction lever. */
  feedback: number;
  /** What the user is here to do. */
  objective: Objective;
}

export const DEFAULT_SIGNALS: Signals = {
  heartRate: 68,
  motion: 0,
  hour: new Date().getHours(),
  idleSeconds: 0,
  mood: null,
  feedback: 0,
  objective: 'settle',
};

export interface SignalSource {
  name: string;
  kind: 'passive' | 'explicit';
  /** Human-readable note shown in the Signals panel, e.g. "simulated" or "DeviceMotion". */
  note: string;
}
