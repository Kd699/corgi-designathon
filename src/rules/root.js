// Root — the recursive-questioning rules, as pure functions. No storage, no network, no clock.
// The app (CbtApp.tsx), the proxy (server/root-proxy.mjs) and the sandbox (sandbox/run.mjs) all
// import THIS file, so a disagreement is always about the rule and never the wiring.
//
// The idea (user, 2026-09-02): start by identifying the core issue, then each question takes the
// root of the previous answer — probing deeper, breaking the problem into its most basic parts.
// One question per message. No math notation in anything shown to the user.

/** Depth cap: how many answers before we call it the root. [NEEDS INPUT] — 7 is a placeholder. */
export const MAX_DEPTH = 7;

/** The first question is fixed: identify the core issue. Everything after comes from the model. */
export const OPENING_QUESTION = 'What is the issue you want to get to the root of?';

/** @typedef {{ role: 'q' | 'a', text: string }} Turn */

/** Number of answers given so far = current depth. */
export function depthOf(transcript) {
  return transcript.filter((t) => t.role === 'a').length;
}

/**
 * What the flow should do next, from the transcript alone.
 *   'ask'   — we owe the user a question (empty transcript, or last turn was an answer)
 *   'await' — a question is on the table; wait for the answer
 *   'done'  — depth cap reached; the root has been found
 */
export function nextStep(transcript) {
  if (depthOf(transcript) >= MAX_DEPTH) return 'done';
  const last = transcript[transcript.length - 1];
  if (!last || last.role === 'a') return 'ask';
  return 'await';
}

/**
 * Enforce the output contract on whatever the model returns: no math notation, exactly one
 * question, nothing after it. The model is asked for this too; this is the guarantee.
 */
export function sanitizeQuestion(raw) {
  let s = String(raw ?? '');
  s = s.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ');       // code spans
  s = s.replace(/\$[^$]*\$/g, ' ').replace(/\\\(|\\\)|\\\[|\\\]/g, ' '); // $...$ and \( \)
  s = s.replace(/\\?sqrt\s*\(?[^)\s]*\)?/gi, ' ');                        // sqrt(...)
  s = s.replace(/x_\{?n(?:\s*[+-]\s*1)?\}?/gi, ' ');                      // x_n, x_{n+1}
  s = s.replace(/[√^=]/g, ' ');                                           // stray symbols
  s = s.replace(/^\s*(question\s*\d*\s*[:.)-]\s*|q\d*\s*[:.)-]\s*)/i, ''); // "Question 3:" prefixes
  s = s.replace(/^\s*(?:[A-Za-z]+\s?){1,3}:\s+(?=\S)/, '');                 // "Next question:" / "Mock:" -- a label of <=3 words
  s = s.replace(/\s+/g, ' ').trim();
  const q = s.indexOf('?');
  if (q >= 0) s = s.slice(0, q + 1);
  else {
    const dot = s.search(/[.!]\s|[.!]$/);
    s = (dot >= 0 ? s.slice(0, dot) : s).trim();
    if (s) s += '?';
  }
  s = s.replace(/^[^A-Za-z0-9"'(]+/, '');
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

/** The prompt the model gets. Plain text so any transport (CLI, API) can carry it unchanged. */
export function buildPrompt(transcript) {
  const system = [
    'You guide a person through recursive problem-solving, one question at a time.',
    'They have named an issue. Each turn, ask exactly ONE question that probes the root of their most recent answer — what lies underneath it — breaking the problem down toward its most basic part.',
    'Rules: one question per message. No preamble, no reflection, no advice, no summary. No math notation, formulas, symbols or variable names. Plain, warm, specific language. Refer to what they actually said.',
    'Output the question only.',
  ].join('\n');
  const history = transcript
    .map((t) => (t.role === 'q' ? `Question: ${t.text}` : `Answer: ${t.text}`))
    .join('\n');
  const user = `${history}\n\nAsk the next question.`;
  return { system, user };
}

/** Is this keypress the Root hotkey? 'r' / 'R' outside any text field, with no modifier held. */
export function isRootHotkey(ev) {
  if (ev.key !== 'r' && ev.key !== 'R') return false;
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return false;
  const tag = String(ev.targetTag ?? '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || ev.targetEditable) return false;
  return true;
}
