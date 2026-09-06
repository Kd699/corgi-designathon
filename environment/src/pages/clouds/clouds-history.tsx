// The running history under the sky: every voice (or typed) session's read
// — heading, line, mood, sky, when — collected newest-first, kept in
// localStorage so it survives a reload. The sky stays put behind it
// (clouds-scene.tsx fixes the canvas); the motif fades as you scroll into
// this, and the cards scroll up over the sky.

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { SessionRead } from "./clouds-session";

export type HistoryItem = SessionRead & { at: string; sky: string };

const KEY = "clouds-sessions";

/** The empty-mic read (clouds-session.ts localRead with no text). Shown in
 *  the moment as feedback, but a non-session: it never belongs in the
 *  history, and any already saved get swept on load. */
export function isEmptyRead(read: SessionRead): boolean {
  return read.heading === "Nothing came through";
}

export function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as HistoryItem[]) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => !isEmptyRead(item)) : [];
  } catch {
    return [];
  }
}

export function saveHistory(items: HistoryItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(-60)));
  } catch {
    /* private mode, quota — the list still lives for this visit */
  }
}

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return sameDay ? `Today · ${time}` : `${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} · ${time}`;
}

const CSS = /* css */ `
.ch { position: relative; z-index: 20; pointer-events: auto; width: min(92vw, 560px); margin: -14vh auto 0; padding: 0 0 20vh;
  display: flex; flex-direction: column; font-family: 'Work Sans', ui-sans-serif, system-ui, sans-serif; color: #fff; }
.ch-title { margin: 0 0 16px 6px; font-family: 'PP Editorial Old', ui-serif, Georgia, serif; font-weight: 400; font-size: 20px; opacity: 0.9; }
.ch-count { font-family: 'Work Sans', ui-sans-serif, system-ui, sans-serif; font-size: 12px; opacity: 0.7; margin-left: 10px; letter-spacing: 0.06em; }
/* Each entry: a wrapper that owns the swipe and the collapse, a Delete
   layer behind, the card on top. touch-action pan-y: vertical scrolling
   stays native, horizontal drags are ours. */
.ch-item { position: relative; margin-bottom: 12px; touch-action: pan-y; }
.ch-del { position: absolute; inset: 0; display: flex; align-items: center; justify-content: flex-end; padding-right: 22px;
  border-radius: 20px; background: rgba(200, 40, 40, 0.14); border: 1px solid rgba(200, 40, 40, 0.25);
  color: #fff; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
  opacity: var(--ch-swipe, 0); transition: opacity 120ms linear; }
.ch[data-invert="true"] .ch-del { color: #a02020; }
/* Cards are solid white with black type on every page, sky or inverted —
   like the mascot itself, a white shape the content sits inside. */
.ch-card { position: relative; border-radius: 20px; padding: 16px 18px 15px; background: #fff; color: #111;
  border: 1px solid rgba(0,0,0,0.08); text-align: left; }
.ch-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(0,0,0,0.6); }
.ch-heading { margin: 8px 0 4px; font-family: 'PP Editorial Old', ui-serif, Georgia, serif; font-weight: 400; font-size: 23px; line-height: 1.15; }
.ch-summary { margin: 0; font-size: 14px; line-height: 1.6; color: rgba(0,0,0,0.7); }
.ch-empty { opacity: 0.65; font-size: 13px; text-align: center; padding: 12px; }
/* On the inverted (white) page the title outside the cards goes dark too. */
.ch[data-invert="true"] { color: #111; }
.ch[data-invert="true"] .ch-card { border-color: rgba(0,0,0,0.14); }
/* Leaving through the top: each card rides its own view() timeline, so as
   it climbs into the top ~18% of the viewport it progressively blurs,
   thins and lifts away — a per-card progressive blur, no scroll listener.
   The title and cards share the treatment; browsers without scroll-driven
   animations just scroll them off plain. */
@supports (animation-timeline: view()) {
  .ch-item, .ch-title {
    animation: ch-away linear both;
    animation-timeline: view(block 18% 0%);
    animation-range: exit 0% exit 90%;
  }
  @keyframes ch-away {
    to { opacity: 0; filter: blur(14px); transform: translateY(-14px) scale(0.97); }
  }
}
@media (prefers-reduced-motion: reduce) {
  .ch-item, .ch-title { animation: none; }
}
`;

/* Swipe right-to-left to delete. The drag follows the finger (a little
 * rubber-band resistance the wrong way), the Delete layer fades up behind,
 * and past ~38% of the card's width the card MORPHS out — flies left,
 * blurs, shrinks — and the row collapses before the item leaves the list
 * (localStorage follows through onDelete → saveHistory in the scene). */
function SwipeableCard({ item, onDelete }: { item: HistoryItem; onDelete: (at: string) => void }) {
  const itemRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const drag = useRef({ x: 0, y: 0, dx: 0, active: false, horizontal: null as boolean | null, gone: false });

  const setSwipe = (dx: number) => {
    const card = cardRef.current;
    const host = itemRef.current;
    if (!card || !host) return;
    card.style.transform = `translateX(${dx}px)`;
    const progress = Math.min(1, Math.max(0, -dx) / (host.offsetWidth * 0.38));
    host.style.setProperty("--ch-swipe", progress.toFixed(3));
  };

  const release = () => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transition = "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)";
    setSwipe(0);
    setTimeout(() => {
      if (cardRef.current) cardRef.current.style.transition = "";
    }, 280);
  };

  const morphOut = () => {
    const card = cardRef.current;
    const host = itemRef.current;
    if (!card || !host || drag.current.gone) return;
    drag.current.gone = true;
    // The morph: the card flies out left, blurring and shrinking...
    card.style.transition = "transform 320ms cubic-bezier(0.4, 0, 0.9, 0.6), opacity 300ms linear, filter 300ms linear";
    card.style.transform = `translateX(${-host.offsetWidth * 1.15}px) scale(0.85)`;
    card.style.opacity = "0";
    card.style.filter = "blur(10px)";
    host.style.setProperty("--ch-swipe", "0");
    // ...then the row folds shut under the cards below, and the item goes.
    const fold = host.animate(
      [
        { height: `${host.offsetHeight}px`, marginBottom: "12px", opacity: 1 },
        { height: "0px", marginBottom: "0px", opacity: 0 },
      ],
      { duration: 240, delay: 200, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" }
    );
    fold.onfinish = () => onDelete(item.at);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 || drag.current.gone) return;
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, active: true, horizontal: null, gone: false };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d.active || d.gone) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    // First few pixels decide: sideways is a swipe, up/down stays a scroll.
    if (d.horizontal === null) {
      if (Math.abs(dx) < 7 && Math.abs(dy) < 7) return;
      d.horizontal = Math.abs(dx) > Math.abs(dy);
      if (d.horizontal) (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    if (!d.horizontal) return;
    d.dx = dx;
    setSwipe(dx < 0 ? dx : dx / 5);
  };
  const onPointerEnd = () => {
    const d = drag.current;
    if (!d.active || d.gone) return;
    d.active = false;
    if (!d.horizontal) return;
    const width = itemRef.current?.offsetWidth ?? 400;
    if (-d.dx > width * 0.38) morphOut();
    else release();
  };

  return (
    <div
      ref={itemRef}
      className="ch-item"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div className="ch-del" aria-hidden="true">Delete</div>
      <article className="ch-card" ref={cardRef}>
        <div className="ch-meta">
          <time dateTime={item.at}>{when(item.at)}</time>
        </div>
        <h3 className="ch-heading">{item.heading}</h3>
        <p className="ch-summary">{item.summary}</p>
      </article>
    </div>
  );
}

export default function SessionHistory({
  items,
  inverted,
  onDelete,
}: {
  items: HistoryItem[];
  inverted: boolean;
  /** Swipe a card off (right to left) and it leaves the list — the scene
   *  owns the state and writes localStorage through saveHistory. */
  onDelete: (at: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="ch" data-invert={inverted ? "true" : "false"} aria-label="Session history">
      <style>{CSS}</style>
      <h2 className="ch-title">
        Sessions
        <span className="ch-count">{items.length}</span>
      </h2>
      {items
        .slice()
        .reverse()
        .map((item) => (
          <SwipeableCard key={item.at} item={item} onDelete={onDelete} />
        ))}
    </section>
  );
}
