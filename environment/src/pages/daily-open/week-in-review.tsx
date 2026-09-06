/* Week in review — three concepts for the same five cards.
 *
 * The argument being tested is placement, not content: the weather is `derive()` on the
 * day the card is about, the mascot stands in front of it, and the card carries the read.
 * What differs is how much room each concept gives the weather versus the card, and how
 * you move between cards.
 *
 * Every concept renders the SAME <Card>, <Arc>, <DayChip> and <Mascot> — only the stage
 * around them changes. Nothing here branches on a concept id outside the LAYOUT record,
 * and nothing branches on a view id at all: the cards are data in week.ts.
 *
 * Paging is live in the viewer (arrows, dots, and Play cycling on a timer) and frozen in
 * the artboard, so a board frame always shows the card it is labelled with.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { DesktopFrame, type ScreenMode, type StateConfig } from '../../components/v3artboard';
import { derive, type EnvSpec } from '../../engine/derive';
import Mascot from '../../ui/Mascot';
import { WEEK, WEEK_VIEWS, dayOf, type WeekView } from './week';

export type WeekConceptId = 'week-stage' | 'week-postcard' | 'week-filmstrip';

interface ConceptCfg { label: string; thesis: string; risk: string }

export const WEEK_CONCEPTS: WeekConceptId[] = ['week-stage', 'week-postcard', 'week-filmstrip'];

export const WEEK_CONCEPT_CONFIG: Record<WeekConceptId, ConceptCfg> = {
  'week-stage': {
    label: 'W1 · Stage',
    thesis: 'The weather is the whole screen and the card floats on it, mascot standing on the card’s edge. The read is the room you are standing in; the words are a note pinned to it.',
    risk: 'A card over a gradient is the weakest place to put text. If the weather is doing its job the card fights it.',
  },
  'week-postcard': {
    label: 'W2 · Postcard',
    thesis: 'The weather is framed — a window at the top of a plain card, mascot inside it. You look AT the week rather than standing in it, and the text sits on a surface built for text.',
    risk: 'Framing the weather demotes it to an illustration. The strongest signal becomes a picture at the top of a document.',
  },
  'week-filmstrip': {
    label: 'W3 · Filmstrip',
    thesis: 'Seven day-tiles along the bottom, each tinted with that day’s own weather, and the selected card above. The week is legible before you read a word, and paging has somewhere to happen.',
    risk: 'Two navigations on one screen — the strip and the dots — and the tiles are small enough that the weather reads as decoration.',
  },
};

/* ── shared parts ─────────────────────────────────────────────────────── */

const SURFACE = (spec: EnvSpec) => ({
  background: `linear-gradient(160deg, ${spec.palette.from}, ${spec.palette.to})`,
  color: spec.palette.ink,
});

/** The seven-day mood arc. One bar per day, height from that day's arousal, tint from its palette. */
function Arc({ activeDay }: { activeDay: string }) {
  return (
    <div className="flex items-end gap-2" style={{ height: 68 }}>
      {WEEK.map((d) => {
        const s = derive(d.signals);
        const h = 20 + Math.round(s.arousal * 44);
        const on = d.id === activeDay;
        return (
          <div key={d.id} className="flex flex-1 flex-col items-center gap-1.5">
            <div
              className="w-full rounded-md"
              style={{ height: h, background: s.palette.from, opacity: on ? 1 : 0.45, outline: on ? '2px solid currentColor' : 'none', outlineOffset: 2 }}
            />
            <span className="text-[10px] uppercase tracking-wider" style={{ opacity: on ? 0.9 : 0.5 }}>{d.short}</span>
          </div>
        );
      })}
    </div>
  );
}

/** One day, spelled out: the numbers the read was made from. */
function DayChip({ dayId }: { dayId: string }) {
  const d = dayOf(dayId as never);
  const s = derive(d.signals);
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-3" style={{ borderColor: 'currentColor' }}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest opacity-70">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.palette.from }} />
        {d.label}
      </div>
      <p className="text-sm leading-snug opacity-90">{d.note}</p>
      <dl className="flex gap-5 text-[11px] tabular-nums opacity-70">
        <div><dt className="uppercase tracking-wider">Heart</dt><dd className="text-base">{d.signals.heartRate}</dd></div>
        <div><dt className="uppercase tracking-wider">Mood</dt><dd className="text-base">{d.signals.mood ?? '—'}</dd></div>
        <div><dt className="uppercase tracking-wider">Hour</dt><dd className="text-base">{d.signals.hour}:00</dd></div>
      </dl>
    </div>
  );
}

/** The correction ledger: what you told it, day by day. This is the lever, made visible. */
function Tally() {
  return (
    <div className="flex gap-1.5">
      {WEEK.map((d) => {
        const f = d.signals.feedback;
        const mark = f > 0 ? 'right' : f < 0 ? 'wrong' : '—';
        return (
          <div key={d.id} className="flex flex-1 flex-col items-center gap-1 rounded-lg border py-2 text-[10px]" style={{ borderColor: 'currentColor', opacity: f === 0 ? 0.45 : 1 }}>
            <span className="uppercase tracking-wider">{d.short}</span>
            <span className="opacity-80">{mark}</span>
          </div>
        );
      })}
    </div>
  );
}

const FIGURE: Record<WeekView['figure'], (v: WeekView) => ReactNode> = {
  arc: (v) => <Arc activeDay={v.day} />,
  day: (v) => <DayChip dayId={v.day} />,
  tally: () => <Tally />,
  none: () => null,
};

/** The card itself — identical in all three concepts, so the comparison is about placement. */
function Card({ view, spec, solid }: { view: WeekView; spec: EnvSpec; solid?: boolean }) {
  return (
    <article
      className="flex w-full flex-col gap-5 rounded-2xl p-7"
      style={
        solid
          ? { background: 'transparent' }
          : { background: 'rgba(255,255,255,0.82)', color: 'hsl(0 0% 10%)', boxShadow: '0 24px 60px rgba(0,0,0,0.18)' }
      }
    >
      <p className="text-[11px] uppercase tracking-[0.18em] opacity-60">{view.eyebrow}</p>
      <h2 className="text-3xl leading-tight" style={{ fontWeight: spec.type.weight + 200, textWrap: 'balance' }}>{view.headline}</h2>
      <p className="max-w-[52ch] text-base leading-relaxed opacity-85">{view.body}</p>
      {FIGURE[view.figure](view)}
    </article>
  );
}

/** Paging: arrows, dots, and Play. The only interactive part of the week screen. */
function Pager({ i, setI, playing, setPlaying }: { i: number; setI: (n: number) => void; playing: boolean; setPlaying: (b: boolean) => void }) {
  const n = WEEK_VIEWS.length;
  const btn = 'rounded-full border px-3 py-1.5 text-sm transition';
  return (
    <div className="flex items-center gap-4">
      <button className={btn} style={{ borderColor: 'currentColor' }} onClick={() => setI((i - 1 + n) % n)} aria-label="Previous card">←</button>
      <div className="flex items-center gap-2">
        {WEEK_VIEWS.map((v, k) => (
          <button
            key={v.id}
            onClick={() => setI(k)}
            aria-label={v.label}
            className="h-2.5 rounded-full transition-all"
            style={{ width: k === i ? 26 : 10, background: 'currentColor', opacity: k === i ? 0.95 : 0.4 }}
          />
        ))}
      </div>
      <button className={btn} style={{ borderColor: 'currentColor' }} onClick={() => setI((i + 1) % n)} aria-label="Next card">→</button>
      <button className={btn} style={{ borderColor: 'currentColor', opacity: playing ? 1 : 0.75 }} onClick={() => setPlaying(!playing)}>
        {playing ? 'Pause' : 'Play'}
      </button>
      <span className="text-xs tabular-nums opacity-60">{i + 1} / {n}</span>
    </div>
  );
}

/* ── the three stages ─────────────────────────────────────────────────── */

interface Ctx { view: WeekView; spec: EnvSpec; pager: ReactNode }

const LAYOUT: Record<WeekConceptId, (c: Ctx) => ReactNode> = {
  'week-stage': ({ view, spec, pager }) => (
    <div className={`tex-${spec.texture} flex h-full flex-col items-center justify-center gap-8 px-16`} style={SURFACE(spec)}>
      <div className="relative w-full max-w-[720px]">
        <div className="absolute -top-11 left-8 z-10"><Mascot spec={spec} /></div>
        <Card view={view} spec={spec} />
      </div>
      {pager}
    </div>
  ),

  'week-postcard': ({ view, spec, pager }) => (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-16" style={{ background: '#f4f4f7', color: 'hsl(0 0% 10%)' }}>
      <div className="w-full max-w-[720px] overflow-hidden rounded-3xl bg-white" style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.12)' }}>
        <div className={`tex-${spec.texture} flex items-end px-8 pb-5 pt-10`} style={{ ...SURFACE(spec), height: 190 }}>
          <Mascot spec={spec} />
        </div>
        <Card view={view} spec={spec} solid />
      </div>
      <div style={{ color: 'hsl(0 0% 25%)' }}>{pager}</div>
    </div>
  ),

  'week-filmstrip': ({ view, spec, pager }) => (
    <div className={`tex-${spec.texture} flex h-full flex-col`} style={SURFACE(spec)}>
      <div className="flex flex-1 items-center gap-10 px-16 pt-12">
        <div className="w-full max-w-[640px]"><Card view={view} spec={spec} /></div>
        <div className="shrink-0 scale-[1.5]"><Mascot spec={spec} /></div>
      </div>
      <div className="flex items-end justify-between gap-8 px-16 pb-9 pt-6">
        <div className="flex gap-2">
          {WEEK.map((d) => {
            const s = derive(d.signals);
            const on = d.id === view.day;
            return (
              <div key={d.id} className="flex w-[74px] flex-col gap-1.5">
                <div className="h-[54px] rounded-lg" style={{ background: `linear-gradient(160deg, ${s.palette.from}, ${s.palette.to})`, outline: on ? '2px solid currentColor' : 'none', outlineOffset: 2, opacity: on ? 1 : 0.55 }} />
                <span className="text-[10px] uppercase tracking-wider" style={{ opacity: on ? 0.9 : 0.5 }}>{d.label.slice(0, 3)}</span>
              </div>
            );
          })}
        </div>
        {pager}
      </div>
    </div>
  ),
};

/* ── mode assembly ────────────────────────────────────────────────────── */

/** Live in the viewer: arrows, dots and Play all work, and the weather changes with the card. */
function WeekScreen({ conceptId, stateId, live }: { conceptId: WeekConceptId; stateId: string; live: boolean }) {
  const start = Math.max(0, WEEK_VIEWS.findIndex((v) => v.id === stateId));
  const [i, setI] = useState(start);
  const [playing, setPlaying] = useState(false);

  useEffect(() => { setI(start); }, [start]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setI((k) => (k + 1) % WEEK_VIEWS.length), 3200);
    return () => clearInterval(id);
  }, [playing]);

  // The artboard frame is frozen on the card it is labelled with; only the viewer pages.
  const view = WEEK_VIEWS[live ? i : start];
  const spec = derive(dayOf(view.day).signals);
  const pager = live
    ? <Pager i={i} setI={setI} playing={playing} setPlaying={setPlaying} />
    : <Pager i={start} setI={() => {}} playing={false} setPlaying={() => {}} />;

  return LAYOUT[conceptId]({ view, spec, pager }) as JSX.Element;
}

const WEEK_STATES: StateConfig[] = WEEK_VIEWS.map((v) => ({ id: v.id, label: v.label, description: v.headline }));

function buildWeekMode(id: WeekConceptId): ScreenMode {
  const cfg = WEEK_CONCEPT_CONFIG[id];
  return {
    id,
    label: cfg.label,
    concept: cfg.label,
    description: cfg.thesis,
    platforms: ['web'],
    states: WEEK_STATES,
    renderFrame: (state) => (
      <DesktopFrame url="spacetime.app/week" height={760}>
        <WeekScreen conceptId={id} stateId={state.id} live />
      </DesktopFrame>
    ),
    renderArtboardFrame: (state) => (
      <DesktopFrame url="spacetime.app/week" height={760}>
        <div className="pointer-events-none h-full"><WeekScreen conceptId={id} stateId={state.id} live={false} /></div>
      </DesktopFrame>
    ),
    floatingNavLabel: (state) => `${cfg.label} · ${state.label}`,
  };
}

export const WEEK_MODES: ScreenMode[] = WEEK_CONCEPTS.map(buildWeekMode);
