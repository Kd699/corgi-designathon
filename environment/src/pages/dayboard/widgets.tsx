/* Ten widgets, each a pure projection of one slice of DayState.
 *
 * No widget parses text, calls the agent, or holds state. They are given data and draw it,
 * which is why the agent can compose the board freely: any subset, any order, and every
 * widget still renders correctly because it only ever knew about its own slice.
 *
 * The Timeline is the companion's schedule, reproduced: same SchedulerEvent shape
 * (name / start / duration), same read — date rail on the left, dot-and-time rows on the
 * right, dashed rule where there is a gap. It is a rebuild rather than a copy of
 * CalendarTask.tsx, which is 755 lines of drag, lock, inline-edit and Google refresh that a
 * read-only board has no use for.
 */
import type { DayState, WidgetId } from './types';

/* ── shared shell ─────────────────────────────────────────────────────── */

export function Panel({ title, hint, span = 1, tall, children }: {
  title: string; hint?: string; span?: 1 | 2; tall?: boolean; children: React.ReactNode;
}) {
  return (
    <section
      className="db-panel flex flex-col gap-3 rounded-2xl p-5"
      style={{ gridColumn: `span ${span}`, minHeight: tall ? 260 : 168 }}
    >
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] db-muted">{title}</h3>
        {hint && <span className="text-[11px] db-muted tabular-nums">{hint}</span>}
      </header>
      <div className="flex min-h-0 flex-1 flex-col justify-center">{children}</div>
    </section>
  );
}

const clock = (t: string) => t;
const mins = (m: number) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10}h` : `${m}m`);

/* Kind is the timeline's only colour axis, so it lives in one place. */
const KIND_COLOR: Record<string, string> = {
  work: 'var(--db-ink)', people: 'var(--db-accent)', body: 'var(--db-good)',
  rest: 'var(--db-soft)', admin: 'var(--db-muted)',
};

/* ── the ten ──────────────────────────────────────────────────────────── */

function Read({ day }: { day: DayState }) {
  return (
    <Panel title="The read" span={2}>
      <p className="text-[28px] leading-[1.15]" style={{ fontWeight: 600, textWrap: 'balance' }}>{day.headline}</p>
      {day.read && <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed db-muted">{day.read}</p>}
    </Panel>
  );
}

function Mood({ day }: { day: DayState }) {
  const pts = day.mood;
  const w = 100, h = 42;
  const x = (i: number) => (pts.length < 2 ? w / 2 : (i / (pts.length - 1)) * w);
  const y = (v: number) => h - ((v + 1) / 2) * h;
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const area = `${path} L${w} ${h} L0 ${h} Z`;
  return (
    <Panel title="Mood through the day" hint={pts.length ? `${clock(pts[0].at)}–${clock(pts[pts.length - 1].at)}` : undefined}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-[76px] w-full" aria-label="Mood over the day">
        <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="var(--db-line)" strokeWidth="0.4" strokeDasharray="1.5 2" />
        {pts.length > 1 && <path d={area} fill="var(--db-accent)" opacity="0.12" />}
        <path d={path} fill="none" stroke="var(--db-accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.value)} r="1.6" fill="var(--db-accent)" />)}
      </svg>
      <div className="mt-2 flex justify-between text-[11px] db-muted">
        {pts.slice(0, 4).map((p, i) => <span key={i}>{p.note ?? clock(p.at)}</span>)}
      </div>
    </Panel>
  );
}

function Energy({ day }: { day: DayState }) {
  const pct = Math.round(day.energy * 100);
  return (
    <Panel title="Energy left">
      <div className="flex items-end gap-3">
        <span className="text-[44px] leading-none tabular-nums" style={{ fontWeight: 600 }}>{pct}</span>
        <span className="pb-2 text-sm db-muted">of 100</span>
      </div>
      <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--db-line)' }}>
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: pct < 30 ? 'var(--db-warn)' : 'var(--db-accent)' }} />
      </div>
    </Panel>
  );
}

function Timeline({ day }: { day: DayState }) {
  const ev = day.timeline;
  const total = ev.reduce((a, e) => a + e.durationMinutes, 0);
  return (
    <Panel title="Today" hint={total ? mins(total) + ' logged' : undefined} span={2} tall>
      <div className="flex gap-6">
        {/* data-rail: the date column the companion shows beside the rows. A narrow host (a
            vertical slab on the morph board) hides it rather than squeezing the rows. */}
        <div className="w-28 shrink-0" data-rail>
          <p className="text-sm font-semibold">Today</p>
          <p className="text-[11px] db-muted">{ev.length} entr{ev.length === 1 ? 'y' : 'ies'}</p>
        </div>
        <ol className="flex flex-1 flex-col">
          {ev.map((e, i) => (
            <li key={e.id} className="flex items-start gap-3 py-2" style={{ borderTop: i ? '1px dashed var(--db-line)' : 'none' }}>
              <span className="mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: KIND_COLOR[e.kind] ?? 'var(--db-ink)' }} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] db-muted tabular-nums">{clock(e.start)} · {mins(e.durationMinutes)}</p>
                <p className="truncate text-[15px]">{e.name}</p>
              </div>
              <span className="text-[11px] uppercase tracking-wider db-muted">{e.kind}</span>
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  );
}

function People({ day }: { day: DayState }) {
  return (
    <Panel title="Who you were with" hint={`${day.people.length}`}>
      <ul className="flex flex-wrap gap-2">
        {day.people.map((p) => (
          <li key={p.name} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm"
              style={{ border: '1px solid var(--db-line)', background: p.warmth > 0.2 ? 'var(--db-good-wash)' : p.warmth < -0.2 ? 'var(--db-warn-wash)' : 'transparent' }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.warmth > 0.2 ? 'var(--db-good)' : p.warmth < -0.2 ? 'var(--db-warn)' : 'var(--db-muted)' }} />
            {p.name}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Focus({ day }: { day: DayState }) {
  const max = Math.max(...day.focus.map((f) => f.minutes), 60);
  return (
    <Panel title="Where the hours went" hint={mins(day.focus.reduce((a, f) => a + f.minutes, 0))}>
      <ul className="flex flex-col gap-2.5">
        {day.focus.map((f) => (
          <li key={f.label} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-[13px]">{f.label}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--db-line)' }}>
              <span className="block h-full rounded-full" style={{ width: `${(f.minutes / max) * 100}%`, background: 'var(--db-accent)', opacity: 0.35 + f.depth * 0.65 }} />
            </span>
            <span className="w-10 shrink-0 text-right text-[12px] db-muted tabular-nums">{mins(f.minutes)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Body({ day }: { day: DayState }) {
  const cells = [
    { label: 'Sleep', value: day.body.sleepHours, unit: 'h' },
    { label: 'Resting', value: day.body.restingHeart, unit: 'bpm' },
    { label: 'Moved', value: day.body.moveMinutes, unit: 'min' },
  ];
  return (
    <Panel title="Body">
      <dl className="grid grid-cols-3 gap-3">
        {cells.map((c) => (
          <div key={c.label} className="flex flex-col gap-1">
            <dt className="text-[11px] uppercase tracking-wider db-muted">{c.label}</dt>
            <dd className="text-[26px] leading-none tabular-nums" style={{ fontWeight: 600, opacity: c.value === null ? 0.25 : 1 }}>
              {c.value ?? '—'}<span className="ml-1 text-[12px] db-muted">{c.value === null ? '' : c.unit}</span>
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone: 'good' | 'warn' }) {
  return (
    <Panel title={title} hint={`${items.length}`}>
      <ul className="flex flex-col gap-2">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2.5 text-[14px] leading-snug">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tone === 'good' ? 'var(--db-good)' : 'var(--db-warn)' }} />
            <span className="first-letter:uppercase">{t}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Tomorrow({ day }: { day: DayState }) {
  return (
    <Panel title="What today asks of tomorrow" span={2}>
      <p className="max-w-[46ch] text-[22px] leading-snug" style={{ fontWeight: 500, textWrap: 'balance' }}>{day.tomorrow}</p>
    </Panel>
  );
}

/** The registry. The agent names widgets by id; this is the only place ids meet renderers. */
export const WIDGETS: Record<WidgetId, (day: DayState) => React.ReactNode> = {
  read: (day) => <Read day={day} />,
  mood: (day) => <Mood day={day} />,
  energy: (day) => <Energy day={day} />,
  timeline: (day) => <Timeline day={day} />,
  people: (day) => <People day={day} />,
  focus: (day) => <Focus day={day} />,
  body: (day) => <Body day={day} />,
  wins: (day) => <List title="Wins" items={day.wins} tone="good" />,
  frictions: (day) => <List title="What dragged" items={day.frictions} tone="warn" />,
  tomorrow: (day) => <Tomorrow day={day} />,
};
