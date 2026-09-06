/* The two paradigms, under one set of tabs.
 *
 * They are not two features — they are two answers to the same question, and the tab pair is
 * the argument: Display is where you report your state and the board fills in around it;
 * Intervention is where the environment acts on you while you are still talking. Putting
 * them side by side is what makes the difference legible.
 *
 * Each tab owns a hash, so either one is linkable and the browser's back button works. The
 * tab list is data — adding a third paradigm is one entry, and nothing here knows which tab
 * it is rendering.
 */
import type { ReactNode } from 'react';
import DayboardPage from './DayboardPage';
import InterventionPage from './intervention/InterventionPage';
import './shell.css';

export interface ShellTab {
  id: string;
  label: string;
  /** What the tab is for, in one line — the paradigms are easy to confuse from the outside. */
  blurb: string;
  hash: string;
  render: () => ReactNode;
}

export const SHELL_TABS: ShellTab[] = [
  {
    id: 'display',
    label: 'Display',
    blurb: 'report your state, the board fills in',
    hash: '#/day',
    render: () => <DayboardPage />,
  },
  {
    id: 'intervention',
    label: 'Intervention',
    blurb: 'a CBT protocol that answers while you speak',
    hash: '#/intervention',
    render: () => <InterventionPage />,
  },
];

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
