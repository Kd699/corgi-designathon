import { useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import './ShapeLab.css';
import {
  CONTROL_BOX,
  KEY_STEP,
  KEY_STEP_LARGE,
  LEAD_MAX,
  LEAD_MIN,
  LEAD_STEP,
  LINK_AT,
  NUDGE_STEP,
  REST_LEAD,
  REST_SIZE,
  SIZE_MAX,
  SIZE_MIN,
  SIZE_STEP,
  SPAWN_LEAD,
  SPAWN_SIZE,
  blendWithRest,
  bridgeThickness,
  centerOf,
  clampInside,
  controlBox,
  controlTitle,
  dragPosition,
  formatLead,
  formatSize,
  gapBetween,
  inflate,
  inkBounds,
  pullFromGap,
  satelliteScale,
  scaleAboutCenter,
  surfaceSize,
} from './geometry';
import type { Axis, Control, Rect } from './geometry';

const INITIAL_TEXT = `The surface is a body of ink.

Bring a control close and the ink leans in. Size follows the horizontal controls. Spacing follows the vertical ones.

They stay where you drop them.`;

type Selection = 'surface' | number;

type Drag =
  | {
      kind: 'control';
      id: number;
      ox: number;
      oy: number;
      nx: number;
      ny: number;
      frame: number;
    }
  | {
      kind: 'surface';
      ox: number;
      oy: number;
      nx: number;
      ny: number;
      frame: number;
    };

type Metric = Control & { box: Rect; gap: number; pull: number };

type Field = { w: number; h: number };

const ARROWS: Record<string, { x: number; y: number }> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

function derive(surface: { x: number; y: number }, controls: Control[], field: Field) {
  const size = surfaceSize(field.w, field.h);
  const ink = inkBounds(surface, size);
  const metrics: Metric[] = controls.map((control) => {
    const box = controlBox(control);
    const gap = gapBetween(ink, box);
    return { ...control, box, gap, pull: pullFromGap(gap) };
  });
  const fontSize = blendWithRest(
    metrics.filter((item) => item.axis === 'horizontal').map((item) => ({ value: item.value, weight: item.pull })),
    REST_SIZE,
  );
  const lineHeight = blendWithRest(
    metrics.filter((item) => item.axis === 'vertical').map((item) => ({ value: item.value, weight: item.pull })),
    REST_LEAD,
  );
  const maxPull = metrics.reduce((max, item) => Math.max(max, item.pull), 0);
  return { size, ink, metrics, fontSize, lineHeight, maxPull };
}

function reading(fontSize: number, lineHeight: number, metrics: Metric[]): string {
  const sizes = metrics.filter((item) => item.axis === 'horizontal' && item.pull > 0.004);
  const leads = metrics.filter((item) => item.axis === 'vertical' && item.pull > 0.004);
  const sizeClause = sizes.length
    ? `Font size ${formatSize(fontSize)}px, from ${sizes
        .map((item) => `${controlTitle(item)} at ${Math.round(item.pull * 100)}%`)
        .join(' and ')}.`
    : `Font size ${formatSize(fontSize)}px, at rest.`;
  const leadClause = leads.length
    ? `Line spacing ${formatLead(lineHeight)}, from ${leads
        .map((item) => `${controlTitle(item)} at ${Math.round(item.pull * 100)}%`)
        .join(' and ')}.`
    : `Line spacing ${formatLead(lineHeight)}, at rest.`;
  return `${sizeClause} ${leadClause}`;
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export default function ShapeLab() {
  const fieldRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const dragRef = useRef<Drag | null>(null);
  const [field, setField] = useState<Field>({ w: 0, h: 0 });
  const [surface, setSurface] = useState({ x: 48, y: 48 });
  const [controls, setControls] = useState<Control[]>([]);
  const [selected, setSelected] = useState<Selection>('surface');
  const [dragging, setDragging] = useState(false);
  const [text, setText] = useState(INITIAL_TEXT);
  const [notice, setNotice] = useState('The field is empty. Add a control from the library.');

  const fieldRefState = useRef(field);
  const surfaceRef = useRef(surface);
  const controlsRef = useRef(controls);
  fieldRefState.current = field;
  surfaceRef.current = surface;
  controlsRef.current = controls;

  useLayoutEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const prev = fieldRefState.current;
      if (prev.w === w && prev.h === h) return;
      fieldRefState.current = { w, h };
      setField({ w, h });
      setSurface((current) => {
        if (w < 40 || h < 40) return current;
        const size = surfaceSize(w, h);
        const centered = current.x === 48 && current.y === 48 && controlsRef.current.length === 0;
        const next = centered
          ? { x: Math.max(0, (w - size.w) / 2), y: Math.max(0, (h - size.h) / 2) }
          : clampInside(current.x, current.y, size.w, size.h, { w, h });
        surfaceRef.current = next;
        return next;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const model = derive(surface, controls, field);
  const sentence = reading(model.fontSize, model.lineHeight, model.metrics);
  const selectedControl = typeof selected === 'number' ? controls.find((item) => item.id === selected) : undefined;

  function announce(message: string) {
    setNotice(message);
  }

  function commitSurface(next: { x: number; y: number }) {
    surfaceRef.current = next;
    setSurface(next);
  }

  function commitControls(next: Control[]) {
    controlsRef.current = next;
    setControls(next);
  }

  function toField(event: { clientX: number; clientY: number }) {
    const rect = fieldRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function writeDrag(drag: Drag, pointer: { x: number; y: number }) {
    const bounds = fieldRefState.current;
    if (drag.kind === 'surface') {
      const size = surfaceSize(bounds.w, bounds.h);
      const next = dragPosition(pointer, { x: drag.ox, y: drag.oy }, size, bounds);
      drag.nx = next.x;
      drag.ny = next.y;
      commitSurface(next);
      return;
    }
    const current = controlsRef.current.find((item) => item.id === drag.id);
    if (!current) return;
    const box = CONTROL_BOX[current.axis];
    const next = dragPosition(pointer, { x: drag.ox, y: drag.oy }, box, bounds);
    drag.nx = next.x;
    drag.ny = next.y;
    commitControls(controlsRef.current.map((item) => (item.id === drag.id ? { ...item, ...next } : item)));
  }

  function onPointerMove(event: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const pointer = toField(event);
    if (drag.frame) cancelAnimationFrame(drag.frame);
    drag.frame = requestAnimationFrame(() => {
      const current = dragRef.current;
      if (!current) return;
      current.frame = 0;
      writeDrag(current, pointer);
    });
  }

  function finishDrag(event: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.frame) cancelAnimationFrame(drag.frame);
    const pointer = toField(event);
    writeDrag(drag, pointer);
    dragRef.current = null;
    setDragging(false);
    const bounds = fieldRefState.current;
    const view = derive(surfaceRef.current, controlsRef.current, bounds);
    if (drag.kind === 'surface') {
      const at = surfaceRef.current;
      announce(`Surface released at ${Math.round(at.x)}, ${Math.round(at.y)}. It stays there.`);
      return;
    }
    const control = controlsRef.current.find((item) => item.id === drag.id);
    if (!control) return;
    const pull = view.metrics.find((item) => item.id === control.id)?.pull ?? 0;
    announce(
      `${controlTitle(control)} released at ${Math.round(control.x)}, ${Math.round(control.y)}. Pull ${Math.round(pull * 100)}%. It stays there.`,
    );
  }

  function beginSurfaceDrag(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('textarea')) return;
    event.preventDefault();
    const pointer = toField(event);
    const at = surfaceRef.current;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: 'surface',
      ox: pointer.x - at.x,
      oy: pointer.y - at.y,
      nx: at.x,
      ny: at.y,
      frame: 0,
    };
    setSelected('surface');
    setDragging(true);
    document.getElementById('surface-handle')?.focus({ preventScroll: true });
  }

  function beginControlDrag(event: ReactPointerEvent<HTMLElement>, id: number) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const pointer = toField(event);
    const control = controlsRef.current.find((item) => item.id === id);
    if (!control) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: 'control',
      id,
      ox: pointer.x - control.x,
      oy: pointer.y - control.y,
      nx: control.x,
      ny: control.y,
      frame: 0,
    };
    setSelected(id);
    setDragging(true);
    document.getElementById(`move-${id}`)?.focus({ preventScroll: true });
  }

  function beginLibraryDrag(event: ReactPointerEvent<HTMLButtonElement>, axis: Axis) {
    if (event.button !== 0) return;
    event.preventDefault();
    const pointer = toField(event);
    const id = nextId.current++;
    const control: Control = {
      id,
      axis,
      x: pointer.x - 28,
      y: pointer.y - 22,
      value: axis === 'horizontal' ? SPAWN_SIZE : SPAWN_LEAD,
    };
    commitControls([...controlsRef.current, control]);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: 'control',
      id,
      ox: pointer.x - control.x,
      oy: pointer.y - control.y,
      nx: control.x,
      ny: control.y,
      frame: 0,
    };
    setSelected(id);
    setDragging(true);
  }

  function placeFromLibrary(axis: Axis) {
    const bounds = fieldRefState.current;
    const size = surfaceSize(bounds.w, bounds.h);
    const ink = inkBounds(surfaceRef.current, size);
    const box = CONTROL_BOX[axis];
    const same = controlsRef.current.filter((item) => item.axis === axis).length;
    const raw =
      axis === 'horizontal'
        ? { x: ink.x + 28 + same * 36, y: ink.y - box.h - 78 }
        : { x: ink.x + ink.w + 78, y: ink.y + 24 + same * 36 };
    const at = clampInside(raw.x, raw.y, box.w, box.h, bounds);
    const id = nextId.current++;
    const control: Control = {
      id,
      axis,
      ...at,
      value: axis === 'horizontal' ? SPAWN_SIZE : SPAWN_LEAD,
    };
    const next = [...controlsRef.current, control];
    commitControls(next);
    setSelected(id);
    const view = derive(surfaceRef.current, next, bounds);
    const pull = view.metrics.find((item) => item.id === id)?.pull ?? 0;
    announce(
      `${controlTitle(control)} placed at ${Math.round(at.x)}, ${Math.round(at.y)}. Pull ${Math.round(pull * 100)}%. Arrow keys move its handle. Nothing will snap.`,
    );
    requestAnimationFrame(() => document.getElementById(`move-${id}`)?.focus());
  }

  function moveSelected(dx: number, dy: number) {
    const bounds = fieldRefState.current;
    if (selected === 'surface' || (typeof selected === 'number' && !controlsRef.current.some((item) => item.id === selected))) {
      const size = surfaceSize(bounds.w, bounds.h);
      const next = clampInside(surfaceRef.current.x + dx, surfaceRef.current.y + dy, size.w, size.h, bounds);
      commitSurface(next);
      announce(`Surface at ${Math.round(next.x)}, ${Math.round(next.y)}.`);
      return;
    }
    const id = selected as number;
    const current = controlsRef.current.find((item) => item.id === id);
    if (!current) return;
    const box = CONTROL_BOX[current.axis];
    const at = clampInside(current.x + dx, current.y + dy, box.w, box.h, bounds);
    const next = controlsRef.current.map((item) => (item.id === id ? { ...item, ...at } : item));
    commitControls(next);
    const pull = derive(surfaceRef.current, next, bounds).metrics.find((item) => item.id === id)?.pull ?? 0;
    announce(`${controlTitle(current)} at ${Math.round(at.x)}, ${Math.round(at.y)}. Pull ${Math.round(pull * 100)}%.`);
  }

  function onHandleKeyDown(event: ReactKeyboardEvent, kind: 'surface' | 'control', id?: number) {
    const arrow = ARROWS[event.key];
    if (arrow) {
      event.preventDefault();
      const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
      setSelected(kind === 'surface' ? 'surface' : id ?? 'surface');
      const bounds = fieldRefState.current;
      if (kind === 'surface') {
        const size = surfaceSize(bounds.w, bounds.h);
        const next = clampInside(
          surfaceRef.current.x + arrow.x * step,
          surfaceRef.current.y + arrow.y * step,
          size.w,
          size.h,
          bounds,
        );
        commitSurface(next);
        return;
      }
      if (id === undefined) return;
      const current = controlsRef.current.find((item) => item.id === id);
      if (!current) return;
      const box = CONTROL_BOX[current.axis];
      const at = clampInside(current.x + arrow.x * step, current.y + arrow.y * step, box.w, box.h, bounds);
      commitControls(controlsRef.current.map((item) => (item.id === id ? { ...item, ...at } : item)));
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && kind === 'control' && id !== undefined) {
      event.preventDefault();
      removeControl(id);
    }
  }

  function onHandleKeyUp(event: ReactKeyboardEvent, kind: 'surface' | 'control', id?: number) {
    if (!ARROWS[event.key]) return;
    const bounds = fieldRefState.current;
    const view = derive(surfaceRef.current, controlsRef.current, bounds);
    if (kind === 'surface') {
      const at = surfaceRef.current;
      announce(`Surface at ${Math.round(at.x)}, ${Math.round(at.y)}.`);
      return;
    }
    const control = controlsRef.current.find((item) => item.id === id);
    if (!control) return;
    const pull = view.metrics.find((item) => item.id === control.id)?.pull ?? 0;
    announce(`${controlTitle(control)} at ${Math.round(control.x)}, ${Math.round(control.y)}. Pull ${Math.round(pull * 100)}%.`);
  }

  function removeControl(id: number) {
    const control = controlsRef.current.find((item) => item.id === id);
    commitControls(controlsRef.current.filter((item) => item.id !== id));
    setSelected('surface');
    announce(control ? `${controlTitle(control)} removed. The ink lets go.` : 'Control removed.');
    requestAnimationFrame(() => document.getElementById('surface-handle')?.focus());
  }

  function setControlValue(id: number, value: number) {
    commitControls(controlsRef.current.map((item) => (item.id === id ? { ...item, value } : item)));
  }

  function resetField() {
    const bounds = fieldRefState.current;
    const size = surfaceSize(bounds.w, bounds.h);
    const next = {
      x: Math.max(0, (bounds.w - size.w) / 2),
      y: Math.max(0, (bounds.h - size.h) / 2),
    };
    commitControls([]);
    commitSurface(next);
    setSelected('surface');
    announce('Controls cleared. The writing is still here, and the surface is back at the center.');
  }

  const swell = model.maxPull * 18;
  const blob: Rect = {
    x: model.ink.x - swell,
    y: model.ink.y - swell,
    w: model.ink.w + swell * 2,
    h: model.ink.h + swell * 2,
  };
  const blobCenter = centerOf(blob);

  return (
    <main className={dragging ? 'lab is-dragging' : 'lab'}>
      <a className="skip" href="#field">
        Skip to field
      </a>
      <header className="mast">
        <div>
          <p className="kicker">Shape Lab</p>
          <h1>Mono</h1>
        </div>
        <p className="mast-note">Black and white. Nothing is saved.</p>
        <button type="button" className="text-button" onClick={resetField}>
          Reset field
        </button>
      </header>

      <div className="workspace">
        <aside className="library" aria-label="Control library">
          <p className="kicker">Instruments</p>
          <p id="library-help" className="quiet">
            Drag onto the field, or focus one and press Enter to place it.
          </p>
          {(['horizontal', 'vertical'] as Axis[]).map((axis) => (
            <button
              key={axis}
              type="button"
              className="instrument"
              aria-describedby="library-help"
              onPointerDown={(event) => beginLibraryDrag(event, axis)}
              onPointerMove={onPointerMove}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                placeFromLibrary(axis);
              }}
            >
              <span className={axis === 'horizontal' ? 'glyph glyph-h' : 'glyph glyph-v'} aria-hidden="true">
                <i />
              </span>
              <strong>{axis === 'horizontal' ? 'Font size' : 'Line spacing'}</strong>
              <small>{axis === 'horizontal' ? 'Horizontal control' : 'Vertical control'}</small>
            </button>
          ))}
          <div className="notes">
            <p>
              <b>Move.</b> Drag a card anywhere on the field. It stays. Focus Move and use the arrow keys. Hold Shift for a longer step.
            </p>
            <p>
              <b>Type.</b> The ink reaches as a control comes close and separates as it leaves. Pull is that control’s share of the type.
            </p>
          </div>
        </aside>

        <section className="stage-column" aria-label="Canvas">
          <div className="toolbar">
            <span>Field</span>
            <span>
              {controls.length === 0 ? 'No controls yet' : `${controls.length} free`}
              {' · '}
              {formatSize(model.fontSize)}px · {formatLead(model.lineHeight)}
            </span>
          </div>
          <div
            className="field"
            id="field"
            ref={fieldRef}
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setSelected('surface');
            }}
          >
            <svg className="ink" width={Math.max(field.w, 0)} height={Math.max(field.h, 0)} aria-hidden="true">
              <defs>
                <filter
                  id="mono-goo"
                  filterUnits="userSpaceOnUse"
                  x="0"
                  y="0"
                  width={Math.max(field.w, 1)}
                  height={Math.max(field.h, 1)}
                  colorInterpolationFilters="sRGB"
                >
                  <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
                  <feColorMatrix
                    in="blur"
                    type="matrix"
                    values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"
                  />
                </filter>
              </defs>
              <g filter="url(#mono-goo)" fill="#0c0c0c">
                <rect x={blob.x} y={blob.y} width={blob.w} height={blob.h} rx={36 + swell * 0.4} />
                {model.metrics.map((item) => {
                  const scale = satelliteScale(item.pull);
                  if (scale <= 0) return null;
                  const satellite = scaleAboutCenter(inflate(item.box, 8), scale);
                  const thick = bridgeThickness(item.pull);
                  const from = blobCenter;
                  const to = centerOf(item.box);
                  const dx = to.x - from.x;
                  const dy = to.y - from.y;
                  const length = Math.hypot(dx, dy);
                  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
                  return (
                    <g key={item.id}>
                      {thick > 0 && length > 1 && (
                        <rect
                          x={-length / 2}
                          y={-thick / 2}
                          width={length}
                          height={thick}
                          rx={thick / 2}
                          transform={`translate(${(from.x + to.x) / 2} ${(from.y + to.y) / 2}) rotate(${angle})`}
                        />
                      )}
                      <rect
                        x={satellite.x}
                        y={satellite.y}
                        width={satellite.w}
                        height={satellite.h}
                        rx={Math.min(32, satellite.h / 2)}
                      />
                    </g>
                  );
                })}
              </g>
            </svg>

            <section
              className="surface"
              data-selected={selected === 'surface' ? 'true' : 'false'}
              style={{ left: surface.x, top: surface.y, width: model.size.w, height: model.size.h }}
              onPointerDown={beginSurfaceDrag}
              onPointerMove={onPointerMove}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
            >
              <div className="surface-bar">
                <button
                  type="button"
                  id="surface-handle"
                  className="handle"
                  aria-label="Move text surface. Arrow keys nudge it. Shift moves farther. You can also drag the surface itself."
                  aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
                  aria-current={selected === 'surface' ? 'true' : undefined}
                  onKeyDown={(event) => onHandleKeyDown(event, 'surface')}
                  onKeyUp={(event) => onHandleKeyUp(event, 'surface')}
                  onFocus={() => setSelected('surface')}
                >
                  Move surface
                </button>
                <span className="surface-meta">{wordCount(text)} words</span>
              </div>
              <textarea
                aria-label="Writing"
                spellCheck={false}
                value={text}
                onChange={(event) => setText(event.target.value)}
                style={{ fontSize: model.fontSize, lineHeight: model.lineHeight }}
              />
              <div className="surface-foot">
                <span>Untitled</span>
                <span>
                  {formatSize(model.fontSize)} px · {formatLead(model.lineHeight)}
                </span>
              </div>
            </section>

            {model.metrics.map((item) => {
              const activeDrag = dragRef.current;
              return (
              <ControlCard
                key={item.id}
                item={item}
                selected={selected === item.id}
                dragging={Boolean(dragging && activeDrag?.kind === 'control' && activeDrag.id === item.id)}
                onSelect={() => setSelected(item.id)}
                onDragStart={(event) => beginControlDrag(event, item.id)}
                onPointerMove={onPointerMove}
                onPointerUp={finishDrag}
                onKeyDown={(event) => onHandleKeyDown(event, 'control', item.id)}
                onKeyUp={(event) => onHandleKeyUp(event, 'control', item.id)}
                onValue={(value) => setControlValue(item.id, value)}
                onRemove={() => removeControl(item.id)}
              />
              );
            })}

            {controls.length === 0 && <p className="field-hint">Drag an instrument close. The ink will reach.</p>}
          </div>
          <p className="status" aria-hidden="true">
            {sentence}
          </p>
          <p className="sr" role="status">
            {notice}
          </p>
        </section>

        <aside className="inspector" aria-label="Reading and movement">
          <p className="kicker">Specimen</p>
          <div className="specimen">
            <div>
              <span>Font size</span>
              <strong>{formatSize(model.fontSize)}</strong>
              <em>px</em>
            </div>
            <div>
              <span>Line spacing</span>
              <strong>{formatLead(model.lineHeight)}</strong>
              <em>×</em>
            </div>
          </div>

          <p className="kicker">Pull</p>
          {model.metrics.length === 0 ? (
            <p className="quiet">Nothing is close enough to pull. Resting type is {REST_SIZE}px at {formatLead(REST_LEAD)}.</p>
          ) : (
            <ul className="pull-list">
              {model.metrics.map((item) => (
                <li key={item.id}>
                  <div className="pull-label">
                    <span>{controlTitle(item)}</span>
                    <span>{Math.round(item.pull * 100)}%</span>
                  </div>
                  <div className="bar" aria-hidden="true">
                    <i style={{ width: `${Math.round(item.pull * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="kicker">Selected</p>
          <div className="select-row" role="group" aria-label="Choose what the pad moves">
            <button
              type="button"
              aria-pressed={selected === 'surface'}
              onClick={() => {
                setSelected('surface');
                document.getElementById('surface-handle')?.focus();
              }}
            >
              Surface
            </button>
            {controls.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={selected === item.id}
                onClick={() => {
                  setSelected(item.id);
                  document.getElementById(`move-${item.id}`)?.focus();
                }}
              >
                {item.axis === 'horizontal' ? `Size ${item.id}` : `Spacing ${item.id}`}
              </button>
            ))}
          </div>
          <p className="coords">
            {selected === 'surface' || !selectedControl
              ? `x ${Math.round(surface.x)} · y ${Math.round(surface.y)}`
              : `x ${Math.round(selectedControl.x)} · y ${Math.round(selectedControl.y)}`}
          </p>

          <div className="pad" role="group" aria-label="Nudge the selected object">
            <button type="button" className="pad-up" aria-label="Nudge selected up" onClick={() => moveSelected(0, -NUDGE_STEP)}>
              ↑
            </button>
            <button type="button" className="pad-left" aria-label="Nudge selected left" onClick={() => moveSelected(-NUDGE_STEP, 0)}>
              ←
            </button>
            <span className="pad-step" aria-hidden="true">
              {NUDGE_STEP}
            </span>
            <button type="button" className="pad-right" aria-label="Nudge selected right" onClick={() => moveSelected(NUDGE_STEP, 0)}>
              →
            </button>
            <button type="button" className="pad-down" aria-label="Nudge selected down" onClick={() => moveSelected(0, NUDGE_STEP)}>
              ↓
            </button>
          </div>
          <p className="quiet">The pad steps 16px. Arrow keys on a Move handle step 8px, or 32px with Shift.</p>
          {selectedControl && (
            <button type="button" className="text-button danger" onClick={() => removeControl(selectedControl.id)}>
              Remove {controlTitle(selectedControl)}
            </button>
          )}
        </aside>
      </div>
    </main>
  );
}

function ControlCard({
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
}: {
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
}) {
  const horizontal = item.axis === 'horizontal';
  const name = controlTitle(item);
  const linked = item.pull >= LINK_AT;
  return (
    <article
      className="control"
      data-axis={item.axis}
      data-linked={linked ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
      aria-label={name}
      style={{
        left: item.x,
        top: item.y,
        width: item.box.w,
        height: item.box.h,
        zIndex: dragging ? 6 : selected ? 4 : 3,
      }}
      onPointerDown={(event) => {
        onSelect();
        const target = event.target as HTMLElement;
        if (target.closest('input, .remove')) return;
        onDragStart(event);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="control-top">
        <button
          type="button"
          id={`move-${item.id}`}
          className="handle"
          aria-label={`Move ${name}. Drag the card, or use arrow keys. Delete removes it.`}
          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Delete"
          aria-current={selected ? 'true' : undefined}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onFocus={onSelect}
        >
          <span className="kicker">{horizontal ? 'Font size' : 'Spacing'}</span>
          <span className="handle-meta">
            <span className="index">{String(item.id).padStart(2, '0')}</span>
            <span className="move-word">Move</span>
          </span>
        </button>
        <button
          type="button"
          className="remove"
          aria-label={`Remove ${name}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onRemove}
        >
          ×
        </button>
      </div>
      <label className="slider">
        <span className="readout">
          {horizontal ? formatSize(item.value) : formatLead(item.value)}
          <small>{horizontal ? 'px' : '×'}</small>
        </span>
        <input
          type="range"
          min={horizontal ? SIZE_MIN : LEAD_MIN}
          max={horizontal ? SIZE_MAX : LEAD_MAX}
          step={horizontal ? SIZE_STEP : LEAD_STEP}
          value={item.value}
          aria-label={name}
          aria-orientation={horizontal ? 'horizontal' : 'vertical'}
          onChange={(event) => onValue(Number(event.target.value))}
          onPointerDown={(event) => event.stopPropagation()}
        />
      </label>
      <div className="meter">
        <span className="meter-label">Pull</span>
        <span className="meter-track" aria-hidden="true">
          <i style={{ width: `${Math.round(item.pull * 100)}%` }} />
        </span>
        <span className="meter-value">{Math.round(item.pull * 100)}%</span>
      </div>
    </article>
  );
}
