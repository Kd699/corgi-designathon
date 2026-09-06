/* Daily-open concept lab. Rows are scenarios, columns are the four directions.
 *
 * TODO(v3artboard internals): this runtime predates componentFocus (Phase 3.5) and
 * SidebarItem.subgroup (P4a nesting), so widget-level diffing is unavailable and the sidebar
 * nests via one section per concept rather than a subgroup. Not patching types.ts to suit one
 * lab — see the terminus report.
 */
import { defineV3ArtboardSpec, V3Artboard } from '../components/v3artboard';
import { ALL_CONCEPTS, CONCEPT_CONFIG } from './daily-open/mode-config';
import { DAILY_OPEN_MODES } from './daily-open/modes';
import { SCENARIOS } from './daily-open/scenarios';

const SPEC = defineV3ArtboardSpec({
  brand: {
    title: 'The daily open',
    subtitle: 'Corgi Designathon · how loud is the read?',
    welcomeHelp: [
      { kbd: '⌘1 / ⌘2', title: 'Viewer and artboard', text: 'Viewer is one screen, live. Artboard is every scenario against every direction.' },
      { kbd: '← →', title: 'Step through', text: 'Walk the four scenarios without leaving the direction you are judging.' },
      { badge: 'LIVE', title: 'Viewer frames are real', text: 'Rate a mood, answer the mascot, switch objective — derive() re-runs and the screen changes. Artboard frames are inert on purpose.' },
      { kbd: '</>', title: 'Dev mode', text: 'The toggle is there but the inspector is not wired in this runtime — it prints a placeholder, not source file:line. Do not trust it yet.' },
    ],
  },
  modes: DAILY_OPEN_MODES,
  defaults: { viewMode: 'artboard', platform: 'mobile', zoom: 0.5 },

  // One section per concept, scenarios inside it — so the board reads as four directions with
  // four moments each, not sixteen equal rows.
  sidebar: ALL_CONCEPTS.map((id) => ({
    sectionLabel: CONCEPT_CONFIG[id].label,
    items: SCENARIOS.map((s) => ({
      id: `${id}-${s.id}`,
      label: s.label,
      description: s.description,
      options: [{ modeId: id, stateId: s.id, platform: 'mobile' as const, platformLabel: 'M' }],
    })),
  })),

  // Rows are scenarios so the four directions sit side by side under the same conditions.
  // Only the first row carries each thesis — repeating it under all sixteen frames is noise.
  artboard: SCENARIOS.map((s, row) => ({
    id: s.id,
    divider: 'thick' as const,
    title: s.label,
    description: s.description,
    steps: ALL_CONCEPTS.map((id, i) => ({
      badge: String.fromCharCode(65 + i),
      title: CONCEPT_CONFIG[id].label,
      description: row === 0 ? CONCEPT_CONFIG[id].thesis : undefined,
      frames: [{ modeId: id, stateId: s.id, platform: 'mobile' as const, rawFrame: true }],
    })),
  })),

  context: [
    { tone: 'info', title: 'What this board is deciding', items: ['How loud should the environment be about the read it has already made?', 'Wednesday is the row that matters — the ordinary case is where restraint either works or reads as nothing.'] },
    { tone: 'warn', title: 'Open questions (docs/BRIEF.md)', items: ['Which passive signals are allowed in, and where is the line between responsive and creepy?', 'Is a yes/no enough for course correction, or should the environment ask?', 'What is the mascot for — companion, mirror, or narrator?', 'Where does a wrong read do harm, and how does this fail safe?'] },
    { tone: 'neutral', title: 'What each direction costs', items: ALL_CONCEPTS.map((id) => `${CONCEPT_CONFIG[id].label} — ${CONCEPT_CONFIG[id].risk}`) },
    { tone: 'success', title: 'Every frame is real', items: ['Signals go through the real derive(); the real components render the result.', 'A frame cannot claim behaviour the product does not have.'] },
  ],
});

export default function DailyOpenLab() {
  return <V3Artboard spec={SPEC} />;
}
