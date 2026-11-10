import { useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import './ShapeLab.css';
import {
  CONTROL_BOX,
  KEY_STEP,
  KEY_STEP_LARGE,
  KIND_HINT,
  KIND_LABEL,
  KINDS,
  LEAD_MAX,
  LEAD_MIN,
  LEAD_STEP,
  LINK_AT,
  NUDGE_STEP,
  REST_LEAD,
  REST_SIZE,
  REST_SLANT,
  REST_TRACK,
  REST_WEIGHT,
  SIZE_MAX,
  SIZE_MIN,
  SIZE_STEP,
  SLANT_MAX,
  SLANT_MIN,
  TRACK_MAX,
  TRACK_MIN,
  WEIGHT_MAX,
  WEIGHT_MIN,
  blendWithRest,
  bridgeThickness,
  caseName,
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
  inkBulk,
  pullFromGap,
  satelliteScale,
  scaleAboutCenter,
  shortLabel,
  spawnValue,
  surfaceSize,
} from './geometry';
import type { Control, Kind, Rect } from './geometry';
import { isShake, layoutWords, styleWords, wordsUnderEraser } from './typefx';

const INITIAL_TEXT = `The surface is a body of ink.

Bring a control close and the ink leans in. Size follows the horizontal controls. Spacing follows the vertical ones.

They stay where you drop them.`;

type Selection = 'surface' | number;

type Drag = {
  kind: 'control' | 'surface';
  id: number;
  ox: number;
  oy: number;
  nx: number;
  ny: number;
  frame: number;
  samples: { t: number; x: number }[];
  caseWasOn: boolean;
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
    metrics.filter((item) => item.kind === 'size').map((item) => ({ value: item.value, weight: item.pull })),
    REST_SIZE,
  );
  const lineHeight = blendWithRest(
    metrics.filter((item) => item.kind === 'lead').map((item) => ({ value: item.value, weight: item.pull })),
    REST_LEAD,
  );
  const weight = blendWithRest(
    metrics.filter((item) => item.kind === 'weight').map((item) => ({ value: item.value, weight: item.pull })),
    REST_WEIGHT,
  );
  const tracking = blendWithRest(
    metrics.filter((item) => item.kind === 'tracking').map((item) => ({ value: item.value, weight: item.pull })),
    REST_TRACK,
  );
  const slant = blendWithRest(
    metrics.filter((item) => item.kind === 'slant').map((item) => ({ value: item.value, weight: item.pull })),
    REST_SLANT,
  );
  const onText = metrics.filter((item) => item.kind === 'case' && item.gap <= 0);
  const caseMode = onText.length ? onText[onText.length - 1].value : 0;
  const maxPull = metrics.reduce((max, item) => Math.max(max, item.pull), 0);
  return { size, ink, metrics, fontSize, lineHeight, weight, tracking, slant, caseMode, maxPull };
}

function reading(fontSize: number, lineHeight: number, metrics: Metric[]): string {
  const sizes = metrics.filter((item) => item.kind === 'size' && item.pull > 0.004);
  const leads = metrics.filter((item) => item.kind === 'lead' && item.pull > 0.004);
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
  const pageRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const dragRef = useRef<Drag | null>(null);
  const [field, setField] = useState<Field>({ w: 0, h: 0 });
  const [surface, setSurface] = useState({ x: 48, y: 48 });
  const [controls, setControls] = useState<Control[]>([]);
  const [selected, setSelected] = useState<Selection>('surface');
  const [dragging, setDragging] = useState(false);
  const [text, setText] = useState(INITIAL_TEXT);
  const [erased, setErased] = useState<number[]>([]);
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
    const box = CONTROL_BOX[current.kind];
    const next = dragPosition(pointer, { x: drag.ox, y: drag.oy }, box, bounds);
    drag.nx = next.x;
    drag.ny = next.y;
    const moved = controlsRef.current.map((item) => (item.id === drag.id ? { ...item, ...next } : item));
    commitControls(moved);
    if (current.kind === 'eraser') markEraser(drag, next.x + box.w / 2, next.y + box.h / 2);
  }

  function textMetrics() {
    const page = pageRef.current;
    const fieldEl = fieldRef.current;
    const view = derive(surfaceRef.current, controlsRef.current, fieldRefState.current);
    let originX = surfaceRef.current.x + 18;
    let originY = surfaceRef.current.y + 58;
    let width = view.size.w - 36;
    if (page && fieldEl) {
      const pageBox = page.getBoundingClientRect();
      const fieldBox = fieldEl.getBoundingClientRect();
      originX = pageBox.left - fieldBox.left;
      originY = pageBox.top - fieldBox.top;
      width = page.clientWidth;
    }
    return { view, originX, originY, width };
  }

  function markEraser(drag: Drag, x: number, y: number) {
    const now = performance.now();
    drag.samples.push({ t: now, x });
    if (drag.samples.length > 24) drag.samples.shift();
    if (isShake(drag.samples, now)) {
      setErased([]);
      drag.samples.length = 0;
      return;
    }
    const { view, originX, originY, width } = textMetrics();
    const words = layoutWords(text, width, view.fontSize, view.lineHeight, view.weight, view.tracking);
    const hits = wordsUnderEraser(words, originX, originY, view.fontSize * view.lineHeight, x, y);
    if (hits.length === 0) return;
    setErased((current) => Array.from(new Set([...current, ...hits])));
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
    if (control.kind === 'case' && pull >= 1 && !drag.caseWasOn) {
      const value = control.value >= 3 ? 1 : control.value + 1;
      commitControls(controlsRef.current.map((item) => (item.id === control.id ? { ...item, value } : item)));
      announce(`${controlTitle(control)} dropped on the text. Case is now ${caseName(value)}. It stays there.`);
      return;
    }
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
      id: 0,
      ox: pointer.x - at.x,
      oy: pointer.y - at.y,
      nx: at.x,
      ny: at.y,
      frame: 0,
      samples: [],
      caseWasOn: false,
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
    const gap = gapBetween(inkBounds(surfaceRef.current, surfaceSize(fieldRefState.current.w, fieldRefState.current.h)), controlBox(control));
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: 'control',
      id,
      ox: pointer.x - control.x,
      oy: pointer.y - control.y,
      nx: control.x,
      ny: control.y,
      frame: 0,
      samples: [],
      caseWasOn: control.kind === 'case' && gap <= 0,
    };
    setSelected(id);
    setDragging(true);
    document.getElementById(`move-${id}`)?.focus({ preventScroll: true });
  }

  function beginLibraryDrag(event: ReactPointerEvent<HTMLButtonElement>, kind: Kind) {
    if (event.button !== 0) return;
    event.preventDefault();
    const pointer = toField(event);
    const id = nextId.current++;
    const control: Control = {
      id,
      kind,
      x: pointer.x - 28,
      y: pointer.y - 22,
      value: spawnValue(kind),
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
      samples: [],
      caseWasOn: false,
    };
    setSelected(id);
    setDragging(true);
  }

  function placeFromLibrary(kind: Kind) {
    const bounds = fieldRefState.current;
    const size = surfaceSize(bounds.w, bounds.h);
    const ink = inkBounds(surfaceRef.current, size);
    const box = CONTROL_BOX[kind];
    const same = controlsRef.current.filter((item) => item.kind === kind).length;
    const raw =
      kind === 'size'
        ? { x: ink.x + 28 + same * 36, y: ink.y - box.h - 78 }
        : kind === 'lead'
          ? { x: ink.x + ink.w + 78, y: ink.y + 24 + same * 36 }
          : { x: ink.x + 16 + (same % 3) * 40, y: ink.y + ink.h + 28 + Math.floor(same / 3) * 24 };
    const at = clampInside(raw.x, raw.y, box.w, box.h, bounds);
    const id = nextId.current++;
    const control: Control = {
      id,
      kind,
      ...at,
      value: spawnValue(kind),
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
    const box = CONTROL_BOX[current.kind];
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
      const box = CONTROL_BOX[current.kind];
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
    setErased([]);
    setSelected('surface');
    announce('Controls cleared. The writing is still here, and the surface is back at the center.');
  }

  const pageBox = pageRef.current?.getBoundingClientRect();
  const fieldBox = fieldRef.current?.getBoundingClientRect();
  const originX = pageBox && fieldBox ? pageBox.left - fieldBox.left : surface.x + 18;
  const originY = pageBox && fieldBox ? pageBox.top - fieldBox.top : surface.y + 64;
  const pageWidth = pageRef.current?.clientWidth || model.size.w - 36;
  const spatial =
    erased.length > 0 ||
    model.metrics.some((item) => item.pull > 0.02 && (item.kind === 'gravity' || item.kind === 'contrast' || item.kind === 'wave' || item.kind === 'eraser'));
  const styled = spatial
    ? styleWords(
        layoutWords(text, pageWidth, model.fontSize, model.lineHeight, model.weight, model.tracking),
        originX,
        originY,
        model.fontSize * model.lineHeight,
        model.metrics
          .filter((item) => item.kind === 'gravity')
          .map((item) => ({ x: item.box.x + item.box.w / 2, y: item.box.y + item.box.h / 2, pull: item.pull, value: item.value })),
        model.metrics
          .filter((item) => item.kind === 'contrast')
          .map((item) => ({ x: item.box.x + item.box.w / 2, y: item.box.y + item.box.h / 2, pull: item.pull, value: item.value })),
        model.metrics
          .filter((item) => item.kind === 'wave')
          .map((item) => ({ x: item.x, y: item.y, pull: item.pull, value: item.value })),
        model.metrics
          .filter((item) => item.kind === 'eraser')
          .map((item) => ({ x: item.box.x + item.box.w / 2, y: item.box.y + item.box.h / 2, pull: item.pull, value: item.value })),
        new Set(erased),
      )
    : [];
  const caseTransform = model.caseMode === 1 ? 'uppercase' : model.caseMode === 2 || model.caseMode === 3 ? 'lowercase' : 'none';
  const caseCaps = model.caseMode === 3 ? 'all-small-caps' : 'normal';
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
          {KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className="instrument"
              aria-describedby="library-help"
              onPointerDown={(event) => beginLibraryDrag(event, kind)}
              onPointerMove={onPointerMove}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                placeFromLibrary(kind);
              }}
            >
              <strong>{KIND_LABEL[kind]}</strong>
              <small>{KIND_HINT[kind]}</small>
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
                  const bulk = inkBulk(item.kind, item.value);
                  const scale = satelliteScale(item.pull) * (item.kind === 'weight' ? 0.65 + bulk * 0.4 : 1);
                  if (scale <= 0) return null;
                  const satellite = scaleAboutCenter(inflate(item.box, 8), scale);
                  const thick = bridgeThickness(item.pull, bulk);
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
              style={{
                left: surface.x,
                top: surface.y,
                width: model.size.w,
                height: model.size.h,
                ['--wght' as string]: model.weight,
                ['--slnt' as string]: model.slant,
                ['--track' as string]: `${model.tracking}em`,
                ['--xform' as string]: caseTransform,
                ['--caps' as string]: caseCaps,
              }}
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
              <div className="page" ref={pageRef}>
                {spatial && (
                  <div className="word-stage" aria-hidden="true" style={{ fontSize: model.fontSize, lineHeight: model.lineHeight }}>
                    {styled.map((word) => (
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
                  onChange={(event) => setText(event.target.value)}
                  style={{ fontSize: model.fontSize, lineHeight: model.lineHeight }}
                />
              </div>
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
                onRestore={() => setErased([])}
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
          <p className="quiet specimen-extra">
            {Math.round(model.weight)} weight · {model.tracking.toFixed(2)} tracking · {model.slant.toFixed(0)} slant
            {model.caseMode ? ` · ${caseName(model.caseMode)}` : ''}
          </p>

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
                {shortLabel(item.kind, item.id)}
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

function clampNum(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
  onRestore,
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
  onRestore: () => void;
}) {
  const name = controlTitle(item);
  const linked = item.pull >= LINK_AT;
  const vertical = item.kind === 'lead';
  function stopGesture(event: ReactPointerEvent) {
    event.stopPropagation();
  }
  function dialAngle(weight: number) {
    return -140 + ((weight - WEIGHT_MIN) / (WEIGHT_MAX - WEIGHT_MIN)) * 280;
  }
  function weightFromEvent(event: ReactPointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const degrees = Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2)) * (180 / Math.PI);
    const clamped = clampNum(degrees, -150, 150);
    return Math.round(WEIGHT_MIN + ((clamped + 150) / 300) * (WEIGHT_MAX - WEIGHT_MIN));
  }
  function nudge(event: ReactKeyboardEvent, delta: number, min: number, max: number) {
    if (!ARROWS[event.key] && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    event.stopPropagation();
    const sign = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0;
    if (!sign) return;
    onValue(clampNum(item.value + sign * delta, min, max));
  }
  return (
    <article
      className="control"
      data-axis={vertical ? 'vertical' : 'horizontal'}
      data-kind={item.kind}
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
        if (target.closest('input, .remove, .gesture, .cycle, .restore')) return;
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
          <span className="kicker">{KIND_LABEL[item.kind]}</span>
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
      {item.kind === 'size' || item.kind === 'lead' ? (
        <label className="slider">
          <span className="readout">
            {item.kind === 'size' ? formatSize(item.value) : formatLead(item.value)}
            <small>{item.kind === 'size' ? 'px' : '×'}</small>
          </span>
          <input
            type="range"
            min={item.kind === 'size' ? SIZE_MIN : LEAD_MIN}
            max={item.kind === 'size' ? SIZE_MAX : LEAD_MAX}
            step={item.kind === 'size' ? SIZE_STEP : LEAD_STEP}
            value={item.value}
            aria-label={name}
            aria-orientation={vertical ? 'vertical' : 'horizontal'}
            onChange={(event) => onValue(Number(event.target.value))}
            onPointerDown={(event) => event.stopPropagation()}
          />
        </label>
      ) : null}
      {item.kind === 'weight' ? (
        <div className="dial-row">
          <button
            type="button"
            className="gesture dial"
            role="slider"
            aria-valuemin={WEIGHT_MIN}
            aria-valuemax={WEIGHT_MAX}
            aria-valuenow={Math.round(item.value)}
            aria-label={`${name} dial`}
            onPointerDown={(event) => {
              stopGesture(event);
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              onValue(weightFromEvent(event));
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              onValue(weightFromEvent(event));
            }}
            onKeyDown={(event) => nudge(event, 40, WEIGHT_MIN, WEIGHT_MAX)}
          >
            <i style={{ transform: `rotate(${dialAngle(item.value)}deg)` }} />
          </button>
          <span className="readout">{Math.round(item.value)}</span>
        </div>
      ) : null}
      {item.kind === 'tracking' ? (
        <div className="pinch">
          <span className="pinch-line" style={{ width: 12 + ((item.value - TRACK_MIN) / (TRACK_MAX - TRACK_MIN)) * 78 }} />
          <span className="dot" />
          <button
            type="button"
            className="gesture dot dot-live"
            role="slider"
            aria-valuemin={TRACK_MIN}
            aria-valuemax={TRACK_MAX}
            aria-valuenow={Number(item.value.toFixed(2))}
            aria-label={`${name} pinch`}
            style={{ left: 28 + ((item.value - TRACK_MIN) / (TRACK_MAX - TRACK_MIN)) * 78 }}
            onPointerDown={(event) => {
              stopGesture(event);
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              const rect = event.currentTarget.parentElement!.getBoundingClientRect();
              const local = clampNum(event.clientX - rect.left - 28, 0, 78);
              onValue(TRACK_MIN + (local / 78) * (TRACK_MAX - TRACK_MIN));
            }}
            onKeyDown={(event) => nudge(event, 0.02, TRACK_MIN, TRACK_MAX)}
          />
          <span className="readout">{item.value.toFixed(2)}</span>
        </div>
      ) : null}
      {item.kind === 'slant' ? (
        <button
          type="button"
          className="gesture lever"
          role="slider"
          aria-valuemin={SLANT_MIN}
          aria-valuemax={SLANT_MAX}
          aria-valuenow={Math.round(item.value)}
          aria-label={`${name} lever`}
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
          <span>{item.value.toFixed(0)}°</span>
        </button>
      ) : null}
      {item.kind === 'gravity' ? <div className="blob-mark" aria-hidden="true" /> : null}
      {item.kind === 'contrast' ? <div className="puck-mark" aria-hidden="true" /> : null}
      {item.kind === 'case' ? (
        <button
          type="button"
          className="cycle"
          onPointerDown={stopGesture}
          onClick={() => onValue(item.value >= 3 ? 1 : item.value + 1)}
        >
          {caseName(item.value)}
        </button>
      ) : null}
      {item.kind === 'wave' ? (
        <div className="wave">
          <svg viewBox="0 0 160 36" aria-hidden="true">
            <path d={`M4 28 Q 80 ${28 - item.value * 1.6} 156 28`} />
          </svg>
          <button
            type="button"
            className="gesture wave-handle"
            role="slider"
            aria-valuemin={0}
            aria-valuemax={16}
            aria-valuenow={Math.round(item.value)}
            aria-label={`${name} string`}
            style={{ top: 22 - item.value * 1.15 }}
            onPointerDown={(event) => {
              stopGesture(event);
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              const rect = event.currentTarget.parentElement!.getBoundingClientRect();
              const lift = clampNum(rect.bottom - 8 - event.clientY, 0, 28);
              onValue(lift / 1.7);
            }}
            onKeyDown={(event) => nudge(event, 2, 0, 16)}
          />
        </div>
      ) : null}
      {item.kind === 'eraser' ? (
        <button type="button" className="restore" onPointerDown={stopGesture} onClick={onRestore}>
          Restore
        </button>
      ) : null}
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
