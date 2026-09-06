// /moods — the reference sheet: every motif mascot with its shape, its
// mood, and the skies that produce it. Each card sits on its first sky's
// palette; the mascot's face is punched through the blob with the same
// mask trick /clouds uses, so the sky looks back through the features.
// Everything is derived — SPECS and blobPath from clouds-motif.tsx,
// sky ↔ mood from moodForSky (clouds-signals.ts) — so this page stays
// true as the character evolves.

import { MOTIF_MOODS, SPECS, blobPath, type MotifMood } from "../clouds/clouds-motif";
import { moodForSky } from "../clouds/clouds-signals";
import { SKY_PRESETS, cssPaletteFor, type SkyPresetName } from "../clouds/sky";

/** Which skies land on this mood (the sky → signals → expression chain). */
function skiesFor(mood: MotifMood): SkyPresetName[] {
  return (Object.keys(SKY_PRESETS) as SkyPresetName[]).filter((sky) => moodForSky(sky) === mood);
}

/** The mascot, static: white blob, face masked through to the card. */
function Mascot({ mood }: { mood: MotifMood }) {
  const f = SPECS[mood];
  const id = `mood-mask-${mood}`;
  return (
    <svg viewBox="0 0 100 100" style={{ width: "min(30vmin, 168px)", height: "min(30vmin, 168px)" }} aria-hidden="true">
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect width="100" height="100" fill="#fff" />
          <g transform="translate(14 14) scale(0.72)">
            <g style={{ opacity: f.browOpacity }} stroke="#000" strokeWidth="4.5" strokeLinecap="round" fill="none">
              <path d="M 30 25 L 42 25" style={{ transform: `rotate(${f.browTilt}deg)`, transformOrigin: "36px 25px" }} />
              <path d="M 58 25 L 70 25" style={{ transform: `rotate(${-f.browTilt}deg)`, transformOrigin: "64px 25px" }} />
            </g>
            <rect x="30.5" y={44 - f.eyeHeight / 2} width="11" height={f.eyeHeight} rx="5.5" fill="#000" style={{ transform: `rotate(${f.eyeTilt}deg)`, transformOrigin: "36px 44px" }} />
            <rect x="58.5" y={44 - f.eyeHeight / 2} width="11" height={f.eyeHeight} rx="5.5" fill="#000" style={{ transform: `rotate(${-f.eyeTilt}deg)`, transformOrigin: "64px 44px" }} />
            <path d={`M 41 63 Q 50 ${63 + f.mouthCurve} 59 63`} stroke="#000" strokeWidth="4.5" strokeLinecap="round" fill="none" />
          </g>
        </mask>
      </defs>
      <path d={blobPath(f.pleasant, f.energy)} fill="#fff" mask={`url(#${id})`} />
    </svg>
  );
}

const serif = "'PP Editorial Old', ui-serif, Georgia, serif";
const sans = "'Work Sans', ui-sans-serif, system-ui, sans-serif";

function MoodCard({ mood }: { mood: MotifMood }) {
  const f = SPECS[mood];
  const skies = skiesFor(mood);
  const palette = cssPaletteFor(skies[0] ?? "Midday");
  const ink = palette.light ? "#1e2a3a" : "#fff";
  const faint = palette.light ? "rgba(30,42,58,0.65)" : "rgba(255,255,255,0.75)";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        padding: "26px 22px 20px",
        borderRadius: 26,
        background: `linear-gradient(180deg, ${palette.top}, ${palette.mid} 55%, ${palette.bot})`,
        boxShadow: "0 18px 44px rgba(10,16,30,0.18)",
      }}
    >
      <Mascot mood={mood} />
      {/* The pure shape, small: the outline is the mood before the face is. */}
      <svg viewBox="0 0 100 100" style={{ width: 34, height: 34, opacity: 0.85 }} aria-hidden="true">
        <path d={blobPath(f.pleasant, f.energy)} fill={ink} />
      </svg>
      <span style={{ fontFamily: serif, fontWeight: 400, fontSize: 30, lineHeight: 1, color: ink }}>{mood}</span>
      <span style={{ fontFamily: sans, fontSize: 11, color: faint, fontVariantNumeric: "tabular-nums" }}>
        pleasant {f.pleasant.toFixed(2)} · energy {f.energy.toFixed(2)}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, maxWidth: 220 }}>
        {(skies.length > 0 ? skies : (["—"] as const)).map((sky) => (
          <span
            key={sky}
            style={{
              fontFamily: sans,
              fontSize: 11,
              lineHeight: 1.6,
              padding: "0.1em 0.75em",
              borderRadius: 999,
              color: ink,
              background: palette.light ? "rgba(30,42,58,0.08)" : "rgba(255,255,255,0.16)",
              border: `1px solid ${palette.light ? "rgba(30,42,58,0.25)" : "rgba(255,255,255,0.35)"}`,
            }}
          >
            {sky}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function MoodsPage() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 30,
        padding: "56px 20px",
        background: "#f4f2ee",
      }}
    >
      <h1 style={{ margin: 0, fontFamily: serif, fontWeight: 400, fontSize: "min(7vmin, 44px)", lineHeight: 1, color: "#1e2a3a" }}>
        Moods
      </h1>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 18,
          width: "100%",
          maxWidth: 1240,
        }}
      >
        {MOTIF_MOODS.map((mood) => (
          <MoodCard key={mood} mood={mood} />
        ))}
      </div>
      <p style={{ margin: 0, maxWidth: 520, textAlign: "center", fontFamily: sans, fontSize: 13, lineHeight: 1.7, color: "rgba(30,42,58,0.65)" }}>
        Each mascot is its mood's shape: rounder and scalloped as pleasant
        rises, notched when tense, low and drooping when weary. The pills are
        the skies whose signals land on that expression on /clouds.
      </p>
    </div>
  );
}
