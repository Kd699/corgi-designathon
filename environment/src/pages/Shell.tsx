/* The final page: two tabs.
 *
 * Intervention is Kyler's /clouds voice session — you talk, the sky and the motif answer
 * while you are still speaking. Logging is the dayboard — you report the day and the widgets
 * fill in around it. Two answers to the same question, side by side; the tab pair is the
 * argument.
 *
 * Each tab owns a hash so either is linkable and back works. `#/day` still lands on Logging
 * because that link is already in circulation. The tab list is data: a third paradigm is one
 * entry, and nothing here knows which tab it is rendering.
 */
import type { ReactNode } from 'react';
import DayboardPage from './DayboardPage';
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
    blurb: 'report the day, the board fills in',
    hash: '#/logging',
    aliases: ['#/day'],
    render: () => <DayboardPage />,
  },
];

/** The tab a hash belongs to, or null. An empty hash is the first tab — the landing page. */
export function tabForHash(hash: string): ShellTab | null {
  if (!hash || hash === '#' || hash === '#/') return SHELL_TABS[0];
  return SHELL_TABS.find((t) => hash.startsWith(t.hash) || t.aliases?.some((a) => hash.startsWith(a))) ?? null;
}

export default function Shell({ tabId }: { tabId: string }) {
  const active = SHELL_TABS.find((t) => t.id === tabId) ?? SHELL_TABS[0];
  return (
    <div className="shell">
      <nav className="shell-tabs" aria-label="paradigms">
        {SHELL_TABS.map((tab) => (
          <a
            key={tab.id}
            className="shell-tab"
            href={tab.hash}
            data-testid={`tab-${tab.id}`}
            data-state={tab.id === active.id ? 'current' : 'idle'}
            aria-current={tab.id === active.id ? 'page' : undefined}
          >
            {tab.label}
            <span className="shell-tab-blurb">{tab.blurb}</span>
          </a>
        ))}
      </nav>
      <div className="shell-body">{active.render()}</div>
    </div>
  );
}
