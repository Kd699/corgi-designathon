/* Words in, weather out — locally, on the same frame you speak.
 *
 * Nothing here touches the network. Display can afford Grok because it answers a paragraph
 * later; the intervention cannot, because the whole claim of this surface is that the room
 * moves WHILE you are talking. A regex pass over a hand-authored table costs microseconds
 * and lands on the interim transcript, which is the only budget that buys that.
 *
 * Two tables, both plain data:
 *   EMOJI   stems → a glyph. Stems, not words, so "worry"/"worried"/"worrying" all land on
 *           the same face. Authored here rather than pulled from a package because the set
 *           is deliberately small and about a person's day, not about emoji coverage.
 *   TONES   stems → a sky preset, a mascot expression, and how the deck should move. This
 *           is the axis Display does not have: the environment taking a position on what it
 *           just heard.
 *
 * The step gets the last word through its own `pull`: early in the protocol the user's
 * language owns the sky, and by the closing step the sky mostly holds still, because a room
 * that keeps reacting while you commit to something is a room arguing with you.
 */
import type { SkyPresetName } from '../clouds/sky';
import type { Expression, ProtocolStep } from './protocol';

export type EmojiGroup = 'feeling' | 'body' | 'people' | 'place' | 'time' | 'activity';

/** Stem → glyph. A stem matches any word that starts with it. */
const EMOJI: ReadonlyArray<readonly [EmojiGroup, string, string]> = [
  // feeling
  ['feeling', 'anxi', '😰'], ['feeling', 'anxious', '😰'], ['feeling', 'worr', '😟'],
  ['feeling', 'stress', '😖'], ['feeling', 'panic', '😱'], ['feeling', 'dread', '😨'],
  ['feeling', 'scare', '😨'], ['feeling', 'afraid', '😨'], ['feeling', 'fear', '😨'],
  ['feeling', 'nervous', '😬'], ['feeling', 'tense', '😬'], ['feeling', 'overwhelm', '🌊'],
  ['feeling', 'angr', '😠'], ['feeling', 'anger', '😠'], ['feeling', 'furious', '🤬'],
  ['feeling', 'rage', '🤬'], ['feeling', 'annoy', '😤'], ['feeling', 'frustrat', '😤'],
  ['feeling', 'irritat', '😤'], ['feeling', 'resent', '😒'], ['feeling', 'bitter', '😒'],
  ['feeling', 'sad', '😢'], ['feeling', 'cry', '😭'], ['feeling', 'crying', '😭'],
  ['feeling', 'grief', '🖤'], ['feeling', 'lonel', '🫥'], ['feeling', 'alone', '🫥'],
  ['feeling', 'empt', '🕳️'], ['feeling', 'numb', '🧊'], ['feeling', 'flat', '➖'],
  ['feeling', 'hopeless', '🌑'], ['feeling', 'ashame', '🫣'], ['feeling', 'shame', '🫣'],
  ['feeling', 'guilt', '⚖️'], ['feeling', 'embarrass', '🫠'], ['feeling', 'stupid', '🫠'],
  ['feeling', 'fail', '📉'], ['feeling', 'useless', '📉'], ['feeling', 'worthless', '📉'],
  ['feeling', 'doubt', '❓'], ['feeling', 'confus', '🌀'], ['feeling', 'stuck', '🧱'],
  ['feeling', 'trapped', '🧱'], ['feeling', 'pressur', '🗜️'], ['feeling', 'rush', '🏃'],
  ['feeling', 'calm', '🌿'], ['feeling', 'peace', '🕊️'], ['feeling', 'quiet', '🤫'],
  ['feeling', 'still', '🪷'], ['feeling', 'settl', '🪷'], ['feeling', 'safe', '🛟'],
  ['feeling', 'ok', '👌'], ['feeling', 'fine', '👌'], ['feeling', 'better', '📈'],
  ['feeling', 'happ', '😊'], ['feeling', 'glad', '😊'], ['feeling', 'joy', '😄'],
  ['feeling', 'excit', '🤩'], ['feeling', 'proud', '🏅'], ['feeling', 'grateful', '🙏'],
  ['feeling', 'thank', '🙏'], ['feeling', 'relief', '😮‍💨'], ['feeling', 'reliev', '😮‍💨'],
  ['feeling', 'hope', '🌱'], ['feeling', 'love', '❤️'], ['feeling', 'like', '👍'],
  ['feeling', 'enjoy', '✨'], ['feeling', 'curious', '🔍'], ['feeling', 'bored', '🥱'],
  ['feeling', 'jealous', '🟢'], ['feeling', 'envy', '🟢'], ['feeling', 'surpris', '😮'],
  ['feeling', 'disappoint', '😞'], ['feeling', 'regret', '🔙'], ['feeling', 'miss', '🫙'],
  // body
  ['body', 'tired', '🥱'], ['body', 'exhaust', '🪫'], ['body', 'drain', '🪫'],
  ['body', 'knacker', '🪫'], ['body', 'sleep', '😴'], ['body', 'nap', '😴'],
  ['body', 'insomnia', '🌙'], ['body', 'awake', '👁️'], ['body', 'rest', '🛌'],
  ['body', 'sore', '🩹'], ['body', 'ache', '🩹'], ['body', 'pain', '🩹'],
  ['body', 'headach', '🤕'], ['body', 'migraine', '🤕'], ['body', 'sick', '🤒'],
  ['body', 'ill', '🤒'], ['body', 'nausea', '🤢'], ['body', 'stomach', '🫃'],
  ['body', 'chest', '🫁'], ['body', 'breath', '🌬️'], ['body', 'heart', '❤️‍🔥'],
  ['body', 'pulse', '💓'], ['body', 'shak', '🫨'], ['body', 'sweat', '💦'],
  ['body', 'tight', '🪢'], ['body', 'shoulder', '🫱'], ['body', 'jaw', '🦷'],
  ['body', 'hungry', '🍽️'], ['body', 'thirst', '🥤'], ['body', 'heavy', '🪨'],
  ['body', 'light', '🎈'], ['body', 'energ', '⚡'], ['body', 'strong', '💪'],
  ['body', 'weak', '🫗'], ['body', 'dizz', '💫'], ['body', 'cold', '🥶'],
  ['body', 'hot', '🥵'], ['body', 'cough', '🤧'],
  // people
  ['people', 'mum', '👩'], ['people', 'mother', '👩'], ['people', 'dad', '👨'],
  ['people', 'father', '👨'], ['people', 'parent', '👪'], ['people', 'sister', '👧'],
  ['people', 'brother', '👦'], ['people', 'famil', '👪'], ['people', 'kid', '🧒'],
  ['people', 'child', '🧒'], ['people', 'son', '👦'], ['people', 'daughter', '👧'],
  ['people', 'partner', '🧑‍🤝‍🧑'], ['people', 'wife', '👰'], ['people', 'husband', '🤵'],
  ['people', 'girlfriend', '💞'], ['people', 'boyfriend', '💞'], ['people', 'friend', '🫂'],
  ['people', 'mate', '🫂'], ['people', 'boss', '🧑‍💼'], ['people', 'manager', '🧑‍💼'],
  ['people', 'colleague', '🧑‍💻'], ['people', 'coworker', '🧑‍💻'], ['people', 'team', '👥'],
  ['people', 'client', '🤝'], ['people', 'customer', '🤝'], ['people', 'doctor', '🩺'],
  ['people', 'therapist', '🛋️'], ['people', 'neighbour', '🏘️'], ['people', 'neighbor', '🏘️'],
  ['people', 'stranger', '🚶'], ['people', 'crowd', '👥'], ['people', 'everyone', '👥'],
  ['people', 'nobody', '🫥'], ['people', 'ex', '💔'],
  // place
  ['place', 'home', '🏠'], ['place', 'house', '🏠'], ['place', 'flat', '🏢'],
  ['place', 'room', '🚪'], ['place', 'bed', '🛏️'], ['place', 'kitchen', '🍳'],
  ['place', 'office', '🏢'], ['place', 'desk', '🪑'], ['place', 'work', '💼'],
  ['place', 'school', '🏫'], ['place', 'uni', '🎓'], ['place', 'hospital', '🏥'],
  ['place', 'shop', '🛒'], ['place', 'street', '🛣️'], ['place', 'road', '🛣️'],
  ['place', 'park', '🌳'], ['place', 'garden', '🪴'], ['place', 'gym', '🏋️'],
  ['place', 'train', '🚆'], ['place', 'bus', '🚌'], ['place', 'car', '🚗'],
  ['place', 'tube', '🚇'], ['place', 'traffic', '🚦'], ['place', 'airport', '✈️'],
  ['place', 'city', '🏙️'], ['place', 'outside', '🌤️'], ['place', 'beach', '🏖️'],
  ['place', 'sea', '🌊'], ['place', 'wood', '🌲'], ['place', 'hill', '⛰️'],
  // time
  ['time', 'morning', '🌅'], ['time', 'noon', '🕛'], ['time', 'afternoon', '🌇'],
  ['time', 'evening', '🌆'], ['time', 'night', '🌙'], ['time', 'midnight', '🕛'],
  ['time', 'today', '📅'], ['time', 'yesterday', '⏮️'], ['time', 'tomorrow', '⏭️'],
  ['time', 'week', '🗓️'], ['time', 'month', '🗓️'], ['time', 'year', '🗓️'],
  ['time', 'monday', '📆'], ['time', 'tuesday', '📆'], ['time', 'wednesday', '📆'],
  ['time', 'thursday', '📆'], ['time', 'friday', '📆'], ['time', 'saturday', '📆'],
  ['time', 'sunday', '📆'], ['time', 'weekend', '🎏'], ['time', 'hour', '⏳'],
  ['time', 'minute', '⏱️'], ['time', 'late', '⏰'], ['time', 'early', '🐓'],
  ['time', 'again', '🔁'], ['time', 'always', '♾️'], ['time', 'never', '🚫'],
  ['time', 'deadline', '⏲️'], ['time', 'deadlines', '⏲️'],
  // activity
  ['activity', 'meeting', '📊'], ['activity', 'standup', '📊'], ['activity', 'call', '📞'],
  ['activity', 'email', '📧'], ['activity', 'message', '💬'], ['activity', 'text', '💬'],
  ['activity', 'slack', '💬'], ['activity', 'present', '🎤'], ['activity', 'interview', '🎙️'],
  ['activity', 'exam', '📝'], ['activity', 'test', '📝'], ['activity', 'deck', '📑'],
  ['activity', 'code', '💻'], ['activity', 'design', '🎨'], ['activity', 'draw', '🎨'],
  ['activity', 'writ', '✍️'], ['activity', 'read', '📖'], ['activity', 'study', '📚'],
  ['activity', 'ship', '🚢'], ['activity', 'launch', '🚀'], ['activity', 'fix', '🔧'],
  ['activity', 'break', '☕'], ['activity', 'coffee', '☕'], ['activity', 'tea', '🍵'],
  ['activity', 'lunch', '🥪'], ['activity', 'dinner', '🍲'], ['activity', 'breakfast', '🥣'],
  ['activity', 'drink', '🍷'], ['activity', 'smok', '🚬'], ['activity', 'run', '🏃'],
  ['activity', 'walk', '🚶'], ['activity', 'swim', '🏊'], ['activity', 'cycl', '🚴'],
  ['activity', 'yoga', '🧘'], ['activity', 'stretch', '🤸'], ['activity', 'train', '🏋️'],
  ['activity', 'music', '🎧'], ['activity', 'sing', '🎵'], ['activity', 'film', '🎬'],
  ['activity', 'game', '🎮'], ['activity', 'phone', '📱'], ['activity', 'scroll', '📱'],
  ['activity', 'clean', '🧹'], ['activity', 'cook', '🍳'], ['activity', 'shower', '🚿'],
  ['activity', 'money', '💷'], ['activity', 'bill', '🧾'], ['activity', 'rent', '🔑'],
  ['activity', 'argu', '🗯️'], ['activity', 'fight', '🥊'], ['activity', 'apolog', '🙇'],
  ['activity', 'cancel', '❌'], ['activity', 'forgot', '🫠'], ['activity', 'forget', '🫠'],
  ['activity', 'plan', '🗺️'], ['activity', 'decide', '🧭'], ['activity', 'promis', '🤞'],
  ['activity', 'help', '🆘'], ['activity', 'ask', '🙋'], ['activity', 'say', '🗣️'],
  ['activity', 'tell', '🗣️'], ['activity', 'listen', '👂'], ['activity', 'wait', '⏸️'],
  ['activity', 'start', '▶️'], ['activity', 'finish', '🏁'], ['activity', 'win', '🏆'],
  ['activity', 'lose', '🎲'],
];

/** A tone family: the words that mean it, and what the environment does about it. */
interface Tone {
  name: string;
  stems: string[];
  sky: SkyPresetName;
  mascot: Expression;
  /** -1..1 each, averaged across the tones that matched. */
  valence: number;
  arousal: number;
  /** Multiplied into the step's own dial bias. */
  speed: number;
  fullness: number;
  intensity: number;
  /** How loudly this family speaks when several match at once. */
  weight: number;
}

const TONES: Tone[] = [
  {
    name: 'wound-up',
    stems: ['anxi', 'panic', 'stress', 'overwhelm', 'dread', 'rush', 'urgent', 'deadline',
      'scare', 'afraid', 'fear', 'nervous', 'racing', 'spiral', 'worr', 'shak', 'sweat', 'tight'],
    sky: 'Dusk', mascot: 'tense',
    valence: -0.65, arousal: 0.9, speed: 1.5, fullness: 1.3, intensity: 1.35, weight: 1.2,
  },
  {
    name: 'angry',
    stems: ['angr', 'anger', 'furious', 'rage', 'annoy', 'frustrat', 'irritat', 'resent',
      'unfair', 'fight', 'argu', 'shout', 'snapp'],
    sky: 'Sunset', mascot: 'tense',
    valence: -0.55, arousal: 0.8, speed: 1.4, fullness: 1.25, intensity: 1.4, weight: 1.1,
  },
  {
    name: 'low',
    stems: ['sad', 'cry', 'lonel', 'hopeless', 'empt', 'numb', 'grief', 'worthless',
      'useless', 'fail', 'pointless', 'give up', 'ashame', 'shame', 'guilt', 'regret',
      'disappoint', 'stupid'],
    sky: 'Night', mascot: 'weary',
    valence: -0.8, arousal: 0.2, speed: 0.55, fullness: 1.25, intensity: 0.75, weight: 1.15,
  },
  {
    name: 'spent',
    stems: ['tired', 'exhaust', 'drain', 'knacker', 'burn', 'sleep', 'insomnia', 'heavy',
      'slow', 'cannot', "can't", 'no energy'],
    sky: 'Pre-dawn', mascot: 'weary',
    valence: -0.35, arousal: 0.15, speed: 0.5, fullness: 1.1, intensity: 0.7, weight: 0.9,
  },
  {
    name: 'settled',
    stems: ['calm', 'peace', 'quiet', 'settl', 'safe', 'steady', 'ok', 'fine', 'gentle',
      'slow down', 'breath', 'rest', 'grateful', 'thank', 'alright'],
    sky: 'Morning', mascot: 'content',
    valence: 0.6, arousal: 0.25, speed: 0.6, fullness: 0.8, intensity: 0.85, weight: 1,
  },
  {
    name: 'lifted',
    stems: ['happ', 'glad', 'joy', 'excit', 'proud', 'relief', 'reliev', 'hope', 'love',
      'enjoy', 'good', 'great', 'better', 'win', 'won', 'ship', 'finish', 'sorted'],
    sky: 'Sunrise', mascot: 'excited',
    valence: 0.8, arousal: 0.7, speed: 1.15, fullness: 0.95, intensity: 1.1, weight: 1,
  },
  {
    name: 'flat',
    stems: ['bored', 'nothing', 'whatever', 'meh', 'blank', 'dont care', "don't care", 'numb out'],
    sky: 'Night', mascot: 'asleep',
    valence: -0.15, arousal: 0.05, speed: 0.4, fullness: 0.6, intensity: 0.6, weight: 0.7,
  },
];

/** What one pass over the transcript produced. Every field the stage renders is here —
 *  the page reads them, it does not re-derive them. */
export interface Reaction {
  emoji: Array<{ glyph: string; group: EmojiGroup; word: string }>;
  sky: SkyPresetName;
  mascot: Expression;
  valence: number;
  arousal: number;
  /** The tone family that won, or null when the words carried no charge. Shown to the user
   *  so the surface never pretends to a read it did not make. */
  tone: string | null;
  speed: number;
  fullness: number;
  intensity: number;
}

/** One alternation over every stem in the table, longest first so "worrying" is claimed by
 *  "worr" rather than a shorter prefix that happens to sort earlier. Built once. */
function alternation(stems: string[]): RegExp {
  const escaped = stems
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(${escaped.join('|')})[a-z']*`, 'gi');
}

const EMOJI_BY_STEM = new Map(EMOJI.map(([group, stem, glyph]) => [stem, { group, glyph }]));
const EMOJI_RE = alternation(EMOJI.map(([, stem]) => stem));
const TONE_RES = TONES.map((tone) => ({ tone, re: alternation(tone.stems) }));

/** The whole response loop, start to finish: text in, everything the stage needs out.
 *  Same function for the microphone and the keyboard — they are two sources into one pipe,
 *  which is also the only reason this is testable without a microphone. */
export function reactTo(text: string, step: ProtocolStep): Reaction {
  const seen = new Set<string>();
  const emoji: Reaction['emoji'] = [];
  for (const match of text.matchAll(EMOJI_RE)) {
    const entry = EMOJI_BY_STEM.get(match[1].toLowerCase());
    if (!entry || seen.has(entry.glyph)) continue;
    seen.add(entry.glyph);
    emoji.push({ glyph: entry.glyph, group: entry.group, word: match[0] });
  }

  let best: Tone | null = null;
  let bestScore = 0;
  let charge = 0;
  let valence = 0;
  let arousal = 0;
  for (const { tone, re } of TONE_RES) {
    const hits = [...text.matchAll(re)].length;
    if (!hits) continue;
    const score = Math.min(3, hits) * tone.weight;
    charge += score;
    valence += tone.valence * score;
    arousal += tone.arousal * score;
    if (score > bestScore) { bestScore = score; best = tone; }
  }

  // The step's `pull` is the whole negotiation between the user's weather and the step's.
  // Above the threshold the words take the sky; below it the step keeps the one it opened
  // on. The face moves on half the evidence the sky needs — it is the fast channel, and a
  // mascot that lags the sentence reads as a mascot that was not listening.
  const dominance = bestScore * step.pull;
  const tone = best;
  return {
    emoji,
    sky: tone && dominance >= 0.9 ? tone.sky : step.sky,
    mascot: tone && dominance >= 0.45 ? tone.mascot : step.mascot,
    valence: charge ? valence / charge : 0,
    arousal: charge ? arousal / charge : 0.3,
    tone: tone ? tone.name : null,
    speed: step.speed * (tone ? tone.speed : 1),
    fullness: step.fullness * (tone ? tone.fullness : 1),
    intensity: step.intensity * (tone ? tone.intensity : 1),
  };
}

/** Counts, for the report and for anyone auditing the table's coverage. */
export const LEXICON_SIZE = { emoji: EMOJI.length, tones: TONES.length };
