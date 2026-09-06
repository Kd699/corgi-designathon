// A NumberFlow-style label for words. @number-flow/react rolls DIGITS
// through a soft-edged window; this does the same move for a string: each
// character position that changes rolls the old glyph up and out while the
// new one rises in from below, staggered left to right, through a vertical
// mask so the ends fade instead of clipping. The box glides to the new
// width (measured on a hidden ruler) so the line around it never jumps.
//
// Used for the motif's label — greeting → "Listening" → "Thinking" → the
// session heading — so the words turn over the way the sky does: in place.

import { useEffect, useRef, useState, type CSSProperties } from "react";

const DURATION = 520;
const STAGGER = 16;

const CSS = /* css */ `
.tf { display: inline-block; position: relative; white-space: nowrap; vertical-align: top;
  transition: width ${DURATION}ms cubic-bezier(0.22, 1, 0.36, 1);
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent);
  mask-image: linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent);
  padding: 0.18em 0.12em; margin: -0.18em -0.12em; }
.tf-row { display: inline-block; white-space: pre; }
.tf-row.tf-out { position: absolute; left: 0.12em; top: 0.18em; }
.tf-ruler { position: absolute; left: 0; top: 0; visibility: hidden; white-space: pre; pointer-events: none; }
.tf-ch { display: inline-block; will-change: transform, opacity, filter; }
.tf-in .tf-ch { animation: tf-in ${DURATION}ms cubic-bezier(0.22, 1, 0.36, 1) both; animation-delay: var(--tf-d, 0ms); }
.tf-out .tf-ch { animation: tf-out ${DURATION}ms cubic-bezier(0.22, 1, 0.36, 1) both; animation-delay: var(--tf-d, 0ms); }
.tf-in .tf-ch.tf-same { animation: none; }
.tf-out .tf-ch.tf-same { visibility: hidden; }
@keyframes tf-in { from { transform: translateY(0.7em); opacity: 0; filter: blur(3px); } 60% { opacity: 1; } to { transform: none; opacity: 1; filter: blur(0); } }
@keyframes tf-out { from { transform: none; opacity: 1; filter: blur(0); } to { transform: translateY(-0.7em); opacity: 0; filter: blur(3px); } }
@media (prefers-reduced-motion: reduce) { .tf { transition: none; } .tf-in .tf-ch, .tf-out .tf-ch { animation: none; } .tf-out { display: none; } }
`;

export default function TextFlow({ text, className, style }: { text: string; className?: string; style?: CSSProperties }) {
  const [shown, setShown] = useState(text);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [width, setWidth] = useState<number | undefined>(undefined);
  const rulerRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // A new string: the current one becomes the leaving row for one
  // DURATION (plus the stagger tail).
  useEffect(() => {
    if (text === shown) return;
    setLeaving(shown);
    setShown(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setLeaving(null), DURATION + STAGGER * Math.max(text.length, shown.length));
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // The ruler is the new string set EXACTLY as the visible row is — one
  // inline-block per glyph, so kerning matches and the box width is the
  // row's width, not a plain text run's. A ResizeObserver rather than a
  // one-off measure, so a web font landing late never leaves the box at
  // the wrong width; a zero measurement means "auto".
  useEffect(() => {
    const ruler = rulerRef.current;
    if (!ruler) return;
    const apply = () => {
      const w = ruler.getBoundingClientRect().width;
      setWidth(w > 0 ? w : undefined);
    };
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(apply);
    ro.observe(ruler);
    return () => ro.disconnect();
  }, [shown]);

  const chars = (s: string, other: string | null, mode: "in" | "out" | "ruler") =>
    Array.from(s).map((ch, i) => {
      const same = other != null && Array.from(other)[i] === ch;
      return (
        <span
          key={`${mode}-${i}-${ch}`}
          className={`tf-ch${same ? " tf-same" : ""}`}
          style={{ "--tf-d": `${i * STAGGER}ms` } as CSSProperties}
        >
          {ch}
        </span>
      );
    });

  return (
    <>
      <style>{CSS}</style>
      <span className={`tf ${className ?? ""}`} style={{ ...style, width }} aria-label={text}>
        <span ref={rulerRef} className="tf-ruler" aria-hidden="true">{chars(shown, null, "ruler")}</span>
        {leaving != null && (
          <span key={`out-${leaving}`} className="tf-row tf-out" aria-hidden="true">
            {chars(leaving, shown, "out")}
          </span>
        )}
        <span key={`in-${shown}`} className="tf-row tf-in" aria-hidden="true">
          {chars(shown, leaving, "in")}
        </span>
      </span>
    </>
  );
}
