// One shared screen renderer for all four concepts (variant_config_pattern).
// The chrome — surface, objective nav, correction lever — is written once. Only the body
// differs, and each body is a PURE PROJECTION of EnvSpec: no branching on raw signals, and
// no `concept === 'x' ? ... : ...`. Wording comes from CONCEPT_CONFIG.
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { derive, type Component, type EnvSpec } from '../../engine/derive';
import type { Objective, Signals } from '../../engine/signals';
import Mascot from '../../ui/Mascot';
import { Breath, FocusTimer, MoodRater, PromptCards, RootFlow } from '../../ui/components';
import { CONCEPT_CONFIG, type ConceptId } from './mode-config';
import { signalsFor } from './scenarios';

type Patch = (p: Partial<Signals>) => void;
interface Ctx { id: ConceptId; spec: EnvSpec; signals: Signals; patch: Patch }

const OBJECTIVES: { id: Objective; label: string }[] = [
  { id: 'settle', label: 'Settle' }, { id: 'focus', label: 'Focus' }, { id: 'wander', label: 'Wander' }, { id: 'root', label: 'Root' },
];

/** The real components, same ones the product renders. The board must not draw pictures of them. */
const SLOT: Record<Exclude<Component, 'signalsPanel'>, (c: Ctx) => JSX.Element> = {
  moodRater: ({ signals, patch }) => <MoodRater key="mood" signals={signals} patch={patch} />,
  breath: () => <Breath key="breath" />,
  rootFlow: () => <RootFlow key="root" />,
  focusTimer: () => <FocusTimer key="timer" />,
  promptCards: () => <PromptCards key="prompts" />,
};

/** Renders the components derive() says exist, minus any a concept deliberately withholds. */
function Slots({ skip = [], ...c }: Ctx & { skip?: Component[] }) {
  const shown = c.spec.components.filter((x): x is Exclude<Component, 'signalsPanel'> => x !== 'signalsPanel' && !skip.includes(x));
  return <>{shown.map((x) => SLOT[x](c))}</>;
}

/** The mascot without its line, for concepts that carry the read somewhere else. */
const mute = (spec: EnvSpec): EnvSpec => ({ ...spec, mascot: { ...spec.mascot, line: '' } });

function Surface({ spec, children }: { spec: EnvSpec; children: ReactNode }) {
  return (
    <div
      // flex-1/min-h-0 rather than h-full: the phone shell is a flex column, and a
      // percentage height against an auto-height (grow) frame collapses to the content,
      // leaving dead space under the surface.
      className={`flex min-h-0 flex-1 flex-col overflow-y-auto tex-${spec.texture}`}
      style={{
        background: `linear-gradient(160deg, ${spec.palette.from}, ${spec.palette.to})`,
        color: spec.palette.ink, fontSize: spec.type.size, fontWeight: spec.type.weight, letterSpacing: spec.type.tracking,
      }}
    >
      <div className={`flex min-h-full flex-1 flex-col gap-6 px-5 py-9 tex-${spec.texture}`}>{children}</div>
    </div>
  );
}

/** Pinned, not pushed. Navigation that scrolls off the bottom of a phone is not navigation. */
function Nav({ signals, patch, spec }: Ctx) {
  return (
    <nav className="sticky bottom-0 -mx-5 mt-auto flex gap-2 px-5 pb-1 pt-4" style={{ background: `linear-gradient(to top, ${spec.palette.to}, transparent)` }}>
      {OBJECTIVES.map((o) => (
        <button key={o.id} onClick={() => patch({ objective: o.id })}
          className="rounded-full border px-3 py-1 text-sm transition"
          style={{ borderColor: 'currentColor', background: signals.objective === o.id ? 'currentColor' : 'transparent' }}>
          <span style={{ mixBlendMode: 'difference', color: 'white' }}>{o.label}</span>
        </button>
      ))}
    </nav>
  );
}

function Correction(c: Ctx) {
  const { positive, negative } = CONCEPT_CONFIG[c.id].correction;
  return (
    <div className="flex gap-2 text-sm">
      <button onClick={() => c.patch({ feedback: c.signals.feedback + 1 })} className="rounded-full border px-3 py-1" style={{ borderColor: 'currentColor' }}>{positive}</button>
      <button onClick={() => c.patch({ feedback: c.signals.feedback - 1 })} className="rounded-full border px-3 py-1 opacity-70" style={{ borderColor: 'currentColor' }}>{negative}</button>
    </div>
  );
}

/** The one thing that genuinely differs between concepts: how loud the read is. */
const LAYOUT: Record<ConceptId, (c: Ctx) => JSX.Element> = {
  weather: (c) => (
    <Surface spec={c.spec}>
      <div className="flex justify-end"><Mascot spec={mute(c.spec)} /></div>
      <div className="flex flex-1 flex-col justify-center gap-6"><Slots {...c} skip={['moodRater']} /></div>
      <Nav {...c} />
    </Surface>
  ),
  stated: (c) => (
    <Surface spec={c.spec}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest opacity-60">Spacetime</p>
          <h1 className="mt-1 text-3xl leading-tight" style={{ fontWeight: c.spec.type.weight + 100 }}>{c.spec.headline}</h1>
        </div>
        <Mascot spec={mute(c.spec)} />
      </header>
      <p className="text-base leading-snug opacity-90">{c.spec.read}</p>
      <Correction {...c} />
      <Slots {...c} />
      <Nav {...c} />
    </Surface>
  ),
  narrator: (c) => (
    <Surface spec={c.spec}>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <div className="scale-[1.6]"><Mascot spec={mute(c.spec)} /></div>
        <p className="max-w-[22ch] text-lg leading-snug">{c.spec.mascot.line}</p>
        <p className="max-w-[22ch] text-base opacity-75">{c.spec.ask}</p>
        <Correction {...c} />
      </div>
      <Slots {...c} skip={['moodRater']} />
      <Nav {...c} />
    </Surface>
  ),
  'quiet-read': (c) => (
    <Surface spec={c.spec}>
      <p className="text-xs uppercase tracking-widest opacity-60">Spacetime</p>
      <p className="text-2xl leading-snug" style={{ fontWeight: c.spec.type.weight + 100 }}>{c.spec.read}</p>
      <div className="flex items-start gap-3 rounded-2xl border p-3" style={{ borderColor: 'currentColor' }}>
        <div className="scale-90"><Mascot spec={mute(c.spec)} /></div>
        <div className="flex flex-col gap-2">
          <p className="text-sm leading-snug opacity-85">{c.spec.ask}</p>
          <Correction {...c} />
        </div>
      </div>
      <Slots {...c} />
      <Nav {...c} />
    </Surface>
  ),
};

/**
 * Owns its own signals, seeded from the scenario. In the viewer that makes the screen live —
 * rate a mood, answer the mascot, switch objective, and derive() re-runs. The artboard wraps
 * this in pointer-events-none so every grid frame stays pinned to the scenario it claims.
 */
export function ConceptScreen({ conceptId, stateId }: { conceptId: ConceptId; stateId: string }) {
  const [signals, setSignals] = useState<Signals>(() => signalsFor(stateId));
  const patch = useCallback((p: Partial<Signals>) => setSignals((s) => ({ ...s, ...p })), []);
  const spec = useMemo(() => derive(signals), [signals]);
  return LAYOUT[conceptId]({ id: conceptId, spec, signals, patch });
}
