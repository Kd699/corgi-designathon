import type { CSSProperties } from 'react';
import type { ButtonSpec } from '../engine/buttonSpec';

/** Facial geometry comes from the same spec as the body; no raw signals here. */
export default function CharacterFace({ face, index }: { face: ButtonSpec['face']; index: number }) {
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
      <path className="face-mouth" style={{ d: `path('M 41 63 Q 50 ${63 + face.mouthCurve} 59 63')` }} d={`M 41 63 Q 50 ${63 + face.mouthCurve} 59 63`} />
    </g>
  </svg>;
}
