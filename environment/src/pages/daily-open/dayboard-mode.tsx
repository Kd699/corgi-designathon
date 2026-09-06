/* The dayboard as a board mode.
 *
 * It was built as a standalone route first, which was the wrong instinct: every other
 * surface in this project is a ScreenMode with states, a sidebar entry and artboard frames,
 * and a surface that lives outside that can't be compared with anything, linked to by frame,
 * or annotated. It is a mode now. `#/day` still opens it full-screen for demoing — the route
 * and the mode render the same component, so there is no second copy to drift.
 *
 * States are accounts of a day, not UI states. Each frame runs its account through the same
 * local parser the live page uses, so a board frame is the real product with a known input
 * rather than a picture of it.
 */
import { DesktopFrame, type ScreenMode, type StateConfig } from '../../components/v3artboard';
import DayboardPage, { PROMPTS } from '../DayboardPage';

export const DAYBOARD_ID = 'dayboard';

export const DAYBOARD_CONFIG = {
  label: 'D1 · Dayboard',
  thesis: 'You say what happened; the board decides which widgets the day earned and in what order. The composition is the output — a quiet day and a wrecked one should not produce the same grid.',
  risk: 'A dashboard by another name. If the widgets are always the same ten in the same order, nothing here is doing the work the premise claims.',
};

/** Each state is an account of a day. The empty one is the first thing anyone actually sees. */
const ACCOUNTS: { state: StateConfig; seed: string }[] = [
  { state: { id: 'blank', label: 'Before you say anything', description: 'The board at rest — no widgets, just the ask.' }, seed: '' },
  { state: { id: 'full', label: 'A full day', description: 'Run, standup, shipped work, lunch with someone, stuck all afternoon.' }, seed: PROMPTS[0] },
  { state: { id: 'quiet', label: 'A quiet day', description: 'Barely anything happened, and the board must not invent.' }, seed: PROMPTS[1] },
  { state: { id: 'rough', label: 'A rough day', description: 'Bad sleep, back-to-back, wound up by evening.' }, seed: PROMPTS[2] },
];

export const DAYBOARD_STATES: StateConfig[] = ACCOUNTS.map((a) => a.state);

const seedFor = (stateId: string) => ACCOUNTS.find((a) => a.state.id === stateId)?.seed ?? '';

export const DAYBOARD_MODE: ScreenMode = {
  id: DAYBOARD_ID,
  label: DAYBOARD_CONFIG.label,
  concept: DAYBOARD_CONFIG.label,
  description: DAYBOARD_CONFIG.thesis,
  platforms: ['web'],
  states: DAYBOARD_STATES,
  // Viewer: the live page, composer and all — type into it and the widgets move.
  renderFrame: (state) => (
    <DesktopFrame url="spacetime.app/day" height={900}>
      <DayboardPage seed={seedFor(state.id)} />
    </DesktopFrame>
  ),
  // Artboard: the same page with the composer dropped and pointer events off, so a frame
  // shows the composition its label claims and cannot be typed into by accident.
  renderArtboardFrame: (state) => (
    <DesktopFrame url="spacetime.app/day" height={900}>
      <div className="pointer-events-none h-full"><DayboardPage seed={seedFor(state.id)} frozen /></div>
    </DesktopFrame>
  ),
  floatingNavLabel: (state) => `${DAYBOARD_CONFIG.label} · ${state.label}`,
};
