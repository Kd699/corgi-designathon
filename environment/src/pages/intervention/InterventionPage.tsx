/* The intervention: W1b's stage, running a CBT protocol on your voice.
 *
 * Display records — you talk about your day and the widgets fill in afterwards. This side
 * acts on you while the sentence is still in your mouth: the sky behind you moves toward
 * what the words are, the character in front wears the read, and the emoji are the words
 * themselves, surfacing as you say them. That is the whole difference between the two
 * paradigms, and it is why nothing in this loop is allowed to call an API — a reaction that
 * arrives a network round-trip later is a different product.
 *
 * The stage is W1b's, deliberately: full-bleed Wisps sky behind, motif character in front,
 * one thing centred. What W1b puts in the middle is a card about a day already lived; what
 * this puts there is the step you are in. W1b itself is untouched — the two get compared.
 *
 * The page derives nothing about a step. `PROTOCOL` carries every axis a step can move and
 * `reactTo()` carries every axis the words can move; this file reads those fields and
 * arranges them. There is no step id anywhere below this comment.
 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_SIGNALS } from '../../engine/signals';
import MotifMascot from '../daily-open/MotifMascot';
import { deriveMotif } from '../daily-open/motif';
import '../daily-open/motif.css';
import { PROTOCOL } from './protocol';
import { LEXICON_SIZE, MASCOT_DRIVE, reactTo, type Reaction } from './lexicon';
import SkyBoundary from './sky-boundary';
import { useTranscript } from './voice';
import './intervention.css';

/* Same seam rule as W1b's: the sky is three.js + R3F and must not reach the main chunk. */
const InterventionSky = lazy(() => import('./intervention-sky'));

/** Emoji, once surfaced, stay put for the rest of the step.
 *
 * Interim speech results are rewritten constantly — Chrome will hand you "I'm worried", then
 * "I'm worried about" and sometimes a wholly re-heard clause. Rendering each pass directly
 * makes the field strobe. Holding first-seen order and only ever appending means a glyph
 * arrives once and then settles, which is what was asked for and also what reads as the room
 * remembering what you said. */
function useSettledEmoji(reaction: Reaction, stepKey: string) {
  const [glyphs, setGlyphs] = useState<Reaction['emoji']>([]);
  const seen = useRef(new Set<string>());

  useEffect(() => { seen.current = new Set(); setGlyphs([]); }, [stepKey]);

  useEffect(() => {
    const fresh = reaction.emoji.filter((e) => !seen.current.has(e.glyph));
    if (!fresh.length) return;
    for (const e of fresh) seen.current.add(e.glyph);
    setGlyphs((prev) => [...prev, ...fresh]);
  }, [reaction]);

  return glyphs;
}

export default function InterventionPage() {
  const [index, setIndex] = useState(0);
  const step = PROTOCOL[index];
  const source = useTranscript();
  const { clear } = source;

  // One pass, on every keystroke and every interim result. Local, so it costs nothing.
  const reaction = useMemo(() => reactTo(source.transcript, step), [source.transcript, step]);
  const emoji = useSettledEmoji(reaction, step.id);

  // Each step listens fresh — the previous step's words are its own, not this one's evidence.
  useEffect(() => { clear(); }, [index, clear]);

  /* The character is derived, not set: deriveMotif() owns what a face does, and handing it
   * the drive coordinates for the expression the words asked for is how the words reach it
   * without this file second-guessing the derive. Measured arousal moves inside the band. */
  const drive = MASCOT_DRIVE[reaction.mascot];
  const [low, high] = drive.arousalBand;
  const arousal = Math.min(high, Math.max(low, drive.arousal + (reaction.arousal - drive.arousal) * 0.4));
  const motif = useMemo(
    () => deriveMotif({ ...DEFAULT_SIGNALS, idleSeconds: drive.idleSeconds }, drive.valence, arousal),
    [drive, arousal],
  );

  const spoken = source.transcript.trim();

  return (
    <div
      className="intervention"
      data-step={step.id}
      data-sky={reaction.sky}
      data-mascot={reaction.mascot}
      data-tone={reaction.tone ?? 'none'}
    >
      {/* The sky owns the frame. Its fallback is flat rather than animated: a spinner over a
          protocol step would be the one moving thing in a surface about slowing down. */}
      <div className="intervention-sky-layer">
        <SkyBoundary fallback={<div className="intervention-sky-fallback" data-testid="sky-fallback" />}>
        <Suspense fallback={<div className="intervention-sky-fallback" />}>
          <InterventionSky
            sky={reaction.sky}
            mascot={reaction.mascot}
            speed={reaction.speed}
            fullness={reaction.fullness}
            intensity={reaction.intensity}
          />
        </Suspense>
        </SkyBoundary>
      </div>

      <div className="intervention-stage">
        <div className="intervention-centre">
          <div className="intervention-mascot"><MotifMascot motif={motif} size={116} /></div>

          <div className="intervention-panel">
            <p className="intervention-step-name">{step.title}</p>
            <h1 className="intervention-prompt">{step.prompt}</h1>

            <div className="intervention-field" data-testid="emoji-field" aria-live="polite">
              {emoji.map((e) => (
                <span key={e.glyph} className="intervention-emoji" title={`${e.word} · ${e.group}`}>
                  {e.glyph}
                </span>
              ))}
              {!emoji.length && <span className="intervention-field-empty">listening for {step.listeningFor}</span>}
            </div>

            <p className="intervention-transcript" data-testid="transcript">{spoken || ' '}</p>

            {/* Voice and keyboard are two sources into one pipe. The input is not a
                convenience: a microphone cannot be driven headlessly, so it is the only
                thing that makes any claim on this page provable. */}
            <div className="intervention-controls">
              <button
                type="button"
                className="intervention-mic"
                data-testid="mic"
                data-listening={source.listening}
                onClick={() => (source.listening ? source.stop() : source.start())}
              >
                {source.listening ? 'Stop listening' : 'Speak'}
              </button>
              {/* Keyed on the step so moving on empties the box the same way it empties the
                  transcript — uncontrolled, because the value's home is the transcript
                  source, not this element. */}
              <input
                key={step.id}
                className="intervention-input"
                data-testid="intervention-input"
                placeholder={`or type it — ${step.listeningFor}`}
                onChange={(e) => source.type(e.target.value)}
              />
            </div>

            {source.status.kind !== 'idle' && source.status.kind !== 'listening' && (
              <p className="intervention-status" data-testid="voice-status">{source.status.message}</p>
            )}

            <p className="intervention-read" data-testid="read">
              {reaction.tone
                ? `heard ${reaction.tone} · sky ${reaction.sky} · ${reaction.mascot}`
                : `sky ${reaction.sky} · ${reaction.mascot} · nothing read yet`}
            </p>
          </div>
        </div>

        {/* The rail replaces W1b's pager: same job, but the steps are named, because in a
            protocol where you are is the information. Rendered straight off PROTOCOL. */}
        <nav className="intervention-rail" aria-label="protocol steps">
          {PROTOCOL.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className="intervention-rail-step"
              data-state={i === index ? 'current' : i < index ? 'done' : 'ahead'}
              data-testid={`rail-${s.id}`}
              onClick={() => setIndex(i)}
            >
              <span className="intervention-rail-dot" />
              {s.title}
            </button>
          ))}
          <button
            type="button"
            className="intervention-next"
            data-testid="next"
            disabled={index === PROTOCOL.length - 1}
            onClick={() => setIndex((i) => Math.min(PROTOCOL.length - 1, i + 1))}
          >
            Next
          </button>
        </nav>

        <p className="intervention-footnote">
          {LEXICON_SIZE.emoji} words, {LEXICON_SIZE.tones} tone families, all local — the sky moves on the
          same frame you speak.
        </p>
      </div>
    </div>
  );
}
