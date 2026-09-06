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
/* A white card like the session cards — the same sheet the mascot is cut
   from — with the read's title set inside it. */
.ct { border-radius: 20px; padding: 16px 18px 15px; background: #fff; color: #111;
  font-family: 'Work Sans', ui-sans-serif, system-ui, sans-serif; text-align: left;
  border: 1px solid rgba(0,0,0,0.08); }
.ct-title { margin: 2px 0 14px; font-family: 'PP Editorial Old', ui-serif, Georgia, serif; font-weight: 400;
  font-size: 23px; line-height: 1.15; }
.ct-group { margin: 14px 2px 8px; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(0,0,0,0.42); }
.ct-row { border-radius: 12px; padding: 11px 13px 12px; background: rgba(0,0,0,0.035); margin-bottom: 8px; }
.ct-row:last-child { margin-bottom: 0; }
.ct-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 9px; }
.ct-label { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; line-height: 1.3; }
.ct-pct { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ct-pct[data-tone="good"] { color: #1f9d55; }
.ct-pct[data-tone="bad"] { color: #d98200; }
/* A DIVERGING bar: the hatched track runs the row, a centre mark holds the
   zero, and the fill grows FROM the middle — green to the right, orange to
   the left — so lift and drag read as directions, not just lengths. */
.ct-track { position: relative; height: 7px; border-radius: 999px; overflow: visible;
  background: repeating-linear-gradient(135deg, rgba(0,0,0,0.10) 0 2.5px, transparent 2.5px 6px); }
.ct-track::before { content: ""; position: absolute; left: 50%; top: -2.5px; bottom: -2.5px; width: 1.5px;
  transform: translateX(-50%); border-radius: 1px; background: rgba(0,0,0,0.3); }
.ct-fill { position: absolute; top: 0; height: 100%; min-width: 8px; }
.ct-fill[data-tone="good"] { left: 50%; background: #34c26b; border-radius: 0 999px 999px 0; }
.ct-fill[data-tone="bad"] { right: 50%; background: #f5a623; border-radius: 999px 0 0 999px; }
.ct-fill::after { content: ""; position: absolute; top: 50%; width: 5px; height: 5px;
  transform: translateY(-50%); border-radius: 999px; background: #fff; }
.ct-fill[data-tone="good"]::after { right: 2px; }
.ct-fill[data-tone="bad"]::after { left: 2px; }
`;

function TrendRow({ row, max }: { row: Row; max: number }) {
  const tone = row.pct >= 0 ? "good" : "bad";
  // Half the track is the whole scale: the fill leaves the centre mark and
  // the biggest effect just reaches its end of the row.
  const width = `${Math.round((Math.abs(row.pct) / max) * 50)}%`;
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
      <h3 className="ct-title">Mood impact</h3>
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
