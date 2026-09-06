// Four ScreenModes, generated from CONCEPT_CONFIG. One concept = one mode; one scenario = one
// state. Frames come from the shared runtime (PhoneFrame), never rebuilt inline.
import { PhoneFrame, type ScreenMode } from '../../components/v3artboard';
import { ALL_CONCEPTS, CONCEPT_CONFIG, type ConceptId } from './mode-config';
import { ConceptScreen, } from './renderer';
import { SCENARIOS } from './scenarios';

function buildMode(id: ConceptId): ScreenMode {
  const cfg = CONCEPT_CONFIG[id];
  const screen = (stateId: string) => <PhoneFrame><ConceptScreen conceptId={id} stateId={stateId} /></PhoneFrame>;
  return {
    id,
    label: cfg.label,
    description: cfg.thesis,
    platforms: ['mobile'],
    states: SCENARIOS,
    // Viewer: live. Tap a mood, answer the mascot, switch objective — derive() re-runs.
    renderFrame: (state) => screen(state.id),
    // Artboard: inert, so a grid frame cannot drift off the scenario it is labelled with.
    renderArtboardFrame: (state) => <div className="pointer-events-none">{screen(state.id)}</div>,
    floatingNavLabel: (state) => `${cfg.label} · ${state.label}`,
  };
}

export const DAILY_OPEN_MODES: ScreenMode[] = ALL_CONCEPTS.map(buildMode);
