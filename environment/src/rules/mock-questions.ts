// Offline question source for Root so the prototype runs with no model, no key, no proxy.
// Swap for a real transport (cbt-app/server/root-proxy.mjs shape) when the flow is being tuned.
import type { Turn } from './root.js';

const TEMPLATES = [
  (a: string) => `What is underneath "${a}"?`,
  (a: string) => `When you say "${a}", what does that give you, or protect you from?`,
  (a: string) => `If "${a}" were not true, what would change?`,
  (a: string) => `Where did "${a}" first show up for you?`,
  (a: string) => `What would someone who loves you say about "${a}"?`,
  (a: string) => `What is the smallest true thing inside "${a}"?`,
];

export function mockNextQuestion(transcript: Turn[]): string {
  const answers = transcript.filter((t) => t.role === 'a');
  const last = answers[answers.length - 1]?.text ?? 'that';
  const short = last.length > 40 ? last.slice(0, 37) + '...' : last;
  return TEMPLATES[(answers.length - 1) % TEMPLATES.length](short);
}
