import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ButtonSpec } from '../engine/buttonSpec';
import CharacterFace from './CharacterFace';

export default function ButtonCanvas({ spec }: { spec: ButtonSpec }) {
  const [sound, setSound] = useState(false);
  const [audioError, setAudioError] = useState('');
  const context = useRef<AudioContext | null>(null);
  const master = useRef<GainNode | null>(null);
  const voices = useRef(new Set<OscillatorNode>());
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const latest = useRef(spec);
  useEffect(() => { latest.current = spec; }, [spec]);

  const play = useCallback((index: number, settings: ButtonSpec) => {
    const ctx = context.current;
    if (!ctx || ctx.state !== 'running' || !master.current || settings.sound.gain === 0) return;
    // Bound overlapping clicks to keep playback predictable and quiet.
    if (voices.current.size >= 6) return;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    const now = ctx.currentTime;
    const tone = settings.sound;
    oscillator.type = tone.wave;
    oscillator.frequency.setValueAtTime(tone.frequency * tone.ratios[index], now);
    oscillator.frequency.exponentialRampToValueAtTime(tone.frequency * tone.ratios[index] * tone.glide, now + tone.decay);
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(tone.gain, now + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + tone.decay);
    oscillator.connect(envelope);
    envelope.connect(master.current);
    voices.current.add(oscillator);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); voices.current.delete(oscillator); };
    oscillator.start(now);
    oscillator.stop(now + tone.decay + 0.03);
  }, []);

  useEffect(() => () => { void context.current?.close(); }, []);

  // Announce a new sound character once, without beeping on every live sensor tick.
  useEffect(() => {
    if (!sound) return;
    const id = setTimeout(() => play(0, latest.current), 180);
    return () => clearTimeout(id);
  }, [sound, spec.sound.name, play]);

  const toggleSound = async () => {
    if (sound) {
      if (master.current) master.current.gain.value = 0;
      voices.current.forEach(voice => voice.stop());
      setSound(false);
      return;
    }
    try {
      if (!context.current) {
        context.current = new AudioContext();
        master.current = context.current.createGain();
        master.current.connect(context.current.destination);
      }
      await context.current.resume();
      if (context.current.state !== 'running') throw new Error('Audio unavailable');
      master.current!.gain.value = 1;
      setAudioError('');
      setSound(true);
    } catch { setAudioError('Audio could not start. Try enabling sound again.'); }
  };

  const press = (index: number) => {
    const element = buttons.current[index];
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      element?.animate([{ scale: '1' }, { scale: '.88' }, { scale: '1' }], { duration: 220, easing: 'ease-out' });
      element?.querySelector('.face-eye-right')?.animate(
        [{ transform: 'scaleY(1)' }, { transform: 'scaleY(.12)', offset: 0.35 }, { transform: 'scaleY(.12)', offset: 0.65 }, { transform: 'scaleY(1)' }],
        { duration: 480, easing: 'ease-in-out' },
      );
    }
    if (sound) play(index, spec);
  };

  const style = {
    '--button-duration': `${spec.duration}s`, '--button-amplitude': `${spec.amplitude}px`,
    '--shape-transition': `${spec.transition}ms`,
  } as CSSProperties;

  return <>
    <div className="canvas-toolbar"><div><strong>Button studies</strong><span>{spec.state}</span></div>
      <button className="sound-toggle" aria-pressed={sound} onClick={() => void toggleSound()}>{sound ? 'Sound on' : 'Enable sound'}</button>
    </div>
    <section className="button-canvas" aria-label="Interactive button canvas" style={style}>
      <div className="canvas-buttons">{[0, 1, 2].map(index => <div className="button-position" key={index}>
        <div className={`button-motion motion-${spec.motion}`} style={{ animationDelay: `${index * -0.23}s` }}>
          <button className="study-button" aria-label={`Play button ${index + 1}, ${spec.face.expression}`} ref={el => { buttons.current[index] = el; }} onClick={() => press(index)}>
            <span className="button-shape" style={{ clipPath: spec.polygons[index], background: spec.colors[index] }} />
            <CharacterFace face={spec.face} index={index} />
          </button>
        </div>
      </div>)}</div>
    </section>
    <div className="canvas-footer"><span>{spec.face.expression} · {spec.motion} · {spec.sound.name}</span><span>{audioError || (sound ? 'Press a character for a wink and a tone.' : 'Press for a wink. Enable sound to hear their tones.')}</span></div>
  </>;
}
