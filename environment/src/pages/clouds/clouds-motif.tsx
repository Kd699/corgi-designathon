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

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import type { ReadSegment } from "./clouds-signals";
import { cssPaletteFor, type SkyPresetName } from "./sky";
import { useVoice, type VoiceTheme } from "./clouds-voice";
import { WidgetArc } from "./clouds-widgets";

export type MotifMood = "Content" | "Excited" | "Tense" | "Weary" | "Asleep";
export const MOTIF_MOODS: readonly MotifMood[] = [
  "Content",
  "Excited",
  "Tense",
  "Weary",
  "Asleep",
];

type FaceSpec = {
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
const SPECS: Record<MotifMood, FaceSpec> = {
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

/** The study's outline() (buttonSpec.ts, index 0), as an SVG path in the
 *  100×100 viewBox instead of a CSS clip-path polygon. Same grammar: a
 *  superellipse that rounds as pleasant rises, scalloped edges when
 *  pleasant energy is high, notched cuts when unpleasant energy is high.
 *  64 points for every mood, so d: path() transitions can interpolate. */
function blobPath(pleasant: number, energy: number, size = 46): string {
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
function circlePath(): string {
  const points = Array.from({ length: 64 }, (_, i) => {
    const angle = (i * Math.PI * 2) / 64;
    return `${(50 + Math.cos(angle) * 31).toFixed(2)} ${(50 + Math.sin(angle) * 31).toFixed(2)}`;
  });
  return `M ${points[0]} L ${points.slice(1).join(" L ")} Z`;
}


const CSS = /* css */ `
.cm-wrap { position: relative; width: min(30vmin, 240px); height: min(30vmin, 240px); pointer-events: auto; cursor: pointer; }
.cm-motif { position: relative; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.cm-motif .cm-shape { fill: #fff; transition: d 700ms ease, opacity 500ms ease; }
.cm-motif .cm-sheet { transition: opacity 500ms ease; }
.cm-motif[data-invert="true"] .cm-shape { opacity: 0; }
.cm-motif:not([data-invert="true"]) .cm-sheet { opacity: 0; }
.cm-motif .cm-hole { fill: #000; transition: d 700ms ease; }
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
.cm-motif .cm-face, .cm-motif .cm-vbars { transition: opacity 400ms ease; }
.cm-motif[data-voice="true"] .cm-face { opacity: 0; }
.cm-motif:not([data-voice="true"]) .cm-vbars { opacity: 0; }
.cm-motif .cm-vbar { fill: currentColor; transform-box: fill-box; transform-origin: center; transition: transform 90ms ease-out; }
@keyframes cm-blink { 0%,40%,46%,100% { transform: scaleY(1); } 43% { transform: scaleY(.1); } }
@keyframes cm-glance { 0%,25%,70%,100% { transform: translate(0,0); } 35%,50% { transform: translate(var(--cm-gaze-distance),-1px); } 80%,90% { transform: translate(calc(-1 * var(--cm-gaze-distance)),0); } }
@media (prefers-reduced-motion: reduce) {
  .cm-motif .cm-blink, .cm-motif .cm-gaze { animation: none; }
  .cm-motif .cm-shape, .cm-motif .cm-eye, .cm-motif .cm-mouth, .cm-motif .cm-brows, .cm-motif .cm-brows path, .cm-motif .cm-eye-tilt { transition: none; }
}
/* position: relative on the type, or the sheet eats it: cm-wrap is
   positioned, so its viewport-sized white rect paints ABOVE later
   non-positioned siblings — the label under the sheet, invisible. */
.cm-mood-label { position: relative; margin-top: 0.4em; font-family: 'PP Editorial Old', ui-serif, Georgia, serif; font-weight: 400; font-size: min(5vmin, 34px); line-height: 1; color: #fff; }
.cm-read { position: relative; margin-top: 0.9em; max-width: min(78vmin, 480px); padding: 0 16px; text-align: center; font-family: 'Work Sans', ui-sans-serif, system-ui, sans-serif; font-weight: 400; font-size: 14px; line-height: 2; color: rgba(255,255,255,0.92); text-shadow: 0 1px 10px rgba(0,0,0,0.22); }
.cm-pill { display: inline-block; padding: 0.05em 0.65em; margin: 0 0.1em; border-radius: 999px; background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.35); backdrop-filter: blur(6px); font-variant-numeric: tabular-nums; font-size: 0.86em; line-height: 1.6; white-space: nowrap; vertical-align: 0.05em; }
/* Inverted page: the sheet is white, so the type goes black and grey. */
[data-invert="true"] .cm-mood-label { color: #111; }
[data-invert="true"] .cm-read { color: rgba(0,0,0,0.62); text-shadow: none; }
[data-invert="true"] .cm-pill { background: rgba(0,0,0,0.05); border-color: rgba(0,0,0,0.24); color: rgba(0,0,0,0.72); }
/* The voice stream: each settled utterance is a bubble cut in the sky's
   own palette; the last one rewrites itself live as you speak. */
.cm-bubbles { position: relative; display: flex; flex-direction: column; align-items: center; gap: 9px; margin-top: 1em; max-width: min(80vmin, 520px); padding: 0 16px; }
.cm-bubble { padding: 10px 22px; font-family: 'Work Sans', ui-sans-serif, system-ui, sans-serif; font-weight: 400; font-size: 14px; line-height: 1.55; text-align: center; animation: cm-bub 420ms cubic-bezier(0.2, 1.3, 0.4, 1) both; }
.cm-bubble-live { opacity: 0.82; }
@keyframes cm-bub { from { opacity: 0; transform: translateY(10px) scale(0.9); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .cm-bubble { animation: none; } }
`;

export default function CloudsMotif({
  mood,
  summary,
  sky = "Midday",
  invert = false,
  smile = false,
  onTheme,
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
  /** Fired when a spoken emotion theme should recolour the sky. */
  onTheme?: (sky: SkyPresetName) => void;
}) {
  const face = SPECS[mood] ?? SPECS.Content;

  // Click to talk: the blob morphs into a circle, the face yields to mic
  // level bars, and the transcript pulls WHOOP widgets out as keywords
  // land (clouds-voice.ts / clouds-widgets.tsx).
  const voice = useVoice({ onTheme });
  // Voice always speaks on the white page: listening forces the inverted
  // layout — sky masked into the shape — whatever the dial says.
  const inverted = invert || voice.listening;
  // The listening shape starts as a neutral circle, then MORPHS into the
  // mascot blob of whatever emotion theme is in the air — excited's
  // scallops, tense's notches, weary's droop — at voice-tracker scale.
  const voiceSpec = voice.theme ? SPECS[THEME_MOODS[voice.theme]] : null;
  const blob = voice.listening
    ? voiceSpec
      ? blobPath(voiceSpec.pleasant, voiceSpec.energy, 34)
      : circlePath()
    : blobPath(face.pleasant, face.energy);
  const palette = useMemo(() => cssPaletteFor(sky), [sky]);
  const style = {
    "--cm-blink-duration": `${face.blinkSeconds}s`,
    "--cm-gaze-distance": `${face.gazePixels}px`,
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
  const barsGroup = (cls: "cm-cutout" | "cm-ink") => (
    <g className={`${cls} cm-vbars`} transform="translate(14 14) scale(0.72)">
      {[0.5, 1.3, 2.0, 1.3, 0.5].map((factor, i) => (
        <rect
          key={i}
          className="cm-vbar"
          x={29 + i * 8}
          y="31"
          width="6"
          height="26"
          rx="3"
          style={{ transform: `scaleY(calc(0.18 + var(--cm-level, 0) * ${factor}))` }}
        />
      ))}
    </g>
  );

  // Each bubble is cut in the current sky's palette and takes an organic,
  // per-index border — scallopier when the mood is pleasant-energetic,
  // just like the blob itself.
  const bubbleStyle = (i: number): CSSProperties => {
    const amp = 6 + 12 * face.energy;
    const r = (k: number) => `${Math.round(55 + Math.sin(i * 12.9898 + k * 4.233) * amp)}%`;
    return {
      background: `linear-gradient(180deg, ${palette.top}, ${palette.mid} 55%, ${palette.bot})`,
      borderRadius: `${r(0)} ${r(1)} ${r(2)} ${r(3)} / ${r(4)} ${r(5)} ${r(6)} ${r(7)}`,
      color: palette.light ? "#1e2a3a" : "#fff",
    };
  };

  const hasStream = voice.chunks.length > 0 || voice.interim.length > 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center" data-invert={inverted ? "true" : "false"}>
      <style>{CSS}</style>
      <div
        ref={voice.levelHostRef}
        className="cm-wrap"
        // pointerdown, not click: the session starts on press, not on
        // release, buying the speech service its connection time while
        // the finger is still coming up.
        onPointerDown={(e) => {
          if (e.button === 0) voice.toggle();
        }}
        role="button"
        aria-label={voice.listening ? "Stop listening" : "Start voice"}
      >
        <svg
          ref={svgRef}
          className={`cm-motif${face.asleep ? " cm-asleep" : ""}`}
          data-expression={mood}
          data-voice={voice.listening}
          data-invert={inverted ? "true" : "false"}
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
          </defs>
          {/* The white sheet: far larger than any viewport (the svg
              overflows visibly), holed by its mask so the sky only shows
              through the character. */}
          <rect className="cm-sheet" x="-4000" y="-4000" width="8000" height="8000" fill="#fff" mask="url(#cm-sheet-mask)" />
          <path
            className="cm-shape"
            mask="url(#cm-motif-mask)"
            style={{ d: `path('${blob}')` } as CSSProperties}
            d={blob}
          />
        </svg>
        {/* The WHOOP cards sweep out from behind the circle along an arc
            as their keywords land, blurring in on the way. */}
        <WidgetArc kinds={voice.widgets} />
      </div>
      <span className="cm-mood-label">{voice.listening ? "Listening" : mood}</span>
      {voice.listening && !hasStream && (
        <p className="cm-read">
          <span style={{ opacity: 0.65, fontStyle: "italic" }}>
            {!voice.supported
              ? "speech recognition isn't available in this browser"
              : voice.ready
                ? "go ahead — sleep, recovery, strain, or how you feel\u2026"
                : "connecting\u2026"}
          </span>
        </p>
      )}
      {voice.listening && hasStream && (
        <div className="cm-bubbles">
          {voice.chunks.map((chunk, i) => (
            <span key={i} className="cm-bubble" style={bubbleStyle(i)}>{chunk}</span>
          ))}
          {voice.interim && (
            <span className="cm-bubble cm-bubble-live" style={bubbleStyle(voice.chunks.length)}>
              {voice.interim}
            </span>
          )}
        </div>
      )}
      {!voice.listening && summary && (
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
    </div>
  );
}
