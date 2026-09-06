// Four ScreenModes, generated from CONCEPT_CONFIG. One concept = one mode; one scenario = one
// state. Frames come from the shared runtime (PhoneFrame), never rebuilt inline.
import { PhoneFrame, type ScreenMode } from '../../components/v3artboard';
import { ALL_CONCEPTS, CONCEPT_CONFIG, type ConceptId } from './mode-config';
import { ConceptScreen } from './renderer';
import { SCENARIOS } from './scenarios';

function buildMode(id: ConceptId): ScreenMode {
  const cfg = CONCEPT_CONFIG[id];
  // PhoneFrame is a flex column, so the screen needs flex-1/min-h-0 to actually fill the
  // device height — without it the surface collapses to its content and the frame shows
  // dead space under it.
  const screen = (stateId: string, grow?: boolean) => (
    <PhoneFrame grow={grow}>
      <div className="flex min-h-0 flex-1 flex-col">
        <ConceptScreen conceptId={id} stateId={stateId} />
      </div>
    </PhoneFrame>
  );
  return {
    id,
    label: cfg.label,
    concept: cfg.label,
    description: cfg.thesis,
    platforms: ['mobile'],
    states: SCENARIOS,
    // Viewer: live. Tap a mood, answer the mascot, switch objective — derive() re-runs.
    renderFrame: (state) => screen(state.id),
    // Artboard: inert, so a grid frame cannot drift off the scenario it is labelled with.
    // `grow` is threaded from the per-frame fitHeight config by the runtime.
    renderArtboardFrame: (state, _platform, opts) => (
      <div className="pointer-events-none">{screen(state.id, opts?.grow)}</div>
    ),
    floatingNavLabel: (state) => `${cfg.label} · ${state.label}`,
  };
}

export const DAILY_OPEN_MODES: ScreenMode[] = ALL_CONCEPTS.map(buildMode);
