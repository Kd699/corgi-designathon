// The motif face, floated over /clouds. This is the CharacterFace from
// motif+signal_simulation, made self-contained: there the geometry came out
// of deriveButtons() (signals → valence/arousal → face spec); here the same
// five expressions are baked as MOOD presets — the numbers each expression
// lands on at a representative valence/arousal — and a DialKit select picks
// one directly. Ink is white so it reads against every sky, day and night.
// The animation CSS rides along in a scoped <style> tag (cm- prefix), so
// the clouds route doesn't depend on the motif app's stylesheet.

import type { CSSProperties } from "react";

export type MotifMood = "Content" | "Excited" | "Tense" | "Weary" | "Asleep";
export const MOTIF_MOODS: readonly MotifMood[] = [
  "Content",
  "Excited",
  "Tense",
  "Weary",
  "Asleep",
];

type FaceSpec = {
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
// Weary (v -.6, a .25), Asleep (idle).
const SPECS: Record<MotifMood, FaceSpec> = {
  Excited: { eyeHeight: 18, eyeTilt: -15, mouthCurve: 10.5, browTilt: 20, browOpacity: 0, blinkSeconds: 3.75, gazePixels: 3.7, asleep: false },
  Tense: { eyeHeight: 17.5, eyeTilt: 19, mouthCurve: -8.5, browTilt: 20, browOpacity: 0.6, blinkSeconds: 3.9, gazePixels: 3.6, asleep: false },
  Content: { eyeHeight: 12, eyeTilt: -10, mouthCurve: 5.7, browTilt: -20, browOpacity: 0, blinkSeconds: 5.25, gazePixels: 1.9, asleep: false },
  Weary: { eyeHeight: 11.5, eyeTilt: 14, mouthCurve: -5.7, browTilt: -20, browOpacity: 0.5, blinkSeconds: 5.4, gazePixels: 1.75, asleep: false },
  Asleep: { eyeHeight: 3, eyeTilt: 0, mouthCurve: 0, browTilt: -20, browOpacity: 0, blinkSeconds: 6, gazePixels: 0, asleep: true },
};

const CSS = /* css */ `
.cm-face { width: min(30vmin, 240px); height: min(30vmin, 240px); overflow: visible; pointer-events: none; color: #fff; filter: drop-shadow(0 2px 14px rgba(0,0,0,0.18)); }
.cm-face .cm-eye { fill: currentColor; transition: height 700ms ease, y 700ms ease; transform-box: fill-box; transform-origin: center; }
.cm-face .cm-mouth, .cm-face .cm-brows path { fill: none; stroke: currentColor; stroke-width: 4.5; stroke-linecap: round; }
.cm-face .cm-mouth { transition: d 700ms ease; }
.cm-face .cm-brows, .cm-face .cm-brows path, .cm-face .cm-eye-tilt { transition: opacity 700ms ease, transform 700ms ease; }
.cm-face .cm-blink { transform-box: fill-box; transform-origin: center; animation: cm-blink var(--cm-blink-duration) ease-in-out infinite; }
.cm-face .cm-gaze { animation: cm-glance 8s ease-in-out infinite; }
.cm-face.cm-asleep .cm-blink, .cm-face.cm-asleep .cm-gaze { animation: none; }
@keyframes cm-blink { 0%,40%,46%,100% { transform: scaleY(1); } 43% { transform: scaleY(.1); } }
@keyframes cm-glance { 0%,25%,70%,100% { transform: translate(0,0); } 35%,50% { transform: translate(var(--cm-gaze-distance),-1px); } 80%,90% { transform: translate(calc(-1 * var(--cm-gaze-distance)),0); } }
@media (prefers-reduced-motion: reduce) {
  .cm-face .cm-blink, .cm-face .cm-gaze { animation: none; }
  .cm-face .cm-eye, .cm-face .cm-mouth, .cm-face .cm-brows, .cm-face .cm-brows path, .cm-face .cm-eye-tilt { transition: none; }
}
`;

export default function CloudsMotif({ mood }: { mood: MotifMood }) {
  const face = SPECS[mood] ?? SPECS.Content;
  const style = {
    "--cm-blink-duration": `${face.blinkSeconds}s`,
    "--cm-gaze-distance": `${face.gazePixels}px`,
  } as CSSProperties;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <style>{CSS}</style>
      <svg
        className={`cm-face${face.asleep ? " cm-asleep" : ""}`}
        data-expression={mood}
        viewBox="0 0 100 100"
        aria-hidden="true"
        style={style}
      >
        <g className="cm-gaze">
          <g className="cm-brows" style={{ opacity: face.browOpacity }}>
            <path d="M 30 28 L 42 28" style={{ transform: `rotate(${face.browTilt}deg)`, transformOrigin: "36px 28px" }} />
            <path d="M 58 28 L 70 28" style={{ transform: `rotate(${-face.browTilt}deg)`, transformOrigin: "64px 28px" }} />
          </g>
          <g className="cm-eye-tilt" style={{ transform: `rotate(${face.eyeTilt}deg)`, transformOrigin: "36px 44px" }}>
            <g className="cm-blink"><rect className="cm-eye" x="31.5" y={44 - face.eyeHeight / 2} width="9" height={face.eyeHeight} rx="4.5" /></g>
          </g>
          <g className="cm-eye-tilt" style={{ transform: `rotate(${-face.eyeTilt}deg)`, transformOrigin: "64px 44px" }}>
            <g className="cm-blink"><rect className="cm-eye" x="59.5" y={44 - face.eyeHeight / 2} width="9" height={face.eyeHeight} rx="4.5" /></g>
          </g>
          <path
            className="cm-mouth"
            style={{ d: `path('M 41 63 Q 50 ${63 + face.mouthCurve} 59 63')` } as CSSProperties}
            d={`M 41 63 Q 50 ${63 + face.mouthCurve} 59 63`}
          />
        </g>
      </svg>
    </div>
  );
}
