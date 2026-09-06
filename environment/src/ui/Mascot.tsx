import type { EnvSpec } from '../engine/derive';

// A blob with eyes. Everything visual comes from spec.mascot; no branching on raw signals here.
const EYES: Record<EnvSpec['mascot']['state'], { ry: number; brow: number }> = {
  asleep: { ry: 0.6, brow: 0 },
  calm: { ry: 5, brow: 0 },
  curious: { ry: 7, brow: -3 },
  alert: { ry: 8, brow: -5 },
  frazzled: { ry: 8, brow: 4 },
};
const MOTION: Record<EnvSpec['mascot']['motion'], string> = {
  still: 'none', breathe: 'breathe 4s ease-in-out infinite', bob: 'bob 1.6s ease-in-out infinite', jitter: 'jitter 0.25s linear infinite',
};

export default function Mascot({ spec }: { spec: EnvSpec }) {
  const { state, motion, line } = spec.mascot;
  const e = EYES[state];
  return (
    <div className="flex shrink-0 items-center gap-3">
      <svg width="72" height="72" viewBox="0 0 72 72" style={{ animation: MOTION[motion], transformOrigin: '50% 60%' }} aria-label={`mascot ${state}`}>
        <path d="M36 6c16 0 30 12 30 28S52 66 36 66 6 50 6 34 20 6 36 6z" fill={spec.palette.accent} opacity="0.95" />
        <ellipse cx="27" cy="32" rx="5" ry={e.ry} fill={spec.palette.ink} />
        <ellipse cx="45" cy="32" rx="5" ry={e.ry} fill={spec.palette.ink} />
        <path d={`M20 ${22 + e.brow} q7 -4 14 0`} stroke={spec.palette.ink} strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d={`M38 ${22 + e.brow} q7 -4 14 0`} stroke={spec.palette.ink} strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
      {line && <p className="max-w-[16ch] text-sm leading-snug opacity-80">{line}</p>}
    </div>
  );
}
