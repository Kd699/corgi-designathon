// The motif, floated over /clouds. This is the character from
// motif+signal_simulation made self-contained: there the geometry came out
// of deriveButtons() (signals → valence/arousal → spec); here the same five
// expressions are baked as MOOD presets — the numbers each expression lands
// on at a representative valence/arousal — and a DialKit select picks one.
//
// The character is its blob SHAPE again (the study's button-shape outline,
// the 64-point superellipse that scallops when pleasant and notches when
// tense), drawn as one white path. The face is not drawn ON it: eyes, brows
// and mouth are punched THROUGH it with an SVG mask, so the features are
// holes and the sky itself looks back through them. Blink/gaze animations
// run inside the mask, so the holes blink.
//
// The animation CSS rides along in a scoped <style> tag (cm- prefix), so
// the clouds route doesn't depend on the motif app's stylesheet. Mood
// morphs use CSS d: path() transitions (Chromium; other engines snap).

// TALKING TO IT. Press (or type below it) and the blob snaps into a circle
// on a white page, the face yields to five bars riding the live shape of
// your voice (clouds-voice.ts), the WHOOP cards sweep out along an arc as
// you name them, and the sky — and the circle itself — take the shape of
// the feelings you say. When you stop, the circle holds and THINKS; then
// the read lands in place (clouds-session.ts): the heading flows in over
// the greeting (clouds-textflow.tsx), the line replaces the sky's, the
// face morphs to the mood it heard, and the page returns to the sky.
// Nothing navigates.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { ReadSegment } from "./clouds-signals";
import { SKY_PRESETS, cssPaletteFor, type SkyPresetName } from "./sky";
import { useVoice, type VoiceTheme } from "./clouds-voice";
import { WidgetArc } from "./clouds-widgets";
import TextFlow from "./clouds-textflow";
import { summariseSession, type DayPicture, type SessionRead } from "./clouds-session";

export type MotifMood = "Content" | "Excited" | "Tense" | "Weary" | "Asleep";
export const MOTIF_MOODS: readonly MotifMood[] = [
  "Content",
  "Excited",
  "Tense",
  "Weary",
  "Asleep",
];

export type FaceSpec = {
  /** (valence+1)/2 and arousal — the blob outline's two inputs. */
  pleasant: number;
  energy: number;
  eyeHeight: number;
  eyeTilt: number;
  mouthCurve: number;
  browTilt: number;
  browOpacity: number;
  blinkSeconds: number;
  gazePixels: number;
  asleep: boolean;
};

// deriveButtons() evaluated at each expression's home ground:
// Excited (v .8, a .9), Tense (v -.7, a .85), Content (v .6, a .3),
// Weary (v -.6, a .25), Asleep (idle, calm middle). Eye heights run taller
// than the study's — long rounded capsules, the Grok-companion read.
export const SPECS: Record<MotifMood, FaceSpec> = {
  Excited: { pleasant: 0.9, energy: 0.9, eyeHeight: 27, eyeTilt: -12, mouthCurve: 10.5, browTilt: 20, browOpacity: 0, blinkSeconds: 3.75, gazePixels: 3.7, asleep: false },
  Tense: { pleasant: 0.15, energy: 0.85, eyeHeight: 25, eyeTilt: 15, mouthCurve: -8.5, browTilt: 20, browOpacity: 0.6, blinkSeconds: 3.9, gazePixels: 3.6, asleep: false },
  Content: { pleasant: 0.8, energy: 0.3, eyeHeight: 22, eyeTilt: -8, mouthCurve: 5.7, browTilt: -20, browOpacity: 0, blinkSeconds: 5.25, gazePixels: 1.9, asleep: false },
  Weary: { pleasant: 0.2, energy: 0.25, eyeHeight: 17, eyeTilt: 11, mouthCurve: -5.7, browTilt: -20, browOpacity: 0.5, blinkSeconds: 5.4, gazePixels: 1.75, asleep: false },
  Asleep: { pleasant: 0.5, energy: 0.05, eyeHeight: 3.5, eyeTilt: 0, mouthCurve: 0, browTilt: -20, browOpacity: 0, blinkSeconds: 6, gazePixels: 0, asleep: true },
};

// While listening, spoken emotion themes wear the mascot's own shapes:
// the voice circle morphs into the matching mood's blob.
const THEME_MOODS: Record<VoiceTheme, MotifMood> = {
  happy: "Excited",
  anxious: "Tense",
  sad: "Weary",
  calm: "Content",
};

// The label is a greeting, not a noun: "Good afternoon, you've been calm
// today". Time of day comes from the sky (its solar hour; Live = the clock).
const MOOD_WORDS: Record<MotifMood, string> = {
  Content: "calm",
  Excited: "buzzing",
  Tense: "wound up",
  Weary: "running low",
  Asleep: "resting",
};

function partOfDay(sky: SkyPresetName | "Live"): string {
  const hour = sky === "Live" ? new Date().getHours() + new Date().getMinutes() / 60 : SKY_PRESETS[sky].hour;
  return hour >= 4 && hour < 12 ? "morning" : hour >= 12 && hour < 17.5 ? "afternoon" : "evening";
}

/** First landing, nothing logged yet: no mood to report, so ask. */
export function greetingFor(mood: MotifMood, sky: SkyPresetName | "Live", neutral = false): string {
  const part = partOfDay(sky);
  return neutral ? `Good ${part}, how are you feeling?` : `Good ${part}, you've been ${MOOD_WORDS[mood] ?? "yourself"} today`;
}

// Before the first session the character has no read to wear: a plain
// round body, level eyes, no brows — waiting, not feeling.
const NEUTRAL: FaceSpec = { pleasant: 0.5, energy: 0.15, eyeHeight: 20, eyeTilt: 0, mouthCurve: 0, browTilt: 0, browOpacity: 0, blinkSeconds: 5, gazePixels: 2, asleep: false };

// Bar order on the face: bands [b3, b1, b0, b2, b4] — the voice's
// fundamentals in the middle, its air at the edges (see clouds-voice.ts).
const BAR_BANDS = [3, 1, 0, 2, 4];

/** The study's outline() (buttonSpec.ts, index 0), as an SVG path in the
 *  100×100 viewBox instead of a CSS clip-path polygon. Same grammar: a
 *  superellipse that rounds as pleasant rises, scalloped edges when
 *  pleasant energy is high, notched cuts when unpleasant energy is high.
 *  64 points for every mood, so d: path() transitions can interpolate. */
export function blobPath(pleasant: number, energy: number, size = 46): string {
  const exponent = 5 - pleasant * 3;
  const points = Array.from({ length: 64 }, (_, i) => {
    const angle = (i * Math.PI * 2) / 64;
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    const radius = 1 / Math.pow(Math.pow(Math.abs(x), exponent) + Math.pow(Math.abs(y), exponent), 1 / exponent);
    const scallop = 1 - pleasant * energy * 0.07 * (1 + Math.cos(angle * 6));
    const cut = 1 - (1 - pleasant) * energy * 0.17 * (1 + Math.cos(angle * 4));
    return `${(50 + x * radius * scallop * cut * size).toFixed(2)} ${(50 + y * radius * scallop * cut * size).toFixed(2)}`;
  });
  return `M ${points[0]} L ${points.slice(1).join(" L ")} Z`;
}

/** The listening shape: a plain circle built from the same 64 points as
 *  the blob, so the CSS d transition can morph one into the other. */
function circlePath(radius = 31): string {
  const points = Array.from({ length: 64 }, (_, i) => {
    const angle = (i * Math.PI * 2) / 64;
    return `${(50 + Math.cos(angle) * radius).toFixed(2)} ${(50 + Math.sin(angle) * radius).toFixed(2)}`;
  });
  return `M ${points[0]} L ${points.slice(1).join(" L ")} Z`;
}


const CSS = /* css */ `
.cm-stage { opacity: var(--cm-fade, 1); }
.cm-wrap { position: relative; width: min(30vmin, 240px); height: min(30vmin, 240px); pointer-events: auto; cursor: pointer; }
.cm-motif { position: relative; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.cm-motif .cm-shape { fill: #fff; transform-origin: 50px 50px; transition: d 560ms cubic-bezier(0.22, 1, 0.36, 1), opacity 420ms ease, transform 420ms ease; }
.cm-motif .cm-hole { fill: #000; transform-origin: 50px 50px; transition: d 560ms cubic-bezier(0.22, 1, 0.36, 1), transform 420ms ease; }
.cm-motif .cm-sheet { transition: opacity 420ms ease; }
/* Crossfade (default): sheet and shape swap by opacity. */
.cm-motif[data-reveal="fade"][data-invert="true"] .cm-shape { opacity: 0; }
.cm-motif[data-reveal="fade"]:not([data-invert="true"]) .cm-sheet { opacity: 0; }
/* Circle reveal (experimental dial): a circle grows from the motif's
   centre — inside it the page is inverted, outside it is the sky — and
   shrinks back the same way. The sheet is clipped to the circle, the
   shape masked to everything outside it; one radius drives both. */
.cm-motif .cm-reveal { r: var(--cm-reveal-r, 0px); transition: r 640ms cubic-bezier(0.4, 0, 0.2, 1); }
/* INTO voice: snap. The blob rounds into the circle in a quarter second
   with a touch of overshoot; the face yields to the bars just as fast. */
.cm-motif[data-voice="true"] .cm-shape { transition: d 260ms cubic-bezier(0.3, 1.15, 0.45, 1), opacity 240ms ease, transform 70ms linear; }
.cm-motif[data-voice="true"] .cm-hole { transition: d 260ms cubic-bezier(0.3, 1.15, 0.45, 1), transform 70ms linear; }
/* …and the circle breathes with your voice. */
.cm-motif[data-voice="true"] .cm-shape, .cm-motif[data-voice="true"] .cm-hole { transform: scale(calc(1 + var(--cm-level, 0) * 0.07)); }
.cm-motif .cm-cutout { color: #000; }
.cm-motif .cm-ink { color: #fff; }
.cm-motif .cm-eye { fill: currentColor; transition: height 700ms ease, y 700ms ease; transform-box: fill-box; transform-origin: center; }
.cm-motif .cm-mouth, .cm-motif .cm-brows path { fill: none; stroke: currentColor; stroke-width: 4.5; stroke-linecap: round; }
.cm-motif .cm-mouth { transition: d 700ms ease; }
.cm-motif .cm-brows, .cm-motif .cm-brows path, .cm-motif .cm-eye-tilt { transition: opacity 700ms ease, transform 700ms ease; }
.cm-motif .cm-blink { transform-box: fill-box; transform-origin: center; animation: cm-blink var(--cm-blink-duration) ease-in-out infinite; }
.cm-motif .cm-gaze { animation: cm-glance 8s ease-in-out infinite; }
.cm-motif .cm-track { transform: translate(var(--cm-track-x, 0px), var(--cm-track-y, 0px)); transition: transform 160ms ease-out; }
.cm-motif[data-tracking="true"] .cm-gaze { animation-play-state: paused; }
.cm-motif.cm-asleep .cm-blink, .cm-motif.cm-asleep .cm-gaze { animation: none; }
.cm-motif.cm-asleep .cm-track { transform: none; }
.cm-motif .cm-face, .cm-motif .cm-vbars { transition: opacity 380ms ease; }
.cm-motif[data-voice="true"] .cm-face, .cm-motif[data-voice="true"] .cm-vbars { transition: opacity 200ms ease; }
.cm-motif[data-voice="true"] .cm-face { opacity: 0; }
.cm-motif:not([data-voice="true"]) .cm-vbars { opacity: 0; }
/* Five capsules dead-centre in the circle. height/y (not scaleY), so the
   caps stay perfectly round at every level; each rides its own band. */
.cm-motif .cm-vbar { fill: currentColor; height: calc(6px + var(--cm-bar, 0) * 34px); y: calc(50px - (6px + var(--cm-bar, 0) * 34px) / 2); transition: height 55ms linear, y 55ms linear; }
/* Thinking: the bars idle in a slow wave until the read lands. */
.cm-motif[data-thinking="true"] .cm-vbar { animation: cm-think 1s ease-in-out infinite; animation-delay: calc(var(--cm-i, 0) * 110ms); }
@keyframes cm-think { 0%, 100% { height: 6px; y: 47px; } 50% { height: 18px; y: 41px; } }
@keyframes cm-blink { 0%,40%,46%,100% { transform: scaleY(1); } 43% { transform: scaleY(.1); } }
@keyframes cm-glance { 0%,25%,70%,100% { transform: translate(0,0); } 35%,50% { transform: translate(var(--cm-gaze-distance),-1px); } 80%,90% { transform: translate(calc(-1 * var(--cm-gaze-distance)),0); } }
@media (prefers-reduced-motion: reduce) {
  .cm-motif .cm-blink, .cm-motif .cm-gaze, .cm-motif .cm-vbar { animation: none; }
  .cm-motif .cm-shape, .cm-motif .cm-hole, .cm-motif .cm-eye, .cm-motif .cm-mouth, .cm-motif .cm-brows, .cm-motif .cm-brows path, .cm-motif .cm-eye-tilt, .cm-motif .cm-reveal { transition: none; }
}
/* position: relative on everything under the wrap, or the sheet eats it:
   cm-wrap is positioned, so its viewport-sized white rect paints ABOVE
   later non-positioned siblings — the label under the sheet, invisible. */
.cm-mood-label { position: relative; margin-top: 0.55em; max-width: 94vw; font-family: 'PP Editorial Old', ui-serif, Georgia, serif; font-weight: 400; font-size: min(3.6vmin, 27px); line-height: 1.15; color: #fff; text-align: center; transition: color 420ms ease; }
.cm-read { position: relative; margin: 0.9em 0 0; max-width: min(78vmin, 480px); padding: 0 16px; text-align: center; font-family: 'Work Sans', ui-sans-serif, system-ui, sans-serif; font-weight: 400; font-size: 14px; line-height: 2; color: rgba(255,255,255,0.92); text-shadow: 0 1px 10px rgba(0,0,0,0.22); transition: color 420ms ease; animation: cm-rise 420ms ease both; }
.cm-pill { display: inline-block; padding: 0.05em 0.65em; margin: 0 0.1em; border-radius: 999px; background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.35); backdrop-filter: blur(6px); font-variant-numeric: tabular-nums; font-size: 0.86em; line-height: 1.6; white-space: nowrap; vertical-align: 0.05em; }
/* The thinking line: one shimmering blank where the read will land. */
.cm-sk { display: inline-block; height: 0.85em; width: 62%; border-radius: 999px; vertical-align: middle;
  background: linear-gradient(90deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.42) 50%, rgba(255,255,255,0.14) 100%); background-size: 200% 100%; animation: cm-shimmer 1.15s linear infinite; }
@keyframes cm-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
@keyframes cm-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
/* Type instead of talk: the same matcher answers the line (widgets, sky,
   then the read). Mid-session it joins the stream. */
.cm-input { position: relative; pointer-events: auto; margin-top: 1em; width: min(76vmin, 440px); padding: 0 16px; }
.cm-input input { width: 100%; height: 42px; padding: 0 48px 0 20px; border-radius: 999px; border: 1px solid rgba(0,0,0,0.08); background: #fff;
  color: #111; font: 400 14px 'Work Sans', ui-sans-serif, system-ui, sans-serif; text-align: left; outline: none;
  transition: border-color 200ms ease; }
.cm-input input::placeholder { color: rgba(0,0,0,0.42); font-style: italic; }
.cm-input input:focus { border-color: rgba(0,0,0,0.22); }
/* The send: a blue circle with a white arrow, parked at the pill's end. */
.cm-send { position: absolute; right: 22px; top: 50%; transform: translateY(-50%); display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 999px; border: none; padding: 0; background: #3478f6; color: #fff; cursor: pointer;
  transition: background 160ms ease, transform 160ms ease; }
.cm-send:hover { background: #2b66d9; }
.cm-send:active { transform: translateY(-50%) scale(0.92); }
.cm-send:disabled { background: rgba(0,0,0,0.14); cursor: default; }
.cm-note { position: relative; margin: 0.7em 0 0; font: italic 400 13px 'Work Sans', ui-sans-serif, system-ui, sans-serif; color: rgba(255,255,255,0.72); text-align: center; }
/* Inverted page: the sheet is white, so the type goes black and grey. */
[data-invert="true"] .cm-mood-label { color: #111; }
[data-invert="true"] .cm-read { color: rgba(0,0,0,0.62); text-shadow: none; }
[data-invert="true"] .cm-pill { background: rgba(0,0,0,0.05); border-color: rgba(0,0,0,0.24); color: rgba(0,0,0,0.72); }
[data-invert="true"] .cm-sk { background-image: linear-gradient(90deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.16) 50%, rgba(0,0,0,0.06) 100%); }
[data-invert="true"] .cm-input input { border-color: rgba(0,0,0,0.14); }
[data-invert="true"] .cm-note { color: rgba(0,0,0,0.52); }
/* The voice stream: chat bubbles — yours, so they sit right with a small
   tail corner — cut in the sky's own palette; the last one rewrites
   itself live as you speak. */
.cm-bubbles { position: relative; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; margin-top: 1em; width: min(80vmin, 520px); padding: 0 16px; }
.cm-bubble { max-width: 86%; padding: 10px 16px; border-radius: 18px 18px 6px 18px; font-family: 'Work Sans', ui-sans-serif, system-ui, sans-serif; font-weight: 400; font-size: 14px; line-height: 1.45; text-align: left; animation: cm-bub 380ms cubic-bezier(0.2, 1.2, 0.4, 1) both; }
.cm-bubble-live { opacity: 0.82; }
@keyframes cm-bub { from { opacity: 0; transform: translateY(8px) scale(0.94); transform-origin: 100% 100%; } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .cm-bubble, .cm-read, .cm-sk { animation: none; } }
`;

export default function CloudsMotif({
  mood,
  summary,
  sky = "Midday",
  invert = false,
  smile = false,
  circleReveal = false,
  session = null,
  neutral = false,
  onTheme,
  onSession,
  onLive,
  picture = null,
}: {
  mood: MotifMood;
  /** The read behind the mood (clouds-signals.ts) — signal citations
   *  arrive as { pill } segments and render as chips in the line. */
  summary?: ReadSegment[];
  /** The active sky preset — the voice bubbles wear its palette. */
  sky?: SkyPresetName | "Live";
  /** Invert the page: a white sheet covers the sky, which shows only
   *  through the blob — with the face restored in white inside it. The
   *  exact negative of the normal white-body / sky-face look. */
  invert?: boolean;
  /** The mouth is off the face for now — this dial brings it back. */
  smile?: boolean;
  /** Experimental: invert ↔ sky as a growing/shrinking circle. */
  circleReveal?: boolean;
  /** The last session's read, if one has landed (owned by the scene so it
   *  can set the mood dial from it). */
  session?: SessionRead | null;
  /** Nothing logged yet (no history, no session): ask instead of report. */
  neutral?: boolean;
  /** Fired when a spoken emotion theme should recolour the sky. */
  onTheme?: (sky: SkyPresetName) => void;
  /** A read landed (or null: a new session began, clear the old one). */
  onSession?: (read: SessionRead | null) => void;
  /** Tracks the voice session (listening or thinking) — the scene hides
   *  the history list while one is live. */
  onLive?: (live: boolean) => void;
  /** The day so far, grouped: with 2+ check-ins today the read shows this
   *  general picture instead of quoting only the latest session. */
  picture?: DayPicture | null;
}) {
  const face = neutral ? NEUTRAL : SPECS[mood] ?? SPECS.Content;

  // Between stop and the read: the circle holds, the bars idle, the label
  // says so. Ends when clouds-session.ts answers (model or local).
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState("");
  // Read through a ref inside the voice callbacks: a session ends seconds
  // after it started, and the sky, mood and handlers may all have moved.
  const latest = useRef({ sky, mood, onSession });
  latest.current = { sky, mood, onSession };

  // Click to talk: the blob morphs into a circle, the face yields to mic
  // level bars, and the transcript pulls WHOOP widgets out as keywords
  // land (clouds-voice.ts / clouds-widgets.tsx).
  const voice = useVoice({
    onTheme,
    onStart: () => latest.current.onSession?.(null),
    onEnd: (transcript, widgets) => {
      setThinking(true);
      const ctx = { sky: latest.current.sky, mood: latest.current.mood, widgets };
      summariseSession(transcript, ctx)
        .then((read) => latest.current.onSession?.(read))
        .finally(() => setThinking(false));
    },
  });
  // A line typed outside a voice session thinks IN PLACE: the sky page
  // stays, the face stays, only the label says Thinking — no white page,
  // no tracker. Voice keeps the full inverted treatment.
  const [typedOnly, setTypedOnly] = useState(false);
  const live = voice.listening || (thinking && !typedOnly);
  useEffect(() => {
    onLive?.(live);
  }, [live, onLive]);
  // Voice always speaks on the white page: listening forces the inverted
  // layout — sky masked into the shape — whatever the dial says.
  const inverted = invert || live;
  // The listening shape starts as a neutral circle, then MORPHS into the
  // mascot blob of whatever emotion theme is in the air — excited's
  // scallops, tense's notches, weary's droop — at voice-tracker scale.
  const voiceSpec = voice.theme ? SPECS[THEME_MOODS[voice.theme]] : null;
  const blob = live
    ? voiceSpec
      ? blobPath(voiceSpec.pleasant, voiceSpec.energy, 34)
      : circlePath()
    : neutral
      ? circlePath(46)
      : blobPath(face.pleasant, face.energy);
  const palette = useMemo(() => cssPaletteFor(sky), [sky]);

  // The reveal circle has to clear the viewport's FARTHEST corner from the
  // motif's own centre (the copy below pushes it above the middle of the
  // screen), measured in its 100-unit space.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [revealRadius, setRevealRadius] = useState(1600);
  useEffect(() => {
    if (!circleReveal) return;
    const measure = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      const w = r?.width || 240;
      const cx = r ? r.left + r.width / 2 : window.innerWidth / 2;
      const cy = r ? r.top + r.height / 2 : window.innerHeight / 2;
      const far = Math.max(
        Math.hypot(cx, cy),
        Math.hypot(window.innerWidth - cx, cy),
        Math.hypot(cx, window.innerHeight - cy),
        Math.hypot(window.innerWidth - cx, window.innerHeight - cy)
      );
      setRevealRadius(far / (w / 100) + 8);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [circleReveal]);

  const style = {
    "--cm-blink-duration": `${face.blinkSeconds}s`,
    "--cm-gaze-distance": `${face.gazePixels}px`,
    "--cm-reveal-r": inverted ? `${revealRadius.toFixed(0)}px` : "0px",
  } as CSSProperties;

  // The eyes follow the pointer: each move writes the offset (clamped, in
  // viewBox units) onto CSS vars the cm-track group translates by — direct
  // style writes, zero re-renders. Moving pauses the idle glance; after
  // 2.5s of stillness the eyes drift back to centre and the glance
  // resumes. The overlay is pointer-events-none, so the window feeds it.
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onMove = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2)));
      const dy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
      svg.style.setProperty("--cm-track-x", `${(dx * 6.5).toFixed(2)}px`);
      svg.style.setProperty("--cm-track-y", `${(dy * 4).toFixed(2)}px`);
      svg.dataset.tracking = "true";
      clearTimeout(timer);
      timer = setTimeout(() => {
        svg.style.setProperty("--cm-track-x", "0px");
        svg.style.setProperty("--cm-track-y", "0px");
        svg.dataset.tracking = "false";
      }, 2500);
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      clearTimeout(timer);
    };
  }, []);

  // One face, two homes: inside the mask (black, cutting sky-holes in the
  // white body) or drawn directly (white ink on the inverted-sky body).
  const faceGroup = (cls: "cm-cutout" | "cm-ink") => (
    <g className={`${cls} cm-face`} transform="translate(14 14) scale(0.72)">
      <g className="cm-gaze">
        {/* Brows and eyes ride cm-track together — long round capsules
            (plus their brows) that swivel after the pointer,
            Grok-companion style. The mouth stays anchored. */}
        <g className="cm-track">
          <g className="cm-brows" style={{ opacity: face.browOpacity }}>
            <path d="M 30 25 L 42 25" style={{ transform: `rotate(${face.browTilt}deg)`, transformOrigin: "36px 25px" }} />
            <path d="M 58 25 L 70 25" style={{ transform: `rotate(${-face.browTilt}deg)`, transformOrigin: "64px 25px" }} />
          </g>
          <g className="cm-eye-tilt" style={{ transform: `rotate(${face.eyeTilt}deg)`, transformOrigin: "36px 44px" }}>
            <g className="cm-blink"><rect className="cm-eye" x="30.5" y={44 - face.eyeHeight / 2} width="11" height={face.eyeHeight} rx="5.5" /></g>
          </g>
          <g className="cm-eye-tilt" style={{ transform: `rotate(${-face.eyeTilt}deg)`, transformOrigin: "64px 44px" }}>
            <g className="cm-blink"><rect className="cm-eye" x="58.5" y={44 - face.eyeHeight / 2} width="11" height={face.eyeHeight} rx="5.5" /></g>
          </g>
        </g>
        {smile && (
          <path
            className="cm-mouth"
            style={{ d: `path('M 41 63 Q 50 ${63 + face.mouthCurve} 59 63')` } as CSSProperties}
            d={`M 41 63 Q 50 ${63 + face.mouthCurve} 59 63`}
          />
        )}
      </g>
    </g>
  );

  // The listening face: five capsules whose height rides the live mic
  // level (--cm-level, written by clouds-voice.ts onto the wrap). Same
  // two homes as the face — cutout in the mask, or white ink.
  // Five fully-round capsules centred on (50,50), each riding one speech
  // band (--cm-b0…4, written by clouds-voice.ts onto the wrap).
  const barsGroup = (cls: "cm-cutout" | "cm-ink") => (
    <g className={`${cls} cm-vbars`}>
      {BAR_BANDS.map((band, i) => (
        <rect
          key={i}
          className="cm-vbar"
          x={31 + i * 8}
          width="6"
          rx="3"
          style={{ "--cm-bar": `var(--cm-b${band}, 0)`, "--cm-i": i } as CSSProperties}
        />
      ))}
    </g>
  );

  // Each bubble is cut in the current sky's palette and takes an organic,
  // per-index border — scallopier when the mood is pleasant-energetic,
  // just like the blob itself.
  const bubbleStyle: CSSProperties = {
    background: `linear-gradient(180deg, ${palette.top}, ${palette.mid} 55%, ${palette.bot})`,
    color: palette.light ? "#1e2a3a" : "#fff",
  };

  const hasStream = voice.chunks.length > 0 || voice.interim.length > 0;
  const label = voice.listening ? "Listening" : thinking ? "Thinking" : session ? session.heading : greetingFor(mood, sky, neutral);

  const send = () => {
    if (thinking) return;
    if (!voice.listening) setTypedOnly(true);
    voice.typed(draft);
    setDraft("");
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    send();
  };

  return (
    <div
      className="cm-stage pointer-events-none sticky top-0 z-10 flex h-[100dvh] w-full flex-col items-center justify-center"
      data-invert={inverted ? "true" : "false"}
    >
      <style>{CSS}</style>
      <div
        ref={(el) => {
          wrapRef.current = el;
          voice.levelHostRef.current = el;
        }}
        className="cm-wrap"
        // pointerdown, not click: the session starts on press, not on
        // release, buying the speech service its connection time while
        // the finger is still coming up.
        onPointerDown={(e) => {
          if (e.button === 0 && !thinking) {
            if (!voice.listening) setTypedOnly(false);
            voice.toggle();
          }
        }}
        role="button"
        aria-label={voice.listening ? "Stop listening" : thinking ? "Thinking" : "Start voice"}
        aria-busy={thinking}
      >
        <svg
          ref={svgRef}
          className={`cm-motif${face.asleep && !live ? " cm-asleep" : ""}`}
          data-expression={mood}
          data-voice={live ? "true" : "false"}
          data-thinking={thinking ? "true" : "false"}
          data-invert={inverted ? "true" : "false"}
          data-reveal={circleReveal ? "circle" : "fade"}
          viewBox="0 0 100 100"
          aria-hidden="true"
          style={style}
        >
          <defs>
            {/* White keeps, black cuts. Normal: the rect keeps the whole
                blob and the face (black, at the study's 72% face-to-body
                scale) punches the features through to the sky. Inverted:
                the sheet mask keeps a huge white page, the blob cuts the
                one window onto the sky, and the face (white) is restored
                inside the window — the exact negative of normal. Both
                layers stay mounted so flipping (or starting voice, which
                forces the sheet) cross-fades instead of jumping. */}
            <mask id="cm-motif-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
              <rect width="100" height="100" fill="#fff" />
              {faceGroup("cm-cutout")}
              {barsGroup("cm-cutout")}
            </mask>
            <mask id="cm-sheet-mask" maskUnits="userSpaceOnUse" x="-4000" y="-4000" width="8000" height="8000">
              <rect x="-4000" y="-4000" width="8000" height="8000" fill="#fff" />
              <path
                className="cm-hole"
                style={{ d: `path('${blob}')` } as CSSProperties}
                d={blob}
              />
              {faceGroup("cm-ink")}
              {barsGroup("cm-ink")}
            </mask>
            {circleReveal && (
              <>
                <clipPath id="cm-reveal-in" clipPathUnits="userSpaceOnUse">
                  <circle className="cm-reveal" cx="50" cy="50" />
                </clipPath>
                <mask id="cm-reveal-out" maskUnits="userSpaceOnUse" x="-4000" y="-4000" width="8000" height="8000">
                  <rect x="-4000" y="-4000" width="8000" height="8000" fill="#fff" />
                  <circle className="cm-reveal" cx="50" cy="50" fill="#000" />
                </mask>
              </>
            )}
          </defs>
          {/* The white sheet: far larger than any viewport (the svg
              overflows visibly), holed by its mask so the sky only shows
              through the character. Under the circle reveal it is clipped
              to the growing circle instead of faded. */}
          {circleReveal ? (
            <g clipPath="url(#cm-reveal-in)">
              <rect className="cm-sheet" x="-4000" y="-4000" width="8000" height="8000" fill="#fff" mask="url(#cm-sheet-mask)" />
            </g>
          ) : (
            <rect className="cm-sheet" x="-4000" y="-4000" width="8000" height="8000" fill="#fff" mask="url(#cm-sheet-mask)" />
          )}
          {circleReveal ? (
            <g mask="url(#cm-reveal-out)">
              <path className="cm-shape" mask="url(#cm-motif-mask)" style={{ d: `path('${blob}')` } as CSSProperties} d={blob} />
            </g>
          ) : (
            <path className="cm-shape" mask="url(#cm-motif-mask)" style={{ d: `path('${blob}')` } as CSSProperties} d={blob} />
          )}
        </svg>
        {/* The WHOOP cards sweep out from behind the circle along an arc
            as their keywords land, blurring in on the way. */}
        <WidgetArc kinds={voice.widgets} />
      </div>
      <TextFlow className="cm-mood-label" text={label} />
      {voice.listening && !hasStream && (
        <p className="cm-note">
          {!voice.supported
            ? "speech recognition isn't available in this browser — typing works"
            : voice.ready
              ? "go ahead — sleep, recovery, strain, or how you feel\u2026"
              : "connecting\u2026"}
        </p>
      )}
      {thinking && (
        <p className="cm-read" aria-label="Thinking">
          <span className="cm-sk" />
        </p>
      )}
      {voice.listening && hasStream && (
        <div className="cm-bubbles">
          {voice.chunks.map((chunk, i) => (
            <span key={i} className="cm-bubble" style={bubbleStyle}>{chunk}</span>
          ))}
          {voice.interim && (
            <span className="cm-bubble cm-bubble-live" style={bubbleStyle}>
              {voice.interim}
            </span>
          )}
        </div>
      )}
      {!live && session && (
        <p className="cm-read" data-read-source={(picture ?? session).source} key={picture ? picture.text : session.heading}>
          {/* One check-in: its own read. More: the day grouped. */}
          {picture ? picture.text : session.summary} <span className="cm-pill">{(picture ?? session).mood}</span>
          {picture && <span className="cm-pill">{picture.count} check-ins</span>}
          {(picture ?? session).source === "local" && <span className="cm-pill">local read</span>}
        </p>
      )}
      {!live && !session && picture && (
        <p className="cm-read" data-read-source={picture.source} key={picture.text}>
          {picture.text} <span className="cm-pill">{picture.mood}</span>{" "}
          <span className="cm-pill">{picture.count} check-ins</span>
          {picture.source === "local" && <span className="cm-pill">local read</span>}
        </p>
      )}
      {!live && !session && !picture && neutral && (
        <p className="cm-read">Tap the motif to log how you're feeling, or type it below.</p>
      )}
      {!live && !session && !picture && !neutral && summary && (
        <p className="cm-read">
          {summary.map((seg, i) =>
            typeof seg === "string" ? (
              <span key={i}>{seg}</span>
            ) : (
              <span key={i} className="cm-pill">{seg.pill}</span>
            )
          )}
        </p>
      )}
      {!thinking && (
        <form className="cm-input" onSubmit={submit}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            // Enter sends explicitly too: implicit form submission is not
            // a given for every key event source (automation included).
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={voice.listening ? "or type it…" : "talk, or type about your sleep, recovery or strain…"}
            aria-label="Type about your day"
            autoComplete="off"
            enterKeyHint="send"
          />
          <button className="cm-send" type="submit" disabled={!draft.trim()} aria-label="Send">
            {/* An up arrow, the message-send read. */}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      )}
    </div>
  );
}
