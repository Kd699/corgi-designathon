// What happens when you stop talking. The transcript the voice session
// collected is turned into one READ — a heading for what happened, a line
// on what you talked about, and the mood the motif should wear for it —
// and the page transitions in place: the circle settles back into the
// mood's blob, the heading flows in over the old label, the read replaces
// the sky's line.
//
// Two ways to get there, same shape either way:
//   openai  — POST /api/openai (vite.config.ts proxies it; OPENAI_API_KEY
//             stays in the dev server, never in the bundle). JSON mode,
//             one small model call, ~1–2s.
//   local   — no key, offline, or the model failed: a keyword read of the
//             same transcript, held for a beat so the "thinking" state is
//             still visible, so the flow is identical with or without a
//             token. The result says which one you are looking at.

import type { MotifMood } from "./clouds-motif";
import type { WidgetKind } from "./clouds-widgets";

export type SessionTheme = "happy" | "anxious" | "sad" | "calm" | null;

export type SessionRead = {
  /** ≤ 6 words: what happened / what you talked about. Replaces the mood label. */
  heading: string;
  /** 1–2 sentences, quoting your own details. Replaces the sky's read line. */
  summary: string;
  /** The expression the motif should settle into for this session. */
  mood: MotifMood;
  theme: SessionTheme;
  source: "openai" | "local";
};

export type SessionContext = {
  sky: string;
  mood: MotifMood;
  widgets: WidgetKind[];
};

const MOODS: MotifMood[] = ["Content", "Excited", "Tense", "Weary", "Asleep"];

const SYSTEM = `You listen to someone talk for a minute about how they are doing and hand back one read.

Return ONLY JSON, no prose around it:
{
  "heading": string,   // at most 6 words. What happened / what they talked about. Plain, specific, no punctuation at the end.
  "summary": string,   // 1-2 sentences on what they said and how it sounded. Quote their own details. Second person ("you"). No advice.
  "mood": "Content" | "Excited" | "Tense" | "Weary" | "Asleep",
  "theme": "happy" | "anxious" | "sad" | "calm" | null
}

Mood rules: high energy + pleasant → Excited; high energy + unpleasant → Tense; low energy + pleasant → Content;
low energy + unpleasant → Weary; exhausted / falling asleep / nothing said → Asleep. If unsure, keep the current mood.
Never moralise. Describe, don't coach.`;

/** Where the two paths meet: one function, one shape back. */
export async function summariseSession(transcript: string, ctx: SessionContext): Promise<SessionRead> {
  const text = transcript.trim();
  const started = performance.now();
  try {
    const read = await viaOpenAI(text, ctx);
    return read;
  } catch (e) {
    // Offline, no key (503), bad JSON — the local read is the product, and
    // it should take as long as a model would have, so the thinking state
    // reads the same either way.
    console.info("[clouds] session read fell back to local:", e instanceof Error ? e.message : e);
    const elapsed = performance.now() - started;
    await new Promise((r) => setTimeout(r, Math.max(0, 900 - elapsed)));
    return localRead(text, ctx);
  }
}

async function viaOpenAI(text: string, ctx: SessionContext): Promise<SessionRead> {
  if (!text) throw new Error("nothing said");
  const res = await fetch("/api/openai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      // Overridable server-side with OPENAI_MODEL; the proxy fills it in
      // when the body leaves it out.
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content:
            `Sky right now: ${ctx.sky}. The face's expression BEFORE they spoke was ${ctx.mood} — context for "if unsure", ` +
            `never something to mention or contrast with. ` +
            `Widgets they pulled up while talking: ${ctx.widgets.join(", ") || "none"}.\n\nThey said:\n${text}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("openai returned no content");
  const parsed = JSON.parse(content) as Partial<SessionRead>;
  const heading = String(parsed.heading ?? "").replace(/[.!]\s*$/, "").trim();
  const summary = String(parsed.summary ?? "").trim();
  if (!heading || !summary) throw new Error("openai read was incomplete");
  const theme = normaliseTheme(parsed.theme);
  return {
    heading: heading.split(/\s+/).slice(0, 7).join(" "),
    summary,
    mood: normaliseMood(parsed.mood, theme, ctx.mood),
    theme,
    source: "openai",
  };
}

function normaliseTheme(raw: unknown): SessionTheme {
  const t = String(raw ?? "").toLowerCase().trim();
  return t === "happy" || t === "anxious" || t === "sad" || t === "calm" ? t : null;
}

/** Case-insensitive against the five moods; a synonym or a stray word
 *  falls back to the theme's mood, then to the mood already on the face. */
function normaliseMood(raw: unknown, theme: SessionTheme, current: MotifMood): MotifMood {
  const m = String(raw ?? "").toLowerCase().trim();
  const exact = MOODS.find((x) => x.toLowerCase() === m);
  if (exact) return exact;
  if (/excit|buzz|energ|happy|joy/.test(m)) return "Excited";
  if (/tense|anx|stress|worr|nerv/.test(m)) return "Tense";
  if (/wear|tired|low|sad|drain|exhaust/.test(m)) return "Weary";
  if (/asleep|sleep/.test(m)) return "Asleep";
  if (/content|calm|fine|ok|settled|good/.test(m)) return "Content";
  const byTheme: Record<Exclude<SessionTheme, null>, MotifMood> = { happy: "Excited", calm: "Content", anxious: "Tense", sad: "Weary" };
  return theme ? byTheme[theme] : current;
}

// The keyword read. Same emotion families the live sky follows
// (clouds-voice.ts THEME_SKIES), plus energy words to split the arousal
// axis, plus the widget topics for the heading.
const THEMES: { theme: Exclude<SessionTheme, null>; rx: RegExp }[] = [
  { theme: "happy", rx: /\b(happy|happiness|glad|joy|joyful|great|amazing|wonderful|excited|exciting|fantastic|love|loved|good|brilliant)\b/i },
  { theme: "anxious", rx: /\b(anxious|anxiety|stress|stressed|nervous|worried|worry|worrying|tense|overwhelmed|panic|panicking|scared|deadline|busy)\b/i },
  { theme: "sad", rx: /\b(sad|sadness|unhappy|depressed|depressing|down|lonely|upset|miserable|crying|cried|grief|rough|hard day|bad day)\b/i },
  { theme: "calm", rx: /\b(calm|calmer|relaxed|relaxing|peaceful|serene|settled|chill|chilled|fine|okay|ok)\b/i },
];
const HIGH_ENERGY = /\b(run|ran|running|gym|workout|training|trained|energetic|buzzing|excited|rushed|hectic|busy|deadline|panic|racing)\b/i;
const LOW_ENERGY = /\b(tired|exhausted|sleepy|drained|slow|lazy|rest|resting|nap|bed|sleep|slept|knackered|wiped)\b/i;
const TOPICS: { kind: WidgetKind; label: string }[] = [
  { kind: "sleep", label: "sleep" },
  { kind: "recovery", label: "recovery" },
  { kind: "activity", label: "training" },
];

export function localRead(text: string, ctx: SessionContext): SessionRead {
  if (!text) {
    return {
      heading: "Nothing came through",
      summary: "The mic was open but no words landed — try again a little closer to it.",
      mood: ctx.mood,
      theme: null,
      source: "local",
    };
  }
  // Latest emotion word wins, as the live sky does.
  let theme: SessionTheme = null;
  let at = -1;
  for (const t of THEMES) {
    const m = new RegExp(t.rx.source, "gi");
    let hit: RegExpExecArray | null;
    let last = -1;
    while ((hit = m.exec(text))) last = hit.index;
    if (last > at) {
      at = last;
      theme = t.theme;
    }
  }
  const high = HIGH_ENERGY.test(text) && !LOW_ENERGY.test(text);
  const low = LOW_ENERGY.test(text) && !HIGH_ENERGY.test(text);
  const pleasant = theme === "happy" || theme === "calm";
  const unpleasant = theme === "anxious" || theme === "sad";
  let mood: MotifMood = ctx.mood;
  if (theme === "anxious") mood = "Tense";
  else if (theme === "sad") mood = low ? "Weary" : "Weary";
  else if (pleasant) mood = high ? "Excited" : "Content";
  else if (low) mood = "Weary";
  else if (high) mood = unpleasant ? "Tense" : "Excited";

  const topics = TOPICS.filter((t) => ctx.widgets.includes(t.kind)).map((t) => t.label);
  const topicLine = topics.length ? topics.join(topics.length === 2 ? " and " : ", ").replace(/, ([^,]*)$/, " and $1") : "";
  const headingByTheme: Record<Exclude<SessionTheme, null>, string> = {
    happy: "A good stretch",
    anxious: "A lot on your mind",
    sad: "A heavy one",
    calm: "Settled, mostly",
  };
  const heading = topicLine
    ? `Talking ${topicLine}`.replace(/^Talking/, theme ? `${headingByTheme[theme].split(",")[0]} —` : "Talking")
    : theme
      ? headingByTheme[theme]
      : "What you said";

  const words = text.split(/\s+/);
  const quote = words.length > 22 ? `${words.slice(0, 22).join(" ")}…` : text;
  const feel = theme
    ? { happy: "it sounded upbeat", anxious: "it sounded wound up", sad: "it sounded low", calm: "it sounded settled" }[theme]
    : "hard to read the tone from the words alone";
  const summary = `You said “${quote}” — ${feel}${topicLine ? `, mostly about ${topicLine}` : ""}.`;

  return { heading: heading.split(/\s+/).slice(0, 7).join(" "), summary, mood, theme, source: "local" };
}
