// The running history under the sky: every voice (or typed) session's read
// — heading, line, mood, sky, when — collected newest-first, kept in
// localStorage so it survives a reload. The sky stays put behind it
// (clouds-scene.tsx fixes the canvas); the motif fades as you scroll into
// this, and the cards scroll up over the sky.

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
  display: flex; flex-direction: column; gap: 12px; font-family: 'Work Sans', ui-sans-serif, system-ui, sans-serif; color: #fff; }
.ch-title { margin: 0 0 4px 6px; font-family: 'PP Editorial Old', ui-serif, Georgia, serif; font-weight: 400; font-size: 20px; opacity: 0.9; }
.ch-count { font-family: 'Work Sans', ui-sans-serif, system-ui, sans-serif; font-size: 12px; opacity: 0.7; margin-left: 10px; letter-spacing: 0.06em; }
/* Cards are solid white with black type on every page, sky or inverted —
   like the mascot itself, a white shape the content sits inside. */
.ch-card { border-radius: 20px; padding: 16px 18px 15px; background: #fff; color: #111;
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
  .ch-card, .ch-title {
    animation: ch-away linear both;
    animation-timeline: view(block 18% 0%);
    animation-range: exit 0% exit 90%;
  }
  @keyframes ch-away {
    to { opacity: 0; filter: blur(14px); transform: translateY(-14px) scale(0.97); }
  }
}
@media (prefers-reduced-motion: reduce) {
  .ch-card, .ch-title { animation: none; }
}
`;

export default function SessionHistory({ items, inverted }: { items: HistoryItem[]; inverted: boolean }) {
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
          <article className="ch-card" key={item.at}>
            <div className="ch-meta">
              <time dateTime={item.at}>{when(item.at)}</time>
            </div>
            <h3 className="ch-heading">{item.heading}</h3>
            <p className="ch-summary">{item.summary}</p>
          </article>
        ))}
    </section>
  );
}
