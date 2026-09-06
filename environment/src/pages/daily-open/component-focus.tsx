/* Components tab (E9) for the daily-open lab.
 *
 * The corgi runtime this lab came from had no componentFocus, so the real components could
 * only ever be seen inside a whole screen. Here each one gets its own frame, driven by the
 * same derive() the screens use — a component in this tab cannot show behaviour the product
 * does not have.
 *
 * Every wrapper owns the state its component needs and nothing else; none of them branch on
 * a concept id, so adding a direction never touches this file.
 */
import { useCallback, useMemo, useState } from 'react';
import type { ComponentFocusConfig } from '../../components/v3artboard';
import { derive } from '../../engine/derive';
import type { Signals } from '../../engine/signals';
import Mascot from '../../ui/Mascot';
import { Breath, FocusTimer, MoodRater, PromptCards, RootFlow, SignalsPanel } from '../../ui/components';
import { ALL_CONCEPTS } from './mode-config';
import { SCENARIOS, signalsFor } from './scenarios';

/** Components read colour off the surface via currentColor, so each frame carries a surface. */
function Swatch({ stateId, children }: { stateId: string; children: React.ReactNode }) {
  const spec = useMemo(() => derive(signalsFor(stateId)), [stateId]);
  return (
    <div
      className={`tex-${spec.texture} w-[358px] rounded-2xl p-5`}
      style={{
        background: `linear-gradient(160deg, ${spec.palette.from}, ${spec.palette.to})`,
        color: spec.palette.ink,
        fontSize: spec.type.size,
        fontWeight: spec.type.weight,
        letterSpacing: spec.type.tracking,
      }}
    >
      {children}
    </div>
  );
}

/** Live signals seeded from a scenario — the same seeding the viewer frames use. */
function useScenarioSignals(stateId: string) {
  const [signals, setSignals] = useState<Signals>(() => signalsFor(stateId));
  const patch = useCallback((p: Partial<Signals>) => setSignals((s) => ({ ...s, ...p })), []);
  return { signals, patch, spec: useMemo(() => derive(signals), [signals]) };
}

function MascotDemo({ stateId }: { stateId: string }) {
  const { spec } = useScenarioSignals(stateId);
  return <Swatch stateId={stateId}><Mascot spec={spec} /></Swatch>;
}

function MoodRaterDemo({ stateId }: { stateId: string }) {
  const { signals, patch } = useScenarioSignals(stateId);
  return <Swatch stateId={stateId}><MoodRater signals={signals} patch={patch} /></Swatch>;
}

function SignalsPanelDemo({ stateId }: { stateId: string }) {
  const { signals, patch, spec } = useScenarioSignals(stateId);
  const [watchTarget, setWatchTarget] = useState(signals.heartRate);
  return (
    <Swatch stateId={stateId}>
      <SignalsPanel signals={signals} spec={spec} patch={patch} watchTarget={watchTarget} setWatchTarget={setWatchTarget} />
    </Swatch>
  );
}

/** Where a component shows up on the board. Mood rater / mascot are in every direction. */
const usedInEvery = (stateId: string) =>
  ALL_CONCEPTS.map((modeId) => ({ modeId, stateId, platform: 'mobile' as const }));

/** One state per scenario, so a component can be judged against every mood the palette produces. */
const perScenario = (render: (stateId: string) => React.ReactNode) =>
  SCENARIOS.map((s) => ({ label: s.label, render: () => render(s.id) }));

export const DAILY_OPEN_COMPONENTS: ComponentFocusConfig[] = [
  {
    id: 'mascot',
    label: 'Mascot',
    level: 'atom',
    states: perScenario((stateId) => <MascotDemo stateId={stateId} />),
    usedIn: usedInEvery('monday-wound-up'),
  },
  {
    id: 'mood-rater',
    label: 'Mood rater',
    level: 'molecule',
    states: perScenario((stateId) => <MoodRaterDemo stateId={stateId} />),
    usedIn: usedInEvery('wednesday-steady'),
  },
  {
    id: 'breath',
    label: 'Breath',
    level: 'molecule',
    states: perScenario((stateId) => <Swatch stateId={stateId}><Breath /></Swatch>),
    usedIn: [{ modeId: 'stated', stateId: 'thursday-heavy', platform: 'mobile' }],
  },
  {
    id: 'focus-timer',
    label: 'Focus timer',
    level: 'molecule',
    states: perScenario((stateId) => <Swatch stateId={stateId}><FocusTimer /></Swatch>),
    usedIn: [{ modeId: 'stated', stateId: 'monday-wound-up', platform: 'mobile' }],
  },
  {
    id: 'prompt-cards',
    label: 'Prompt cards',
    level: 'molecule',
    states: perScenario((stateId) => <Swatch stateId={stateId}><PromptCards /></Swatch>),
    usedIn: [{ modeId: 'stated', stateId: 'sunday-light', platform: 'mobile' }],
  },
  {
    id: 'root-flow',
    label: 'Root (recursive questioning)',
    level: 'organism',
    states: perScenario((stateId) => <Swatch stateId={stateId}><RootFlow /></Swatch>),
    usedIn: [{ modeId: 'stated', stateId: 'thursday-heavy', platform: 'mobile' }],
  },
  {
    id: 'signals-panel',
    label: 'Signals panel (debug)',
    level: 'organism',
    states: perScenario((stateId) => <SignalsPanelDemo stateId={stateId} />),
    usedIn: [],
  },
];
