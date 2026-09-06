import type { Signals } from './signals';

export interface ButtonSpec {
  face: {
    expression: 'excited' | 'tense' | 'content' | 'weary' | 'asleep';
    eyeHeight: number;
    eyeTilt: number;
    mouthCurve: number;
    browTilt: number;
    browOpacity: number;
    blinkSeconds: number;
    gazePixels: number;
    asleep: boolean;
  };
  state: string;
  shape: string;
  polygons: string[];
  colors: string[];
  motion: 'float' | 'bounce' | 'tremble' | 'press' | 'still';
  duration: number;
  amplitude: number;
  transition: number;
  sound: { name: string; wave: 'sine' | 'triangle'; frequency: number; ratios: number[]; decay: number; gain: number; glide: number };
}

// Equal vertex counts let CSS interpolate between every outline, including interrupted morphs.
function outline(index: number, pleasant: number, energy: number): string {
  const exponent = 5 - pleasant * 3;
  const points = Array.from({ length: 64 }, (_, i) => {
    const angle = i * Math.PI * 2 / 64;
    const x = Math.cos(angle), y = Math.sin(angle);
    const radius = 1 / Math.pow(Math.pow(Math.abs(x), exponent) + Math.pow(Math.abs(y), exponent), 1 / exponent);
    const scallop = 1 - pleasant * energy * (0.07 + index * 0.025) * (1 + Math.cos(angle * (6 + index * 2)));
    const cut = 1 - (1 - pleasant) * energy * 0.17 * (1 + Math.cos(angle * (4 + index * 2)));
    const width = index === 1 ? 46 : 42;
    const height = index === 1 ? 32 + energy * 7 : 42;
    return `${(50 + x * radius * scallop * cut * width).toFixed(2)}% ${(50 + y * radius * scallop * cut * height).toFixed(2)}%`;
  });
  return `polygon(${points.join(', ')})`;
}

export function deriveButtons(s: Signals, valence: number, arousal: number): ButtonSpec {
  const pleasant = (valence + 1) / 2;
  const high = arousal > 0.6;
  const positive = valence >= 0;
  const idle = s.idleSeconds > 90;
  const night = s.hour >= 21 || s.hour < 6;
  const motion = idle ? 'still' : high ? positive ? 'bounce' : 'tremble' : positive ? 'float' : 'press';
  return {
    face: {
      expression: idle ? 'asleep' : high ? positive ? 'excited' : 'tense' : positive ? 'content' : 'weary',
      eyeHeight: idle ? 3 : 9 + arousal * 10,
      eyeTilt: positive ? -8 - arousal * 8 : 12 + arousal * 8,
      mouthCurve: idle ? 0 : valence * (8 + arousal * 5),
      browTilt: high ? 20 : -20,
      browOpacity: idle ? 0 : Math.max(0, -valence) * 0.85,
      blinkSeconds: 6 - arousal * 2.5,
      gazePixels: idle ? 0 : 1 + arousal * 3,
      asleep: idle,
    },
    state: idle ? 'Resting' : `${high ? 'High' : 'Low'} energy · ${positive ? 'pleasant' : 'unpleasant'}`,
    shape: high ? positive ? 'Scalloped & rounded' : 'Notched & angular' : positive ? 'Circles & capsules' : 'Soft squares',
    polygons: [0, 1, 2].map(i => outline(i, pleasant, arousal)),
    colors: [0, 1, 2].map(i => `hsl(${positive ? 148 + i * 30 : 250 + i * 18} ${32 + arousal * 25}% ${night ? 38 : 45}%)`),
    motion,
    duration: 5 - arousal * 4.1,
    amplitude: 2 + arousal * 9,
    transition: 1100 - arousal * 500,
    sound: {
      name: idle ? 'Silent' : positive ? high ? 'Bright chime' : 'Soft bell' : high ? 'Short buzz' : 'Low hum',
      wave: positive ? 'sine' : 'triangle',
      frequency: (positive ? 240 : 125) + arousal * 220,
      ratios: s.objective === 'wander' ? [1, 1.5, 2] : positive ? [1, 1.25, 1.5] : [1, 1.06, 1.19],
      decay: 0.8 - arousal * 0.55,
      gain: idle ? 0 : night ? 0.025 : 0.05,
      glide: positive ? 1.08 : 0.8,
    },
  };
}
