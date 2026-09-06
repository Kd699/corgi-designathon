/* The daily open — concept lab, on the full V3Artboard runtime.
 *
 * This board used to run on a stripped copy of the runtime that predated componentFocus
 * and SidebarItem.subgroup; its TODO said the sidebar could only nest one section per
 * concept and a widget could not be shown on its own. The full runtime is now vendored in
 * src/components/v3artboard, so both are gone:
 *
 *   - the sidebar cuts the same sixteen frames two ways (by direction, and by moment),
 *     each with a real subgroup rather than four flat sections;
 *   - the Components tab renders the real components on their own, driven by derive();
 *   - concepts inside a row are ALTERNATIVES, so the row is arrow-free — the previous
 *     runtime's auto-arrow implied A leads to B, which is the opposite of the argument.
 *
 * Everything below is data. Adding a direction is one entry in CONCEPT_CONFIG; adding a
 * moment is one entry in SCENARIOS. Neither touches this file.
 */
import { defineV3ArtboardSpec, V3Artboard } from '../components/v3artboard'
import { ALL_CONCEPTS, CONCEPT_CONFIG } from './daily-open/mode-config'
import { DAILY_OPEN_MODES } from './daily-open/modes'
import { DAILY_OPEN_COMPONENTS } from './daily-open/component-focus'
import { SCENARIOS } from './daily-open/scenarios'
import { STANDARD_WELCOME_HELP } from './_shared/v3artboard-welcome-help'

const mobile = 'mobile' as const

/** One frame = one direction under one moment. The only frame shape this board has. */
const frame = (modeId: string, stateId: string) => ({ modeId, stateId, platform: mobile, rawFrame: true })

const SPEC = defineV3ArtboardSpec({
  brand: {
    title: 'The daily open',
    subtitle: 'Corgi Designathon — how loud is the read?',
    welcomeHelp: [
      ...STANDARD_WELCOME_HELP,
      { kbd: 'LIVE', text: 'Viewer frames are real — rate a mood, answer the mascot, switch objective and derive() re-runs. Artboard frames are inert on purpose.' },
      { kbd: 'Components', text: 'The third tab renders each real component on its own, against every scenario palette.' },
    ],
  },
  modes: DAILY_OPEN_MODES,
  componentFocus: DAILY_OPEN_COMPONENTS,
  componentFocusLayout: 'detail',
  defaults: { viewMode: 'artboard', platform: mobile, zoom: 0.5, frameHeight: 'auto' },

  sidebar: [
    // Cut 1 — pick a direction, then walk the day inside it. This is the cut you use when
    // you are judging one argument end to end.
    {
      sectionLabel: 'Directions',
      items: ALL_CONCEPTS.map((id) => ({
        id: `dir-${id}`,
        label: CONCEPT_CONFIG[id].label,
        description: CONCEPT_CONFIG[id].thesis,
        options: [{ modeId: id, stateId: SCENARIOS[0].id, platform: mobile, platformLabel: 'M' }],
        subgroup: {
          label: 'Moments',
          items: SCENARIOS.map((s) => ({
            id: `dir-${id}-${s.id}`,
            label: s.label,
            description: s.description,
            options: [{ modeId: id, stateId: s.id, platform: mobile, platformLabel: 'M' }],
          })),
        },
      })),
    },
    // Cut 2 — pick a moment, then compare the four directions under it. This is the cut you
    // use when you are deciding. The old runtime could not express it at all.
    {
      sectionLabel: 'Moments',
      items: SCENARIOS.map((s) => ({
        id: `moment-${s.id}`,
        label: s.label,
        description: s.description,
        options: [{ modeId: ALL_CONCEPTS[0], stateId: s.id, platform: mobile, platformLabel: 'M' }],
        subgroup: {
          label: 'Directions',
          items: ALL_CONCEPTS.map((id) => ({
            id: `moment-${s.id}-${id}`,
            label: CONCEPT_CONFIG[id].label,
            description: CONCEPT_CONFIG[id].thesis,
            options: [{ modeId: id, stateId: s.id, platform: mobile, platformLabel: 'M' }],
          })),
        },
      })),
    },
  ],

  artboard: [
    // Rows are moments so the four directions sit side by side under identical signals.
    // Only the first row carries each thesis — repeating it under all sixteen frames is noise.
    ...SCENARIOS.map((s, row) => ({
      id: s.id,
      divider: 'thick' as const,
      flowBadge: { label: row === 1 ? 'The row that matters' : 'Moment' },
      title: s.label,
      description: s.description,
      steps: ALL_CONCEPTS.map((id, i) => ({
        badge: String.fromCharCode(65 + i),
        title: CONCEPT_CONFIG[id].label,
        description: row === 0 ? CONCEPT_CONFIG[id].thesis : undefined,
        maxWidth: 380,
        // Alternatives, not steps. No arrow — A does not lead to B.
        arrowAfter: false as const,
        frames: [frame(id, s.id)],
      })),
    })),
    // The other cut of the same sixteen frames: one direction across the whole day. Hidden by
    // default because the board's job is the comparison above; this is for the read-through
    // once a direction is in the lead.
    ...ALL_CONCEPTS.map((id) => ({
      id: `walk-${id}`,
      divider: 'thick' as const,
      hiddenByDefault: true,
      revealLabel: `${CONCEPT_CONFIG[id].label} — across the day`,
      title: `${CONCEPT_CONFIG[id].label} — across the day`,
      description: CONCEPT_CONFIG[id].risk,
      steps: SCENARIOS.map((s, i) => ({
        badge: i + 1,
        title: s.label,
        arrowAfter: true,
        frames: [frame(id, s.id)],
      })),
    })),
  ],

  context: [
    { tone: 'info', title: 'What this board is deciding', items: [
      'How loud should the environment be about the read it has already made?',
      'Wednesday is the row that matters — the ordinary case is where restraint either works or reads as nothing.',
    ] },
    { tone: 'warn', title: 'Open questions (docs/BRIEF.md)', items: [
      'Which passive signals are allowed in, and where is the line between responsive and creepy?',
      'Is a yes/no enough for course correction, or should the environment ask?',
      'What is the mascot for — companion, mirror, or narrator?',
      'Where does a wrong read do harm, and how does this fail safe?',
    ] },
    { tone: 'neutral', title: 'What each direction costs', items: ALL_CONCEPTS.map((id) => `${CONCEPT_CONFIG[id].label} — ${CONCEPT_CONFIG[id].risk}`) },
    { tone: 'success', title: 'Every frame is real', items: [
      'Signals go through the real derive(); the real components render the result.',
      'A frame cannot claim behaviour the product does not have.',
      'Artboard frames are pointer-events-none, so a grid frame stays pinned to the scenario it is labelled with.',
    ] },
    { tone: 'info', title: 'How this runs', items: [
      'npm install && npm run dev — the board is the landing page, no other setup.',
      'The V3Artboard runtime is vendored in src/components/v3artboard; the engine, components and Root rules are unchanged.',
    ] },
  ],
})

export default function DailyOpenLab() {
  return <V3Artboard spec={SPEC} />
}
