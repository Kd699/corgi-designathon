import { useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, Ref } from 'react';
import type { Frame, Part } from './design';

export type BodyFx = {
  fontSize: number;
  lineHeight: number;
  weight: number;
  tracking: number;
  slant: number;
  border: number;
  gap: number;
  skew: number;
  wave: number;
  shiftX: number;
  shiftY: number;
  grey: string;
  transform: string;
  caps: string;
};

function shown(part: Part, hidden: Set<string>) {
  return part.visible && !hidden.has(part.id);
}

export function BodyStage({
  frame,
  fx,
  hidden,
  text,
  onText,
  wordCount,
  spatial,
  words,
  onSurfaceKeyDown,
  onSurfaceKeyUp,
  onSurfaceFocus,
  pageRef,
}: {
  frame: Frame;
  fx: BodyFx;
  hidden: Set<string>;
  text: string;
  onText: (value: string) => void;
  wordCount: number;
  spatial: boolean;
  words: { start: number; text: string; x: number; y: number; dx: number; dy: number; opacity: number; color: string; rotate: number }[];
  onSurfaceKeyDown: (event: ReactKeyboardEvent) => void;
  onSurfaceKeyUp: (event: ReactKeyboardEvent) => void;
  onSurfaceFocus: () => void;
  pageRef: Ref<HTMLDivElement>;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(38);
  const parts = frame.parts.filter((part) => shown(part, hidden));
  const shell: CSSProperties = {
    transform: `translate(${fx.shiftX}px, ${fx.shiftY}px) skewX(${fx.skew}deg)`,
    color: fx.grey,
    fontWeight: fx.weight,
    letterSpacing: `${fx.tracking}em`,
    textTransform: fx.transform as CSSProperties['textTransform'],
    fontVariantCaps: fx.caps as CSSProperties['fontVariantCaps'],
    gap: fx.gap,
  };

  if (frame.id === 'body:text') {
    const writing = parts.find((part) => part.role === 'writing');
    return (
      <div className="body-abs" style={shell}>
        {parts.map((part) => {
          if (part.role === 'writing') {
            return (
              <div key={part.id} className="page part" style={box(part)} ref={pageRef}>
                {spatial && (
                  <div className="word-stage" aria-hidden="true" style={{ fontSize: part.fontSize || fx.fontSize, lineHeight: fx.lineHeight }}>
                    {words.map((word) => (
                      <span
                        key={word.start}
                        style={{
                          left: word.x + word.dx,
                          top: word.y + word.dy,
                          opacity: word.opacity,
                          color: word.color,
                          transform: `rotate(${word.rotate}deg)`,
                        }}
                      >
                        {word.text}
                      </span>
                    ))}
                  </div>
                )}
                <textarea
                  aria-label="Writing"
                  spellCheck={false}
                  className={spatial ? 'is-fx' : undefined}
                  value={text}
                  onChange={(event) => onText(event.target.value)}
                  style={{ fontSize: part.fontSize || fx.fontSize, lineHeight: fx.lineHeight }}
                />
              </div>
            );
          }
          if (part.id === 'count') {
            return (
              <span key={part.id} className="surface-meta part" style={box(part)}>
                {wordCount} {part.text}
              </span>
            );
          }
          if (part.role === 'move') {
            return (
              <button
                key={part.id}
                type="button"
                id="surface-handle"
                className="handle part surface-move"
                style={box(part)}
                aria-label="Move the surface. Arrow keys nudge it."
                onKeyDown={onSurfaceKeyDown}
                onKeyUp={onSurfaceKeyUp}
                onFocus={onSurfaceFocus}
              >
                {part.text}
              </button>
            );
          }
          if (part.role === 'readout') {
            return (
              <span key={part.id} className="surface-meta part" style={box(part)}>
                {Math.round(fx.fontSize)} {part.text} · {fx.lineHeight.toFixed(2)}
              </span>
            );
          }
          return (
            <span key={part.id} className="surface-meta part" style={box(part)}>
              {part.text}
            </span>
          );
        })}
        {!writing && null}
      </div>
    );
  }

  return (
    <div className="body-abs" style={shell}>
      {parts.map((part, index) => {
        const waveY = Math.sin(part.x * 0.05 + index) * fx.wave;
        const style = { ...box(part), transform: `translateY(${waveY}px)`, borderWidth: fx.border, fontSize: part.fontSize };
        if (part.role === 'button' || part.role === 'submit' || part.role === 'play') {
          return (
            <button
              key={part.id}
              type="button"
              className="body-button no-drag"
              style={style}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => part.role === 'play' && setPlaying((value) => !value)}
            >
              {part.role === 'play' ? (playing ? 'Pause' : part.text || 'Play') : part.text}
            </button>
          );
        }
        if (part.role === 'field') {
          return (
            <input
              key={part.id}
              className="body-input no-drag"
              style={style}
              placeholder={part.text}
              aria-label={part.text}
              onPointerDown={(event) => event.stopPropagation()}
            />
          );
        }
        if (part.role === 'progress') {
          return (
            <input
              key={part.id}
              className="body-progress no-drag"
              style={style}
              type="range"
              min={0}
              max={100}
              value={progress}
              aria-label="Progress"
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => setProgress(Number(event.target.value))}
            />
          );
        }
        if (part.role === 'art') {
          return <div key={part.id} className="body-art" style={style} aria-hidden="true" />;
        }
        if (part.role === 'bar') {
          const lift = 1 + Math.sin(index + fx.wave * 0.2) * Math.min(0.35, fx.wave / 40);
          return (
            <div key={part.id} className="body-bar" style={{ ...style, height: Math.max(8, part.h * lift) }} title={part.text}>
              <span>{part.text}</span>
            </div>
          );
        }
        return (
          <span key={part.id} className="body-copy" style={style}>
            {part.text}
          </span>
        );
      })}
    </div>
  );
}

function box(part: Part): CSSProperties {
  return {
    position: 'absolute',
    left: part.x,
    top: part.y,
    width: part.w,
    height: part.h,
    fontSize: part.fontSize,
    borderRadius: part.radius,
  };
}
