// /widgets — the voice session's WHOOP cards on their own page. Same
// components the /clouds voice flow pulls out (clouds-widgets.tsx), laid
// flat on the current sky's palette so the glass reads the same.

import { WidgetGallery } from "../clouds/clouds-widgets";
import { cssPaletteFor } from "../clouds/sky";

export default function WidgetsPage() {
  // The live clock picks the palette, exactly like the sky's Live preset.
  const palette = cssPaletteFor("Live");
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        padding: "48px 20px",
        background: `linear-gradient(180deg, ${palette.top}, ${palette.mid} 55%, ${palette.bot})`,
      }}
    >
      <h1
        style={{
          margin: 0,
          fontFamily: "'PP Editorial Old', ui-serif, Georgia, serif",
          fontWeight: 400,
          fontSize: "min(7vmin, 44px)",
          lineHeight: 1,
          color: palette.light ? "#1e2a3a" : "#fff",
        }}
      >
        Widgets
      </h1>
      <WidgetGallery />
      <p
        style={{
          margin: 0,
          maxWidth: 480,
          textAlign: "center",
          fontFamily: "'Work Sans', ui-sans-serif, system-ui, sans-serif",
          fontSize: 13,
          lineHeight: 1.7,
          color: palette.light ? "rgba(30,42,58,0.7)" : "rgba(255,255,255,0.75)",
        }}
      >
        The cards the voice session pulls out on /clouds: say sleep, recovery
        or strain while the motif is listening and these arrive one by one.
      </p>
    </div>
  );
}
