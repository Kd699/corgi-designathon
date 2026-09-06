/* The teammate's character (motif+signal_simulation, commit 8625713) as the week screen's
 * mascot. CharacterFace is copied verbatim from src/ui/CharacterFace.tsx; the body is the
 * middle of their three button studies — one specimen, not the three-up canvas, because
 * here it is a mascot rather than a comparison.
 *
 * Nothing about the audio studio comes across: no AudioContext, no press tones, no toolbar.
 */
import type { CSSProperties } from 'react';
import type { ButtonSpec } from './motif';
import './motif.css';

/** Verbatim from motif+signal_simulation/src/ui/CharacterFace.tsx. */
function CharacterFace({ face, index }: { face: ButtonSpec['face']; index: number }) {
  const style = {
    '--blink-duration': `${face.blinkSeconds + index * 0.45}s`,
    '--face-delay': `${index * -1.3}s`,
    '--gaze-distance': `${face.gazePixels}px`,
  } as CSSProperties;
  return <svg className={`character-face${face.asleep ? ' face-asleep' : ''}`} data-expression={face.expression} viewBox="0 0 100 100" aria-hidden="true" style={style}>
    <g className="face-gaze">
      <g className="face-brows" style={{ opacity: face.browOpacity }}>
        <path d="M 30 28 L 42 28" style={{ transform: `rotate(${face.browTilt}deg)`, transformOrigin: '36px 28px' }} />
        <path d="M 58 28 L 70 28" style={{ transform: `rotate(${-face.browTilt}deg)`, transformOrigin: '64px 28px' }} />
      </g>
      <g className="face-eye-tilt" style={{ transform: `rotate(${face.eyeTilt}deg)`, transformOrigin: '36px 44px' }}>
        <g className="face-blink"><rect className="face-eye" x="31.5" y={44 - face.eyeHeight / 2} width="9" height={face.eyeHeight} rx="4.5" /></g>
      </g>
      <g className="face-eye-tilt" style={{ transform: `rotate(${-face.eyeTilt}deg)`, transformOrigin: '64px 44px' }}>
        <g className="face-blink"><rect className="face-eye face-eye-right" x="59.5" y={44 - face.eyeHeight / 2} width="9" height={face.eyeHeight} rx="4.5" /></g>
      </g>
      <path className="face-mouth" d={`M 41 63 Q 50 ${63 + face.mouthCurve} 59 63`} />
    </g>
  </svg>;
}

/** One specimen: the morphing outline, the face, and the motion the spec asks for.
 *  Takes an already-derived motif so the caller can feed the same expression to the sky's
 *  own face dial — one derive, two consumers, no chance of them disagreeing. */
export default function MotifMascot({ motif, size = 132 }: { motif: ButtonSpec; size?: number }) {
  const style = {
    '--button-duration': `${motif.duration}s`,
    '--button-amplitude': `${motif.amplitude}px`,
    '--shape-transition': `${motif.transition}ms`,
    width: size,
    height: size,
  } as CSSProperties;
  return (
    <div className="motif-mascot" style={style} aria-label={`mascot ${motif.face.expression}`} role="img">
      <div className={`button-motion motion-${motif.motion}`}>
        <div className="study-button">
          <span className="button-shape" style={{ clipPath: motif.polygons[1], background: motif.colors[1] }} />
          <CharacterFace face={motif.face} index={1} />
        </div>
      </div>
    </div>
  );
}
