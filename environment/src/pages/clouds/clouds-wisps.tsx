"use client";

// The WISPS engine for /clouds: the same sky presets rendered as a painting
// instead of a simulation. Where the volumetric engine ray-marches a real
// atmosphere (heavy, physical, per-pixel), this is ONE fullscreen fragment
// shader — a hand-tinted gradient, procedural value-noise FBM sculpting a
// few soft wisps, hash-sprinkled stars — after the Codrops procedural-cloud
// sprite technique (tympanus.net/codrops/2020/01/28/how-to-create-
// procedural-clouds-using-three-js-sprites/), collapsed from N sprites to
// one quad: with a fixed postcard camera the sprites would all face it
// anyway, so each "sprite" becomes a wrapped, masked FBM domain in the same
// pass. No @takram packages, no EffectComposer, no textures to stream — a
// single draw call that an integrated GPU idles through.
//
// It shares EVERYTHING conceptual with the volumetric engine (app/clouds/
// sky.ts): the same presets, the same Live-clock interpolation, the same
// two-easing tween (ease-in-out from rest, ease-out when interrupted), the
// same mood-times-slider grammar. Only the paint differs: each preset hour
// maps to a palette (top/mid/horizon plus a cloud tint) and palettes blend
// by solar hour, so Live drifts through sunrise peach and dusk ember on the
// visitor's own clock, exactly like the physical sky next door.

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Color, type ShaderMaterial } from "three";
import {
  SKY_PRESETS,
  ease,
  liveSky,
  paletteForHour,
  wrapDelta,
  type CloudDials,
  type SkyStop,
} from "./sky";

// The palettes live in ./sky.ts (SKY_PALETTES) so BOTH engines paint from
// the same recipes — the wisps sky is made of them entirely, and the
// volumetric engine borrows the horizon colour for its wash. They are
// display-referred sRGB: this shader writes gl_FragColor raw (no
// colorspace_fragment chunk), so the numbers land on screen exactly as
// authored.

// The wisps' own tween vector — same machinery as the volumetric engine's,
// smaller vocabulary: no camera, no exposure (palettes carry the light).
// Epsilons stop Live's clock-creep restarting the tween every frame.
const KEYS = {
  hour: { period: 24, epsilon: 0.05, seconds: 2 },
  stars: { epsilon: 0.05, seconds: 2 },
  fullness: { epsilon: 0.01, seconds: 3.5 },
  intensity: { epsilon: 0.01, seconds: 3.5 },
  size: { epsilon: 0.005, seconds: 3.5 },
} as const;
type Key = keyof typeof KEYS;
type Vec = Record<Key, number>;
type Tween = { t: number; from: Vec; to: Vec; fromRest: boolean };
const LONGEST = Math.max(...Object.values(KEYS).map((k) => k.seconds));

function evalTween(tw: Tween): Vec {
  const out = {} as Vec;
  for (const key of Object.keys(KEYS) as Key[]) {
    const { period, seconds } = KEYS[key] as {
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

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// One pass paints everything. Wisps: each is an FBM domain under a
// flattened-ellipse mask, wrapped horizontally so it drifts off one edge
// and returns on the other; the mask erodes the noise toward the rim so
// edges tear into vapour instead of ending (the Codrops trick, minus the
// textures — hash noise stands in for both of its source images). Fullness
// reveals wisps one by one — "a few only, distanced apart" at the dial's
// resting point. Intensity is body: opacity plus the shaded underside.
const FRAGMENT = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform float uAspect;
uniform float uSeed;
uniform float uStars;
uniform float uFullness;
uniform float uIntensity;
uniform float uSize;
uniform float uSpeed;
uniform float uMorph;
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uBot;
uniform vec3 uTint;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = r * p * 2.02;
    a *= 0.5;
  }
  return v;
}

// One wisp: alpha of a wrapped, eroded FBM patch. The classic cloud field
// — NOISE MINUS DISTANCE — rather than noise times a mask: subtracting d
// keeps the heart solid while the noise variance (±0.3) decides exactly
// where the boundary tears, so the body is cloud and the edges are vapour
// pulled off it. Fullness rides the bias: fuller skies grow each wisp
// outward, not just more opaque. (Tuned numerically in an ASCII harness —
// the first mask-multiplied version was invisible at real dial values.)
float wisp(vec2 p, vec2 anchor, float scale, float stretch, float seed, float drift) {
  float span = uAspect + 1.4;
  vec2 q = p - anchor;
  q.x = mod(q.x - drift + span * 0.5, span) - span * 0.5;
  q /= max(scale, 1e-3);
  float d = length(q * vec2(1.0, stretch));
  if (d > 1.6) return 0.0;
  // uMorph advances only while a sky switch is tweening, so the wisps'
  // internal shapes re-form a little as the light changes, then hold.
  vec2 flow = vec2(uTime * 0.010 + uMorph * 0.35, -uTime * 0.006 - uMorph * 0.2);
  float n = fbm(q * vec2(1.3, 2.4) + seed + flow);
  n += 0.5 * fbm(q * vec2(3.0, 5.2) + vec2(-seed, seed * 0.7) + flow * 1.7);
  n *= 0.66;
  float bias = mix(-0.06, 0.24, clamp(uFullness / 1.3, 0.0, 1.0));
  return smoothstep(0.0, 0.3, n * 1.1 - d * 0.62 + bias);
}

void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);

  // The painted sky: three stops, plus a whisper of large-scale noise so
  // the gradient has air in it instead of being a print.
  vec3 sky = mix(uBot, uMid, smoothstep(0.02, 0.5, vUv.y));
  sky = mix(sky, uTop, smoothstep(0.45, 1.0, vUv.y));
  sky += (fbm(p * 2.0 + uSeed) - 0.5) * 0.02;

  // Stars: a tiny square per occupied cell, jittered so the lattice
  // doesn't read. Filling the whole cell made 6px tiles; this is ~2px.
  vec2 starCell = floor(p * 190.0);
  vec2 starUv = fract(p * 190.0);
  float sh = hash12(starCell + floor(uSeed));
  vec2 starAt = 0.16 + 0.68 * vec2(
    hash12(starCell + 17.0 + floor(uSeed)),
    hash12(starCell + 41.0 + floor(uSeed))
  );
  vec2 starDelta = abs(starUv - starAt);
  float star = smoothstep(0.998, 1.0, sh)
    * step(starDelta.x, 0.16)
    * step(starDelta.y, 0.16);
  float twinkle = 0.7 + 0.3 * sin(uTime * (0.8 + sh * 2.0) + sh * 43.0);
  sky += vec3(1.0, 0.98, 0.92)
    * star * twinkle
    * min(uStars * 0.22, 1.0)
    * smoothstep(0.25, 0.75, vUv.y);

  // Wisps — a few only, distanced apart. Fullness fades extras in one at a
  // time; each drifts at its own rate so the sky never moves as one sheet.
  // The tint carries most of the cloud colour (0.8): day tints are white so
  // nothing changes, but night's navy tint keeps the clouds only a shade
  // lighter than the sky — the reference frames' barely-there night decks.
  vec3 lit = mix(vec3(0.99), uTint, 0.8);
  vec3 shade = mix(lit, uMid, 0.4);
  // uMorph also nudges the drift, so a switch slides each wisp a touch —
  // per-wisp rates below keep them from moving as one sheet.
  float drift = uTime * (0.002 + uSpeed * 0.0016) + uMorph * 0.06;
  vec3 col = sky;

  vec2 anchors[4];
  anchors[0] = vec2(0.24, 0.72);
  anchors[1] = vec2(0.62, 0.50);
  anchors[2] = vec2(0.92, 0.78);
  anchors[3] = vec2(0.44, 0.30);
  float scales[4];
  scales[0] = 0.42; scales[1] = 0.32; scales[2] = 0.26; scales[3] = 0.20;
  float stretches[4];
  stretches[0] = 2.4; stretches[1] = 3.0; stretches[2] = 2.2; stretches[3] = 3.4;

  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float weight = clamp(uFullness * 2.6 - fi * 0.55, 0.0, 1.0);
    if (weight < 0.01) continue;
    vec2 anchor = vec2(anchors[i].x * uAspect, anchors[i].y);
    float a = wisp(
      p, anchor,
      scales[i] * (0.5 + uSize),
      stretches[i],
      uSeed + fi * 17.0,
      drift * (0.7 + fi * 0.35)
    );
    a *= weight * (0.55 + 0.4 * min(uIntensity, 1.0));
    float core = smoothstep(0.5, 1.0, a);
    col = mix(col, mix(lit, shade, core * 0.6 * min(uIntensity, 1.2)), a);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

function WispsQuad({ dials }: { dials: CloudDials }) {
  const materialRef = useRef<ShaderMaterial>(null);
  const size = useThree((s) => s.size);
  const tween = useRef<Tween | null>(null);
  const morph = useRef(0);
  const dialsRef = useRef(dials);
  dialsRef.current = dials;

  const reducedMotion = useMemo(
    () =>
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAspect: { value: 1 },
      // Same easter egg as the volumetric engine's weather offset: the seed
      // decides where the noise lands, so each visit gets its own wisps.
      uSeed: { value: Math.random() * 100 },
      uStars: { value: 0 },
      uFullness: { value: 0 },
      uIntensity: { value: 0 },
      uSize: { value: 0 },
      uSpeed: { value: 0 },
      uMorph: { value: 0 },
      uTop: { value: new Color() },
      uMid: { value: new Color() },
      uBot: { value: new Color() },
      uTint: { value: new Color() },
    }),
    []
  );
  const palette = useMemo(
    () => ({ top: new Color(), mid: new Color(), bot: new Color(), tint: new Color() }),
    []
  );

  useFrame((_, delta) => {
    const material = materialRef.current;
    if (!material) return;
    const d = dialsRef.current;
    const sky: SkyStop = d.sky === "Live" ? liveSky() : SKY_PRESETS[d.sky];

    const target: Vec = {
      hour: sky.hour,
      stars: sky.stars,
      // Moods touch only fullness/intensity — fades in place. size is the
      // user's slider alone: scaling a wisp moves its whole silhouette, and
      // a preset switch must not rearrange the sky (see sky.ts).
      fullness: Math.min(1.7, d.fullness * sky.mood.fullness),
      intensity: Math.min(1.7, d.intensity * sky.mood.intensity),
      size: Math.min(1.3, d.size),
    };

    // Same retarget rules as the volumetric engine: only when a target
    // meaningfully moved; departing from wherever the old tween currently
    // is; gentle ease-in-out from rest, responsive ease-out mid-flight.
    const previous =
      tween.current == null || reducedMotion
        ? (tween.current = {
            t: LONGEST + 1,
            from: { ...target },
            to: { ...target },
            fromRest: true,
          })
        : tween.current;
    const moved = (Object.keys(KEYS) as Key[]).some((key) => {
      const { period, epsilon } = KEYS[key] as {
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
            fromRest: previous.t >= LONGEST,
          })
        : previous;
    tw.t += delta;
    const a = evalTween(tw);

    // A sky switch reshuffles the clouds a LITTLE: while the tween runs,
    // morph accumulates at a rate shaped like sin(π·phase) — zero at both
    // ends, a breath in the middle — sliding each wisp's position and
    // noise domain slightly, then holding still. (A deliberate divergence
    // from upstream's perfectly still switches.) Reduced motion never
    // advances it: the snapped tween sits past LONGEST, where sin is 0.
    const phase = Math.min(1, tw.t / LONGEST);
    morph.current += Math.sin(Math.PI * phase) * delta * 0.5;

    paletteForHour(a.hour, palette);
    // Write into the MATERIAL's uniform map, not the memoised record: R3F
    // clones the uniforms prop into fresh { value } wrappers on mount, so
    // scalar writes to our record never reach the GPU (the shared Color
    // instances made colour updates look like the record was live — the
    // classic half-working trap).
    const u = material.uniforms as unknown as typeof uniforms;
    u.uTime.value += delta;
    u.uAspect.value = size.width / Math.max(1, size.height);
    u.uStars.value = a.stars;
    u.uFullness.value = a.fullness;
    u.uIntensity.value = a.intensity;
    u.uSize.value = a.size;
    u.uSpeed.value = d.speed;
    u.uMorph.value = morph.current;
    (u.uTop.value as Color).copy(palette.top);
    (u.uMid.value as Color).copy(palette.mid);
    (u.uBot.value as Color).copy(palette.bot);
    (u.uTint.value as Color).copy(palette.tint);
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

export default function WispsCanvas({ dials }: { dials: CloudDials }) {
  return (
    <Canvas gl={{ antialias: true, depth: false, stencil: false }} dpr={[1, 2]}>
      <WispsQuad dials={dials} />
    </Canvas>
  );
}
