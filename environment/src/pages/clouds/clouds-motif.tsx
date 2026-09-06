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
// Weary (v -.6, a .25), Asleep (idle, calm middle).
const SPECS: Record<MotifMood, FaceSpec> = {
  Excited: { pleasant: 0.9, energy: 0.9, eyeHeight: 18, eyeTilt: -15, mouthCurve: 10.5, browTilt: 20, browOpacity: 0, blinkSeconds: 3.75, gazePixels: 3.7, asleep: false },
  Tense: { pleasant: 0.15, energy: 0.85, eyeHeight: 17.5, eyeTilt: 19, mouthCurve: -8.5, browTilt: 20, browOpacity: 0.6, blinkSeconds: 3.9, gazePixels: 3.6, asleep: false },
  Content: { pleasant: 0.8, energy: 0.3, eyeHeight: 12, eyeTilt: -10, mouthCurve: 5.7, browTilt: -20, browOpacity: 0, blinkSeconds: 5.25, gazePixels: 1.9, asleep: false },
  Weary: { pleasant: 0.2, energy: 0.25, eyeHeight: 11.5, eyeTilt: 14, mouthCurve: -5.7, browTilt: -20, browOpacity: 0.5, blinkSeconds: 5.4, gazePixels: 1.75, asleep: false },
  Asleep: { pleasant: 0.5, energy: 0.05, eyeHeight: 3, eyeTilt: 0, mouthCurve: 0, browTilt: -20, browOpacity: 0, blinkSeconds: 6, gazePixels: 0, asleep: true },
};

/** The study's outline() (buttonSpec.ts, index 0), as an SVG path in the
 *  100×100 viewBox instead of a CSS clip-path polygon. Same grammar: a
 *  superellipse that rounds as pleasant rises, scalloped edges when
 *  pleasant energy is high, notched cuts when unpleasant energy is high.
 *  64 points for every mood, so d: path() transitions can interpolate. */
function blobPath(pleasant: number, energy: number): string {
  const exponent = 5 - pleasant * 3;
  const points = Array.from({ length: 64 }, (_, i) => {
    const angle = (i * Math.PI * 2) / 64;
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    const radius = 1 / Math.pow(Math.pow(Math.abs(x), exponent) + Math.pow(Math.abs(y), exponent), 1 / exponent);
    const scallop = 1 - pleasant * energy * 0.07 * (1 + Math.cos(angle * 6));
    const cut = 1 - (1 - pleasant) * energy * 0.17 * (1 + Math.cos(angle * 4));
    return `${(50 + x * radius * scallop * cut * 46).toFixed(2)} ${(50 + y * radius * scallop * cut * 46).toFixed(2)}`;
  });
  return `M ${points[0]} L ${points.slice(1).join(" L ")} Z`;
}

const CSS = /* css */ `
.cm-motif { width: min(30vmin, 240px); height: min(30vmin, 240px); overflow: visible; pointer-events: none; filter: drop-shadow(0 2px 14px rgba(0,0,0,0.18)); }
.cm-motif .cm-shape { fill: #fff; transition: d 700ms ease; }
.cm-motif .cm-cutout { color: #000; }
.cm-motif .cm-eye { fill: currentColor; transition: height 700ms ease, y 700ms ease; transform-box: fill-box; transform-origin: center; }
.cm-motif .cm-mouth, .cm-motif .cm-brows path { fill: none; stroke: currentColor; stroke-width: 4.5; stroke-linecap: round; }
.cm-motif .cm-mouth { transition: d 700ms ease; }
.cm-motif .cm-brows, .cm-motif .cm-brows path, .cm-motif .cm-eye-tilt { transition: opacity 700ms ease, transform 700ms ease; }
.cm-motif .cm-blink { transform-box: fill-box; transform-origin: center; animation: cm-blink var(--cm-blink-duration) ease-in-out infinite; }
.cm-motif .cm-gaze { animation: cm-glance 8s ease-in-out infinite; }
.cm-motif.cm-asleep .cm-blink, .cm-motif.cm-asleep .cm-gaze { animation: none; }
@keyframes cm-blink { 0%,40%,46%,100% { transform: scaleY(1); } 43% { transform: scaleY(.1); } }
@keyframes cm-glance { 0%,25%,70%,100% { transform: translate(0,0); } 35%,50% { transform: translate(var(--cm-gaze-distance),-1px); } 80%,90% { transform: translate(calc(-1 * var(--cm-gaze-distance)),0); } }
@media (prefers-reduced-motion: reduce) {
  .cm-motif .cm-blink, .cm-motif .cm-gaze { animation: none; }
  .cm-motif .cm-shape, .cm-motif .cm-eye, .cm-motif .cm-mouth, .cm-motif .cm-brows, .cm-motif .cm-brows path, .cm-motif .cm-eye-tilt { transition: none; }
}
.cm-mood-label { margin-top: 0.4em; font-family: 'PP Editorial Old', ui-serif, Georgia, serif; font-weight: 400; font-size: min(5vmin, 34px); line-height: 1; color: #fff; text-shadow: 0 2px 14px rgba(0,0,0,0.18); }
`;

export default function CloudsMotif({ mood }: { mood: MotifMood }) {
  const face = SPECS[mood] ?? SPECS.Content;
  const blob = blobPath(face.pleasant, face.energy);
  const style = {
    "--cm-blink-duration": `${face.blinkSeconds}s`,
    "--cm-gaze-distance": `${face.gazePixels}px`,
  } as CSSProperties;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center">
      <style>{CSS}</style>
      <svg
        className={`cm-motif${face.asleep ? " cm-asleep" : ""}`}
        data-expression={mood}
        viewBox="0 0 100 100"
        aria-hidden="true"
        style={style}
      >
        <defs>
          {/* White keeps, black cuts: the rect keeps the whole blob and the
              face group (drawn black, at the study's 72% face-to-body scale)
              punches the features through to the sky. */}
          <mask id="cm-motif-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
            <rect width="100" height="100" fill="#fff" />
            <g className="cm-cutout" transform="translate(14 14) scale(0.72)">
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
            </g>
          </mask>
        </defs>
        <path
          className="cm-shape"
          mask="url(#cm-motif-mask)"
          style={{ d: `path('${blob}')` } as CSSProperties}
          d={blob}
        />
      </svg>
      <span className="cm-mood-label">{mood}</span>
    </div>
  );
}
