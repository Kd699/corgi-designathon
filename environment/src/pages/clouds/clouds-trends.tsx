// The trends card: WHOOP's monthly-impact read, for mood. Two stacks of
// behaviours — what lifted the mood over the period and what dragged it —
// each row a label, a signed percentage and a bar on a hatched track, the
// bar's length the size of the effect. The numbers are MOCK: a believable
// week/month of correlations, not derived from the sessions (yet) — the
// card is the shape the real computation will pour into.

import type { CSSProperties } from "react";

export type TrendScope = "week" | "month";

type Row = { label: string; pct: number };

const DATA: Record<TrendScope, { good: Row[]; bad: Row[] }> = {
  week: {
    good: [
      { label: "Morning sunlight", pct: 6 },
      { label: "8h+ sleep", pct: 5 },
      { label: "Walk outside", pct: 4 },
      { label: "Consistent wake time", pct: 2 },
      { label: "Breathwork", pct: 1 },
    ],
    bad: [
      { label: "Work late", pct: -1 },
      { label: "Late caffeine", pct: -2 },
      { label: "Late meals", pct: -3 },
      { label: "2%+ of the day in high stress zone", pct: -4 },
      { label: "3+ strain", pct: -8 },
    ],
  },
  month: {
    good: [
      { label: "8h+ sleep", pct: 7 },
      { label: "Morning sunlight", pct: 5 },
      { label: "Walk outside", pct: 5 },
      { label: "Time with friends", pct: 4 },
      { label: "Breathwork", pct: 2 },
    ],
    bad: [
      { label: "Cold shower", pct: -1 },
      { label: "Work late", pct: -2 },
      { label: "Alcohol", pct: -4 },
      { label: "2%+ of the day in high stress zone", pct: -5 },
      { label: "3+ strain", pct: -7 },
    ],
  },
};

const CSS = /* css */ `
/* Dark on purpose, whatever the page: the trends card is the WHOOP read
   quoted inside the sky's own white-card column. */
.ct { border-radius: 20px; padding: 16px 16px 14px; background: #131519; color: #fff;
  font-family: 'Work Sans', ui-sans-serif, system-ui, sans-serif; text-align: left;
  border: 1px solid rgba(255,255,255,0.06); }
.ct-title { margin: 2px 2px 12px; font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(255,255,255,0.55); }
.ct-group { margin: 14px 2px 8px; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.4); }
.ct-row { border-radius: 12px; padding: 11px 13px 12px; background: #1d2026; margin-bottom: 8px; }
.ct-row:last-child { margin-bottom: 0; }
.ct-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 9px; }
.ct-label { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; line-height: 1.3; }
.ct-pct { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ct-pct[data-tone="good"] { color: #58d68d; }
.ct-pct[data-tone="bad"] { color: #f5a623; }
/* The hatched track, the filled bar, the dot riding its end. */
.ct-track { position: relative; height: 7px; border-radius: 999px; overflow: visible;
  background: repeating-linear-gradient(135deg, rgba(255,255,255,0.10) 0 2.5px, transparent 2.5px 6px); }
.ct-fill { position: absolute; left: 0; top: 0; height: 100%; border-radius: 999px; min-width: 10px; }
.ct-fill[data-tone="good"] { background: #58d68d; }
.ct-fill[data-tone="bad"] { background: #f5a623; }
.ct-fill::after { content: ""; position: absolute; right: -2px; top: 50%; width: 5px; height: 5px;
  transform: translateY(-50%); border-radius: 999px; background: #fff; }
`;

function TrendRow({ row, max }: { row: Row; max: number }) {
  const tone = row.pct >= 0 ? "good" : "bad";
  const width = `${Math.round((Math.abs(row.pct) / max) * 100)}%`;
  return (
    <div className="ct-row">
      <div className="ct-head">
        <span className="ct-label">{row.label}</span>
        <span className="ct-pct" data-tone={tone}>
          {row.pct >= 0 ? `+${row.pct}%` : `\u2212${Math.abs(row.pct)}%`}
        </span>
      </div>
      <div className="ct-track">
        <span className="ct-fill" data-tone={tone} style={{ width } as CSSProperties} />
      </div>
    </div>
  );
}

export default function TrendsCard({ scope }: { scope: TrendScope }) {
  const { good, bad } = DATA[scope];
  const max = Math.max(...[...good, ...bad].map((r) => Math.abs(r.pct)));
  return (
    <article className="ct" aria-label="Mood trends">
      <style>{CSS}</style>
      <div className="ct-title">Mood impact · {scope === "week" ? "this week" : "this month"}</div>
      <div className="ct-group">Lifts your mood</div>
      {good.map((row) => (
        <TrendRow key={row.label} row={row} max={max} />
      ))}
      <div className="ct-group">Drags your mood</div>
      {bad.map((row) => (
        <TrendRow key={row.label} row={row} max={max} />
      ))}
    </article>
  );
}
