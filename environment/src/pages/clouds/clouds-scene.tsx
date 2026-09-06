"use client";

// The /clouds scene: geospatial volumetric clouds (@takram/three-clouds)
// lit and composited by @takram/three-atmosphere, dialled by DialKit.
// This is the VOLUMETRIC engine; an Engine dial swaps it for the wisps
// engine (clouds-wisps.tsx) — the same presets painted by one lightweight
// procedural shader. Shared sky vocabulary lives in ./sky.ts.
//
// HOW THE PIECES COMPOSE. Clouds is a postprocessing effect, not a mesh: it
// ray-marches cloud density into buffers inside EffectComposer, and
// AerialPerspective (from the atmosphere package) composites those buffers
// while drawing the sky and applying sun/sky irradiance — which is why the
// two must sit together inside <Atmosphere>. The camera lives in real ECEF
// coordinates on the WGS84 ellipsoid, so "where you are" is a geodetic
// longitude/latitude/height, not an arbitrary scene position.
//
// SKY IS A PRESET, TIME IS THE STYLE (after Steve Lauda's Blissful sky,
// x.com/stevelauda_/status/2066417007038521475). One select steps the sky
// through Pre-dawn → Night, and each stop is a real solar hour, the exposure
// that makes that hour legible, a postcard heading, and a cloud MOOD — the
// atmosphere model does the palette (indigo twilight, peach at sunrise,
// saturated midday blue, ember dusk) and the mood decides whether the hour
// arrives with big soft clouds, thin wisps, or a brooding deck. "Live" is
// the default and the easter egg: the visitor's own clock is the solar hour,
// interpolating between the neighbouring stops.
//
// SWITCHING SKIES: THE DAY TURNS OVER A STILL SKY. Every animated quantity
// — solar hour, exposure, heading/pitch, cloud coverage/density, star
// brightness — is evaluated per frame from ONE fixed-duration tween and
// written STRAIGHT ONTO the CloudsEffect / renderer / camera (zero React
// re-renders per frame). Tweens, not damped lerp, on purpose: exponential
// smoothing moves FASTEST in its first frame — an early cut read as zooming
// through space — where an ease-in-out starts still, breathes through the
// middle and lands softly. Three tempos off one clock (see TWEEN_KEYS):
// light ~2.5s, camera ~5s, cloud fade ~4s. And the clouds NEVER MOVE on a
// switch: no weather scroll beyond the dialled wind, no mood-driven
// rescale — the same clouds hold their places while the time of day
// changes over them. Hour and heading interpolate circularly
// (midday→night rolls forward, not back through morning). Honours
// prefers-reduced-motion by snapping.
//
// THE CAMERA IS A DIAL, NOT A GESTURE. No OrbitControls: the view is fixed,
// a postcard rather than a fly-through, and the only way to move it is the
// View folder (geodetic location plus heading/pitch in the local east-
// north-up frame). Selecting a sky swings the heading dial to that sky's
// postcard direction; the dial stays live on top.
//
// THE CLOUDS ARE FOUR WORDS, not fourteen parameters: Speed, Fullness,
// Intensity, Size — the Blissful vocabulary. The package's default layers
// are disabled and one thin, eroded layer is dialled instead; the preset
// mood multiplies the sliders, so the same hand-set character reads calm at
// midday and stormy at dusk. Everything else — quality preset, clump
// sharpness, layer altitude/thickness — is real but secondary, so it lives
// in a collapsed Advanced folder.
//
// The default weather/shape/turbulence/star textures stream from the takram
// packages' GitHub media host on first load; nothing is bundled here.

import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  EffectComposer,
  SMAA,
  ToneMapping,
} from "@react-three/postprocessing";
import { BlendFunction, Effect, ToneMappingMode } from "postprocessing";
import { Color, Uniform, Vector3 } from "three";
import { DEFAULT_STARS_DATA_URL } from "@takram/three-atmosphere";
import {
  AerialPerspective,
  Atmosphere,
  Stars,
  type AtmosphereApi,
  type StarsImpl,
} from "@takram/three-atmosphere/r3f";
import type { CloudsEffect } from "@takram/three-clouds";
import { CloudLayer, Clouds } from "@takram/three-clouds/r3f";
import { Ellipsoid, Geodetic, radians } from "@takram/three-geospatial";
import { DialRoot, useDialKitController, type DialConfig } from "dialkit";
import "dialkit/styles.css";
import WispsCanvas from "./clouds-wisps";
import CloudsMotif, { MOTIF_MOODS } from "./clouds-motif";
import SessionHistory, { isEmptyRead, loadHistory, saveHistory, type HistoryItem } from "./clouds-history";
import TrendsCard from "./clouds-trends";
import MonthCalendar from "./clouds-month";
import { summariseDay, type DayPicture, type SessionRead } from "./clouds-session";
import { THEME_SKY } from "./clouds-voice";
import { moodForSky, readForSky } from "./clouds-signals";
import {
  SKY_PRESETS,
  ease,
  liveSky,
  paletteForHour,
  wrapDelta,
  type CloudDials,
  type SkyPalette,
  type SkyStop,
} from "./sky";

// THE HORIZON WASH. ground={false} removes the drawn ellipsoid, but the
// scattering model still darkens below the geometric horizon, leaving a
// tonal seam across the frame. Rather than fight the physics, the bottom
// band is treated as design: a wash of the current sky's horizon colour
// (the same SKY_PALETTES the wisps engine paints from) blended over the
// last stretch of the frame, solid below the seam and gone by mid-frame —
// each sky ends in its own single gradient colour, reference-style. Runs
// after ToneMapping, inside the composer's linear space, so the wash
// colour is fed through convertSRGBToLinear before it goes in.
const HORIZON_WASH_FRAGMENT = /* glsl */ `
  uniform vec3 washColor;
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float wash = 1.0 - smoothstep(0.14, 0.44, uv.y);
    outputColor = vec4(mix(inputColor.rgb, washColor, wash), inputColor.a);
  }
`;

class HorizonWashEffect extends Effect {
  constructor() {
    super("HorizonWash", HORIZON_WASH_FRAGMENT, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([["washColor", new Uniform(new Color())]]),
    });
  }
  get washColor(): Color {
    return this.uniforms.get("washColor")!.value as Color;
  }
}

// THE DAY NAV. A small pill fixed top-centre: "Today", with a back arrow
// that steps the SESSIONS VIEW to the previous day (and a forward arrow to
// walk home). Tapping the label drops a scope menu — Today, This week,
// This month — whose rows blur-stagger in and out; week and month scope
// the list below to the period and put the trends card on top. The sky
// and the motif stay live — only the sessions view is scoped.
export type SessionScope = "day" | "week" | "month";

const SCOPE_OPTIONS: { id: SessionScope; label: string }[] = [
  { id: "day", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
];

const DAY_NAV_CSS = /* css */ `
/* No chrome of its own: the pill is just the label and arrows floating
   over the sky — the menu below carries the glass. */
.cn { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 30; pointer-events: auto;
  display: flex; align-items: center; gap: 2px; padding: 4px 6px;
  font-family: 'Work Sans', ui-sans-serif, system-ui, sans-serif; color: #fff; }
.cn-btn { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px;
  border: none; border-radius: 999px; padding: 0; background: transparent; color: inherit; cursor: pointer;
  transition: background 140ms ease; }
.cn-btn:hover { background: rgba(255,255,255,0.18); }
.cn-btn:disabled { opacity: 0.28; cursor: default; background: transparent; }
.cn-label { display: flex; align-items: center; justify-content: center; gap: 6px; min-width: 96px; height: 26px;
  border: none; border-radius: 999px; padding: 0 10px; background: transparent; color: inherit; cursor: pointer;
  font: inherit; font-size: 13px; letter-spacing: 0.02em; user-select: none; transition: background 140ms ease; }
.cn-label:hover { background: rgba(255,255,255,0.14); }
.cn-caret { transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1); }
.cn-label[aria-expanded="true"] .cn-caret { transform: rotate(180deg); }
/* The scope menu: each row arrives out of a blur, one after the other, and
   leaves the same way in reverse — closing keeps the menu mounted until
   the last row has faded (data-closing). */
.cn-menu { position: absolute; top: calc(100% + 10px); left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; gap: 3px; min-width: 148px; padding: 5px; border-radius: 18px;
  background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.32);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
.cn-item { border: none; border-radius: 13px; padding: 8px 14px; background: transparent; color: inherit;
  cursor: pointer; font: inherit; font-size: 13px; text-align: left; transition: background 140ms ease;
  animation: cn-item-in 360ms cubic-bezier(0.22, 1, 0.36, 1) both; animation-delay: calc(var(--i) * 55ms); }
.cn-item:hover { background: rgba(255,255,255,0.18); }
.cn-item[data-current="true"] { background: rgba(255,255,255,0.24); }
@keyframes cn-item-in {
  from { opacity: 0; filter: blur(9px); transform: translateY(-7px); }
  to { opacity: 1; filter: blur(0); transform: none; }
}
.cn-menu[data-closing="true"] .cn-item {
  animation: cn-item-out 260ms cubic-bezier(0.4, 0, 0.7, 0.4) both;
  animation-delay: calc((var(--n) - 1 - var(--i)) * 45ms);
  pointer-events: none;
}
@keyframes cn-item-out {
  to { opacity: 0; filter: blur(9px); transform: translateY(-7px); }
}
@media (prefers-reduced-motion: reduce) { .cn-item { animation: none; } }
/* On the inverted (white) page the pill and menu go dark-on-light. */
.cn[data-invert="true"] { color: #111; }
.cn[data-invert="true"] .cn-btn:hover, .cn[data-invert="true"] .cn-label:hover, .cn[data-invert="true"] .cn-item:hover { background: rgba(0,0,0,0.08); }
.cn[data-invert="true"] .cn-menu { background: rgba(255,255,255,0.85); border-color: rgba(0,0,0,0.14); }
.cn[data-invert="true"] .cn-item[data-current="true"] { background: rgba(0,0,0,0.1); }
`;

/** offset days back from today → what the pill says. */
function dayLabel(offset: number, day: Date): string {
  if (offset === 0) return "Today";
  if (offset === 1) return "Yesterday";
  return day.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}

function DayNav({
  scope,
  onScope,
  offset,
  day,
  canBack,
  inverted,
  onStep,
}: {
  scope: SessionScope;
  onScope: (scope: SessionScope) => void;
  offset: number;
  day: Date;
  canBack: boolean;
  inverted: boolean;
  onStep: (delta: number) => void;
}) {
  // null → not mounted; open → staggering in; closing → staggering out,
  // unmounted when the last row's out-animation has run.
  const [menu, setMenu] = useState<null | "open" | "closing">(null);
  const navRef = useRef<HTMLElement>(null);
  const close = () => {
    setMenu((m) => (m === "open" ? "closing" : m));
    setTimeout(() => setMenu((m) => (m === "closing" ? null : m)), 420);
  };
  // A tap anywhere else folds the menu away.
  useEffect(() => {
    if (menu !== "open") return;
    const onDown = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [menu]);

  const label =
    scope === "day" ? dayLabel(offset, day) : scope === "week" ? "This week" : "This month";
  const chevron = (dir: 1 | -1) => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ transform: dir === 1 ? "scaleX(-1)" : undefined }}>
      <path d="M8.8 2.8 4.6 7l4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  return (
    <nav className="cn" data-invert={inverted ? "true" : "false"} aria-label="Sessions scope" ref={navRef}>
      <style>{DAY_NAV_CSS}</style>
      {/* The day arrows only mean something in day scope; week and month
          hold the pill to just the label. */}
      {scope === "day" && (
        <button className="cn-btn" type="button" onClick={() => onStep(1)} disabled={!canBack} aria-label="Previous day">
          {chevron(-1)}
        </button>
      )}
      <button
        className="cn-label"
        type="button"
        aria-expanded={menu === "open"}
        onClick={() => (menu === "open" ? close() : setMenu("open"))}
      >
        {label}
        <svg className="cn-caret" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M2 3.8 5 6.8 8 3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {scope === "day" && (
        <button className="cn-btn" type="button" onClick={() => onStep(-1)} disabled={offset === 0} aria-label="Next day">
          {chevron(1)}
        </button>
      )}
      {menu && (
        <div
          className="cn-menu"
          data-closing={menu === "closing" ? "true" : "false"}
          style={{ "--n": SCOPE_OPTIONS.length } as CSSProperties}
          role="menu"
        >
          {SCOPE_OPTIONS.map((option, i) => (
            <button
              key={option.id}
              className="cn-item"
              type="button"
              role="menuitem"
              data-current={option.id === scope ? "true" : "false"}
              style={{ "--i": i } as CSSProperties}
              onClick={() => {
                onScope(option.id);
                close();
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}

// THE SPLIT. Week and month scope break the single column: the motif's
// stage glides LEFT and the content — the week's sessions, or the month's
// calendar sheet — takes the RIGHT half, so the sky stays a subject
// instead of a backdrop you scrolled away from. Today folds it all back
// to one centred column. Wide screens only; a phone keeps the stack.
const SPLIT_CSS = /* css */ `
@media (min-width: 900px) {
  .cm-stage { transition: transform 700ms cubic-bezier(0.22, 1, 0.36, 1); }
  .ch { transition: transform 700ms cubic-bezier(0.22, 1, 0.36, 1), margin-top 700ms cubic-bezier(0.22, 1, 0.36, 1), width 700ms cubic-bezier(0.22, 1, 0.36, 1); }
  [data-split="week"] .cm-stage, [data-split="month"] .cm-stage { transform: translateX(-23vw); }
  /* The sessions column rides up into the first viewport and right of
     centre; the sticky stage keeps the motif pinned beside it while the
     cards scroll. Kept ABOVE the blur-away zone (top ~18vh). */
  [data-split="week"] .ch { margin-top: -76vh; width: min(44vw, 520px); transform: translateX(calc(45vw - 50%)); }
  [data-split="week"] .cm-stage { opacity: 1; }
  /* The month sheet docks as a right panel instead of the whole page —
     the sky and the shifted motif hold the left. */
  [data-split="month"] .mv { left: auto; width: max(50vw, 620px); border-left: 1px solid rgba(0,0,0,0.06); box-shadow: -30px 0 60px rgba(16,18,28,0.10); }
  [data-split="month"] .cn { left: calc(100vw - max(50vw, 620px) / 2); }
}
@media (prefers-reduced-motion: reduce) {
  .cm-stage, .ch { transition: none; }
}
`;

/** Solar time → a real Date for Atmosphere.updateByDate. The sun's direction
 *  comes from the date, so "1pm at longitude 30°E" must be handed over as
 *  11am UTC — hours minus longitude/15. Fixed to midsummer 2026 because only
 *  time of day is dialled; the season is part of the page's look. */
function sunDate(hours: number, longitude: number): Date {
  return new Date(
    Date.UTC(2026, 0, 1) + (171 * 24 + hours - longitude / 15) * 3_600_000
  );
}

// Everything a sky is, as one flat vector the tween runs over. period
// marks the circular members; epsilon is how far a target must move before
// a new tween starts (Live's clock creeps ~0.017h/min — restarting on
// every creep would turn the tween back into the exponential it replaced).
// seconds is each quantity's OWN duration, three tempos on one clock: the
// LIGHT (hour, exposure, stars) crosses in ~2.5s so the day visibly turns;
// the CAMERA drifts over ~5s — a slow deliberate pan, never a whip; the
// DECK (coverage, density) fades over ~4s, and it only FADES — nothing in
// a preset switch moves a cloud's position (see the frame loop).
const TWEEN_KEYS = {
  hour: { period: 24, epsilon: 0.05, seconds: 2.5 },
  exposure: { epsilon: 0.1, seconds: 2.5 },
  heading: { period: 360, epsilon: 0.5, seconds: 5 },
  pitch: { epsilon: 0.25, seconds: 5 },
  originE: { epsilon: 5, seconds: 5 },
  originN: { epsilon: 5, seconds: 5 },
  stars: { epsilon: 0.05, seconds: 2.5 },
  coverage: { epsilon: 0.003, seconds: 4 },
  density: { epsilon: 0.001, seconds: 4 },
  repeat: { epsilon: 0.5, seconds: 4 },
} as const;
type TweenKey = keyof typeof TWEEN_KEYS;
type SkyVector = Record<TweenKey, number>;

const LONGEST_SECONDS = Math.max(
  ...Object.values(TWEEN_KEYS).map((k) => k.seconds)
);

type Tween = { t: number; from: SkyVector; to: SkyVector; fromRest: boolean };

function evalTween(tw: Tween): SkyVector {
  const out = {} as SkyVector;
  for (const key of Object.keys(TWEEN_KEYS) as TweenKey[]) {
    const { period, seconds } = TWEEN_KEYS[key] as {
      period?: number;
      seconds: number;
    };
    const eased = ease(Math.min(1, tw.t / seconds), tw.fromRest);
    const delta = period
      ? wrapDelta(tw.from[key], tw.to[key], period)
      : tw.to[key] - tw.from[key];
    const value = tw.from[key] + delta * eased;
    out[key] = period ? (value + period) % period : value;
  }
  return out;
}

function Scene({ dials }: { dials: CloudDials }) {
  const camera = useThree(({ camera }) => camera);
  const atmosphereRef = useRef<AtmosphereApi>(null);
  const starsRef = useRef<StarsImpl>(null);
  const [clouds, setClouds] = useState<CloudsEffect | null>(null);
  const wash = useMemo(() => new HorizonWashEffect(), []);
  const washPalette = useMemo<SkyPalette>(
    () => ({ top: new Color(), mid: new Color(), bot: new Color(), tint: new Color() }),
    []
  );
  // Snap instead of glide for anyone who asked the OS for less motion.
  const reducedMotion = useMemo(
    () =>
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  // The Blissful easter egg's other half: the weather texture starts at a
  // random offset each mount, so which clouds you get — and where they sit
  // in the frame — is unique to the visit, not a fixed postcard.
  useEffect(() => {
    clouds?.localWeatherOffset.set(Math.random(), Math.random());
  }, [clouds]);

  // The one tween the frame loop owns. null until the first frame seeds it
  // at its own target (t past both durations), so a page opened on
  // ?sky=Dusk starts AT dusk instead of easing in from midday.
  const tween = useRef<Tween | null>(null);

  // Latest dials for the frame loop without re-binding the callback.
  const dialsRef = useRef(dials);
  dialsRef.current = dials;

  useFrame(({ gl }, delta) => {
    const d = dialsRef.current;
    const sky: SkyStop = d.sky === "Live" ? liveSky() : SKY_PRESETS[d.sky];

    // Targets: the preset's mood rides ON the user's sliders, so the same
    // hand-set character reads calm at midday and stormy at dusk. Moods only
    // touch coverage and density — quantities that fade a cloud IN PLACE.
    // repeat (cloud size/position on the weather map) is the user's slider
    // alone: a preset switch changes the time of day over the clouds that
    // are there, it does not rearrange the sky.
    const target: SkyVector = {
      hour: sky.hour,
      exposure: sky.exposure,
      heading: d.view.heading,
      pitch: d.view.pitch,
      originE: d.view.origin.x,
      originN: d.view.origin.y,
      coverage: Math.min(1, d.fullness * 0.5 * sky.mood.fullness),
      density: Math.min(0.3, d.intensity * 0.15 * sky.mood.intensity),
      repeat: 60 + (1 - Math.min(1, d.size)) * 140,
      stars: sky.stars,
    };

    // Retarget only when something meaningfully moved (see TWEEN_KEYS —
    // restarting on Live's clock-creep would put the hard start back). A
    // new tween departs from wherever the old one currently IS, so a switch
    // mid-switch bends the path instead of jumping.
    const previous =
      tween.current == null || reducedMotion
        ? (tween.current = {
            t: LONGEST_SECONDS + 1,
            from: { ...target },
            to: { ...target },
            fromRest: true,
          })
        : tween.current;
    const moved = (Object.keys(TWEEN_KEYS) as TweenKey[]).some((key) => {
      const { period, epsilon } = TWEEN_KEYS[key] as {
        period?: number;
        epsilon: number;
      };
      const delta = period
        ? wrapDelta(previous.to[key], target[key], period)
        : target[key] - previous.to[key];
      return Math.abs(delta) > epsilon;
    });
    const tw =
      moved && !reducedMotion
        ? (tween.current = {
            t: 0,
            from: evalTween(previous),
            to: { ...target },
            fromRest: previous.t >= LONGEST_SECONDS,
          })
        : previous;
    tw.t += delta;
    const a = evalTween(tw);

    // Light and exposure.
    gl.toneMappingExposure = a.exposure;
    atmosphereRef.current?.updateByDate(sunDate(a.hour, d.view.longitude));
    if (starsRef.current) starsRef.current.material.intensity = a.stars;

    // The horizon wash follows the SMOOTHED hour, so during a preset switch
    // the bottom band crossfades in step with the light instead of snapping.
    paletteForHour(a.hour, washPalette);
    wash.washColor.copy(washPalette.bot).convertSRGBToLinear();

    // Clouds — written straight onto the effect. NO added motion on a
    // preset switch: the weather map never scrolls faster than the dialled
    // wind and never rescales from a mood, so the clouds that were in the
    // sky stay exactly where they are while the light and their density
    // change around them — a new time of day over the SAME sky.
    if (clouds) {
      clouds.coverage = a.coverage;
      clouds.localWeatherVelocity.set(d.speed * 1e-5, 0);
      clouds.localWeatherRepeat.setScalar(a.repeat);
      const layer = clouds.cloudLayers[0];
      if (layer) layer.densityScale = a.density;
    }

    // Camera: the dialled geodetic stance, aimed by the SMOOTHED heading and
    // pitch — so a preset switch pans, it doesn't teleport.
    const position = new Geodetic(
      radians(d.view.longitude),
      radians(d.view.latitude),
      d.view.height
    ).toECEF(new Vector3());
    const east = new Vector3();
    const north = new Vector3();
    const up = new Vector3();
    Ellipsoid.WGS84.getEastNorthUpVectors(position, east, north, up);
    // The origin pad walks the stance across the ground plane — metres east
    // and north in the local frame, smoothed like the rest of the camera so
    // dragging the pad glides under the deck instead of teleporting.
    position.addScaledVector(east, a.originE).addScaledVector(north, a.originN);
    const h = radians(a.heading);
    const p = radians(a.pitch);
    const direction = new Vector3()
      .addScaledVector(east, Math.sin(h) * Math.cos(p))
      .addScaledVector(north, Math.cos(h) * Math.cos(p))
      .addScaledVector(up, Math.sin(p));
    camera.up.copy(up);
    camera.position.copy(position);
    camera.lookAt(position.addScaledVector(direction, 1e4));
  });

  return (
    <Atmosphere ref={atmosphereRef} correctAltitude>
      {/* Real stars (the package's HYG-derived catalogue), lifted per preset
          — night pushes them hard, day leaves them below the tone-mapper's
          floor. Suspense is load-bearing: Stars suspends while the catalogue
          streams from GitHub, and without a boundary it would take the WHOLE
          canvas down with it — black sky until the .bin arrives. */}
      <Suspense fallback={null}>
        {/* @ts-expect-error takram Stars types assume React 19 ref-as-prop */}
        <Stars ref={starsRef} data={DEFAULT_STARS_DATA_URL} pointSize={1.5} />
      </Suspense>
      <EffectComposer multisampling={0} enableNormalPass>
        <Clouds
          ref={setClouds}
          disableDefaultLayers
          qualityPreset={dials.advanced.quality}
          shadow-maxFar={1e5}
        >
          {/* The one curated layer (see file comment): thin, sparse, eroded.
              weatherExponent (clumping) sharpens the weather signal so low
              fullness means separated clumps, not a uniform veil; full
              shapeDetailAmount keeps the clumps translucent and ragged —
              wisps. coverage/density/repeat are NOT props: the frame loop
              above owns them so they can glide between moods. */}
          <CloudLayer
            channel="r"
            altitude={dials.advanced.altitude}
            height={dials.advanced.thickness}
            shapeAmount={1}
            shapeDetailAmount={1}
            weatherExponent={dials.advanced.clumping}
            shapeAlteringBias={0.35}
            coverageFilterWidth={0.6}
            shadow
          />
        </Clouds>
        {/* ground={false}: the ellipsoid is never drawn, so there is no dark
            sea and no hard horizon line — below the horizon the rays keep
            sampling atmosphere and the sky just continues. */}
        <AerialPerspective sky sunLight skyLight ground={false} />
        <ToneMapping mode={ToneMappingMode.AGX} />
        {/* After tone mapping: paints the palette's horizon colour over the
            bottom band, erasing the below-horizon scattering seam. */}
        <primitive object={wash} />
        <SMAA />
      </EffectComposer>
    </Atmosphere>
  );
}

export default function CloudsScene() {
  // Hooks (useDialKit) cannot live inside <Canvas> — R3F's reconciler only
  // knows three.js objects — so the panel registers out here and the values
  // flow down as plain props. Slider tuples are [default, min, max, step].
  // This is the ONLY panel registered on /clouds: components/dialkit.tsx
  // stands down on this route so the popover holds exactly these dials.
  //
  // ?sky=Dusk seeds the select, so a particular sky is a shareable URL —
  // client-only read (this component is ssr:false) and it only seeds the
  // DEFAULT: the dial stays live on top of it.
  const params = new URLSearchParams(window.location.search);
  const skyParam = params.get("sky");
  const initialSky =
    skyParam && (skyParam === "Live" || skyParam in SKY_PRESETS)
      ? skyParam
      : "Live";
  // Volumetric is parked: the dial offers only Wisps (dialkit selects have
  // no disabled state), and the ?engine= seed is ignored. The scene code
  // stays; restoring the option is one line here.
  const initialEngine = "Wisps";
  // Controller rather than plain useDialKit because presets WRITE a dial:
  // picking a sky swings view.heading to that sky's postcard direction.
  const dial = useDialKitController(
    "Clouds",
    {
      // Two renderers, one sky (see clouds-wisps.tsx): Volumetric is the
      // physical @takram atmosphere; Wisps is the same presets as a single
      // procedural shader painting — far lighter, its own hand-tinted look.
      // Advanced and View belong to Volumetric only; Wisps has no camera.
      engine: {
        type: "select",
        options: ["Wisps"],
        default: initialEngine,
      },
      sky: {
        type: "select",
        options: ["Live", ...Object.keys(SKY_PRESETS)],
        default: initialSky,
      },
      // The motif face floating mid-sky (clouds-motif.tsx) — five baked
      // expressions from the motif+signal_simulation study.
      mood: {
        type: "select",
        options: [...MOTIF_MOODS],
        default: "Content",
      },
      // Invert the page: white sheet everywhere, the sky masked into the
      // motif's shape (clouds-motif.tsx).
      invert: false,
      // The mouth is parked for now — flip this to bring the smile back.
      smile: false,
      experimental: {
        _collapsed: true,
        // Invert ↔ sky as a circle growing from the motif (clouds-motif.tsx)
        // instead of the default crossfade.
        circleReveal: false,
      },
      speed: [2, 0, 10, 0.1],
      fullness: [0.35, 0, 1, 0.01],
      intensity: [0.5, 0, 1, 0.01],
      size: [0.75, 0.1, 1, 0.01],
      advanced: {
        _collapsed: true,
        quality: {
          type: "select",
          options: ["low", "medium", "high", "ultra"],
          default: "high",
        },
        clumping: [2, 1, 8, 0.1],
        altitude: [1400, 200, 8000, 50],
        thickness: [800, 100, 2500, 25],
      },
      view: {
        _collapsed: true,
        longitude: [30, -180, 180, 0.5],
        latitude: [35, -85, 85, 0.5],
        height: [250, 10, 30000, 10],
        // The camera's position origin: an XY pad in metres east/north of
        // the geodetic anchor. Lat/lon steps are ~55 km — this is how you
        // actually walk under the clouds.
        origin: {
          type: "pad",
          x: [0, -4000, 4000, 25],
          y: [0, -4000, 4000, 25],
          labels: { x: "East", y: "North" },
        },
        heading: [35, 0, 360, 1],
        pitch: [22, -5, 85, 0.5],
      },
    } as DialConfig
  );
  const values = dial.values as unknown as CloudDials;
  const setValue = dial.setValue;

  // THE SESSION READ. When a voice (or typed) session ends, the motif hands
  // up what clouds-session.ts made of it; the scene owns it because the
  // read sets the MOOD DIAL — the face morphs to what it heard — and shows
  // where it landed. Every read also joins the history under the sky.
  const [session, setSession] = useState<SessionRead | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());
  const skyRef = useRef(values.sky);
  skyRef.current = values.sky;
  // True while a sky change was made BY a read: the sky effect below must
  // not treat it as the user turning the dial (which would wipe the
  // session heading and re-derive the mood the read just set).
  const skyFromReadRef = useRef(false);
  const onSession = (read: SessionRead | null) => {
    setSession(read);
    if (!read) return;
    setValue("mood", read.mood);
    // The read built its picture: its theme lands on the sky dial too —
    // the one move for typed sessions, a final settle for spoken ones.
    const readSky = read.theme ? THEME_SKY[read.theme] : null;
    if (readSky && readSky !== skyRef.current) {
      skyFromReadRef.current = true;
      setValue("sky", readSky);
    }
    // An empty mic is feedback, not a session: show the read, log nothing.
    if (isEmptyRead(read)) return;
    setHistory((prev) => {
      // The sky the session lands on: the read's own theme if it moved it,
      // else wherever any spoken theme had already taken the dial.
      const next = [...prev, { ...read, at: new Date().toISOString(), sky: readSky ?? skyRef.current }];
      saveHistory(next);
      return next;
    });
  };

  // THE GENERAL PICTURE. Two or more check-ins today and the read under
  // the mood groups them (clouds-session.ts summariseDay) instead of
  // quoting only the latest; one at most, and the single read stands.
  const [picture, setPicture] = useState<DayPicture | null>(null);
  // A refresh starts a NEW session: the picture only groups check-ins made
  // since this page load. The saved history still scrolls below — it just
  // doesn't dress the motif on arrival.
  const visitStart = useRef(new Date().toISOString());
  useEffect(() => {
    const thisVisit = history.filter((h) => h.at >= visitStart.current);
    if (thisVisit.length < 2) {
      setPicture(null);
      return;
    }
    let alive = true;
    summariseDay(thisVisit).then((p) => {
      if (!alive) return;
      setPicture(p);
      // Two messages in, the picture COMMITS: the face morphs to where the
      // day sits and the sky moves to its theme — same guarded path as a
      // session read, so the grouped text isn't retired by its own sky.
      setValue("mood", p.mood);
      const pictureSky = THEME_SKY[p.theme];
      if (pictureSky !== skyRef.current) {
        skyFromReadRef.current = true;
        setValue("sky", pictureSky);
      }
    });
    return () => {
      alive = false;
    };
  }, [history, setValue]);

  // THE DAY IN VIEW. The top nav steps the sessions view back a day at a
  // time; the sky and the motif stay today's. A past day gets its own
  // grouped read (summariseDay again) above its cards, cached per day so
  // walking back and forth doesn't re-ask. The label's dropdown widens the
  // scope instead: This week / This month pull the whole period's sessions
  // and lead with the trends card.
  const [scope, setScope] = useState<SessionScope>("day");
  const [dayOffset, setDayOffset] = useState(0);
  const viewedDay = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - dayOffset);
    return d;
  }, [dayOffset]);
  const dayItems = useMemo(
    () => history.filter((h) => new Date(h.at).toDateString() === viewedDay.toDateString()),
    [history, viewedDay]
  );
  // Back is live while anything older than the viewed day exists.
  const canBack = useMemo(() => {
    const dayStart = new Date(viewedDay);
    dayStart.setHours(0, 0, 0, 0);
    return history.some((h) => new Date(h.at) < dayStart);
  }, [history, viewedDay]);
  const [dayReads, setDayReads] = useState<Record<string, DayPicture>>({});
  const askedDays = useRef(new Set<string>());
  useEffect(() => {
    if (dayOffset === 0 || dayItems.length === 0) return;
    const key = viewedDay.toDateString();
    if (askedDays.current.has(key)) return;
    askedDays.current.add(key);
    summariseDay(dayItems).then((p) => setDayReads((prev) => ({ ...prev, [key]: p })));
  }, [dayOffset, dayItems, viewedDay]);
  const dayRead = dayOffset > 0 ? dayReads[viewedDay.toDateString()] ?? null : null;
  // Week and month scope: every session since Monday / since the 1st.
  const periodItems = useMemo(() => {
    if (scope === "day") return null;
    const start = new Date();
    if (scope === "week") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    else start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return history.filter((h) => new Date(h.at) >= start);
  }, [scope, history]);
  const shownItems = periodItems ?? dayItems;
  // Stepping into a past day (or the week) brings the sessions into view —
  // the summary and the trends live down there, and a click that changes
  // nothing on screen reads as a dead button. Month is its own page
  // (clouds-month.tsx), no scroll needed.
  useEffect(() => {
    if (scope === "month" || (dayOffset === 0 && scope === "day")) return;
    // Split week (wide screens): the column is already up beside the motif
    // — scrolling into it would race the layout transition and carry the
    // top off-screen. Home the scroll instead.
    if (scope === "week" && window.innerWidth >= 900) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const id = requestAnimationFrame(() => {
      document.querySelector(".ch")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id);
  }, [dayOffset, scope]);

  // Scrolling into the history fades the motif — shape, greeting, read —
  // while the sky (a fixed canvas) stays exactly where it is. One CSS var,
  // written on scroll, read by .cm-stage.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onScroll = () => {
      const fade = Math.max(0, 1 - window.scrollY / (window.innerHeight * 0.45));
      rootRef.current?.style.setProperty("--cm-fade", fade.toFixed(3));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Selecting a sky swings the heading dial to that sky's postcard
  // direction (Live: the nearer stop's), and DERIVES the motif's mood from
  // that hour's signals (clouds-signals.ts — the signal simulation's own
  // rules). setValue, not derived values, so both dials show where they
  // landed and stay adjustable from there — the frame loop then PANS to
  // the heading, and the face morphs to the mood.
  useEffect(() => {
    const heading =
      values.sky === "Live" ? liveSky().heading : SKY_PRESETS[values.sky].heading;
    setValue("view.heading", heading);
    // A sky the READ chose keeps the read's mood and heading; only a hand
    // on the dial re-derives the mood and retires the session.
    if (skyFromReadRef.current) {
      skyFromReadRef.current = false;
      return;
    }
    setValue("mood", moodForSky(values.sky));
    // A new sky is a new read: the last session's heading steps aside.
    setSession(null);
  }, [values.sky, setValue]);

  // Arriving (or refreshing) is a NEW session: the motif greets from the
  // clock's own sky and mood — yesterday's (or a minute ago's) reads stay
  // in the history below without dressing the face.

  // While the voice session is live (listening or thinking) the history
  // list unmounts — reported up by the motif, which owns the mic.
  const [voiceLive, setVoiceLive] = useState(false);

  // "d" hides the whole DialKit dock (the floating circle included) for a
  // clean frame. display:none rather than unmount, so the panel keeps its
  // state. Keys typed into DialKit's own inputs don't count.
  // Hidden by default: /clouds opens as a clean frame; "d" brings the
  // dials out when you want to tune it.
  const [dialsVisible, setDialsVisible] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "d" && e.key !== "D") || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      setDialsVisible((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // SPACE walks the simulated moods: each press steps the sky dial to the
  // next preset, and everything downstream swaps with it — the scene
  // transition, the signal-derived mood and face, the heading pan, the
  // read under the label (the sky effect above also retires any session).
  // Not while typing, not while a voice session owns the page.
  useEffect(() => {
    const onSpace = (e: KeyboardEvent) => {
      if (e.key !== " " || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "BUTTON" || t.isContentEditable)) return;
      if (voiceLive) return;
      e.preventDefault(); // space would scroll the history into view
      const keys = Object.keys(SKY_PRESETS) as (keyof typeof SKY_PRESETS)[];
      const i = keys.indexOf(skyRef.current as keyof typeof SKY_PRESETS);
      setValue("sky", keys[(i + 1) % keys.length]);
    };
    window.addEventListener("keydown", onSpace);
    return () => window.removeEventListener("keydown", onSpace);
  }, [voiceLive, setValue]);

  return (
    <div
      ref={rootRef}
      className="relative min-h-[100dvh] w-full bg-black"
      data-split={voiceLive || scope === "day" ? "none" : scope}
    >
      <style>{SPLIT_CSS}</style>
      {/* The sky is FIXED: the page scrolls (motif, then the session
          history) and the canvas never moves under it. */}
      <div className="fixed inset-0">
      {/* Keyed swap, not co-mounting: the engines are separate WebGL
          contexts, and only the dialled one should own a context at all —
          that lightness is the wisps engine's whole reason to exist. */}
      {values.engine === "Wisps" ? (
        <WispsCanvas dials={values} />
      ) : (
        /* depth:false and multisampling 0 as upstream: the composer owns
           depth via its normal pass, and MSAA is wasted under temporal
           upscaling. fov 55 over R3F's default 75: a longer lens makes the
           wisps read as subjects instead of specks, and keeps the pale
           horizon band out of most of the frame so the blue stays
           saturated. */
        <Canvas gl={{ depth: false }} camera={{ near: 1, far: 4e5, fov: 55 }}>
          <Scene dials={values} />
        </Canvas>
      )}
      </div>
      <CloudsMotif
        mood={values.mood}
        summary={readForSky(values.sky).summary}
        sky={values.sky}
        invert={values.invert}
        smile={values.smile}
        // Spoken emotion themes steer the sky dial itself, so the scene
        // transition, the mood select and the summary all follow.
        onTheme={(sky) => setValue("sky", sky)}
        circleReveal={values.experimental?.circleReveal ?? false}
        session={session}
        picture={picture}
        onSession={onSession}
        neutral={history.length === 0 && !session}
        onLive={setVoiceLive}
      />
      {/* The day nav and history step aside while a voice session is live —
          the white page belongs to the tracker and its stream. */}
      {!voiceLive && (history.length > 0 || dayOffset > 0 || scope !== "day") && (
        <DayNav
          scope={scope}
          onScope={(next) => {
            setScope(next);
            if (next === "day") setDayOffset(0);
          }}
          offset={dayOffset}
          day={viewedDay}
          canBack={canBack}
          // The month page is a white sheet — the pill reads dark on it.
          inverted={values.invert || scope === "month"}
          onStep={(delta) => setDayOffset((o) => Math.max(0, o + delta))}
        />
      )}
      {/* Month scope is a page of its own: the calendar of shapes masks in
          over everything (clouds-month.tsx); tapping a day masks out to
          that day's sessions. Day and week keep the scrolling list. */}
      {!voiceLive && scope === "month" && (
        <MonthCalendar
          history={history}
          onDay={(offset) => {
            setScope("day");
            setDayOffset(offset);
          }}
        />
      )}
      {!voiceLive && scope !== "month" && (
        <SessionHistory
          items={shownItems}
          inverted={values.invert}
          title={
            scope === "week"
              ? "This week"
              : dayOffset === 0
                ? "Sessions"
                : dayLabel(dayOffset, viewedDay)
          }
          lead={scope === "day" && dayRead ? dayRead.text : null}
          extra={scope === "week" ? <TrendsCard scope={scope} /> : null}
          emptyNote={
            scope === "week"
              ? "Nothing logged yet this week."
              : dayOffset > 0
                ? "Nothing logged this day."
                : null
          }
          onDelete={(at) =>
            setHistory((prev) => {
              const next = prev.filter((item) => item.at !== at);
              saveHistory(next);
              return next;
            })
          }
        />
      )}
      {/* Mounted only when summoned: DialRoot portals to document.body, so
          a display:none wrapper can't hide it — unmount is the real hide.
          Dial values live in the controller store, so nothing is lost.
          defaultOpen={false}: it arrives as the closed circle; the panel
          opens only when clicked. */}
      {dialsVisible && (
        <DialRoot position="top-right" theme="dark" productionEnabled defaultOpen={false} />
      )}
    </div>
  );
}
