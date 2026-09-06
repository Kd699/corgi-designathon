// THE MONTH, AS A CALENDAR OF SHAPES. Month scope takes the whole page: a
// white sheet masked IN over the sky (a circle growing from the day pill),
// then one cell per day, each wearing that day's mood as the motif's blob
// outline filled with that day's sky gradient. Days that have real
// sessions take their mood and sky from the last check-in; the rest are
// MOCK — a deterministic hash per date, so the month reads believably and
// never reshuffles. Tapping a day masks OUT toward that cell (the zoom
// runs to where your finger is) and lands on that day's sessions view.

import { useMemo, useRef } from "react";
import { SPECS, blobPath, type MotifMood } from "./clouds-motif";
import { SKY_PRESETS, cssPaletteFor, type SkyPresetName } from "./sky";
import type { HistoryItem } from "./clouds-history";
import TrendsCard from "./clouds-trends";

/** Each mood's postcard sky — the gradient a mocked day is filled with. */
const MOOD_SKY: Record<MotifMood, SkyPresetName> = {
  Excited: "Midday",
  Content: "Sunset",
  Tense: "Dusk",
  Weary: "Pre-dawn",
  Asleep: "Night",
};

/** How the month felt overall, one line per winning mood — mock copy. */
const MONTH_FEEL: Record<MotifMood, string> = {
  Content: "settled and even, with room to breathe",
  Excited: "high energy, the good kind",
  Tense: "wound tight through the middle stretch",
  Weary: "running low more days than not",
  Asleep: "quiet, half checked-out",
};

/** Deterministic mock mood for a date: mostly content and excited days,
 *  tense and weary sprinkled through, the odd asleep one. */
function mockMood(year: number, month: number, day: number): MotifMood {
  const r = (day * 37 + month * 11 + year * 3) % 10;
  if (r <= 2) return "Content";
  if (r <= 5) return "Excited";
  if (r <= 7) return "Tense";
  if (r === 8) return "Weary";
  return "Asleep";
}

const CSS = /* css */ `
/* The sheet: fixed, white, scrollable, and it ARRIVES as a mask — a circle
   growing out of the day pill until it owns the frame, the content easing
   down from a slight overscale so the whole page reads as one zoom. */
.mv { position: fixed; inset: 0; z-index: 25; background: #fff; overflow-y: auto; pointer-events: auto;
  font-family: 'Work Sans', ui-sans-serif, system-ui, sans-serif; color: #111;
  animation: mv-in 720ms cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes mv-in { from { clip-path: circle(0% at 50% 28px); } to { clip-path: circle(142% at 50% 28px); } }
.mv-inner { width: min(92vw, 560px); margin: 0 auto; padding: 84px 0 48px;
  animation: mv-settle 720ms cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes mv-settle { from { transform: scale(1.06); } to { transform: none; } }
@media (prefers-reduced-motion: reduce) { .mv, .mv-inner { animation: none; } }
.mv-name { margin: 0 0 6px; font-family: 'PP Editorial Old', ui-serif, Georgia, serif; font-weight: 400; font-size: 40px; line-height: 1; }
/* The overall feeling: the month's winning mood, worn as a small shape. */
.mv-feel { display: flex; align-items: center; gap: 10px; margin: 0 0 26px; font-size: 14px; line-height: 1.5; color: rgba(0,0,0,0.62); }
.mv-feel svg { flex: none; }
.mv-feel b { font-weight: 600; color: #111; }
.mv-dow { display: grid; grid-template-columns: repeat(7, 1fr); margin-bottom: 6px;
  font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(0,0,0,0.38); text-align: center; }
.mv-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.mv-day { position: relative; aspect-ratio: 1; border: none; border-radius: 14px; padding: 5px; margin: 0;
  background: transparent; cursor: pointer; transition: background 150ms ease, transform 150ms ease; }
.mv-day:hover { background: rgba(0,0,0,0.045); transform: scale(1.04); }
.mv-day:disabled { cursor: default; }
.mv-day:disabled:hover { background: transparent; transform: none; }
.mv-day[data-today="true"] { box-shadow: inset 0 0 0 1.5px rgba(0,0,0,0.28); }
.mv-num { position: absolute; top: 5px; left: 8px; font-size: 9.5px; font-variant-numeric: tabular-nums; color: rgba(0,0,0,0.45); }
.mv-shape { width: 100%; height: 100%; display: block; }
/* Days still to come: the outline only, waiting. */
.mv-ghost { fill: none; stroke: rgba(0,0,0,0.14); stroke-width: 2.5; stroke-dasharray: 4 5; }
.mv-hint { margin: 18px 2px 26px; font-size: 12px; color: rgba(0,0,0,0.4); }
`;

/** One day's blob in its sky. Gradient ids are per-cell so defs don't collide. */
function DayShape({ mood, sky, id }: { mood: MotifMood; sky: SkyPresetName | "Live"; id: string }) {
  const spec = SPECS[mood];
  const palette = cssPaletteFor(sky);
  return (
    <svg className="mv-shape" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.top} />
          <stop offset="55%" stopColor={palette.mid} />
          <stop offset="100%" stopColor={palette.bot} />
        </linearGradient>
      </defs>
      <path d={blobPath(spec.pleasant, spec.energy, 44)} fill={`url(#${id})`} />
    </svg>
  );
}

export default function MonthCalendar({
  history,
  onDay,
}: {
  history: HistoryItem[];
  /** A tapped day, as days back from today — fired AFTER the mask-out. */
  onDay: (offset: number) => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const leaving = useRef(false);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startPad = (new Date(year, month, 1).getDay() + 6) % 7; // Monday first

  // Real sessions trump the mock: a day with check-ins wears its last one.
  const logged = useMemo(() => {
    const map = new Map<number, { mood: MotifMood; sky: SkyPresetName | "Live" }>();
    for (const item of history) {
      const d = new Date(item.at);
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      const sky = item.sky in SKY_PRESETS ? (item.sky as SkyPresetName) : "Live";
      map.set(d.getDate(), { mood: item.mood, sky });
    }
    return map;
  }, [history, year, month]);

  const dayFor = (day: number) => {
    const real = logged.get(day);
    if (real) return real;
    const mood = mockMood(year, month, day);
    return { mood, sky: MOOD_SKY[mood] as SkyPresetName | "Live" };
  };

  // The month's overall feeling: the mood that won the most elapsed days.
  const overall = useMemo(() => {
    const counts = new Map<MotifMood, number>();
    for (let d = 1; d <= today; d++) {
      const { mood } = dayFor(d);
      counts.set(mood, (counts.get(mood) ?? 0) + 1);
    }
    let top: MotifMood = "Content";
    for (const [mood, n] of counts) if (n > (counts.get(top) ?? 0)) top = mood;
    return top;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logged, today]);

  // The mask-out: the sheet collapses toward the tapped cell — the same
  // circle that revealed the month, run backwards to where the finger is —
  // then the scene swaps to that day's sessions view.
  const leave = (day: number, cell: HTMLElement) => {
    if (leaving.current) return;
    leaving.current = true;
    const offset = today - day;
    const sheet = sheetRef.current;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!sheet || reduced) return onDay(offset);
    const rect = cell.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    const zoom = sheet.animate(
      [
        { clipPath: `circle(142% at ${x}px ${y}px)` },
        { clipPath: `circle(0% at ${x}px ${y}px)` },
      ],
      { duration: 560, easing: "cubic-bezier(0.55, 0, 0.55, 0.2)", fill: "forwards" }
    );
    zoom.onfinish = () => onDay(offset);
  };

  const monthName = now.toLocaleDateString([], { month: "long" });
  const cells: (number | null)[] = [
    ...Array.from({ length: startPad }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="mv" ref={sheetRef} role="dialog" aria-label={`${monthName} calendar`}>
      <style>{CSS}</style>
      <div className="mv-inner">
        <h2 className="mv-name">{monthName}</h2>
        <p className="mv-feel">
          <svg width="30" height="30" viewBox="0 0 100 100" aria-hidden="true">
            <defs>
              <linearGradient id="mv-feel-g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={cssPaletteFor(MOOD_SKY[overall]).top} />
                <stop offset="100%" stopColor={cssPaletteFor(MOOD_SKY[overall]).bot} />
              </linearGradient>
            </defs>
            <path d={blobPath(SPECS[overall].pleasant, SPECS[overall].energy, 46)} fill="url(#mv-feel-g)" />
          </svg>
          <span>
            Overall: <b>{overall.toLowerCase()}</b> — {MONTH_FEEL[overall]}.
          </span>
        </p>
        <div className="mv-dow">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="mv-grid">
          {cells.map((day, i) => {
            if (day === null) return <span key={`pad-${i}`} />;
            const future = day > today;
            return (
              <button
                key={day}
                className="mv-day"
                type="button"
                disabled={future}
                data-today={day === today ? "true" : "false"}
                aria-label={`Open ${monthName} ${day}`}
                onClick={(e) => leave(day, e.currentTarget)}
              >
                <span className="mv-num">{day}</span>
                {future ? (
                  <svg className="mv-shape" viewBox="0 0 100 100" aria-hidden="true">
                    <path className="mv-ghost" d={blobPath(0.7, 0.2, 38)} />
                  </svg>
                ) : (
                  (() => {
                    const { mood, sky } = dayFor(day);
                    return <DayShape mood={mood} sky={sky} id={`mv-g-${day}`} />;
                  })()
                )}
              </button>
            );
          })}
        </div>
        <p className="mv-hint">Tap a day to open it. Shapes are each day's mood, filled with its sky.</p>
        <TrendsCard scope="month" />
      </div>
    </div>
  );
}
