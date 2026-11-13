import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Frame, Part } from './design';
import {
  KIND_LABEL,
  LEAD_MAX,
  LEAD_MIN,
  LEAD_STEP,
  LINK_AT,
  SIZE_MAX,
  SIZE_MIN,
  SIZE_STEP,
  SLANT_MAX,
  SLANT_MIN,
  TRACK_MAX,
  TRACK_MIN,
  WEIGHT_MAX,
  WEIGHT_MIN,
  caseName,
  controlTitle,
  formatLead,
  formatSize,
} from './geometry';
import type { Kind } from './geometry';

type Metric = {
  id: number;
  kind: Kind;
  value: number;
  pull: number;
  box: { x: number; y: number; w: number; h: number };
};

const ARROWS: Record<string, { x: number; y: number }> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

function clampNum(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function place(part: Part): CSSProperties {
  return {
    position: 'absolute',
    left: part.x,
    top: part.y,
    width: part.w,
    height: part.h,
    fontSize: part.fontSize,
    borderRadius: part.radius,
    display: part.visible ? undefined : 'none',
  };
}

export function GadgetFace({
  frame,
  item,
  selected,
  dragging,
  onSelect,
  onDragStart,
  onPointerMove,
  onPointerUp,
  onKeyDown,
  onKeyUp,
  onValue,
  onRemove,
  onRestore,
}: {
  frame: Frame;
  item: Metric;
  selected: boolean;
  dragging: boolean;
  onSelect: () => void;
  onDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
  onKeyDown: (event: ReactKeyboardEvent) => void;
  onKeyUp: (event: ReactKeyboardEvent) => void;
  onValue: (value: number) => void;
  onRemove: () => void;
  onRestore: () => void;
}) {
  const name = controlTitle(item);
  const linked = item.pull >= LINK_AT;
  const parts = new Map(frame.parts.map((partItem) => [partItem.id, partItem]));
  const show = (id: string) => {
    const found = parts.get(id);
    return found && found.visible ? found : null;
  };
  function stopGesture(event: ReactPointerEvent) {
    event.stopPropagation();
  }
  function nudge(event: ReactKeyboardEvent, delta: number, min: number, max: number) {
    if (!ARROWS[event.key]) return;
    event.preventDefault();
    event.stopPropagation();
    const sign = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : -1;
    onValue(clampNum(item.value + sign * delta, min, max));
  }
  const readout = show('readout');
  const slider = show('slider');
  const dial = show('dial');
  const pinchA = show('pinch-a');
  const pinchB = show('pinch-b');
  const lever = show('lever');
  const mark = show('mark');
  const cycle = show('cycle');
  const wave = show('wave');
  const waveHandle = show('wave-handle');
  const restore = show('restore');
  const label = show('label');
  const index = show('index');
  const move = show('move');
  const close = show('close');
  const pullLabel = show('pull-label');
  const pullBar = show('pull-bar');
  const pullValue = show('pull-value');
  const trackT = (item.value - TRACK_MIN) / (TRACK_MAX - TRACK_MIN);
  const pinchSpan = pinchA && pinchB ? Math.max(8, pinchB.x - pinchA.x) : 80;
  const pinchLeft = pinchA ? pinchA.x + trackT * pinchSpan : 0;

  return (
    <article
      className="control"
      data-axis={item.kind === 'lead' ? 'vertical' : 'horizontal'}
      data-kind={item.kind}
      data-linked={linked ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
      aria-label={name}
      style={{
        left: item.box.x,
        top: item.box.y,
        width: frame.w,
        height: frame.h,
        borderRadius: frame.radius,
        zIndex: dragging ? 6 : selected ? 4 : 3,
      }}
      onPointerDown={(event) => {
        onSelect();
        const target = event.target as HTMLElement;
        if (target.closest('input, .remove, .gesture, .cycle, .restore')) return;
        onDragStart(event);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {label && (
        <span className="kicker part" style={place(label)}>
          {label.text || KIND_LABEL[item.kind]}
        </span>
      )}
      {index && (
        <span className="index part" style={place(index)}>
          {String(item.id).padStart(2, '0')}
        </span>
      )}
      {move && (
        <button
          type="button"
          id={`move-${item.id}`}
          className="handle part"
          style={place(move)}
          aria-label={`Move ${name}. Drag the card, or use arrow keys. Delete removes it.`}
          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Delete"
          aria-current={selected ? 'true' : undefined}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onFocus={onSelect}
        >
          {move.text || 'Move'}
        </button>
      )}
      {close && (
        <button type="button" className="remove part" style={place(close)} aria-label={`Remove ${name}`} onPointerDown={stopGesture} onClick={onRemove}>
          {close.text || '×'}
        </button>
      )}
      {readout && (item.kind === 'size' || item.kind === 'lead' || item.kind === 'weight' || item.kind === 'tracking') && (
        <span className="readout part" style={place(readout)}>
          {item.kind === 'size'
            ? formatSize(item.value)
            : item.kind === 'lead'
              ? formatLead(item.value)
              : item.kind === 'weight'
                ? Math.round(item.value)
                : item.value.toFixed(2)}
          <small>{readout.text}</small>
        </span>
      )}
      {slider && (item.kind === 'size' || item.kind === 'lead') && (
        <input
          className="part range-part"
          style={place(slider)}
          type="range"
          min={item.kind === 'size' ? SIZE_MIN : LEAD_MIN}
          max={item.kind === 'size' ? SIZE_MAX : LEAD_MAX}
          step={item.kind === 'size' ? SIZE_STEP : LEAD_STEP}
          value={item.value}
          aria-label={name}
          aria-orientation={slider.h > slider.w ? 'vertical' : 'horizontal'}
          onChange={(event) => onValue(Number(event.target.value))}
          onPointerDown={stopGesture}
        />
      )}
      {dial && item.kind === 'weight' && (
        <button
          type="button"
          className="gesture dial part"
          style={place(dial)}
          role="slider"
          aria-valuemin={WEIGHT_MIN}
          aria-valuemax={WEIGHT_MAX}
          aria-valuenow={Math.round(item.value)}
          aria-label={`${name} dial`}
          onPointerDown={(event) => {
            stopGesture(event);
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            const rect = event.currentTarget.getBoundingClientRect();
            const degrees = Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2)) * (180 / Math.PI);
            onValue(Math.round(WEIGHT_MIN + ((clampNum(degrees, -150, 150) + 150) / 300) * (WEIGHT_MAX - WEIGHT_MIN)));
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const degrees = Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2)) * (180 / Math.PI);
            onValue(Math.round(WEIGHT_MIN + ((clampNum(degrees, -150, 150) + 150) / 300) * (WEIGHT_MAX - WEIGHT_MIN)));
          }}
          onKeyDown={(event) => nudge(event, 40, WEIGHT_MIN, WEIGHT_MAX)}
        >
          <i style={{ transform: `rotate(${-140 + ((item.value - WEIGHT_MIN) / (WEIGHT_MAX - WEIGHT_MIN)) * 280}deg)` }} />
        </button>
      )}
      {pinchA && pinchB && item.kind === 'tracking' && (
        <>
          <span
            className="pinch-line part"
            style={{ position: 'absolute', left: pinchA.x + 8, top: pinchA.y + pinchA.h / 2, width: Math.max(0, pinchLeft - pinchA.x), height: 1 }}
          />
          <span className="dot part" style={place(pinchA)} />
          <button
            type="button"
            className="gesture dot dot-live part"
            role="slider"
            aria-label={`${name} pinch`}
            aria-valuemin={TRACK_MIN}
            aria-valuemax={TRACK_MAX}
            aria-valuenow={Number(item.value.toFixed(2))}
            style={{ ...place(pinchB), left: pinchLeft }}
            onPointerDown={(event) => {
              stopGesture(event);
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              const host = event.currentTarget.parentElement!.getBoundingClientRect();
              const local = clampNum(event.clientX - host.left - pinchA.x, 0, pinchSpan);
              onValue(TRACK_MIN + (local / pinchSpan) * (TRACK_MAX - TRACK_MIN));
            }}
            onKeyDown={(event) => nudge(event, 0.02, TRACK_MIN, TRACK_MAX)}
          />
        </>
      )}
      {lever && item.kind === 'slant' && (
        <button
          type="button"
          className="gesture lever part"
          style={place(lever)}
          role="slider"
          aria-label={`${name} lever`}
          aria-valuemin={SLANT_MIN}
          aria-valuemax={SLANT_MAX}
          aria-valuenow={Math.round(item.value)}
          onPointerDown={(event) => {
            stopGesture(event);
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const degrees = Math.atan2(event.clientX - (rect.left + rect.width / 2), rect.bottom - event.clientY) * (180 / Math.PI);
            onValue(clampNum(-degrees / 4, SLANT_MIN, SLANT_MAX));
          }}
          onKeyDown={(event) => nudge(event, 1, SLANT_MIN, SLANT_MAX)}
        >
          <i style={{ transform: `rotate(${item.value * -4}deg)` }} />
          <span>
            {item.value.toFixed(0)}
            {lever.text}
          </span>
        </button>
      )}
      {mark && item.kind === 'gravity' && <div className="blob-mark part" style={place(mark)} aria-hidden="true" />}
      {mark && item.kind === 'contrast' && <div className="puck-mark part" style={place(mark)} aria-hidden="true" />}
      {mark && item.kind === 'eraser' && <div className="blob-mark part eraser-mark" style={place(mark)} aria-hidden="true" />}
      {cycle && item.kind === 'case' && (
        <button type="button" className="cycle part" style={place(cycle)} onPointerDown={stopGesture} onClick={() => onValue(item.value >= 3 ? 1 : item.value + 1)}>
          {caseName(item.value) || cycle.text}
        </button>
      )}
      {wave && item.kind === 'wave' && (
        <svg className="part" style={place(wave)} viewBox="0 0 160 40" aria-hidden="true">
          <path d={`M4 32 Q 80 ${32 - item.value * 1.5} 156 32`} fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )}
      {waveHandle && item.kind === 'wave' && (
        <button
          type="button"
          className="gesture wave-handle part"
          style={{ ...place(waveHandle), top: waveHandle.y - item.value }}
          role="slider"
          aria-label={`${name} string`}
          aria-valuemin={0}
          aria-valuemax={16}
          aria-valuenow={Math.round(item.value)}
          onPointerDown={(event) => {
            stopGesture(event);
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            const rect = event.currentTarget.parentElement!.getBoundingClientRect();
            const lift = clampNum(waveHandle.y + waveHandle.h - (event.clientY - rect.top), 0, 18);
            onValue(lift);
          }}
          onKeyDown={(event) => nudge(event, 2, 0, 16)}
        />
      )}
      {restore && item.kind === 'eraser' && (
        <button type="button" className="restore part" style={place(restore)} onPointerDown={stopGesture} onClick={onRestore}>
          {restore.text || 'Restore'}
        </button>
      )}
      {pullLabel && (
        <span className="meter-label part" style={place(pullLabel)}>
          {pullLabel.text || 'Pull'}
        </span>
      )}
      {pullBar && (
        <span className="meter-track part" style={place(pullBar)} aria-hidden="true">
          <i style={{ width: `${Math.round(item.pull * 100)}%` }} />
        </span>
      )}
      {pullValue && (
        <span className="meter-value part" style={place(pullValue)}>
          {Math.round(item.pull * 100)}
          {pullValue.text || '%'}
        </span>
      )}
    </article>
  );
}
