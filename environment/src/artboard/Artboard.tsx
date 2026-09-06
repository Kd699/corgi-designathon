// The board. Rows are daily-open scenarios, columns are concepts. Every cell is real:
// the preset's Signals go through the real derive() and the real components render the result.
// Nothing here is a drawing, so a frame cannot claim something the product would not do.
import { useCallback, useMemo, useState } from 'react';
import { derive } from '../engine/derive';
import type { Signals } from '../engine/signals';
import { SignalsPanel } from '../ui/components';
import { CONCEPTS, type Concept } from './concepts';
import PhoneFrame from './PhoneFrame';
import { PRESETS, type Preset } from './presets';

const noop = () => {};
const CELL_SCALE = 0.52;

/** One cell: static by design. Live state would let a frame drift away from the scenario it claims. */
function Cell({ preset, concept, onOpen }: { preset: Preset; concept: Concept; onOpen: () => void }) {
  const spec = useMemo(() => derive(preset.signals), [preset]);
  return (
    <button onClick={onOpen} className="group relative block text-left" title={`Open ${concept.name} at ${preset.label}`}>
      <PhoneFrame scale={CELL_SCALE}>
        <div className="pointer-events-none h-full">
          <concept.Render spec={spec} signals={preset.signals} patch={noop} />
        </div>
      </PhoneFrame>
      <span className="absolute inset-0 rounded-[38px] ring-2 ring-transparent transition group-hover:ring-sky-400" />
    </button>
  );
}

/** Solo: one concept, one scenario, actually live. Drag the watch and watch the frame move. */
function Solo({ preset, concept, onBack }: { preset: Preset; concept: Concept; onBack: () => void }) {
  const [signals, setSignals] = useState<Signals>(preset.signals);
  const [watchTarget, setWatchTarget] = useState(preset.signals.heartRate);
  const patch = useCallback((p: Partial<Signals>) => setSignals((s) => ({ ...s, ...p })), []);
  const spec = useMemo(() => derive(signals), [signals]);

  return (
    <div className="min-h-screen bg-neutral-950 px-6 py-8 text-neutral-200">
      <button onClick={onBack} className="mb-6 text-sm text-neutral-400 underline underline-offset-4">back to the board</button>
      <div className="flex flex-wrap items-start gap-10">
        <PhoneFrame>
          <concept.Render spec={spec} signals={signals} patch={patch} />
        </PhoneFrame>
        <div className="w-[26rem] max-w-full">
          <h2 className="text-xl">{concept.name}</h2>
          <p className="mt-1 text-sm text-neutral-400">{preset.label} — {preset.note}</p>
          <p className="mt-4 text-sm leading-relaxed">{concept.thesis}</p>
          <p className="mt-3 text-sm leading-relaxed text-amber-300/80"><b>Risk:</b> {concept.risk}</p>
          <div className="mt-6 text-neutral-200">
            <SignalsPanel signals={signals} spec={spec} patch={patch} watchTarget={watchTarget} setWatchTarget={setWatchTarget} />
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Heart rate here is the slider only — the simulated watch does not run on the board, so a frame stays
            on the scenario it claims until you move something yourself.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Artboard() {
  const [solo, setSolo] = useState<{ p: Preset; c: Concept } | null>(null);
  if (solo) return <Solo preset={solo.p} concept={solo.c} onBack={() => setSolo(null)} />;

  return (
    <div className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-200">
      <header className="mb-10 max-w-3xl">
        <p className="text-xs uppercase tracking-widest text-neutral-500">Corgi Designathon · Artboard 01</p>
        <h1 className="mt-2 text-3xl">The daily open</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">
          The screen you land on when the environment already knows you: history exists, passive signals are live,
          and it has made a read before you looked at it. The job is to show that read without turning it into a
          dashboard you have to audit. Four directions, spread along one axis — <b className="text-neutral-200">how loud is the read?</b>
        </p>
        <p className="mt-3 text-sm text-neutral-500">
          Every frame is the real <code className="text-neutral-300">derive()</code> and the real components. Click any frame to open it live.
        </p>
      </header>

      <div className="overflow-x-auto pb-6">
        <div className="inline-grid gap-x-8 gap-y-12" style={{ gridTemplateColumns: `14rem repeat(${CONCEPTS.length}, auto)` }}>
          <div />
          {CONCEPTS.map((c) => (
            <div key={c.id} className="w-[320px] max-w-[calc(320px*var(--s,0.52))]" style={{ width: 320 * CELL_SCALE }}>
              <h2 className="text-sm font-medium">{c.name}</h2>
              <p className="mt-1 text-xs leading-relaxed text-neutral-400">{c.thesis}</p>
              <p className="mt-2 text-xs leading-relaxed text-amber-300/70">{c.risk}</p>
            </div>
          ))}

          {PRESETS.map((p) => (
            <FrameRow key={p.id} preset={p} onOpen={(c) => setSolo({ p, c })} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FrameRow({ preset, onOpen }: { preset: Preset; onOpen: (c: Concept) => void }) {
  return (
    <>
      <div className="pt-2">
        <h3 className="text-sm font-medium">{preset.label}</h3>
        <p className="mt-1 text-xs leading-relaxed text-neutral-400">{preset.note}</p>
        <p className="mt-2 text-xs text-neutral-500">
          hr {preset.signals.heartRate} · mood {preset.signals.mood ?? '-'} · {preset.signals.objective}
        </p>
      </div>
      {CONCEPTS.map((c) => <Cell key={c.id} preset={preset} concept={c} onOpen={() => onOpen(c)} />)}
    </>
  );
}
