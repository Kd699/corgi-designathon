/* D2 · Morph board — the dayboard forked onto Joseph's Shape Lab (morph_UI, commit b50b99d).
 *
 * His lab: a text editor in the middle of a gooey SVG surface, and sliders you drag from a
 * library; bring one near an edge and it docks, the surface swells to hold it, release and
 * the page contracts. The ask was to keep that exactly and swap what gets dragged:
 *
 *   his slider  →  one of the dayboard's ten widgets
 *   his editor  →  the dayboard's composer
 *
 * So the day is written in the middle and the widgets hang off its edges. Typing hydrates
 * them where they sit (same local read as D1, every keystroke); Send runs the model and then
 * docks every widget that earned data — the "they stick into the field, then update" beat.
 *
 * Geometry — layout(), the goo filter, AnimatedSurface, the drag/dock/release handlers — is
 * his, kept as close to verbatim as the widget shapes allow. What changed and why is on each
 * piece. Widgets remain pure projections of DayState: this file positions them, it never
 * feeds them anything the D1 board does not.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { DesktopFrame, type ScreenMode, type StateConfig } from '../../components/v3artboard';
import { read, think } from '../dayboard/agent';
import { EMPTY_DAY, type DayState, type WidgetId } from '../dayboard/types';
import { WIDGETS } from '../dayboard/widgets';
import { PROMPTS } from '../DayboardPage';
import DaySky from './day-sky';
import '../dayboard/dayboard.css';
import './morph-board.css';

/* ── geometry (Joseph's, with widget-sized slabs) ─────────────────────── */

type Axis = 'horizontal' | 'vertical';
type Edge = 'top' | 'bottom' | 'left' | 'right';
type Box = { x: number; y: number; w: number; h: number };

interface Piece {
  id: number;
  widget: WidgetId;
  axis: Axis;
  x: number;
  y: number;
  edge: Edge | null;
}

/* His stage was 1080×740 with 72px sliders. A widget needs room to be a widget, so the slabs
 * are 120 tall on the horizontal edges and 190 wide on the vertical ones, and the stage grew
 * to fit two of each around the same 540×340 editor. */
const STAGE = { w: 1280, h: 900 };
const BASE: Box = { x: 370, y: 280, w: 540, h: 340 };
const SLAB = { h: 120, w: 190 };
const FREE = { horizontal: { w: 360, h: SLAB.h }, vertical: { w: SLAB.w, h: 320 } };
const CAPACITY = 2;

/* Which edge a widget wants. Wide-and-short things go top/bottom, tall lists go left/right.
 * A field on the registry, not a branch in the renderer. */
const AXIS: Record<WidgetId, Axis> = {
  read: 'horizontal', mood: 'horizontal', energy: 'horizontal', body: 'horizontal', tomorrow: 'horizontal',
  timeline: 'vertical', people: 'vertical', focus: 'vertical', wins: 'vertical', frictions: 'vertical',
};
const LABEL: Record<WidgetId, string> = {
  read: 'The read', mood: 'Mood arc', energy: 'Energy', timeline: 'Timeline', people: 'People',
  focus: 'Focus', body: 'Body', wins: 'Wins', frictions: 'What dragged', tomorrow: 'Tomorrow',
};
const LIBRARY = Object.keys(AXIS) as WidgetId[];

function layout(pieces: Piece[]) {
  const counts = { top: 0, bottom: 0, left: 0, right: 0 };
  const positions = new Map<number, Box>();
  for (const p of pieces) {
    if (!p.edge) { positions.set(p.id, { x: p.x, y: p.y, ...FREE[p.axis] }); continue; }
    const i = counts[p.edge]++;
    positions.set(p.id,
      p.edge === 'top'    ? { x: BASE.x, y: BASE.y - (i + 1) * SLAB.h, w: BASE.w, h: SLAB.h } :
      p.edge === 'bottom' ? { x: BASE.x, y: BASE.y + BASE.h + i * SLAB.h, w: BASE.w, h: SLAB.h } :
      p.edge === 'left'   ? { x: BASE.x - (i + 1) * SLAB.w, y: BASE.y, w: SLAB.w, h: BASE.h } :
                            { x: BASE.x + BASE.w + i * SLAB.w, y: BASE.y, w: SLAB.w, h: BASE.h });
  }
  const body: Box = {
    x: BASE.x - counts.left * SLAB.w,
    y: BASE.y - counts.top * SLAB.h,
    w: BASE.w + (counts.left + counts.right) * SLAB.w,
    h: BASE.h + (counts.top + counts.bottom) * SLAB.h,
  };
  return { positions, counts, body };
}

/** Verbatim from ShapeLab: the goo body tweens to its new box rather than snapping. */
function AnimatedSurface({ box }: { box: Box }) {
  const ref = useRef<SVGRectElement>(null);
  const current = useRef(box);
  useEffect(() => {
    const from = current.current, start = performance.now();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    const tick = (now: number) => {
      const t = reduced ? 1 : Math.min(1, (now - start) / 420), e = 1 - Math.pow(1 - t, 3);
      const next = { x: from.x + (box.x - from.x) * e, y: from.y + (box.y - from.y) * e, w: from.w + (box.w - from.w) * e, h: from.h + (box.h - from.h) * e };
      current.current = next;
      ref.current?.setAttribute('x', String(next.x));
      ref.current?.setAttribute('y', String(next.y));
      ref.current?.setAttribute('width', String(next.w));
      ref.current?.setAttribute('height', String(next.h));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [box.x, box.y, box.w, box.h]);
  return <rect ref={ref} x={box.x} y={box.y} width={box.w} height={box.h} rx="30" />;
}

/* ── seeds for the board's states ─────────────────────────────────────── */

export type MorphPhase = 'blank' | 'typing' | 'sent';

/* The four widgets a seeded frame starts with, parked around the editor the way a person
 * would have dragged them. Free positions are the ones his release() hands back. */
const SEED_PIECES: Piece[] = [
  { id: 1, widget: 'mood',     axis: 'horizontal', x: BASE.x,       y: 60,  edge: null },
  { id: 2, widget: 'energy',   axis: 'horizontal', x: BASE.x,       y: 740, edge: null },
  { id: 3, widget: 'timeline', axis: 'vertical',   x: 1060,         y: BASE.y, edge: null },
  { id: 4, widget: 'people',   axis: 'vertical',   x: 60,           y: BASE.y, edge: null },
];
const DOCK_FOR: Record<number, Edge> = { 1: 'top', 2: 'bottom', 3: 'right', 4: 'left' };

/** The arrangement a phase starts from. */
function piecesFor(phase: MorphPhase): Piece[] {
  if (phase === 'blank') return [];
  if (phase === 'sent') return SEED_PIECES.map((p) => ({ ...p, edge: DOCK_FOR[p.id] }));
  return SEED_PIECES;
}

/* Where a widget the model brought in waits if the edges are full: parked around the
 * page, not stacked on one spot. Cycles through the corners in library order. */
const PARK: { x: number; y: number }[] = [
  { x: 40, y: 40 }, { x: STAGE.w - FREE.horizontal.w - 40, y: 40 },
  { x: 40, y: STAGE.h - FREE.vertical.h - 40 }, { x: STAGE.w - FREE.vertical.w - 40, y: STAGE.h - FREE.vertical.h - 40 },
];

/**
 * Compose the page the way the model said. Every widget it surfaced is on the stage
 * afterwards — the ones already there are docked, the ones it brought in are created and
 * docked in the model's order — and pieces for widgets it dropped come off the edges, so the
 * page reads as the model's board, not the user's earlier guesses. Beyond the eight docking
 * slots a widget waits parked; nothing is silently discarded.
 */
function dockEarned(pieces: Piece[], surface: WidgetId[], nextId: () => number): Piece[] {
  const onStage = new Set(pieces.map((p) => p.widget));
  const brought: Piece[] = surface
    .filter((w) => !onStage.has(w))
    .map((w, i) => ({ id: nextId(), widget: w, axis: AXIS[w], edge: null, ...PARK[i % PARK.length] }));
  const all = [...pieces, ...brought].map((p) => (p.edge && !surface.includes(p.widget) ? { ...p, edge: null } : p));
  // Dock in the model's order, so the first thing it named gets the first slot.
  const rank = (p: Piece) => { const i = surface.indexOf(p.widget); return i < 0 ? 99 : i; };
  const counts = { top: 0, bottom: 0, left: 0, right: 0 };
  for (const p of all) if (p.edge) counts[p.edge]++;
  const docked = [...all].sort((a, b2) => rank(a) - rank(b2)).map((p) => {
    if (p.edge || !surface.includes(p.widget)) return p;
    // The emptier edge of the pair, so four widgets wrap the page rather than piling up
    // on one side of it.
    const pair: Edge[] = p.axis === 'horizontal' ? ['top', 'bottom'] : ['left', 'right'];
    const edge = pair.filter((e) => counts[e] < CAPACITY).sort((a, b2) => counts[a] - counts[b2])[0];
    if (!edge) return p;
    counts[edge]++;
    return { ...p, edge };
  });
  // Back to stage order, so React keys stay stable and nothing remounts.
  return all.map((p) => docked.find((d) => d.id === p.id)!);
}

/* ── the board ────────────────────────────────────────────────────────── */

export function MorphBoard({ seed = '', phase = 'blank' }: { seed?: string; phase?: MorphPhase }) {
  const [text, setText] = useState(seed);
  const [day, setDay] = useState<DayState>(EMPTY_DAY);
  const [surface, setSurface] = useState<WidgetId[]>([]);
  const [pieces, setPieces] = useState<Piece[]>(() => piecesFor(phase));
  const [active, setActive] = useState<number | null>(null);
  const [candidate, setCandidate] = useState<Edge | null>(null);
  const [scale, setScale] = useState(1);
  const [source, setSource] = useState<'idle' | 'local' | 'model' | 'thinking'>(phase === 'sent' ? 'local' : 'idle');
  const [say, setSay] = useState('');
  const [message, setMessage] = useState(
    phase === 'blank' ? 'Your page is ready. Bring a widget closer.' : 'Widgets are reading what you write. Send to dock them.');

  const stage = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const next = useRef(SEED_PIECES.length + 1);
  const drag = useRef<{ id: number; offsetX: number; offsetY: number } | null>(null);
  const latest = useRef(pieces);
  latest.current = pieces;
  const committed = useRef<DayState>(EMPTY_DAY);

  const { positions, counts, body } = layout(pieces);

  /* The board mounts a mode once and switches states underneath it, so a useState initializer
   * only ever sees the first state. A frame is defined by its props: when they change, the
   * arrangement and the text follow. The 'sent' frame looked identical to 'typing' until this. */
  useEffect(() => {
    setText(seed);
    setPieces(piecesFor(phase));
    setActive(null);
    setSource(phase === 'sent' ? 'local' : 'idle');
    setSay('');
  }, [seed, phase]);

  /* Same two-speed loop as D1: the local read on every keystroke, the model on Send. */
  useEffect(() => {
    if (!text.trim()) { setDay(EMPTY_DAY); setSurface([]); return; }
    const id = setTimeout(() => {
      const local = read(text, committed.current);
      setDay(local.day);
      setSurface(local.surface);
      setSource((s) => (s === 'thinking' ? s : 'local'));
    }, 180);
    return () => clearTimeout(id);
  }, [text]);

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const ob = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / STAGE.w)));
    ob.observe(el);
    return () => ob.disconnect();
  }, []);

  const send = useCallback(async () => {
    const said = text.trim();
    if (!said) return;
    setSource('thinking');
    let reply;
    try {
      reply = await think(said, committed.current);
      setSource('model');
      setSay(reply.say);
    } catch (e) {
      // The local read is a real answer, just a dumber one. Say which one is on screen.
      reply = read(said, committed.current);
      setSource('local');
      setSay(`Model unavailable, showing the local read (${e instanceof Error ? e.message.slice(0, 60) : 'error'})`);
    }
    committed.current = reply.day;
    setDay(reply.day);
    setSurface(reply.surface);
    // The beat the whole surface exists for: the page becomes the model's composition —
    // what it surfaced arrives and docks, what it dropped lets go.
    const chosen = reply.surface;
    setPieces((ps) => dockEarned(ps, chosen, () => next.current++));
    setMessage(`Sent. ${chosen.length} widget${chosen.length === 1 ? '' : 's'} chosen and docked to the page.${reply.say ? ` — ${reply.say}` : ''}`);
  }, [text]);

  /* ── drag / dock / release: his handlers, widget-shaped ─────────────── */

  function point(e: { clientX: number; clientY: number }) {
    const r = stage.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  }
  function target(p: Piece, x: number, y: number): Edge | null {
    const { body: b, counts: c } = layout(latest.current.filter((q) => q.id !== p.id));
    if (x < b.x - 85 || x > b.x + b.w + 85 || y < b.y - 85 || y > b.y + b.h + 85) return null;
    const edge: Edge = p.axis === 'horizontal' ? (y < BASE.y + BASE.h / 2 ? 'top' : 'bottom') : (x < BASE.x + BASE.w / 2 ? 'left' : 'right');
    return c[edge] < CAPACITY ? edge : null;
  }
  function begin(e: ReactPointerEvent<HTMLButtonElement>, widget: WidgetId, id?: number) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const at = point(e);
    const axis = AXIS[widget];
    if (id !== undefined) {
      const p = latest.current.find((q) => q.id === id)!;
      setActive(id);
      if (p.edge) { setMessage('Release this widget before moving it.'); return; }
      drag.current = { id, offsetX: at.x - p.x, offsetY: at.y - p.y };
      return;
    }
    if (latest.current.some((q) => q.widget === widget)) { setMessage(`${LABEL[widget]} is already on the page.`); return; }
    const newId = next.current++;
    const off = { x: FREE[axis].w / 2, y: 36 };
    const p: Piece = { id: newId, widget, axis, x: at.x - off.x, y: at.y - off.y, edge: null };
    latest.current = [...latest.current, p];
    setPieces(latest.current);
    setActive(newId);
    drag.current = { id: newId, offsetX: off.x, offsetY: off.y };
  }
  function move(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    const at = point(e), p = latest.current.find((q) => q.id === d.id)!;
    const x = Math.max(15, Math.min(STAGE.w - FREE[p.axis].w - 15, at.x - d.offsetX));
    const y = Math.max(15, Math.min(STAGE.h - FREE[p.axis].h - 15, at.y - d.offsetY));
    latest.current = latest.current.map((q) => (q.id === d.id ? { ...q, x, y } : q));
    setPieces(latest.current);
    setCandidate(target(p, at.x, at.y));
  }
  function finish(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    const at = point(e), p = latest.current.find((q) => q.id === d.id)!;
    const edge = target(p, at.x, at.y);
    setPieces(latest.current.map((q) => (q.id === d.id ? { ...q, edge } : q)));
    drag.current = null;
    setCandidate(null);
    setMessage(edge ? `${LABEL[p.widget]} locked to the ${edge}. The page has room for it now.` : `${LABEL[p.widget]} placed freely. Drag it nearer the page to attach.`);
  }
  function release(p: Piece) {
    const b = positions.get(p.id)!;
    setPieces((ps) => ps.map((q) => (q.id === p.id
      ? { ...q, edge: null,
          x: p.axis === 'horizontal' ? BASE.x : Math.min(STAGE.w - SLAB.w - 15, b.x + (p.edge === 'left' ? -110 : 110)),
          y: p.axis === 'horizontal' ? (p.edge === 'top' ? 40 : STAGE.h - SLAB.h - 40) : BASE.y }
      : q)));
    setMessage('Released. The page contracts; the widget is free to move.');
  }
  const handlers = { onPointerMove: move, onPointerUp: finish, onPointerCancel: () => { drag.current = null; setCandidate(null); } };

  const status =
    source === 'thinking' ? 'Grok is reading it… usually 5–10s'
    : source === 'model' ? 'Composed by Grok'
    : source === 'local' ? 'Local read — Send for the model'
    : 'Widgets fill in as you write';
  const docked = pieces.filter((p) => p.edge).length;

  return (
    <main className="dayboard morph-board relative">
      <DaySky day={day} />
      <section className="mb-intro relative">
        <div>
          <h1>How was your day?</h1>
          <p>Write it in the page. Drag widgets from the library; they read what you write and dock when you send.</p>
        </div>
        <button onClick={() => { setPieces([]); setActive(null); setMessage('Widgets cleared. Your writing is still here.'); }}>↺ Reset widgets</button>
      </section>

      <div className="mb-layout relative">
        <aside className="mb-library">
          <h2>Widgets <span>{LIBRARY.length}</span></h2>
          {LIBRARY.map((w) => (
            <button key={w} className="mb-ingredient" data-on-stage={pieces.some((p) => p.widget === w)}
              onPointerDown={(e) => begin(e, w)} {...handlers}>
              <strong>{LABEL[w]}</strong>
              <small>{AXIS[w] === 'horizontal' ? 'Top or bottom' : 'Left or right'}</small>
              <span className="mb-grip">⠿ Drag to add</span>
            </button>
          ))}
        </aside>

        <section className="mb-workarea">
          <div className="mb-toolbar">
            <span>◦ Your day, as a page</span>
            <span>{docked} docked · {pieces.length - docked} free · {status}</span>
          </div>
          <div className="mb-viewport" ref={viewport} style={{ height: STAGE.h * scale }}>
            <div className="mb-stage" ref={stage} style={{ width: STAGE.w, height: STAGE.h, transform: `scale(${scale})` }}>
              <div className="mb-stage-label">YOUR DAY, YOUR PAGE</div>
              <svg className="mb-surfaces" width={STAGE.w} height={STAGE.h} aria-hidden="true">
                <defs>
                  <filter id="morph-goo" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
                    <feGaussianBlur stdDeviation="7" />
                    <feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 22 -10" />
                  </filter>
                </defs>
                <g fill="#ffffff" filter="url(#morph-goo)">
                  <AnimatedSurface box={body} />
                  {pieces.filter((p) => !p.edge).map((p) => <AnimatedSurface key={p.id} box={positions.get(p.id)!} />)}
                </g>
              </svg>

              {candidate && (
                <div className={`mb-drop-zone ${candidate}`} style={{ left: body.x, top: body.y, width: body.w, height: body.h }}>
                  <span>Release to merge · {candidate}</span>
                </div>
              )}

              <section className="mb-editor" style={{ left: BASE.x, top: BASE.y, width: BASE.w, height: BASE.h }}>
                <div className="mb-doc-title">
                  <span>Today</span>
                  {/* Pre-canned days, so a test send is one click. Same three accounts D1 uses. */}
                  <span className="mb-examples">
                    {PROMPTS.map((pr, i) => (
                      <button key={i} type="button" className="mb-example" onClick={() => setText(pr)}>Example {i + 1}</button>
                    ))}
                  </span>
                </div>
                <textarea
                  aria-label="Your day"
                  spellCheck={false}
                  value={text}
                  placeholder="Up at six, ran before anything else. Standup dragged…"
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
                />
                <div className="mb-doc-footer">
                  <span className="mb-status">{text.trim() ? `${text.trim().split(/\s+/).length} words` : 'Nothing yet'} · {status}</span>
                  <button className="mb-send" onClick={() => void send()} disabled={!text.trim() || source === 'thinking'}>
                    {source === 'thinking' ? 'Reading…' : 'Send'}
                  </button>
                </div>
              </section>

              {pieces.map((p) => {
                const b = positions.get(p.id)!;
                const has = surface.includes(p.widget);
                return (
                  <section key={p.id}
                    className={`mb-piece ${p.axis} ${p.edge ? 'docked' : 'free'} ${active === p.id ? 'active' : ''} ${has ? '' : 'empty'}`}
                    style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
                    onPointerDown={() => setActive(p.id)}>
                    <button className="mb-grab" aria-label={`Move ${LABEL[p.widget]}`} onPointerDown={(e) => begin(e, p.widget, p.id)} {...handlers}
                      title={p.edge ? 'Locked. Release to move.' : 'Drag to attach'}>⠿</button>
                    <div className="mb-widget">{WIDGETS[p.widget](has ? day : EMPTY_DAY)}</div>
                    <button className="mb-lock" onClick={() => {
                      if (p.edge) { release(p); return; }
                      const pair: Edge[] = p.axis === 'horizontal' ? ['bottom', 'top'] : ['right', 'left'];
                      const edge = pair.find((e) => counts[e] < CAPACITY);
                      if (!edge) { setMessage('Both edges are full. Release something first.'); return; }
                      setPieces((ps) => ps.map((q) => (q.id === p.id ? { ...q, edge } : q)));
                    }}>{p.edge ? 'Release' : 'Attach'}</button>
                  </section>
                );
              })}

              <div className="mb-stage-hint">
                {pieces.length === 0 ? '← Grab a widget to begin' : 'Locked widgets become part of the page. Release to pull them away.'}
              </div>
            </div>
          </div>
          <footer className="mb-footer" role="status">{message}{say && source === 'local' ? ` · ${say}` : ''}</footer>
        </section>
      </div>
    </main>
  );
}

/* ── the mode ─────────────────────────────────────────────────────────── */

export const MORPH_ID = 'morph-board';

export const MORPH_CONFIG = {
  label: 'D2 · Morph board',
  thesis: 'D1’s widgets on Joseph’s Shape Lab: the day is written in the middle of a gooey page and the widgets hang off its edges. They read what you write as you write it, and Send docks whichever ones earned a place.',
  risk: 'Two ideas on one surface — a page that reshapes, and widgets that self-select. If dragging feels like admin, the morph is decoration.',
};

const PHASES: { state: StateConfig; seed: string; phase: MorphPhase }[] = [
  { state: { id: 'blank',  label: 'Nothing typed',  description: 'The page at rest — no widgets, an empty editor.' }, seed: '', phase: 'blank' },
  { state: { id: 'typing', label: 'Typing',         description: 'Four widgets parked around the page, hydrating live from the words.' }, seed: PROMPTS[0], phase: 'typing' },
  { state: { id: 'sent',   label: 'Sent',           description: 'After Send: every widget with data has docked into the page and updated.' }, seed: PROMPTS[0], phase: 'sent' },
];
export const MORPH_STATES: StateConfig[] = PHASES.map((p) => p.state);
const phaseFor = (id: string) => PHASES.find((p) => p.state.id === id) ?? PHASES[0];

export const MORPH_MODE: ScreenMode = {
  id: MORPH_ID,
  label: MORPH_CONFIG.label,
  concept: MORPH_CONFIG.label,
  description: MORPH_CONFIG.thesis,
  platforms: ['web'],
  states: MORPH_STATES,
  fullScreenViewer: true,
  renderFrame: (state, _platform, _shared, ctx) => {
    const p = phaseFor(state.id);
    return (
      <DesktopFrame url="spacetime.app/day/morph" height={1000} fullScreen={ctx?.fullScreen}>
        <MorphBoard seed={p.seed} phase={p.phase} />
      </DesktopFrame>
    );
  },
  renderArtboardFrame: (state) => {
    const p = phaseFor(state.id);
    return (
      <DesktopFrame url="spacetime.app/day/morph" height={1000}>
        <div className="pointer-events-none h-full"><MorphBoard seed={p.seed} phase={p.phase} /></div>
      </DesktopFrame>
    );
  },
  floatingNavLabel: (state) => `${MORPH_CONFIG.label} · ${state.label}`,
};
