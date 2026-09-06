import type { Signals } from '../engine/signals';
import type { EnvSpec } from '../engine/derive';
import { SCENARIOS } from '../engine/scenarios';

interface Props {
  signals: Signals; spec: EnvSpec; live: boolean; playing: boolean; scenarioId: string | null;
  patch: (p: Partial<Signals>) => void;
  select: (index: number) => void;
  setLive: (live: boolean) => void;
  setPlaying: (playing: boolean) => void;
}

function Slider({ label, value, min, max, step = 1, display, onChange, disabled }: {
  label: string; value: number; min: number; max: number; step?: number; display: string;
  onChange: (value: number) => void; disabled?: boolean;
}) {
  return <label className="sim-control"><span>{label}<output>{display}</output></span>
    <input type="range" aria-label={label} value={value} min={min} max={max} step={step} disabled={disabled} onChange={e => onChange(Number(e.target.value))} />
  </label>;
}

export default function SignalSimulator({ signals: s, spec, live, playing, scenarioId, patch, select, setLive, setPlaying }: Props) {
  return <aside className="simulator" aria-label="Signal simulator">
    <header><p className="sim-eyebrow">Spacetime / testing workspace</p><h1>Signal simulator</h1>
      <p>Change the inputs. Observe the environment.</p></header>
    <div className="sim-mode" role="group" aria-label="Signal source">
      <button aria-pressed={!live} onClick={() => setLive(false)}>Manual simulation</button>
      <button aria-pressed={live} onClick={() => setLive(true)}>Live browser + mock watch</button>
    </div>
    <p className="sim-note">{live ? 'Clock, idle and movement come from this browser. Heart rate drifts around 68 bpm; no watch is connected.' : 'Inputs stay fixed until you change them or play the scenarios. Moving the cursor will not affect the preview.'}</p>
    <section><div className="sim-section-title"><h2>Scenario sets</h2><span>{playing ? 'Playing · 5s per set' : scenarioId ? 'Preset' : 'Custom inputs'}</span></div>
      <div className="sim-presets">{SCENARIOS.map((scenario, i) => <button key={scenario.id} aria-pressed={scenarioId === scenario.id} title={scenario.description} onClick={() => select(i)}>{scenario.name}</button>)}</div>
      <p className="sim-note">{SCENARIOS.find(x => x.id === scenarioId)?.description ?? 'Adjust the controls to create your own signal combination.'}</p>
      <div className="sim-actions"><button onClick={() => setPlaying(!playing)}>{playing ? 'Pause scenarios' : 'Play scenarios'}</button><button onClick={() => select(0)}>Reset to morning</button></div>
    </section>
    <section><h2>Inputs</h2>
      <Slider label="Heart rate" value={s.heartRate} min={40} max={180} display={`${s.heartRate} bpm`} disabled={live} onChange={heartRate => patch({ heartRate })} />
      <Slider label="Time of day" value={s.hour} min={0} max={23} display={`${String(s.hour).padStart(2, '0')}:00`} disabled={live} onChange={hour => patch({ hour })} />
      <Slider label="Movement" value={s.motion} min={0} max={1} step={0.01} display={`${Math.round(s.motion * 100)}%`} disabled={live} onChange={motion => patch({ motion })} />
      <Slider label="Idle time" value={s.idleSeconds} min={0} max={Math.max(300, s.idleSeconds)} display={`${s.idleSeconds}s`} disabled={live} onChange={idleSeconds => patch({ idleSeconds })} />
      <label className="sim-control"><span>Mood<output>{s.mood === null ? 'Not rated' : `${s.mood} / 5`}</output></span>
        <select aria-label="Simulated mood" value={s.mood ?? ''} onChange={e => patch({ mood: e.target.value === '' ? null : Number(e.target.value) })}><option value="">Not rated</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n} — {['Very low','Low','Neutral','Good','Very good'][n-1]}</option>)}</select>
      </label>
      <label className="sim-control"><span>Objective</span><select aria-label="Simulated objective" value={s.objective} onChange={e => patch({ objective: e.target.value as Signals['objective'] })}>{['settle','focus','wander','root'].map(o => <option key={o} value={o}>{o}</option>)}</select></label>
      <Slider label="Feedback score" value={s.feedback} min={Math.min(-10, s.feedback)} max={Math.max(10, s.feedback)} display={`${s.feedback > 0 ? '+' : ''}${s.feedback}`} onChange={feedback => patch({ feedback })} />
    </section>
    <section><h2>Resulting specification</h2><p className="sim-note">Current rules, ready for us to refine.</p>
      <dl className="sim-results"><dt>State</dt><dd>{spec.buttons.state}</dd><dt>Valence / energy</dt><dd>{spec.valence.toFixed(2)} / {spec.arousal.toFixed(2)}</dd><dt>Expression</dt><dd>{spec.buttons.face.expression}</dd><dt>Shape</dt><dd>{spec.buttons.shape}</dd><dt>Animation</dt><dd>{spec.buttons.motion} · {spec.buttons.duration.toFixed(1)}s</dd><dt>Sound</dt><dd>{spec.buttons.sound.name} · {Math.round(spec.buttons.sound.frequency)} Hz</dd><dt>Canvas</dt><dd>Three interactive buttons</dd></dl>
      <details><summary>Why this result?</summary><ul>{spec.reasons.map(r => <li key={r}>{r}</li>)}</ul></details>
      <details><summary>Signal snapshot & full UI spec</summary><pre>{JSON.stringify({ signals: s, spec }, null, 2)}</pre></details>
    </section>
  </aside>;
}
