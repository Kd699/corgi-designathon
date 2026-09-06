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

// THE GENERAL PICTURE. With more than one session logged today, the read
// under the mood stops quoting the latest check-in and groups them: one or
// two sentences on the day's thread — where it started, where it turned,
// where it sits now. Model when the key answers, a local composition when
// it doesn't; either way the same shape back.

/** What the picture needs from a history item (clouds-history.tsx owns the
 *  full type; keeping this structural avoids a circular import). */
export type PictureItem = {
  heading: string;
  summary: string;
  mood: MotifMood;
  theme: SessionTheme;
  at: string;
};

export type DayPicture = {
  text: string;
  count: number;
  /** Where the day sits NOW: the shape the motif morphs into. */
  mood: MotifMood;
  /** The closest emotional family: sets the sky. Always determined. */
  theme: Exclude<SessionTheme, null>;
  source: "openai" | "local";
};

/** Every mood has a nearest emotional family, so the picture can always
 *  name a sky even when no emotion word was ever said. */
const MOOD_THEMES: Record<MotifMood, Exclude<SessionTheme, null>> = {
  Excited: "happy",
  Content: "calm",
  Tense: "anxious",
  Weary: "sad",
  Asleep: "calm",
};

export async function summariseDay(items: PictureItem[]): Promise<DayPicture> {
  const take = items.slice(-6);
  const count = items.length;
  try {
    return { ...(await pictureViaOpenAI(take)), count, source: "openai" };
  } catch (e) {
    console.info("[clouds] day picture fell back to local:", e instanceof Error ? e.message : e);
    return { ...localPicture(take), count, source: "local" };
  }
}

const PICTURE_SYSTEM = `You get the check-ins someone logged today, oldest first — each one already summarised. Hand back the general picture of their day so far.

Return ONLY JSON, no prose around it:
{
  "text": string,   // 1-2 sentences, second person ("you"). The thread of the day: where it started, where it turned if it turned, where it sits now. Quote their own details sparingly. No advice, no moralising, no list.
  "mood": "Content" | "Excited" | "Tense" | "Weary" | "Asleep",  // where the day sits NOW. Commit to one — never hedge.
  "theme": "happy" | "anxious" | "sad" | "calm"  // the closest emotional family right now. Always pick one.
}

Mood rules: high energy + pleasant → Excited; high energy + unpleasant → Tense; low energy + pleasant → Content;
low energy + unpleasant → Weary; exhausted / winding into sleep → Asleep.`;

async function pictureViaOpenAI(items: PictureItem[]): Promise<Pick<DayPicture, "text" | "mood" | "theme">> {
  if (items.length === 0) throw new Error("nothing logged");
  const lines = items
    .map((it) => {
      const time = new Date(it.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      return `${time} — ${it.heading}: ${it.summary} (mood: ${it.mood}${it.theme ? `, theme: ${it.theme}` : ""})`;
    })
    .join("\n");
  const res = await fetch("/api/openai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PICTURE_SYSTEM },
        { role: "user", content: lines },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("openai returned no content");
  const parsed = JSON.parse(content) as { text?: unknown; mood?: unknown; theme?: unknown };
  const text = String(parsed.text ?? "").trim();
  if (!text) throw new Error("openai picture was empty");
  // Never hedge: an off-list mood falls back to the latest check-in's, and
  // the theme to that mood's family — a sky and a shape either way.
  const mood = MOODS.includes(parsed.mood as MotifMood) ? (parsed.mood as MotifMood) : items[items.length - 1].mood;
  const theme = (["happy", "anxious", "sad", "calm"] as const).includes(parsed.theme as never)
    ? (parsed.theme as Exclude<SessionTheme, null>)
    : MOOD_THEMES[mood];
  return { text, mood, theme };
}

const THEME_WORDS: Record<Exclude<SessionTheme, null>, string> = {
  happy: "upbeat",
  anxious: "wound up",
  sad: "low",
  calm: "settled",
};
const COUNT_WORDS = ["", "one", "two", "three", "four", "five", "six"];

export function localPicture(items: PictureItem[]): Pick<DayPicture, "text" | "mood" | "theme"> {
  const n = items.length;
  const count = COUNT_WORDS[n] ?? String(n);
  const latest = items[items.length - 1];
  // Every check-in carries a mood, so the picture always lands somewhere:
  // the theme is the latest spoken one, else the latest mood's family.
  const mood = latest.mood;
  const first = items.find((it) => it.theme)?.theme ?? MOOD_THEMES[items[0].mood];
  const theme = [...items].reverse().find((it) => it.theme)?.theme ?? MOOD_THEMES[mood];
  const text =
    first !== theme
      ? `Across ${count} check-ins today you've moved from ${THEME_WORDS[first]} to ${THEME_WORDS[theme]}; most recently: ${latest.heading.toLowerCase()}.`
      : `Across ${count} check-ins today the thread has stayed ${THEME_WORDS[theme]}; most recently: ${latest.heading.toLowerCase()}.`;
  return { text, mood, theme };
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
  // No theme word said: the heading still names the sentiment — the mood
  // is always derived, so the line under the mascot never goes generic.
  const headingByMood: Record<MotifMood, string> = {
    Excited: "Riding high",
    Tense: "Wound up",
    Content: "Steady and settled",
    Weary: "Running low",
    Asleep: "Barely awake",
  };
  const heading = topicLine
    ? `Talking ${topicLine}`.replace(/^Talking/, theme ? `${headingByTheme[theme].split(",")[0]} —` : "Talking")
    : theme
      ? headingByTheme[theme]
      : headingByMood[mood];

  const words = text.split(/\s+/);
  const quote = words.length > 22 ? `${words.slice(0, 22).join(" ")}…` : text;
  // No emotion word said: the mood still names a tone — never "hard to read".
  const MOOD_FEELS: Record<MotifMood, string> = {
    Excited: "it sounded lively",
    Tense: "it sounded wound up",
    Content: "it sounded settled",
    Weary: "it sounded low",
    Asleep: "it sounded quiet",
  };
  const feel = theme
    ? { happy: "it sounded upbeat", anxious: "it sounded wound up", sad: "it sounded low", calm: "it sounded settled" }[theme]
    : MOOD_FEELS[mood];
  const summary = `You said “${quote}” — ${feel}${topicLine ? `, mostly about ${topicLine}` : ""}.`;

  return { heading: heading.split(/\s+/).slice(0, 7).join(" "), summary, mood, theme, source: "local" };
}
