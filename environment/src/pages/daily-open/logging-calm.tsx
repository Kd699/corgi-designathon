/* D3 · Logging, calm — the dayboard in the Intervention tab's clothes.
 *
 * D2 had a library, a stage, drag, dock, release, an inspector, and cards that arrived
 * without anyone seeing them arrive. This is the same loop with everything but the loop
 * taken away: the sky, one circle with the face in it, one line, one pill. You write the
 * day, press send, and Grok's widgets sweep out from behind the circle one after another —
 * blurred, staggered, unmistakable — with the read as the line under the face.
 *
 * Borrowed from /clouds on purpose, so the two tabs feel like one product: the circle is
 * his motif window, the pill is his input, the cards are his glass cards, the arc is his
 * arc (clouds-widgets.tsx) widened into a ring so eight can land. Widgets remain pure
 * projections of DayState — each card is a compact reading of one slice, computed here,
 * never a second widget system.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DesktopFrame, type ScreenMode, type StateConfig } from '../../components/v3artboard';
import { read, think } from '../dayboard/agent';
import { EMPTY_DAY, type DayState, type WidgetId } from '../dayboard/types';
import { PROMPTS } from '../DayboardPage';
import { derive } from '../../engine/derive';
import { deriveMotif } from './motif';
import MotifMascot from './MotifMascot';
import DaySky from './day-sky';
import './logging-calm.css';

/* ── one card per widget: a compact reading, not a second widget ──────── */

interface CardSpec { title: string; headline: string; sub: string; text?: boolean }

const mins = (m: number) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10}h` : `${m}m`);
const moodWord = (v: number) => (v > 0.4 ? 'good' : v > 0.1 ? 'steady' : v > -0.3 ? 'flat' : 'rough');

const CARD: Record<Exclude<WidgetId, 'read'>, (d: DayState) => CardSpec> = {
  mood: (d) => ({
    title: 'Mood', headline: d.mood.length ? `${moodWord(d.mood[0].value)} → ${moodWord(d.mood[d.mood.length - 1].value)}` : '—',
    sub: d.mood.map((m) => m.note ?? m.at).slice(0, 4).join(' · '), text: true,
  }),
  energy: (d) => ({ title: 'Energy left', headline: `${Math.round(d.energy * 100)}`, sub: 'of 100, right now' }),
  timeline: (d) => ({
    title: 'Today', headline: `${d.timeline.length} thing${d.timeline.length === 1 ? '' : 's'}`,
    sub: d.timeline.length ? `${d.timeline[0].start} ${d.timeline[0].name} … ${d.timeline[d.timeline.length - 1].name}` : '',
  }),
  people: (d) => ({ title: 'With', headline: d.people.map((p) => p.name).join(', '), sub: d.people.map((p) => (p.warmth > 0.2 ? 'restoring' : p.warmth < -0.2 ? 'draining' : 'neutral')).join(' · '), text: true }),
  focus: (d) => ({ title: 'Focus', headline: mins(d.focus.reduce((a, f) => a + f.minutes, 0)), sub: d.focus.map((f) => f.label).join(' · ') }),
  body: (d) => ({
    title: 'Body', headline: d.body.sleepHours !== null ? `${d.body.sleepHours}h sleep` : d.body.restingHeart !== null ? `${d.body.restingHeart} bpm` : `${d.body.moveMinutes ?? 0}m moved`,
    sub: [d.body.restingHeart !== null && `resting ${d.body.restingHeart}`, d.body.moveMinutes !== null && `${d.body.moveMinutes}m moved`].filter(Boolean).join(' · '),
  }),
  wins: (d) => ({ title: 'Wins', headline: d.wins[0] ?? '', sub: d.wins.length > 1 ? `+${d.wins.length - 1} more` : '', text: true }),
  frictions: (d) => ({ title: 'What dragged', headline: d.frictions[0] ?? '', sub: d.frictions.length > 1 ? `+${d.frictions.length - 1} more` : '', text: true }),
  tomorrow: (d) => ({ title: 'Tomorrow', headline: d.tomorrow, sub: '', text: true }),
};

/* Where N cards go. Up to five sit on the inner ring across the top 200°, so nothing lands
 * on the line or the pill below the circle; the rest take an outer ring, offset half a step
 * so they fall between the inner cards rather than behind them. Order is the model's order,
 * first card straight up. */
function slots(n: number): { angle: number; ring: 0 | 1 }[] {
  const INNER = 5, span = 200;
  const spread = (count: number, shift: number) => {
    if (count === 1) return [shift];
    const step = span / (count - 1);
    return Array.from({ length: count }, (_, i) => -span / 2 + i * step + shift).sort((a, b) => Math.abs(a) - Math.abs(b));
  };
  const inner = spread(Math.min(n, INNER), 0).map((angle) => ({ angle, ring: 0 as const }));
  const outerCount = Math.max(0, n - INNER);
  const outer = outerCount ? spread(outerCount, outerCount > 1 ? 0 : 0).map((angle) => ({ angle: angle * 0.9, ring: 1 as const })) : [];
  return [...inner, ...outer];
}

/** One glass card. Lands as a skeleton, fills a beat later — his response-arriving beat. */
function GlassCard({ spec, delay }: { spec: CardSpec; delay: number }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), delay + 700 + Math.random() * 400); return () => clearTimeout(t); }, [delay]);
  return (
    <div className="lg-card">
      <span className="lg-title">{spec.title}</span>
      {ready ? (
        <span className="lg-body">
          <span className={`lg-headline${spec.text ? ' text' : ''}`}>{spec.headline}</span>
          {spec.sub && <span className="lg-sub2">{spec.sub}</span>}
        </span>
      ) : (
        <><span className="lg-sk lg-sk-h" /><span className="lg-sk lg-sk-s" /></>
      )}
    </div>
  );
}

/* ── the surface ───────────────────────────────────────────────────────── */

export function LoggingCalm({ seed = '', sent = false }: { seed?: string; sent?: boolean }) {
  const [text, setText] = useState(seed);
  const [day, setDay] = useState<DayState>(EMPTY_DAY);
  const [surface, setSurface] = useState<WidgetId[]>([]);
  const [source, setSource] = useState<'idle' | 'thinking' | 'model' | 'local'>('idle');
  const [note, setNote] = useState('');
  /* Bumped on every send so the ring remounts and the sweep replays. */
  const [round, setRound] = useState(0);
  const committed = useRef<DayState>(EMPTY_DAY);

  /* A seeded 'sent' frame shows the local composition, arrived. Props define the frame. */
  useEffect(() => {
    setText(seed);
    if (sent && seed) {
      const local = read(seed, EMPTY_DAY);
      committed.current = local.day; setDay(local.day); setSurface(local.surface); setSource('local'); setRound((r) => r + 1);
    } else { setDay(EMPTY_DAY); setSurface([]); setSource('idle'); }
  }, [seed, sent]);

  const send = useCallback(async () => {
    const said = text.trim();
    if (!said) return;
    setSource('thinking');
    setSurface([]);
    let reply;
    try { reply = await think(said, committed.current); setSource('model'); setNote(reply.say); }
    catch (e) { reply = read(said, committed.current); setSource('local'); setNote(`Local read — ${e instanceof Error ? e.message.slice(0, 60) : 'model unavailable'}`); }
    committed.current = reply.day;
    setDay(reply.day);
    setSurface(reply.surface);
    setRound((r) => r + 1);
    setText('');
  }, [text]);

  const spec = useMemo(() => derive({ heartRate: 55 + Math.round(day.energy * 55), motion: 0.05, hour: new Date().getHours(), idleSeconds: 0, mood: day.mood.length ? Math.round((day.mood.reduce((a, m) => a + m.value, 0) / day.mood.length + 1) * 2) + 1 : null, feedback: 0, objective: 'focus' }), [day]);
  const motif = useMemo(() => deriveMotif({ heartRate: 68, motion: 0, hour: 12, idleSeconds: 0, mood: null, feedback: 0, objective: 'focus' }, spec.valence, spec.arousal), [spec]);

  const cards = surface.filter((w): w is Exclude<WidgetId, 'read'> => w !== 'read');
  const at = slots(cards.length);
  const line = source === 'thinking' ? 'Reading that…' : day.headline || 'How was your day?';
  const sub = source === 'thinking' ? 'usually five to ten seconds' : day.read || 'Say it however it comes out.';

  return (
    <div className="lg">
      <DaySky day={day} />
      <div className="lg-ring" key={round} aria-hidden>
        {cards.map((w, i) => (
          <div key={w} className="lg-slot" data-ring={at[i].ring} style={{ '--lg-a': `${at[i].angle}deg`, '--lg-d': `${i * 140}ms` } as CSSProperties}>
            <GlassCard spec={CARD[w](day)} delay={i * 140} />
          </div>
        ))}
      </div>
      <div className="lg-stage">
        <div className="lg-circle" data-thinking={source === 'thinking'}>
          <MotifMascot motif={motif} size={150} />
        </div>
        <p className="lg-line">{line}</p>
        <p className="lg-sub">{sub}</p>
        <form className="lg-pill" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="talk, or type about your day…"
            aria-label="Your day"
            disabled={source === 'thinking'}
          />
          <button type="submit" disabled={!text.trim() || source === 'thinking'} aria-label="Send">↑</button>
        </form>
        <div className="lg-hints">
          {PROMPTS.map((p, i) => <button key={i} type="button" className="lg-hint" onClick={() => setText(p)}>Example {i + 1}</button>)}
        </div>
        <p className="lg-status">
          {source === 'model' ? `Composed by Grok${note ? ` · ${note}` : ''}` : source === 'local' ? note || 'Local read' : source === 'thinking' ? 'Grok is reading' : `${cards.length ? cards.length + ' cards' : 'Nothing yet'}`}
        </p>
      </div>
    </div>
  );
}

/* ── the mode ─────────────────────────────────────────────────────────── */

export const CALM_ID = 'logging-calm';
export const CALM_CONFIG = {
  label: 'D3 · Logging, calm',
  thesis: 'The dayboard in the Intervention tab’s clothes: sky, one circle, one line, one pill. Send, and Grok’s cards sweep out from behind the circle one after another, with the read as the line under the face.',
  risk: 'Compact cards say less than the D1 widgets. If a reading needs the full widget — the timeline, the tally — this cannot carry it.',
};
const PHASES: { state: StateConfig; seed: string; sent: boolean }[] = [
  { state: { id: 'blank', label: 'Before you say anything', description: 'The circle, the question, the pill.' }, seed: '', sent: false },
  { state: { id: 'sent', label: 'Sent', description: 'Cards arrived around the circle; the read under the face.' }, seed: PROMPTS[0], sent: true },
];
export const CALM_STATES: StateConfig[] = PHASES.map((p) => p.state);
const phaseFor = (id: string) => PHASES.find((p) => p.state.id === id) ?? PHASES[0];

export const CALM_MODE: ScreenMode = {
  id: CALM_ID, label: CALM_CONFIG.label, concept: CALM_CONFIG.label, description: CALM_CONFIG.thesis,
  platforms: ['web'], states: CALM_STATES, fullScreenViewer: true,
  renderFrame: (state, _p, _s, ctx) => { const p = phaseFor(state.id); return <DesktopFrame url="spacetime.app/log" height={900} fullScreen={ctx?.fullScreen}><LoggingCalm seed={p.seed} sent={p.sent} /></DesktopFrame>; },
  renderArtboardFrame: (state) => { const p = phaseFor(state.id); return <DesktopFrame url="spacetime.app/log" height={900}><div className="pointer-events-none h-full"><LoggingCalm seed={p.seed} sent={p.sent} /></div></DesktopFrame>; },
  floatingNavLabel: (state) => `${CALM_CONFIG.label} · ${state.label}`,
};
