// Device chrome. Every artboard frame gets wrapped: a bare rectangle of UI reads as a component,
// not a screen, and the whole point of the board is judging screens.
import type { ReactNode } from 'react';

export default function PhoneFrame({ children, scale = 1 }: { children: ReactNode; scale?: number }) {
  return (
    <div style={{ width: 320 * scale, height: 640 * scale }} className="shrink-0">
      <div
        style={{ width: 320, height: 640, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        className="relative overflow-hidden rounded-[38px] border-[10px] border-neutral-900 bg-neutral-900 shadow-2xl shadow-black/40"
      >
        <div className="absolute left-1/2 top-0 z-20 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-neutral-900" />
        <div className="h-full w-full overflow-hidden rounded-[28px]">{children}</div>
      </div>
    </div>
  );
}
