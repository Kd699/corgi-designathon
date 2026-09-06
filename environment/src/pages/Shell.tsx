/* The final page: two tabs.
 *
 * Intervention is Kyler's /clouds voice session — you talk, the sky and the motif answer
 * while you are still speaking. Logging is D3 — the dayboard wearing the same clothes: sky,
 * circle, line, pill, and Grok's cards sweeping out from behind the circle on Send. (D1 and
 * D2 stay on the concept board for comparison.) Two answers to the same question, side by
 * side; the tab pair is the argument.
 *
 * Each tab owns a hash so either is linkable and back works. `#/day` still lands on Logging
 * because that link is already in circulation. The tab list is data: a third paradigm is one
 * entry, and nothing here knows which tab it is rendering.
 */
import type { ReactNode } from 'react';
import { LoggingCalm } from './daily-open/logging-calm';
import CloudsPage from './clouds/page';
import './shell.css';

export interface ShellTab {
  id: string;
  label: string;
  /** What the tab is for, in one line — the paradigms are easy to confuse from the outside. */
  blurb: string;
  hash: string;
  /** Older hashes that should land here too. */
  aliases?: string[];
  render: () => ReactNode;
}

export const SHELL_TABS: ShellTab[] = [
  {
    id: 'intervention',
    label: 'Intervention',
    blurb: 'talk — the sky and the face answer as you go',
    hash: '#/intervention',
    render: () => <CloudsPage />,
  },
  {
    id: 'logging',
    label: 'Logging',
    blurb: 'say the day, the cards come out',
    hash: '#/logging',
    aliases: ['#/day'],
    render: () => <LoggingCalm />,
  },
];

/** The tab a hash belongs to, or null. An empty hash is the first tab — the landing page. */
export function tabForHash(hash: string): ShellTab | null {
  if (!hash || hash === '#' || hash === '#/') return SHELL_TABS[0];
  return SHELL_TABS.find((t) => hash.startsWith(t.hash) || t.aliases?.some((a) => hash.startsWith(a))) ?? null;
}

export default function Shell({ tabId }: { tabId: string }) {
  const active = SHELL_TABS.find((t) => t.id === tabId) ?? SHELL_TABS[0];
  // The Intervention / Logging tab strip is parked: the page opens straight
  // into the active surface with no chrome. The hashes still route — #/logging
  // and #/day land on the board, #/intervention on the sky — the labels just
  // aren't on screen.
  return (
    <div className="shell">
      <div className="shell-body">{active.render()}</div>
    </div>
  );
}
