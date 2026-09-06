// Four directions for the daily-open screen, spread along one axis: how loud is the environment's read?
// Every concept is a PURE PROJECTION of EnvSpec. None of them branches on raw signals, and none of them
// branches on which concept it is. Adding a fifth idea is a new entry in CONCEPTS, not an `if` in here.
import type { JSX } from 'react';
import type { Component, EnvSpec } from '../engine/derive';
import type { Objective, Signals } from '../engine/signals';
import Mascot from '../ui/Mascot';
import { Breath, FocusTimer, MoodRater, PromptCards, RootFlow } from '../ui/components';

type Patch = (p: Partial<Signals>) => void;

export interface ConceptProps {
  spec: EnvSpec;
  signals: Signals;
  patch: Patch;
}

export interface Concept {
  id: string;
  name: string;
  /** What this direction is arguing. */
  thesis: string;
  /** What it costs if it is wrong. Stated up front so the board is honest. */
  risk: string;
  Render: (p: ConceptProps) => JSX.Element;
}

const OBJECTIVES: { id: Objective; label: string }[] = [
  { id: 'settle', label: 'Settle' }, { id: 'focus', label: 'Focus' }, { id: 'wander', label: 'Wander' }, { id: 'root', label: 'Root' },
];

/** The real components, same ones the product renders. The board must not draw pictures of them. */
const SLOT: Record<Exclude<Component, 'signalsPanel'>, (p: ConceptProps) => JSX.Element> = {
  moodRater: ({ signals, patch }) => <MoodRater key="mood" signals={signals} patch={patch} />,
  breath: () => <Breath key="breath" />,
  rootFlow: () => <RootFlow key="root" />,
  focusTimer: () => <FocusTimer key="timer" />,
  promptCards: () => <PromptCards key="prompts" />,
};

/** Renders the components derive() says exist, minus any a concept deliberately withholds. */
function Slots({ skip = [], ...p }: ConceptProps & { skip?: Component[] }) {
  const shown = p.spec.components.filter((c): c is Exclude<Component, 'signalsPanel'> => c !== 'signalsPanel' && !skip.includes(c));
  return <>{shown.map((c) => SLOT[c](p))}</>;
}

function Surface({ spec, children }: { spec: EnvSpec; children: React.ReactNode }) {
  return (
    <div
      className={`h-full overflow-y-auto tex-${spec.texture}`}
      style={{
        background: `linear-gradient(160deg, ${spec.palette.from}, ${spec.palette.to})`,
        color: spec.palette.ink, fontSize: spec.type.size, fontWeight: spec.type.weight, letterSpacing: spec.type.tracking,
      }}
    >
      <div className={`flex min-h-full flex-col gap-6 px-5 py-9 tex-${spec.texture}`}>{children}</div>
    </div>
  );
}

/** The mascot without its line, for concepts that carry the read somewhere else. */
const mute = (spec: EnvSpec): EnvSpec => ({ ...spec, mascot: { ...spec.mascot, line: '' } });

/** Pinned, not pushed. Navigation that scrolls off the bottom of a phone is not navigation. */
function Nav({ signals, patch, spec }: ConceptProps) {
  return (
    <nav
      className="sticky bottom-0 -mx-5 mt-auto flex gap-2 px-5 pb-1 pt-4"
      style={{ background: `linear-gradient(to top, ${spec.palette.to}, transparent)` }}
    >
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

/** The correction lever, in its two shapes. Same signal either way: feedback +1 / -1. */
function Correction({ patch, signals, positive, negative }: ConceptProps & { positive: string; negative: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <button onClick={() => patch({ feedback: signals.feedback + 1 })} className="rounded-full border px-3 py-1" style={{ borderColor: 'currentColor' }}>{positive}</button>
      <button onClick={() => patch({ feedback: signals.feedback - 1 })} className="rounded-full border px-3 py-1 opacity-70" style={{ borderColor: 'currentColor' }}>{negative}</button>
    </div>
  );
}

export const CONCEPTS: Concept[] = [
  {
    id: 'weather',
    name: 'A · Weather',
    thesis: 'Never states the read. Palette, texture, mascot posture and which components exist ARE the message. You read the room the way you read weather out of a window.',
    risk: 'Illegible. A good read and random noise look identical, and course correction has nothing to attach to.',
    Render: (p) => (
      <Surface spec={p.spec}>
        <div className="flex justify-end"><Mascot spec={mute(p.spec)} /></div>
        <div className="flex flex-1 flex-col justify-center gap-6">
          <Slots {...p} skip={['moodRater']} />
        </div>
        <Nav {...p} />
      </Surface>
    ),
  },
  {
    id: 'stated',
    name: 'B · The read, stated',
    thesis: 'Leads with the guess and the evidence behind it, correction sitting directly underneath. The mechanism is visible, so it can be argued with.',
    risk: 'Presumptuous. A wrong read is loud, and being told how you feel by software is a bad way to start a Monday.',
    Render: (p) => (
      <Surface spec={p.spec}>
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest opacity-60">Spacetime</p>
            <h1 className="mt-1 text-3xl leading-tight" style={{ fontWeight: p.spec.type.weight + 100 }}>{p.spec.headline}</h1>
          </div>
          <Mascot spec={mute(p.spec)} />
        </header>
        <p className="text-base leading-snug opacity-90">{p.spec.read}</p>
        <Correction {...p} positive="got it" negative="not quite" />
        <Slots {...p} />
        <Nav {...p} />
      </Surface>
    ),
  },
  {
    id: 'narrator',
    name: 'C · Mascot as narrator',
    thesis: 'The environment stays quiet and the mascot carries the whole read. It asks rather than asserts, so being wrong is cheap and forgivable.',
    risk: 'Cute, and one step from the chat app the brief explicitly says not to build.',
    Render: (p) => (
      <Surface spec={p.spec}>
        <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <div className="scale-[1.6]"><Mascot spec={mute(p.spec)} /></div>
          <p className="max-w-[22ch] text-lg leading-snug">{p.spec.mascot.line}</p>
          <p className="max-w-[22ch] text-base opacity-75">{p.spec.ask}</p>
          <Correction {...p} positive="yeah" negative="nah" />
        </div>
        <Slots {...p} skip={['moodRater']} />
        <Nav {...p} />
      </Surface>
    ),
  },
  {
    id: 'quiet-read',
    name: 'D · Quiet read (recommended)',
    thesis: "B's spine with C's manners. States the read and its evidence so the mechanism stays legible, but the mascot asks for the correction instead of the system demanding a rating.",
    risk: 'Two voices on one screen. If the mascot and the read disagree in tone it reads as incoherent rather than gentle.',
    Render: (p) => (
      <Surface spec={p.spec}>
        <p className="text-xs uppercase tracking-widest opacity-60">Spacetime</p>
        <p className="text-2xl leading-snug" style={{ fontWeight: p.spec.type.weight + 100 }}>{p.spec.read}</p>
        <div className="flex items-start gap-3 rounded-2xl border p-3" style={{ borderColor: 'currentColor' }}>
          <div className="scale-90"><Mascot spec={mute(p.spec)} /></div>
          <div className="flex flex-col gap-2">
            <p className="text-sm leading-snug opacity-85">{p.spec.ask}</p>
            <Correction {...p} positive="yeah" negative="not really" />
          </div>
        </div>
        <Slots {...p} />
        <Nav {...p} />
      </Surface>
    ),
  },
];
