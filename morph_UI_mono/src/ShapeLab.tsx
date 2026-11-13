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
  NUDGE_STEP,
  REST_LEAD,
  REST_SIZE,
  REST_SLANT,
  REST_TRACK,
  REST_WEIGHT,
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
  scaleAboutCenter,
  shortLabel,
  spawnValue,
  surfaceSize,
} from './geometry';
import type { Control, Kind, Rect } from './geometry';
import { isShake, layoutWords, styleWords, wordsUnderEraser } from './typefx';
import { layoutNow, publishLayout, useDesign } from './design';
import type { BodyId } from './design';
import { BODY_IDS, BODY_LABEL } from './design';
import { GadgetFace } from './GadgetFace';
import { BodyStage } from './BodyStage';
import './editor.css';

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
  const size = field.w > 40 ? layoutNow.surface : surfaceSize(field.w, field.h);
  const ink = inkBounds(surface, size);
  const metrics: Metric[] = controls.map((control) => {
    const sized = layoutNow.box[control.kind];
    const box = sized ? { x: control.x, y: control.y, w: sized.w, h: sized.h } : controlBox(control);
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
  const [hiddenParts, setHiddenParts] = useState<string[]>([]);
  const [body, setBody] = useState<BodyId>('text');
  const [notice, setNotice] = useState('The field is empty. Add a control from the library.');
  const design = useDesign();
  const bodyRef = useRef(body);
  const hiddenRef = useRef(hiddenParts);
  bodyRef.current = body;
  hiddenRef.current = hiddenParts;

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
        const size = layoutNow.surface.w > 0 ? layoutNow.surface : surfaceSize(w, h);
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

  publishLayout(design, field, body);
  const model = derive(surface, controls, field);
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
    const box = layoutNow.box[current.kind] ?? CONTROL_BOX[current.kind];
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
      setHiddenParts([]);
      drag.samples.length = 0;
      return;
    }
    const { view, originX, originY, width } = textMetrics();
    const words = layoutWords(text, width, view.fontSize, view.lineHeight, view.weight, view.tracking);
    const hits = wordsUnderEraser(words, originX, originY, view.fontSize * view.lineHeight, x, y);
    if (hits.length > 0 && bodyRef.current === 'text') setErased((current) => Array.from(new Set([...current, ...hits])));
    const frame = design.frames[`body:${bodyRef.current}`];
    const at = surfaceRef.current;
    if (frame) {
      const covered = frame.parts
        .filter((part) => Math.hypot(x - (at.x + part.x + part.w / 2), y - (at.y + part.y + part.h / 2)) < 52)
        .map((part) => part.id);
      if (covered.length) setHiddenParts((current) => Array.from(new Set([...current, ...covered])));
    }
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
    if (target.closest('textarea, input, .no-drag')) return;
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
    const box = layoutNow.box[kind] ?? CONTROL_BOX[kind];
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
    const box = layoutNow.box[current.kind] ?? CONTROL_BOX[current.kind];
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
      const box = layoutNow.box[current.kind] ?? CONTROL_BOX[current.kind];
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
    setHiddenParts([]);
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
  const bodyFrame = design.frames[`body:${body}`] ?? design.frames['body:text'];
  let shiftX = 0;
  let shiftY = 0;
  let greyMix = 0;
  let waveAmp = 0;
  const centerX = surface.x + model.size.w / 2;
  const centerY = surface.y + model.size.h / 2;
  for (const item of model.metrics) {
    const itemX = item.box.x + item.box.w / 2;
    const itemY = item.box.y + item.box.h / 2;
    if (item.kind === 'gravity' && item.pull > 0) {
      const vx = itemX - centerX;
      const vy = itemY - centerY;
      const dist = Math.hypot(vx, vy) || 1;
      const force = Math.max(0, 1 - dist / 230) * item.pull * item.value;
      shiftX += (vx / dist) * force * 28;
      shiftY += (vy / dist) * force * 20;
    }
    if (item.kind === 'contrast' && item.pull > 0) {
      greyMix = Math.max(greyMix, Math.min(1, Math.hypot(itemX - centerX, itemY - centerY) / 220) * item.pull);
    }
    if (item.kind === 'wave') waveAmp = Math.max(waveAmp, item.value * item.pull);
  }
  const grey = mixHex('#f4f4f2', '#8a8a88', greyMix);
  const bodyFx = {
    fontSize: model.fontSize,
    lineHeight: model.lineHeight,
    weight: model.weight,
    tracking: model.tracking,
    slant: model.slant,
    border: 1 + ((model.weight - 100) / 800) * 7,
    gap: 8 + Math.max(0, model.tracking) * 80,
    skew: model.slant * -1.1,
    wave: waveAmp,
    shiftX,
    shiftY,
    grey,
    transform: caseTransform,
    caps: caseCaps,
  };
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
            <button type="button" className="text-button" onClick={resetField}>
              Reset field
            </button>
          </div>
        </aside>

        <section className="stage-column" aria-label="Canvas">
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
                <rect x={blob.x} y={blob.y} width={blob.w} height={blob.h} rx={(bodyFrame?.radius ?? 36) + swell * 0.2} />
                {model.metrics.map((item) => {
                  const bulk = inkBulk(item.kind, item.value);
                  const cover = item.kind === 'weight' ? 1 + Math.max(0, bulk - 0.4) * 0.22 : 1;
                  const satellite = scaleAboutCenter(inflate(item.box, 16), cover);
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
                        rx={Math.min(design.frames[item.kind]?.radius ?? 16, satellite.h / 2)}
                      />
                    </g>
                  );
                })}
              </g>
            </svg>

            <div className="body-switch" role="group" aria-label="Main body">
              {BODY_IDS.map((id) => (
                <button key={id} type="button" aria-pressed={body === id} onClick={() => setBody(id)}>
                  {BODY_LABEL[id]}
                </button>
              ))}
            </div>
            <a className="layout-link" href="#/editor">
              Layout
            </a>
            {bodyFrame && (
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
              <BodyStage
                frame={bodyFrame}
                fx={bodyFx}
                hidden={new Set(hiddenParts)}
                text={text}
                onText={setText}
                wordCount={wordCount(text)}
                spatial={spatial && body === 'text'}
                words={styled}
                pageRef={pageRef}
                onSurfaceKeyDown={(event) => onHandleKeyDown(event, 'surface')}
                onSurfaceKeyUp={(event) => onHandleKeyUp(event, 'surface')}
                onSurfaceFocus={() => setSelected('surface')}
              />
            </section>
            )}

            {model.metrics.map((item) => {
              const activeDrag = dragRef.current;
              const frame = design.frames[item.kind];
              if (!frame) return null;
              return (
              <GadgetFace
                key={item.id}
                frame={frame}
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
                onRestore={() => {
                  setErased([]);
                  setHiddenParts([]);
                }}
              />
              );
            })}

            {controls.length === 0 && <p className="field-hint">Drag an instrument close. The ink will reach.</p>}
          </div>
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

function mixHex(from: string, to: string, amount: number) {
  const t = Math.min(1, Math.max(0, amount));
  const read = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const a = read(from);
  const b = read(to);
  return `#${a.map((channel, index) => Math.round(channel + (b[index] - channel) * t).toString(16).padStart(2, '0')).join('')}`;
}
