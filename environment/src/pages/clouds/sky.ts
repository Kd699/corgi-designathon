// The sky vocabulary shared by BOTH /clouds engines — the volumetric scene
// (clouds-scene.tsx, @takram atmosphere + ray-marched clouds) and the wisps
// scene (clouds-wisps.tsx, one procedural fullscreen shader). Presets, the
// Live clock interpolation, and the easing/wrapping helpers live here so
// the two renderers stay two STYLES of the same sky rather than two skies.

import { Color } from "three";
import type { CloudsQualityPreset } from "@takram/three-clouds";

// Each stop: solar hour, exposure, postcard heading, star brightness, and a
// cloud mood that multiplies the user's Fullness/Intensity sliders. Moods
// deliberately have NO size axis: fullness and density fade a cloud in
// place, but size would rescale the cloud field and physically rearrange
// the sky on every preset switch — a switch changes the time of day over
// the clouds that are there, it does not move them.
// Hours assume the default view (lat 35, day 172): the sun rises near solar
// 4.8 and sets near 19.2, so Sunrise/Sunset sit just past those edges where
// the colour actually happens, and Dusk is civil twilight — sun down, sky
// still burning. Moods: sunrise and sunset arrive with fuller decks to
// catch the colour (the Blissful reference frames), morning is thin airy
// wisps on light blue, dusk broods — fuller and denser, the storm end of
// the range — and night strips the sky back so the stars own it.
export const SKY_PRESETS = {
  "Pre-dawn": { hour: 4.3, exposure: 40, heading: 55, stars: 3, mood: { fullness: 1.3, intensity: 0.9 } },
  Sunrise: { hour: 5.4, exposure: 14, heading: 60, stars: 0, mood: { fullness: 1.7, intensity: 0.9 } },
  Morning: { hour: 9, exposure: 8, heading: 35, stars: 0, mood: { fullness: 0.9, intensity: 0.85 } },
  Midday: { hour: 13, exposure: 6.5, heading: 35, stars: 0, mood: { fullness: 1, intensity: 1 } },
  Afternoon: { hour: 16.5, exposure: 8, heading: 25, stars: 0, mood: { fullness: 1.25, intensity: 1.1 } },
  Sunset: { hour: 19.0, exposure: 16, heading: 295, stars: 0, mood: { fullness: 1.6, intensity: 1.1 } },
  Dusk: { hour: 19.6, exposure: 55, heading: 295, stars: 1.5, mood: { fullness: 1.35, intensity: 1.5 } },
  Night: { hour: 0.5, exposure: 90, heading: 0, stars: 6, mood: { fullness: 0.55, intensity: 0.7 } },
} as const;
export type SkyPresetName = keyof typeof SKY_PRESETS;
export type SkyStop = {
  hour: number;
  exposure: number;
  heading: number;
  stars: number;
  mood: { fullness: number; intensity: number };
};

/** "Live": the visitor's clock is the solar hour, and everything else
 *  interpolates between the two presets that bracket it (wrapping midnight),
 *  so 3pm looks like a slightly-late Midday and 9pm sits between Dusk and
 *  Night. The heading is the nearer stop's — a direction can't be averaged
 *  usefully. */
export function liveSky(): SkyStop {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const stops = Object.values(SKY_PRESETS)
    .slice()
    .sort((a, b) => a.hour - b.hour);
  let before = stops[stops.length - 1];
  let after = stops[0];
  for (const stop of stops) {
    if (stop.hour <= hour) before = stop;
    if (stop.hour > hour) {
      after = stop;
      break;
    }
  }
  const span = (after.hour - before.hour + 24) % 24 || 24;
  const t = ((hour - before.hour + 24) % 24) / span;
  const mix = (a: number, b: number) => a + (b - a) * t;
  return {
    hour,
    exposure: mix(before.exposure, after.exposure),
    heading: t < 0.5 ? before.heading : after.heading,
    stars: mix(before.stars, after.stars),
    mood: {
      fullness: mix(before.mood.fullness, after.mood.fullness),
      intensity: mix(before.mood.intensity, after.mood.intensity),
    },
  };
}

/** Shortest signed distance a→b on a circle of the given period — how hour
 *  (24) and heading (360) interpolate, so midday→night rolls forward
 *  through dusk instead of rewinding the afternoon. */
export function wrapDelta(a: number, b: number, period: number): number {
  return ((b - a + period / 2 + period * 2) % period) - period / 2;
}

/** Two easings for two situations. A switch FROM REST gets ease-in-out
 *  cubic — still at both ends, breathing through the middle, the calm a
 *  damped lerp's hard start could not give. A tween that INTERRUPTS one
 *  still in flight (a dial being dragged retargets every frame) gets
 *  ease-out — nonzero slope at t=0, so the scene answers the hand
 *  immediately instead of freezing at the start of a curve it keeps being
 *  reset to, and still lands softly. */
export function ease(t: number, fromRest: boolean): number {
  if (fromRest) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  return 1 - Math.pow(1 - t, 3);
}

/** Hex → Color with NO working-space conversion: these palettes are
 *  display-referred paint. The wisps shader writes gl_FragColor raw, so it
 *  wants exactly these numbers; anything living in a linear pipeline (the
 *  volumetric horizon wash) must convertSRGBToLinear() a COPY first. */
function raw(hex: string): Color {
  return new Color().setStyle(hex, "srgb-linear");
}

// Colour recipes keyed by SOLAR HOUR (each preset's hour), blended around
// the clock: zenith, mid-sky, horizon, cloud tint. Tuned against the
// Blissful reference frames: pre-dawn an almost uniform dusty indigo,
// sunrise cream-to-peach under a periwinkle top, midday a LIGHT airy blue
// (not saturated), night a rich navy — never near-black — with clouds only
// a shade lighter than the sky.
export const SKY_PALETTES = (
  [
    { hour: 0.5, top: "#16233f", mid: "#1e2d4d", bot: "#2c3c60", tint: "#4d5c82" }, // night
    { hour: 4.3, top: "#3d4468", mid: "#5b5787", bot: "#b07f97", tint: "#a08bb0" }, // pre-dawn — pink glow low on indigo
    { hour: 5.4, top: "#93a5cd", mid: "#eed3b7", bot: "#f5bb86", tint: "#fff1de" }, // sunrise
    { hour: 9, top: "#8abbec", mid: "#bcd9f5", bot: "#e8f3fc", tint: "#ffffff" }, // morning
    { hour: 13, top: "#6fb4ec", mid: "#a9d3f5", bot: "#ddeffb", tint: "#ffffff" }, // midday
    { hour: 16.5, top: "#7cb2e2", mid: "#b9d4ec", bot: "#f0e6cf", tint: "#fff6e8" }, // afternoon
    { hour: 19.0, top: "#5a6ca6", mid: "#d9a3ab", bot: "#f7b06e", tint: "#ffddb8" }, // sunset
    { hour: 19.6, top: "#2e2d59", mid: "#6f4f7e", bot: "#d97a50", tint: "#d3a8ba" }, // dusk
  ] as const
)
  .map((stop) => ({
    hour: stop.hour,
    top: raw(stop.top),
    mid: raw(stop.mid),
    bot: raw(stop.bot),
    tint: raw(stop.tint),
  }))
  .sort((a, b) => a.hour - b.hour);

export type SkyPalette = { top: Color; mid: Color; bot: Color; tint: Color };

/** Blend the two palettes bracketing this solar hour (wrapping midnight).
 *  smoothstep on the fraction keeps each stop's character holding for a
 *  while instead of the whole day being one long crossfade. */
export function paletteForHour(hour: number, out: SkyPalette) {
  let before = SKY_PALETTES[SKY_PALETTES.length - 1];
  let after = SKY_PALETTES[0];
  for (const stop of SKY_PALETTES) {
    if (stop.hour <= hour) before = stop;
    if (stop.hour > hour) {
      after = stop;
      break;
    }
  }
  const span = (after.hour - before.hour + 24) % 24 || 24;
  const t = ((hour - before.hour + 24) % 24) / span;
  const s = t * t * (3 - 2 * t);
  out.top.copy(before.top).lerp(after.top, s);
  out.mid.copy(before.mid).lerp(after.mid, s);
  out.bot.copy(before.bot).lerp(after.bot, s);
  out.tint.copy(before.tint).lerp(after.tint, s);
}

// The panel's shape, shared so either engine can be handed the same dials.
export interface CloudDials {
  engine: "Volumetric" | "Wisps";
  sky: "Live" | SkyPresetName;
  /** The motif face's expression (clouds-motif.tsx). */
  mood: "Content" | "Excited" | "Tense" | "Weary" | "Asleep";
  /** Inverted motif: negative-sky body, white face (clouds-motif.tsx). */
  invert: boolean;
  speed: number;
  fullness: number;
  intensity: number;
  size: number;
  advanced: {
    quality: CloudsQualityPreset;
    clumping: number;
    altitude: number;
    thickness: number;
  };
  view: {
    longitude: number;
    latitude: number;
    height: number;
    /** Metres east (x) / north (y) of the geodetic anchor — the camera's
     *  position origin, walkable at cloud scale where the lat/lon dials
     *  step in ~55 km increments. */
    origin: { x: number; y: number };
    heading: number;
    pitch: number;
  };
}
