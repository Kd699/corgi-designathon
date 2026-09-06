/* The two sources of transcript, behind one hook.
 *
 * Voice is the intended one: Chrome's Web Speech API, continuous, with interim results
 * driving the response. Waiting for isFinal would be correct and useless — the reaction
 * would arrive a whole sentence after the sentence, which is exactly the lag this surface
 * exists to not have.
 *
 * Typing is the other one, and it is not a courtesy. A microphone cannot be driven
 * headlessly, so without a keyboard path into the identical function nothing about this
 * page is provable. Both sources write the same `transcript`; everything downstream cannot
 * tell which one spoke.
 *
 * Failure is stated, never swallowed: an unsupported browser and a refused microphone are
 * different sentences, and both are visible on the page rather than a button that does
 * nothing when pressed.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** Chrome ships this prefixed and the DOM lib omits it. Same shape clouds-voice.ts uses. */
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

export type VoiceStatus =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'unsupported'; message: string }
  | { kind: 'denied'; message: string }
  | { kind: 'error'; message: string };

function makeRecognition(): SpeechRecognitionLike | null {
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | undefined;
  return Ctor ? new Ctor() : null;
}

export interface TranscriptSource {
  transcript: string;
  status: VoiceStatus;
  listening: boolean;
  start(): void;
  stop(): void;
  /** The keyboard path. Same string, same consumers. */
  type(text: string): void;
  /** Between protocol steps: the next step listens fresh. */
  clear(): void;
}

export function useTranscript(): TranscriptSource {
  const [transcript, setTranscript] = useState('');
  const [status, setStatus] = useState<VoiceStatus>({ kind: 'idle' });
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantedRef = useRef(false);
  /** What voice has said so far this step, kept apart from typed text so a restart of the
   *  recogniser does not erase what the keyboard contributed. */
  const spokenRef = useRef('');
  const typedRef = useRef('');

  const publish = useCallback(() => {
    setTranscript([typedRef.current, spokenRef.current].filter(Boolean).join(' '));
  }, []);

  const stop = useCallback(() => {
    wantedRef.current = false;
    recRef.current?.stop();
    recRef.current = null;
    setStatus((s) => (s.kind === 'listening' ? { kind: 'idle' } : s));
  }, []);

  const start = useCallback(() => {
    const rec = makeRecognition();
    if (!rec) {
      setStatus({ kind: 'unsupported', message: 'This browser has no Web Speech API — type instead, it runs the same pipeline.' });
      return;
    }
    wantedRef.current = true;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';
    rec.onresult = (e) => {
      // Interim included on purpose: this is the frame the response is supposed to land on.
      spokenRef.current = Array.from(e.results, (r) => r[0].transcript).join(' ').trim();
      publish();
    };
    rec.onerror = (e) => {
      wantedRef.current = false;
      setStatus(e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? { kind: 'denied', message: 'Microphone permission was refused — type instead, it runs the same pipeline.' }
        : { kind: 'error', message: `Speech recognition stopped: ${e.error}. Typing still works.` });
    };
    // Chrome ends the session after a stretch of silence; while it is still ours, restart.
    rec.onend = () => { if (wantedRef.current && recRef.current === rec) rec.start(); };
    recRef.current = rec;
    setStatus({ kind: 'listening' });
    rec.start();
  }, [publish]);

  const type = useCallback((text: string) => {
    typedRef.current = text;
    publish();
  }, [publish]);

  const clear = useCallback(() => {
    spokenRef.current = '';
    typedRef.current = '';
    setTranscript('');
  }, []);

  useEffect(() => () => { wantedRef.current = false; recRef.current?.stop(); }, []);

  return { transcript, status, listening: status.kind === 'listening', start, stop, type, clear };
}
