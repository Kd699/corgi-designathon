// Objective-driven components. Each is small and reads only what it needs from spec/signals.
import { useEffect, useState } from 'react';
import type { EnvSpec } from '../engine/derive';
import type { Signals } from '../engine/signals';
import { MAX_DEPTH, OPENING_QUESTION, depthOf, nextStep, type Turn } from '../rules/root.js';
import { mockNextQuestion } from '../rules/mock-questions';

type Patch = (p: Partial<Signals>) => void;

export function MoodRater({ signals, patch }: { signals: Signals; patch: Patch }) {
  const faces = ['1', '2', '3', '4', '5'];
  return (
    <section className="flex flex-col gap-2">
      <p className="text-xs uppercase tracking-wider opacity-60">How are you, right now?</p>
      <div className="flex gap-2">
        {faces.map((f, i) => (
          <button key={f} onClick={() => patch({ mood: i + 1 })}
            className="h-10 w-10 rounded-full border text-sm transition"
            style={{ borderColor: 'currentColor', opacity: signals.mood === i + 1 ? 1 : 0.5, background: signals.mood === i + 1 ? 'currentColor' : 'transparent' }}>
            <span style={{ mixBlendMode: 'difference', color: 'white' }}>{f}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function Breath() {
  return (
    <section className="flex items-center gap-4">
      <div className="h-16 w-16 rounded-full border-2" style={{ borderColor: 'currentColor', animation: 'breathe 6s ease-in-out infinite' }} />
      <p className="text-sm opacity-80">In for four. Out for six. Stay with the circle.</p>
    </section>
  );
}

export function FocusTimer() {
  const [left, setLeft] = useState(25 * 60);
  const [on, setOn] = useState(false);
  useEffect(() => { if (!on) return; const id = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000); return () => clearInterval(id); }, [on]);
  const mm = String(Math.floor(left / 60)).padStart(2, '0'); const ss = String(left % 60).padStart(2, '0');
  return (
    <section className="flex items-center gap-4">
      <span className="font-mono text-4xl tabular-nums">{mm}:{ss}</span>
      <button onClick={() => setOn(!on)} className="rounded-full border px-4 py-1.5 text-sm" style={{ borderColor: 'currentColor' }}>{on ? 'pause' : 'start'}</button>
      <button onClick={() => { setOn(false); setLeft(25 * 60); }} className="text-sm opacity-60">reset</button>
    </section>
  );
}

const PROMPTS = ['What did you notice today that nobody else did?', 'Name one thing you are avoiding.', 'What would you do with a free hour, no phone?', 'Who have you not spoken to in too long?'];
export function PromptCards() {
  const [i, setI] = useState(0);
  return (
    <section className="flex flex-col gap-3">
      <div className="rounded-2xl border p-5 text-lg leading-snug" style={{ borderColor: 'currentColor' }}>{PROMPTS[i % PROMPTS.length]}</div>
      <button onClick={() => setI(i + 1)} className="self-start text-sm opacity-70 underline underline-offset-4">another</button>
    </section>
  );
}

/** Root, ported from cbt-app. Same rules file; question source is an in-browser mock. */
export function RootFlow() {
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const step = nextStep(transcript);
  const depth = depthOf(transcript);
  useEffect(() => {
    if (step !== 'ask') return;
    if (transcript.length === 0) { setTranscript([{ role: 'q', text: OPENING_QUESTION }]); return; }
    const id = setTimeout(() => setTranscript((t) => [...t, { role: 'q', text: mockNextQuestion(t) }]), 600);
    return () => clearTimeout(id);
  }, [step, transcript]);
  const send = () => { const t = draft.trim(); if (!t || step !== 'await') return; setDraft(''); setTranscript((x) => [...x, { role: 'a', text: t }]); };
  return (
    <section className="flex flex-col gap-2">
      <p className="text-xs uppercase tracking-wider opacity-60">Root · depth {depth}/{MAX_DEPTH}</p>
      <ol className="flex max-h-72 flex-col gap-2 overflow-y-auto">
        {transcript.map((t, i) => (
          <li key={i} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${t.role === 'q' ? 'self-start bg-white/60 text-black' : 'self-end bg-black/70 text-white'}`}>{t.text}</li>
        ))}
        {step === 'done' && <li className="text-sm opacity-80">That is the root, {depth} questions down. <button className="underline" onClick={() => setTranscript([])}>again</button></li>}
      </ol>
      {step === 'await' && (
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Answer in your own words" className="flex-1 rounded-xl bg-white/70 px-3 py-2 text-sm text-black outline-none" />
          <button className="rounded-xl border px-3 text-sm" style={{ borderColor: 'currentColor' }}>send</button>
        </form>
      )}
    </section>
  );
}

export function SignalsPanel({ signals, spec, patch, watchTarget, setWatchTarget }: { signals: Signals; spec: EnvSpec; patch: Patch; watchTarget: number; setWatchTarget: (n: number) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <aside className="rounded-2xl border p-4 text-xs" style={{ borderColor: 'currentColor', opacity: 0.9 }}>
      <button onClick={() => setOpen(!open)} className="flex w-full justify-between font-medium"><span>Signals</span><span>{open ? '-' : '+'}</span></button>
      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span>watch heart rate <b>{signals.heartRate}</b> bpm <em className="opacity-60">(simulated - drag)</em></span>
            <input type="range" min={50} max={130} value={watchTarget} onChange={(e) => setWatchTarget(Number(e.target.value))} />
          </label>
          <div>motion <b>{signals.motion.toFixed(2)}</b> <em className="opacity-60">(cursor velocity / DeviceMotion)</em></div>
          <div>hour <b>{signals.hour}</b> · idle <b>{signals.idleSeconds}s</b></div>
          <div>mood <b>{signals.mood ?? '-'}</b> · feedback <b>{signals.feedback >= 0 ? '+' : ''}{signals.feedback}</b></div>
          <div className="flex items-center gap-2">
            <span>did the environment get it right?</span>
            <button onClick={() => patch({ feedback: signals.feedback + 1 })} className="rounded border px-2" style={{ borderColor: 'currentColor' }}>yes</button>
            <button onClick={() => patch({ feedback: signals.feedback - 1 })} className="rounded border px-2" style={{ borderColor: 'currentColor' }}>no</button>
          </div>
          <div className="border-t pt-2 opacity-70" style={{ borderColor: 'currentColor' }}>
            <div>valence {spec.valence.toFixed(2)} · arousal {spec.arousal.toFixed(2)} · texture {spec.texture} · mascot {spec.mascot.state}</div>
            <ul className="mt-1 list-disc pl-4">{spec.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        </div>
      )}
    </aside>
  );
}
