// The environment shell. Signals in -> derive() -> spec -> render. Nothing here decides how it looks.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { derive } from './engine/derive';
import { type Signals } from './engine/signals';
import { SCENARIOS } from './engine/scenarios';
import SignalSimulator from './ui/SignalSimulator';
import { useClockAndIdle, useMotion, useSimWatch } from './engine/sources';
import ButtonCanvas from './ui/ButtonCanvas';

export default function App() {
  const [signals, setSignals] = useState<Signals>({ ...SCENARIOS[0].signals });
  const [live, setLiveState] = useState(false);
  const [playing, setPlayingState] = useState(false);
  const [scenarioIndex, setScenarioIndex] = useState<number | null>(0);
  const sourcePatch = useCallback((p: Partial<Signals>) => setSignals(s => ({ ...s, ...p })), []);
  const patch = useCallback((p: Partial<Signals>) => {
    setPlayingState(false);
    setScenarioIndex(null);
    sourcePatch(p);
  }, [sourcePatch]);
  const select = (index: number) => {
    setLiveState(false);
    setPlayingState(false);
    setScenarioIndex(index);
    setSignals({ ...SCENARIOS[index].signals });
  };
  const setLive = (value: boolean) => {
    setPlayingState(false);
    setScenarioIndex(null);
    setLiveState(value);
  };
  const setPlaying = (value: boolean) => {
    setLiveState(false);
    if (value && scenarioIndex === null) {
      setScenarioIndex(0);
      setSignals({ ...SCENARIOS[0].signals });
    }
    setPlayingState(value);
  };
  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => {
      const next = ((scenarioIndex ?? -1) + 1) % SCENARIOS.length;
      setScenarioIndex(next);
      setSignals({ ...SCENARIOS[next].signals });
    }, 5000);
    return () => clearTimeout(id);
  }, [playing, scenarioIndex]);
  useSimWatch(68, sourcePatch, live);
  useMotion(sourcePatch, live);
  useClockAndIdle(sourcePatch, live);

  const spec = useMemo(() => derive(signals), [signals]);

  return (
    <main className="simulation-workspace">
      <SignalSimulator signals={signals} spec={spec} live={live} playing={playing} scenarioId={scenarioIndex === null ? null : SCENARIOS[scenarioIndex].id} patch={patch} select={select} setLive={setLive} setPlaying={setPlaying} />
      <div className="simulation-preview">
        <ButtonCanvas spec={spec.buttons} />
      </div>
    </main>
  );
}
