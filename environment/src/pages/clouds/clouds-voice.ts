// The voice session behind the motif: click starts it, click ends it.
// While it runs, the Web Speech API streams a live transcript, every new
// keyword family in WIDGET_TRIGGERS lands its widget (with a chime), the
// spoken emotion words steer the sky, and the mic is analysed at frame
// rate into CSS vars on a host element — --cm-level (overall loudness) and
// --cm-b0…--cm-b4 (five speech bands, low to high) — so the motif's bars
// ride the actual shape of your voice, not one number. Typing goes through
// the same matcher (typed()), so the widgets answer text too. When the
// session ends, onEnd gets the whole transcript for the read
// (clouds-session.ts). Sounds are the vendored procedural-sounds recipes
// (clouds-sounds.ts).

import { useCallback, useEffect, useRef, useState } from "react";
import { getAudioContext, playVoiceStart, playVoiceEnd, playWidgetAppear } from "./clouds-sounds";
import { WIDGET_TRIGGERS, type WidgetKind } from "./clouds-widgets";
import type { SkyPresetName } from "./sky";

export type VoiceTheme = "happy" | "anxious" | "sad" | "calm";

// Emotional weather: the themes you speak steer the sky. The MOST RECENT
// emotion word in the transcript wins, so the sky follows the story as it
// turns — happy opens a clear midday blue, anxious broods into dusk, sad
// settles into night, calm eases into sunset.
const THEME_SKIES: { theme: VoiceTheme; sky: SkyPresetName; rx: RegExp }[] = [
  { theme: "happy", sky: "Midday", rx: /\b(happy|happiness|glad|joy|joyful|great|amazing|wonderful|excited|exciting|fantastic|love|loved)\b/gi },
  { theme: "anxious", sky: "Dusk", rx: /\b(anxious|anxiety|stress|stressed|nervous|worried|worry|worrying|tense|overwhelmed|panic|panicking|scared)\b/gi },
  { theme: "sad", sky: "Night", rx: /\b(sad|sadness|unhappy|depressed|depressing|down|lonely|upset|miserable|crying|cried|grief)\b/gi },
  { theme: "calm", sky: "Sunset", rx: /\b(calm|calmer|relaxed|relaxing|peaceful|serene|settled|chill|chilled)\b/gi },
];

// Five bands across the speech range, in Hz. Bar order on the face is
// [b3, b1, b0, b2, b4] — fundamentals in the middle, air at the edges —
// so the pattern moves like a voice, not like one level copied five times.
const BANDS: [number, number][] = [
  [80, 250],
  [250, 500],
  [500, 1000],
  [1000, 2000],
  [2000, 4200],
];
// Highs carry less energy; lift them so the outer bars still speak.
const BAND_LIFT = [1, 1.15, 1.35, 1.7, 2.2];

// Chrome ships this prefixed and the DOM lib omits it entirely.
type SRResult = ArrayLike<{ transcript: string }> & { isFinal: boolean };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<SRResult> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onaudiostart: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

function makeRecognition(): SpeechRecognitionLike | null {
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | undefined;
  return Ctor ? new Ctor() : null;
}

export type VoiceOptions = {
  /** A spoken emotion theme should recolour the sky. */
  onTheme?: (sky: SkyPresetName) => void;
  /** The session ended (click, or a typed line): here is everything said. */
  onEnd?: (transcript: string, widgets: WidgetKind[]) => void;
  /** The session started — anything shown from the last one should clear. */
  onStart?: () => void;
};

export function useVoice({ onTheme, onEnd, onStart }: VoiceOptions = {}) {
  const [listening, setListening] = useState(false);
  /** Finalised utterances, one bubble each. */
  const [chunks, setChunks] = useState<string[]>([]);
  /** The utterance still forming — the live bubble at the stream's end. */
  const [interim, setInterim] = useState("");
  const [widgets, setWidgets] = useState<WidgetKind[]>([]);
  /** The emotion theme currently in the air — morphs the voice shape. */
  const [theme, setTheme] = useState<VoiceTheme | null>(null);
  const [supported, setSupported] = useState(true);
  /** True once the recogniser is actually capturing — words land from
   *  here on. Before this, speech is lost to the connection window, so
   *  the UI should say "connecting" rather than invite talk. */
  const [ready, setReady] = useState(false);

  const listeningRef = useRef(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  /** Where the level vars land: the motif wrap, so the bars can read them. */
  const levelHostRef = useRef<HTMLDivElement | null>(null);
  const matchedRef = useRef<Set<WidgetKind>>(new Set());
  const widgetsRef = useRef<WidgetKind[]>([]);
  const themeRef = useRef<string | null>(null);
  /** Speech chunks + typed lines, in order — the transcript onEnd hands over. */
  const spokenRef = useRef<string[]>([]);
  const typedRef = useRef<string[]>([]);
  const interimRef = useRef("");
  const callbacks = useRef({ onTheme, onEnd, onStart });
  callbacks.current = { onTheme, onEnd, onStart };

  const clearLevels = () => {
    const host = levelHostRef.current;
    if (!host) return;
    host.style.setProperty("--cm-level", "0");
    for (let i = 0; i < 5; i++) host.style.setProperty(`--cm-b${i}`, "0");
  };

  const stopInternals = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    // abort(), not stop(): stop() waits to deliver a last result, and its
    // onend would try to restart a session we have already left.
    try {
      rec?.abort();
    } catch {
      /* already gone */
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    cancelAnimationFrame(rafRef.current);
    clearLevels();
  }, []);

  /** One matcher for speech and typing: widgets land on first mention,
   *  the latest emotion word sets the sky. */
  const ingest = useCallback((all: string) => {
    for (const kind of Object.keys(WIDGET_TRIGGERS) as WidgetKind[]) {
      if (!matchedRef.current.has(kind) && WIDGET_TRIGGERS[kind].test(all)) {
        matchedRef.current.add(kind);
        widgetsRef.current = [...widgetsRef.current, kind];
        setWidgets(widgetsRef.current);
        playWidgetAppear();
      }
    }
    let best: { theme: VoiceTheme; sky: SkyPresetName; at: number } | null = null;
    for (const t of THEME_SKIES) {
      t.rx.lastIndex = 0;
      let m: RegExpExecArray | null;
      let last = -1;
      while ((m = t.rx.exec(all))) last = m.index;
      if (last >= 0 && (!best || last > best.at)) best = { theme: t.theme, sky: t.sky, at: last };
    }
    if (best && best.theme !== themeRef.current) {
      themeRef.current = best.theme;
      setTheme(best.theme);
      callbacks.current.onTheme?.(best.sky);
    }
  }, []);

  const publish = () => {
    // Typed lines sit after the speech so far; the interim tail stays live.
    setChunks([...spokenRef.current, ...typedRef.current]);
    setInterim(interimRef.current);
  };

  const reset = () => {
    spokenRef.current = [];
    typedRef.current = [];
    interimRef.current = "";
    widgetsRef.current = [];
    matchedRef.current = new Set();
    themeRef.current = null;
    setTheme(null);
    setChunks([]);
    setInterim("");
    setWidgets([]);
  };

  const transcript = () =>
    [...spokenRef.current, ...typedRef.current, interimRef.current].filter(Boolean).join(" ").trim();

  const start = useCallback(async () => {
    listeningRef.current = true;
    setListening(true);
    setReady(false);

    // The recogniser goes FIRST: its start() opens a connection to the
    // speech service and nothing said before that lands. Everything
    // else in this function can happen behind it.
    const rec = makeRecognition();
    setSupported(rec !== null);
    if (rec) {
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = navigator.language || "en-US";
      rec.onaudiostart = () => setReady(true);
      rec.onresult = (e) => {
        // Chunking is the recogniser's own utterance segmentation: each
        // finalised result is a settled bubble, the interim tail is the
        // live one still rewriting itself.
        const finals: string[] = [];
        let live = "";
        for (const r of Array.from(e.results)) {
          const text = r[0].transcript.trim();
          if (!text) continue;
          if (r.isFinal) finals.push(text);
          else live = live ? `${live} ${text}` : text;
        }
        spokenRef.current = finals;
        interimRef.current = live;
        publish();
        ingest(transcript());
      };
      // Chrome raises no-speech / aborted / network as errors and then
      // ends; those just restart below. A permission refusal must NOT
      // restart — that is the loop that spams the console.
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          setSupported(false);
          if (recRef.current === rec) recRef.current = null;
        }
      };
      // Chrome ends recognition after a stretch of silence; while the
      // session is ours, just start it again.
      rec.onend = () => {
        if (listeningRef.current && recRef.current === rec) {
          try {
            rec.start();
          } catch {
            /* already running */
          }
        }
      };
      recRef.current = rec;
      try {
        rec.start();
      } catch {
        setSupported(false);
      }
    }

    reset();
    callbacks.current.onStart?.();
    playVoiceStart();

    // The level meter is a separate mic tap: an FFT per frame, five band
    // energies plus overall RMS, each auto-gained against a slow-decaying
    // peak so a quiet speaker fills the bars and a loud one doesn't pin
    // them. Instant attack, quick release — the bars must FOLLOW speech.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!listeningRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const ctx = getAudioContext();
      if (ctx.state === "suspended") void ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.35;
      source.connect(analyser);
      const time = new Float32Array(analyser.fftSize);
      const freq = new Uint8Array(analyser.frequencyBinCount);
      const binHz = ctx.sampleRate / analyser.fftSize;
      const bins = BANDS.map(([lo, hi]) => [Math.max(1, Math.floor(lo / binHz)), Math.min(freq.length - 1, Math.ceil(hi / binHz))]);
      const shown = [0, 0, 0, 0, 0];
      let level = 0;
      let peak = 0.05;
      const tick = () => {
        analyser.getFloatTimeDomainData(time);
        analyser.getByteFrequencyData(freq);
        let sum = 0;
        for (let i = 0; i < time.length; i++) sum += time[i] * time[i];
        const rms = Math.sqrt(sum / time.length);
        // Noise gate, then auto-gain: the peak remembers the loudest
        // recent moment and forgets it over ~3s.
        const gated = rms < 0.004 ? 0 : rms;
        peak = Math.max(peak * 0.996, gated, 0.02);
        const target = Math.min(1, (gated / peak) * 0.95);
        level = target > level ? target : level * 0.8;
        const host = levelHostRef.current;
        if (host) {
          host.style.setProperty("--cm-level", level.toFixed(3));
          for (let b = 0; b < 5; b++) {
            const [lo, hi] = bins[b];
            let acc = 0;
            for (let i = lo; i <= hi; i++) acc += freq[i];
            const energy = (acc / Math.max(1, hi - lo + 1) / 255) * BAND_LIFT[b];
            // Band energy rides the same gate/gain as the level, so silence
            // is flat and speech fills the range.
            const t = gated === 0 ? 0 : Math.min(1, energy * energy * 2.6 * (0.6 + target * 0.8));
            shown[b] = t > shown[b] ? t : shown[b] * 0.78;
            host.style.setProperty(`--cm-b${b}`, shown[b].toFixed(3));
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      // Mic denied: the bars idle at their resting height; the transcript
      // (which asks for the mic on its own) may still be running.
    }
  }, [ingest]);

  const stop = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    setReady(false);
    playVoiceEnd();
    stopInternals();
    // The interim tail is part of what you said — settle it before handing over.
    if (interimRef.current) {
      spokenRef.current = [...spokenRef.current, interimRef.current];
      interimRef.current = "";
      publish();
    }
    callbacks.current.onEnd?.(transcript(), widgetsRef.current);
  }, [stopInternals]);

  const toggle = useCallback(() => {
    if (listeningRef.current) stop();
    else void start();
  }, [start, stop]);

  /** A typed line. Mid-session it joins the stream (widgets and sky answer
   *  it the same way); on its own it IS the session — one bubble, the
   *  widgets it names, and straight on to the read. */
  const typed = useCallback(
    (text: string) => {
      const line = text.trim();
      if (!line) return;
      if (listeningRef.current) {
        typedRef.current = [...typedRef.current, line];
        publish();
        ingest(transcript());
        return;
      }
      reset();
      callbacks.current.onStart?.();
      typedRef.current = [line];
      publish();
      ingest(line);
      callbacks.current.onEnd?.(line, widgetsRef.current);
    },
    [ingest]
  );

  useEffect(() => {
    return () => {
      listeningRef.current = false;
      stopInternals();
    };
  }, [stopInternals]);

  return { listening, chunks, interim, widgets, theme, supported, ready, toggle, typed, levelHostRef };
}
