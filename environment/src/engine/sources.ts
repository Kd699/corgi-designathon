// Passive signal sources. Each one is a hook that pushes into the shared Signals.
// Real hardware slots in here later (Apple Watch via HealthKit bridge, etc.); today they are simulated
// or use what a browser can already sense (cursor velocity, DeviceMotion, clock, idle).
import { useEffect, useRef } from 'react';
import type { Signals } from './signals';

type Patch = (p: Partial<Signals>) => void;

/** Simulated smartwatch: heart rate drifts around a target the user can drag. */
export function useSimWatch(target: number, patch: Patch) {
  useEffect(() => {
    let hr = target;
    const id = setInterval(() => {
      hr += (target - hr) * 0.2 + (Math.random() - 0.5) * 3;
      patch({ heartRate: Math.round(hr) });
    }, 1000);
    return () => clearInterval(id);
  }, [target, patch]);
}

/** Motion: DeviceMotion on phones, cursor velocity on desktop. Decays toward 0. */
export function useMotion(patch: Patch) {
  const energy = useRef(0);
  useEffect(() => {
    let last: { x: number; y: number; t: number } | null = null;
    const onMouse = (e: MouseEvent) => {
      const now = performance.now();
      if (last) {
        const d = Math.hypot(e.clientX - last.x, e.clientY - last.y) / Math.max(1, now - last.t);
        energy.current = Math.min(1, energy.current + d * 0.15);
      }
      last = { x: e.clientX, y: e.clientY, t: now };
    };
    const onDevice = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const g = Math.abs(Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0) - 9.81);
      energy.current = Math.min(1, energy.current + g * 0.05);
    };
    window.addEventListener('mousemove', onMouse);
    window.addEventListener('devicemotion', onDevice);
    const id = setInterval(() => {
      energy.current *= 0.85;
      patch({ motion: Number(energy.current.toFixed(2)) });
    }, 250);
    return () => { window.removeEventListener('mousemove', onMouse); window.removeEventListener('devicemotion', onDevice); clearInterval(id); };
  }, [patch]);
}

/** Clock + idle. Any pointer/key press resets idle. */
export function useClockAndIdle(patch: Patch) {
  useEffect(() => {
    let lastTouch = Date.now();
    const touch = () => { lastTouch = Date.now(); };
    ['pointerdown', 'keydown', 'mousemove', 'touchstart'].forEach((ev) => window.addEventListener(ev, touch));
    const id = setInterval(() => patch({ hour: new Date().getHours(), idleSeconds: Math.round((Date.now() - lastTouch) / 1000) }), 1000);
    return () => { ['pointerdown', 'keydown', 'mousemove', 'touchstart'].forEach((ev) => window.removeEventListener(ev, touch)); clearInterval(id); };
  }, [patch]);
}
