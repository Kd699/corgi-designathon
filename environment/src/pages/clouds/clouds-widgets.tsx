// The widgets the voice flow pulls out while you talk. Data comes from
// whoop-sample.json — a fabricated seven-day sample in the WHOOP API v2
// record shapes (no real data, no credentials) — flattened here into one
// row per day. Each widget kind carries the regex that summons it: the
// live transcript is matched in clouds-voice.ts and the first mention of
// sleep, recovery or strain lands the matching card.

import type { CSSProperties } from "react";
import whoop from "./whoop-sample.json";

export type WidgetKind = "sleep" | "recovery" | "activity";

export const WIDGET_TRIGGERS: Record<WidgetKind, RegExp> = {
  sleep: /\b(sleep|sleeping|slept|sleepy|tired|rest|rested|bed|nap|dream|insomnia)\b/i,
  recovery: /\b(recover|recovery|recovered|hrv|heart|bpm|resting|readiness|stress|stressed)\b/i,
  activity: /\b(strain|activity|active|workout|working out|train|trained|training|exercise|calorie|calories|run|ran|running|gym|walk|walked|steps)\b/i,
};

type Day = {
  label: string;
  recovery: number;
  hrv: number;
  rhr: number;
  sleepMinutes: number;
  sleepPerformance: number;
  strain: number;
  kcal: number;
  avgHr: number;
};

// The three record lists are day-aligned (one cycle per day in the
// sample), so a zip by index is the whole join.
const DAYS: Day[] = whoop.recovery.records.map((rec, i) => {
  const sleep = whoop.sleep.records[i];
  const cycle = whoop.cycle.records[i];
  const stages = sleep.score.stage_summary;
  return {
    label: "SMTWTFS"[new Date(cycle.end).getDay()],
    recovery: rec.score.recovery_score,
    hrv: Math.round(rec.score.hrv_rmssd_milli),
    rhr: rec.score.resting_heart_rate,
    sleepMinutes: Math.round((stages.total_in_bed_time_milli - stages.total_awake_time_milli) / 60_000),
    sleepPerformance: sleep.score.sleep_performance_percentage,
    strain: cycle.score.strain,
    kcal: Math.round(cycle.score.kilojoule / 4.184),
    avgHr: cycle.score.average_heart_rate,
  };
});

const today = DAYS[DAYS.length - 1];

/** The live numbers the voice flow can cite, keyed for reuse elsewhere. */
export const LATEST = today;

function hm(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function Bars({ values, max }: { values: number[]; max: number }) {
  const w = 12, gap = 5, h = 34;
  return (
    <svg width={values.length * (w + gap) - gap} height={h} aria-hidden="true">
      {values.map((v, i) => {
        const bh = Math.max(2, (v / max) * h);
        const last = i === values.length - 1;
        return (
          <rect
            key={i}
            x={i * (w + gap)}
            y={h - bh}
            width={w}
            height={bh}
            rx={2.5}
            fill="currentColor"
            fillOpacity={last ? 0.95 : 0.38}
          />
        );
      })}
    </svg>
  );
}

function Line({ values, max }: { values: number[]; max: number }) {
  const w = 114, h = 34;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * (w - 4) + 2},${h - 3 - (v / max) * (h - 6)}`)
    .join(" ");
  const [lx, ly] = pts.split(" ").pop()!.split(",").map(Number);
  return (
    <svg width={w} height={h} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeOpacity="0.7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="3" fill="currentColor" />
    </svg>
  );
}

const CONTENT: Record<WidgetKind, { title: string; headline: string; sub: string; chart: JSX.Element }> = {
  sleep: {
    title: "Sleep",
    headline: hm(today.sleepMinutes),
    sub: `${today.sleepPerformance}% performance last night`,
    chart: <Bars values={DAYS.map((d) => d.sleepMinutes)} max={480} />,
  },
  recovery: {
    title: "Recovery",
    headline: `${today.recovery}%`,
    sub: `HRV ${today.hrv} ms · resting ${today.rhr} bpm`,
    chart: <Line values={DAYS.map((d) => d.recovery)} max={100} />,
  },
  activity: {
    title: "Strain",
    headline: today.strain.toFixed(1),
    sub: `${today.kcal.toLocaleString()} kcal · avg ${today.avgHr} bpm`,
    chart: <Bars values={DAYS.map((d) => d.strain)} max={21} />,
  },
};

const CSS = /* css */ `
/* The arc lives inside cm-wrap, so 50%/50% is the character's centre. The
   radial mask keeps the window itself card-free: while a card sweeps out
   it is hidden inside the circle's radius, so it reads as emerging from
   BEHIND the voice circle. */
.cw-arc { position: absolute; inset: 0; pointer-events: none;
  -webkit-mask: radial-gradient(circle at 50% 50%, transparent calc(min(30vmin, 240px) * 0.315), #000 calc(min(30vmin, 240px) * 0.33));
  mask: radial-gradient(circle at 50% 50%, transparent calc(min(30vmin, 240px) * 0.315), #000 calc(min(30vmin, 240px) * 0.33)); }
.cw-slot { position: absolute; left: 50%; top: 50%; --cw-r: calc(-1 * min(36vmin, 265px));
  transform: translate(-50%, -50%) rotate(var(--cw-a, 0deg)) translateY(var(--cw-r)) rotate(calc(-1 * var(--cw-a, 0deg)));
  animation: cw-arc 950ms cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes cw-arc {
  from { transform: translate(-50%, -50%) rotate(0deg) translateY(calc(var(--cw-r) * 0.4)) rotate(0deg); opacity: 0; filter: blur(18px); }
  55% { opacity: 1; }
  to { transform: translate(-50%, -50%) rotate(var(--cw-a, 0deg)) translateY(var(--cw-r)) rotate(calc(-1 * var(--cw-a, 0deg))); opacity: 1; filter: blur(0); }
}
.cw-card { display: flex; flex-direction: column; gap: 6px; padding: 12px 16px 10px; border-radius: 18px;
  background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.32); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  color: #fff; font-family: 'Work Sans', ui-sans-serif, system-ui, sans-serif; text-align: left; }
.cw-title { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.75; }
.cw-headline { font-size: 22px; font-weight: 500; line-height: 1.1; font-variant-numeric: tabular-nums; }
.cw-sub { font-size: 11px; opacity: 0.82; white-space: nowrap; }
@media (prefers-reduced-motion: reduce) { .cw-slot { animation: none; } }
/* On the inverted (white) page the glass goes dark-on-light. */
[data-invert="true"] .cw-card { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.18); color: #111; }
[data-invert="true"] .cw-sub, [data-invert="true"] .cw-title { color: rgba(0,0,0,0.6); opacity: 1; }
`;

// First mention lands straight overhead, later ones fan left then right,
// so the cards trace one arc over the circle in the order you said them.
const ARC_ANGLES = ["0deg", "-48deg", "48deg"];

export function WidgetArc({ kinds }: { kinds: WidgetKind[] }) {
  if (kinds.length === 0) return null;
  return (
    <div className="cw-arc">
      <style>{CSS}</style>
      {kinds.map((kind, i) => {
        const c = CONTENT[kind];
        return (
          <div key={kind} className="cw-slot" style={{ "--cw-a": ARC_ANGLES[i % ARC_ANGLES.length] } as CSSProperties}>
            <div className="cw-card">
              <span className="cw-title">{c.title}</span>
              <span className="cw-headline">{c.headline}</span>
              {c.chart}
              <span className="cw-sub">{c.sub}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
