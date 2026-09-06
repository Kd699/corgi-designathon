/* The agent seam. One function: text in, a DayState patch and a widget order out.
 *
 * Two paths, and the fast one always runs:
 *
 *   read()   a local parser, no network, fires on every keystroke. It is deliberately dumb
 *            — clock times, durations, names after "with", a small mood lexicon — so the
 *            board moves while you are still typing and never sits empty waiting on a model.
 *   think()  xAI (Grok) on send, through the dev proxy at /api/xai so the key stays on the
 *            server and never reaches the bundle. Its answer replaces the local guess.
 *
 * With no XAI_API_KEY set, think() fails soft and the local read is the whole product. That
 * is the point: this is demoable on a plane.
 */
import { EMPTY_DAY, type AgentReply, type DayState, type TimelineEvent, type WidgetId } from './types';

/* ── the local read ───────────────────────────────────────────────────── */

const MOOD_WORDS: { re: RegExp; value: number }[] = [
  { re: /\b(great|brilliant|buzzing|elated|amazing|joy|lovely)\b/i, value: 0.9 },
  { re: /\b(good|nice|pleased|happy|productive|calm|settled)\b/i, value: 0.55 },
  { re: /\b(fine|ok|okay|alright|steady|normal)\b/i, value: 0.1 },
  { re: /\b(tired|flat|meh|slow|dragging|foggy)\b/i, value: -0.35 },
  { re: /\b(stressed|anxious|wound up|frazzled|overwhelmed|rough|awful|angry|low)\b/i, value: -0.75 },
];

const KIND_WORDS: { re: RegExp; kind: TimelineEvent['kind'] }[] = [
  { re: /\b(gym|run|ran|walk|walked|swim|yoga|cycle|training)\b/i, kind: 'body' },
  { re: /\b(lunch|coffee|call|meeting|standup|1:1|catch[- ]?up|drinks|dinner)\b/i, kind: 'people' },
  { re: /\b(email|admin|expenses|paperwork|invoic)\w*/i, kind: 'admin' },
  { re: /\b(nap|rest|break|sat|read|reading)\b/i, kind: 'rest' },
];

const WIN_WORDS = /\b(finished|shipped|sent|fixed|done|closed|launched|wrote|solved|nailed)\b/i;
const FRICTION_WORDS = /\b(stuck|blocked|broke|failed|waited|dragged|argued|missed|late|annoying)\b/i;

const clamp = (n: number, lo = -1, hi = 1) => Math.min(hi, Math.max(lo, n));
const pad = (n: number) => String(n).padStart(2, '0');

/* Word clocks, because people say "up at six" far more often than "up at 06:00". */
const WORD_HOUR: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, noon: 12, midnight: 0,
};

/**
 * A clock, or null. A bare number is NOT one: "ran 20 minutes" was being read as 20:00,
 * which put the run at eight in the evening and ate the "20" out of its own label. A number
 * only counts as a time when it carries am/pm, a colon, or an "at/around/by/from" in front.
 */
function parseClock(raw: string): string | null {
  const digits = raw.match(/\b(?:(at|around|about|by|from)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (digits) {
    const [, lead, hRaw, minRaw, merRaw] = digits;
    const mer = merRaw?.toLowerCase();
    const qualified = Boolean(mer || minRaw || lead);
    if (qualified) {
      let h = Number(hRaw);
      if (h <= 23) {
        const min = minRaw ? Number(minRaw) : 0;
        if (mer === 'pm' && h < 12) h += 12;
        if (mer === 'am' && h === 12) h = 0;
        // "by four" in the afternoon reads as 16:00, not 04:00 — a bare small hour after a
        // lead word is far more often the working day than the small hours.
        if (!mer && lead && h < 7) h += 12;
        return `${pad(h)}:${pad(min)}`;
      }
    }
  }
  const words = raw.match(/\b(?:at|around|about|by|from)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|noon|midnight)\b/i);
  if (words) {
    const h = WORD_HOUR[words[1].toLowerCase()];
    // "at six" in a day account is the morning; "at one" is the afternoon.
    return `${pad(h >= 1 && h <= 5 ? h + 12 : h)}:00`;
  }
  return null;
}

/** The sentence, minus the clock it happened at. Never touches duration digits. */
function eventName(sentence: string, at: string | null): string {
  let name = sentence;
  if (at) {
    name = name
      .replace(/\b(at|around|about|by|from)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|noon|midnight)\b/i, ' ')
      .replace(/\b(at|around|about|by|from)\s+\d{1,2}(:\d{2})?\s*(am|pm)?\b/i, ' ')
      .replace(/\b\d{1,2}:\d{2}\s*(am|pm)?\b/i, ' ')
      .replace(/\b\d{1,2}\s*(am|pm)\b/i, ' ');
  }
  // Removing "at six" out of the middle of a clause leaves the comma behind it stranded.
  name = name.replace(/\s+([,.;])/g, '$1').replace(/\s{2,}/g, ' ').replace(/^[\s,–-]+|[\s,]+$/g, '');
  return name.slice(0, 64) || 'Something';
}

function kindOf(text: string): TimelineEvent['kind'] {
  return KIND_WORDS.find((k) => k.re.test(text))?.kind ?? 'work';
}

/** Sentence-level parse. Each sentence can contribute a mood point, an event, a win, a drag. */
export function read(text: string, base: DayState = EMPTY_DAY): AgentReply {
  const sentences = text.split(/[.;\n]+/).map((s) => s.trim()).filter(Boolean);
  // Fresh arrays, not EMPTY_DAY's. Spreading EMPTY_DAY copies its array references, so every
  // push landed in the module-level constant and the next read started with the last one's
  // events — four artboard frames showed each other's days, and the live page accumulated
  // across sends. Caught by looking at the board, not by a test.
  const day: DayState = {
    ...EMPTY_DAY,
    mood: [], timeline: [], people: [], focus: [], wins: [], frictions: [],
    body: { ...base.body },
  };
  let clock = 8;

  for (const s of sentences) {
    const at = parseClock(s);
    if (at) clock = Number(at.slice(0, 2));

    const hit = MOOD_WORDS.find((m) => m.re.test(s));
    if (hit) day.mood.push({ at: at ?? `${pad(clock)}:00`, value: hit.value, note: s.match(hit.re)?.[0]?.toLowerCase() });

    // Sleep is a body reading, not something you did at a time — it would otherwise land on
    // the timeline as a six-hour block at midnight.
    const isSleep = /\b(slept|sleep)\b/i.test(s);

    // An event is a sentence with a clock, or one that names something you did somewhere.
    const duration = s.match(/\b(\d+)\s*(h|hr|hrs|hour|hours|m|min|mins|minutes)\b/i);
    if ((at || duration) && !isSleep) {
      const minutes = duration
        ? /^h/i.test(duration[2]) ? Number(duration[1]) * 60 : Number(duration[1])
        : 60;
      day.timeline.push({
        id: `e${day.timeline.length}`,
        // Keep the sentence as the label and strip only the clock itself — an earlier version
        // stripped the first number it saw anywhere, which turned "ran 20 minutes" into
        // "ran minutes" and "Standup at 9:30" into "Standup at".
        name: eventName(s, at),
        start: at ?? `${pad(clock)}:00`,
        durationMinutes: minutes,
        kind: kindOf(s),
      });
      if (!at) clock = Math.min(23, clock + Math.max(1, Math.round(minutes / 60)));
    }

    for (const m of s.matchAll(/\bwith ([A-Z][a-z]+(?: and [A-Z][a-z]+)?)/g)) {
      for (const name of m[1].split(/ and /)) {
        if (!day.people.some((p) => p.name === name)) {
          day.people.push({ name, warmth: hit ? clamp(hit.value) : 0.3, context: s.slice(0, 60) });
        }
      }
    }

    if (WIN_WORDS.test(s)) day.wins.push(s.slice(0, 90));
    if (FRICTION_WORDS.test(s)) day.frictions.push(s.slice(0, 90));

    const focus = s.match(/\b(\d+)\s*(h|hr|hrs|hour|hours)\b[^.]*\b(on|of)\s+([\w\s]{3,30})/i);
    if (focus) day.focus.push({ label: focus[4].trim().slice(0, 28), minutes: Number(focus[1]) * 60, depth: 0.7 });

    const sleep = s.match(/\b(\d+(?:\.\d+)?)\s*(?:h|hrs?|hours?)\s*(?:of\s*)?sleep\b|\bslept\s*(\d+(?:\.\d+)?)/i);
    if (sleep) day.body.sleepHours = Number(sleep[1] ?? sleep[2]);
    const heart = s.match(/\bheart(?:\s*rate)?\s*(?:at|of|was)?\s*(\d{2,3})\b/i);
    if (heart) day.body.restingHeart = Number(heart[1]);
    const move = s.match(/\b(\d+)\s*(?:min|mins|minutes)\b[^.]*\b(walk|run|gym|cycle|swim)/i);
    if (move) day.body.moveMinutes = Number(move[1]);
  }

  const avg = day.mood.length ? day.mood.reduce((a, m) => a + m.value, 0) / day.mood.length : 0;
  day.energy = clamp((avg + 1) / 2 + (day.timeline.length > 4 ? -0.1 : 0), 0, 1);
  day.headline = day.headline || headlineFor(avg, day);
  day.read = day.read || `Read from what you typed — ${day.timeline.length} thing${day.timeline.length === 1 ? '' : 's'} logged, ${day.mood.length} mood cue${day.mood.length === 1 ? '' : 's'}. Press send for the model's version.`;
  day.tomorrow = day.tomorrow || (day.frictions.length ? 'What made that harder than it needed to be?' : 'Worth repeating tomorrow?');

  return { day, surface: surfaceFor(day), say: '' };
}

function headlineFor(avg: number, day: DayState): string {
  if (!day.timeline.length && !day.mood.length) return 'Tell me about your day.';
  if (avg > 0.4) return 'A good one, on balance.';
  if (avg < -0.4) return 'That sounds like a lot.';
  if (day.timeline.length > 5) return 'A full day, whatever else it was.';
  return 'An ordinary day, so far.';
}

/** A widget earns its place by having something to show. Order is the reading order. */
export function surfaceFor(day: DayState): WidgetId[] {
  const has: Record<WidgetId, boolean> = {
    read: Boolean(day.headline),
    mood: day.mood.length > 0,
    energy: day.mood.length > 0,
    timeline: day.timeline.length > 0,
    people: day.people.length > 0,
    focus: day.focus.length > 0,
    body: Object.values(day.body).some((v) => v !== null),
    wins: day.wins.length > 0,
    frictions: day.frictions.length > 0,
    tomorrow: Boolean(day.tomorrow),
  };
  const order: WidgetId[] = ['read', 'mood', 'energy', 'timeline', 'focus', 'people', 'body', 'wins', 'frictions', 'tomorrow'];
  return order.filter((id) => has[id]);
}

/* ── the model ────────────────────────────────────────────────────────── */

const SYSTEM = `You turn someone's spoken account of their day into a structured board.

Return ONLY a JSON object matching this shape — no prose, no code fence, nothing before or after it:
{
  "day": {
    "headline": string,        // one short line the day IS. Not a summary — a read. No hedging.
    "read": string,            // 1-2 sentences of evidence FROM WHAT THEY SAID. Quote their details.
    "mood": [{"at":"HH:MM","value":-1..1,"note":"one word"}],
    "energy": 0..1,
    "timeline": [{"id":string,"name":string,"start":"HH:MM","durationMinutes":number,
                  "kind":"work"|"people"|"body"|"rest"|"admin"}],
    "people": [{"name":string,"warmth":-1..1,"context":string}],
    "focus": [{"label":string,"minutes":number,"depth":0..1}],
    "body": {"sleepHours":number|null,"restingHeart":number|null,"moveMinutes":number|null},
    "wins": [string],
    "frictions": [string],
    "tomorrow": string         // one question the day asks of tomorrow
  },
  "surface": ["read","mood","energy","timeline","focus","people","body","wins","frictions","tomorrow"],
  "say": string                // one line back to them, warm, specific, no more than 15 words
}

Rules:
- Only include a field you have evidence for. Empty array or null beats invention.
- "surface" lists ONLY widgets with real data, in the order they should be read. The board is
  your composition: if the day was all people and no work, lead with people. The one
  exception: "read" is always present and always first — the headline is the board's title.
- Times: infer sensible clock times from ordering words ("after lunch", "first thing").
- Never moralise, never give advice unless they asked. You are describing, not coaching.`;

/** Merge the model's patch onto what we have. Arrays replace; scalars replace when present. */
function apply(base: DayState, patch: Partial<DayState>): DayState {
  return {
    ...base,
    ...patch,
    body: { ...base.body, ...(patch.body ?? {}) },
  };
}

/* Where the model lives.
 *
 * In dev, /api/xai — the Vite middleware in vite.config.ts, which holds the upstream and its
 * auth in the server process. On a static host there is no server, so the built page talks to
 * Spacetime's llm-proxy edge function directly with the Supabase anon token baked in at build
 * time. That token is public by design (it ships in every Spacetime client); the xAI key it
 * fronts never leaves Supabase. Set VITE_LLM_PROXY_URL + VITE_LLM_PROXY_TOKEN to build for
 * hosting; leave them unset and the dev proxy is used. */
const PROXY_URL = import.meta.env.VITE_LLM_PROXY_URL as string | undefined;
const PROXY_TOKEN = import.meta.env.VITE_LLM_PROXY_TOKEN as string | undefined;
const endpoint: { url: string; headers: Record<string, string> } = PROXY_URL && PROXY_TOKEN
  ? { url: PROXY_URL, headers: { 'content-type': 'application/json', authorization: `Bearer ${PROXY_TOKEN}`, apikey: PROXY_TOKEN } }
  : { url: '/api/xai', headers: { 'content-type': 'application/json' } };

/* grok-4-fast-non-reasoning, not grok-4-latest: through the edge function the reasoning
 * model took 12–18s for this prompt and the non-reasoning one ~6s, with no visible drop in
 * the composition. And a hard ceiling — a request that has not answered in THINK_TIMEOUT_MS
 * is abandoned and the caller falls back to the local read, because "Grok is reading…"
 * forever is the one state the board must never sit in. */
const MODEL = 'grok-4-fast-non-reasoning';
const THINK_TIMEOUT_MS = 20_000;

export async function think(text: string, base: DayState): Promise<AgentReply> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), THINK_TIMEOUT_MS);
  const res = await fetch(endpoint.url, {
    method: 'POST',
    headers: endpoint.headers,
    signal: ctl.signal,
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Board so far:\n${JSON.stringify(base)}\n\nThey said:\n${text}` },
      ],
    }),
  }).catch((e: unknown) => {
    throw new Error(ctl.signal.aborted ? `no answer in ${THINK_TIMEOUT_MS / 1000}s` : e instanceof Error ? e.message : String(e));
  }).finally(() => clearTimeout(timer));
  if (!res.ok) throw new Error(`xai ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const content: string | undefined = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error('xai returned no content');
  // The Supabase llm-proxy drops response_format, so the model is free to wrap the JSON in a
  // code fence or a sentence. Take the outermost object and ignore the rest.
  const start = content.indexOf('{'), end = content.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`xai returned no JSON: ${content.slice(0, 120)}`);
  const parsed = JSON.parse(content.slice(start, end + 1)) as AgentReply;
  const day = apply(base, parsed.day ?? {});
  return {
    day,
    surface: parsed.surface?.length ? parsed.surface : surfaceFor(day),
    say: parsed.say ?? '',
  };
}
