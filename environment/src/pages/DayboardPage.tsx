/* The dayboard: talk about your day, the board rearranges itself around what you said.
 *
 * The loop is deliberately two-speed. Every keystroke runs the local read (no network), so
 * widgets appear and move while you are still typing. Send hands the same text to Grok,
 * whose answer replaces the guess and — the part that matters — chooses which widgets are
 * on the board and in what order. The board is the model's composition, not a fixed grid.
 *
 * With no XAI_API_KEY the local read is the whole product and the page still works; the
 * status line says which of the two you are looking at, so a demo never quietly lies about
 * whether a model ran.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { read, think } from './dayboard/agent';
import { EMPTY_DAY, type AgentReply, type DayState } from './dayboard/types';
import { WIDGETS } from './dayboard/widgets';
import DaySky from './daily-open/day-sky';
import './dayboard/dayboard.css';

/* The three seeds. Exported because the artboard frames are these same accounts run through
 * the same parser — a board frame must never be a drawing of the page, it must BE the page
 * with a known input. */
export const PROMPTS = [
  'Up at six, ran 20 minutes before anything else. Standup at 9:30 dragged. Two hours on the pricing deck, finally shipped it. Lunch with Sam, good one. Stuck on the API thing all afternoon, stressed by four. Slept 6 hours.',
  'Quiet one. Three hours of writing this morning, felt calm. Coffee with Priya at 11. Nothing else really.',
  'Rough. Woke at 5 and could not get back down. Back-to-back calls until two, missed lunch. Wound up by the evening.',
];

/**
 * `seed` pre-fills the composer and runs the local read once, so a frame can show a real
 * populated board without anyone typing. `frozen` drops the composer entirely — the artboard
 * shows the result, not the machinery, and can never drift off the account it is labelled
 * with.
 */
export default function DayboardPage({ seed, frozen }: { seed?: string; frozen?: boolean } = {}) {
  const [text, setText] = useState(seed ?? '');
  const [day, setDay] = useState<DayState>(EMPTY_DAY);
  const [surface, setSurface] = useState<AgentReply['surface']>([]);
  const [say, setSay] = useState('');
  const [source, setSource] = useState<'idle' | 'local' | 'model' | 'thinking'>('idle');
  const [error, setError] = useState('');
  const committed = useRef<DayState>(EMPTY_DAY);

  /* The fast path. Debounced only enough to not re-parse mid-word. */
  useEffect(() => {
    if (!text.trim()) return;
    const id = setTimeout(() => {
      const local = read(text, committed.current);
      setDay(local.day);
      setSurface(local.surface);
      setSource((s) => (s === 'thinking' ? s : 'local'));
    }, 180);
    return () => clearTimeout(id);
  }, [text]);

  const send = useCallback(async () => {
    const said = text.trim();
    if (!said) return;
    setSource('thinking');
    setError('');
    try {
      const reply = await think(said, committed.current);
      committed.current = reply.day;
      setDay(reply.day);
      setSurface(reply.surface);
      setSay(reply.say);
      setSource('model');
      setText('');
    } catch (e) {
      // Keep the local read on screen; it is a real answer, just a dumber one.
      const local = read(said, committed.current);
      committed.current = local.day;
      setDay(local.day);
      setSurface(local.surface);
      setSource('local');
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [text]);

  const panels = useMemo(() => surface.filter((id) => WIDGETS[id]), [surface]);

  const status =
    source === 'thinking' ? 'Grok is reading it… usually 5–10s'
    : source === 'model' ? 'Composed by Grok'
    : source === 'local' ? 'Local read — press send for the model'
    : 'Nothing yet';

  return (
    <div className={`dayboard dayboard--sky relative ${frozen ? 'h-full overflow-y-auto' : 'min-h-screen'}`}>
      {/* The weather is the page; everything else is a white card on it. */}
      <DaySky day={day} />
      <div className="relative mx-auto flex max-w-[1180px] flex-col gap-7 px-8 py-10">
        <header className="db-plate flex flex-col gap-1">
          <p className="text-[11px] uppercase tracking-[0.18em] db-muted">Spacetime · dayboard</p>
          <h1 className="text-[34px] leading-tight" style={{ fontWeight: 650 }}>How was your day?</h1>
          <p className="max-w-[60ch] text-[15px] db-muted">
            Say it however it comes out. The board decides what is worth showing — it changes as you type,
            and again when you send.
          </p>
        </header>

        {!frozen && <div className="db-plate flex flex-col gap-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
            rows={3}
            placeholder="Up at six, ran before anything else. Standup dragged…"
            className="db-panel w-full resize-y rounded-2xl p-4 text-[15px] leading-relaxed outline-none"
            style={{ background: 'var(--db-panel)', color: 'var(--db-ink)' }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => void send()}
              disabled={!text.trim() || source === 'thinking'}
              className="rounded-full px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-40"
              style={{ background: 'var(--db-accent)' }}
            >
              {source === 'thinking' ? 'Reading…' : 'Send'}
            </button>
            <span className="text-[12px] db-muted">{status}</span>
            <span className="text-[12px] db-muted">⌘↵</span>
            <div className="ml-auto flex gap-2">
              {PROMPTS.map((p, i) => (
                <button key={i} onClick={() => setText(p)}
                  className="rounded-full px-3 py-1.5 text-[12px] db-muted transition"
                  style={{ border: '1px solid var(--db-line)' }}>
                  Example {i + 1}
                </button>
              ))}
            </div>
          </div>
          {say && <p className="text-[15px]" style={{ color: 'var(--db-accent)' }}>{say}</p>}
          {error && (
            <p className="text-[12px]" style={{ color: 'var(--db-warn)' }}>
              Model call failed, showing the local read — {error}
            </p>
          )}
        </div>}

        {panels.length === 0 ? (
          <p className="py-16 text-center text-[15px] db-muted">
            The board fills itself in. Start typing, or press an example.
          </p>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {panels.map((id) => <div key={id} className="contents">{WIDGETS[id](day)}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}
