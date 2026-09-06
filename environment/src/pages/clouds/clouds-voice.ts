// The voice session behind the motif: click starts it, click ends it.
// While it runs, the Web Speech API streams a live transcript, every new
// keyword family in WIDGET_TRIGGERS lands its widget (with a chime), and
// the mic level is written onto a host element as --cm-level so the
// motif's voice bars ride the actual signal. Sounds are the vendored
// procedural-sounds recipes (clouds-sounds.ts).

import { useCallback, useEffect, useRef, useState } from "react";
import { getAudioContext, playVoiceStart, playVoiceEnd, playWidgetAppear } from "./clouds-sounds";
import { WIDGET_TRIGGERS, type WidgetKind } from "./clouds-widgets";

// Chrome ships this prefixed and the DOM lib omits it entirely.
type SRResult = ArrayLike<{ transcript: string }> & { isFinal: boolean };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<SRResult> }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

function makeRecognition(): SpeechRecognitionLike | null {
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | undefined;
  return Ctor ? new Ctor() : null;
}

export function useVoice() {
  const [listening, setListening] = useState(false);
  /** Finalised utterances, one bubble each. */
  const [chunks, setChunks] = useState<string[]>([]);
  /** The utterance still forming — the live bubble at the stream's end. */
  const [interim, setInterim] = useState("");
  const [widgets, setWidgets] = useState<WidgetKind[]>([]);
  const [supported, setSupported] = useState(true);

  const listeningRef = useRef(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  /** Where --cm-level lands: the motif wrap, so the bars can read it. */
  const levelHostRef = useRef<HTMLDivElement | null>(null);
  const matchedRef = useRef<Set<WidgetKind>>(new Set());

  const stopInternals = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    cancelAnimationFrame(rafRef.current);
    levelHostRef.current?.style.setProperty("--cm-level", "0");
  }, []);

  const start = useCallback(async () => {
    listeningRef.current = true;
    setListening(true);
    setChunks([]);
    setInterim("");
    setWidgets([]);
    matchedRef.current = new Set();
    playVoiceStart();

    const rec = makeRecognition();
    setSupported(rec !== null);
    if (rec) {
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = navigator.language || "en-US";
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
        setChunks(finals);
        setInterim(live);
        const all = `${finals.join(" ")} ${live}`;
        for (const kind of Object.keys(WIDGET_TRIGGERS) as WidgetKind[]) {
          if (!matchedRef.current.has(kind) && WIDGET_TRIGGERS[kind].test(all)) {
            matchedRef.current.add(kind);
            setWidgets((prev) => [...prev, kind]);
            playWidgetAppear();
          }
        }
      };
      // Chrome ends recognition after a stretch of silence; while the
      // session is ours, just start it again.
      rec.onend = () => {
        if (listeningRef.current && recRef.current === rec) rec.start();
      };
      recRef.current = rec;
      rec.start();
    }

    // The level meter is a separate mic tap — RMS of the time-domain
    // signal, smoothed, written as a CSS var at frame rate.
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
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      let smoothed = 0;
      const tick = () => {
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        const level = Math.min(1, rms * 7);
        smoothed = level > smoothed ? level : smoothed * 0.86;
        levelHostRef.current?.style.setProperty("--cm-level", smoothed.toFixed(3));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      // Mic denied: the bars idle at their resting height; the transcript
      // (which asks for the mic on its own) may still be running.
    }
  }, []);

  const stop = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    playVoiceEnd();
    stopInternals();
  }, [stopInternals]);

  const toggle = useCallback(() => {
    if (listeningRef.current) stop();
    else void start();
  }, [start, stop]);

  useEffect(() => {
    return () => {
      listeningRef.current = false;
      stopInternals();
    };
  }, [stopInternals]);

  return { listening, chunks, interim, widgets, supported, toggle, levelHostRef };
}
