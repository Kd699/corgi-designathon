// The environment shell. Signals in -> derive() -> spec -> render. Nothing here decides how it looks.
import { useCallback, useMemo, useState } from 'react';
import { derive, type Component } from './engine/derive';
import { DEFAULT_SIGNALS, type Objective, type Signals } from './engine/signals';
import { useClockAndIdle, useMotion, useSimWatch } from './engine/sources';
import Mascot from './ui/Mascot';
import { Breath, FocusTimer, MoodRater, PromptCards, RootFlow, SignalsPanel } from './ui/components';

const OBJECTIVES: { id: Objective; label: string }[] = [
  { id: 'settle', label: 'Settle' }, { id: 'focus', label: 'Focus' }, { id: 'wander', label: 'Wander' }, { id: 'root', label: 'Root' },
];

export default function App() {
  const [signals, setSignals] = useState<Signals>(DEFAULT_SIGNALS);
  const [watchTarget, setWatchTarget] = useState(68);
  const patch = useCallback((p: Partial<Signals>) => setSignals((s) => ({ ...s, ...p })), []);
  useSimWatch(watchTarget, patch);
  useMotion(patch);
  useClockAndIdle(patch);

  const spec = useMemo(() => derive(signals), [signals]);

  const render: Record<Component, () => JSX.Element> = {
    moodRater: () => <MoodRater key="mood" signals={signals} patch={patch} />,
    breath: () => <Breath key="breath" />,
    rootFlow: () => <RootFlow key="root" />,
    focusTimer: () => <FocusTimer key="timer" />,
    promptCards: () => <PromptCards key="prompts" />,
    signalsPanel: () => <SignalsPanel key="signals" signals={signals} spec={spec} patch={patch} watchTarget={watchTarget} setWatchTarget={setWatchTarget} />,
  };

  return (
    <div
      className={`min-h-full transition-[background] duration-1000 tex-${spec.texture}`}
      style={{ background: `linear-gradient(160deg, ${spec.palette.from}, ${spec.palette.to})`, color: spec.palette.ink, fontSize: spec.type.size, fontWeight: spec.type.weight, letterSpacing: spec.type.tracking }}
    >
      <div className={`min-h-full tex-${spec.texture}`}>
        <div className="mx-auto flex max-w-xl flex-col gap-8 px-5 py-8">
          <header className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest opacity-60">Spacetime</p>
              <h1 className="mt-1 text-3xl leading-tight" style={{ fontWeight: spec.type.weight + 100 }}>{spec.headline}</h1>
            </div>
            <Mascot spec={spec} />
          </header>

          <nav className="flex gap-2">
            {OBJECTIVES.map((o) => (
              <button key={o.id} onClick={() => patch({ objective: o.id })}
                className="rounded-full border px-3 py-1 text-sm transition"
                style={{ borderColor: 'currentColor', background: signals.objective === o.id ? 'currentColor' : 'transparent' }}>
                <span style={{ mixBlendMode: 'difference', color: 'white' }}>{o.label}</span>
              </button>
            ))}
          </nav>

          {spec.components.map((c) => render[c]())}
        </div>
      </div>
    </div>
  );
}
