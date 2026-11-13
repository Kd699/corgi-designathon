import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import './editor.css';
import {
  BODY_IDS,
  BODY_LABEL,
  freshDesign,
  loadDesign,
  mergeDesign,
  saveDesign,
} from './design';
import type { DesignConfig, Frame, Part } from './design';
import { KINDS, KIND_LABEL } from './geometry';

const GRID = 8;

function snap(value: number, enabled: boolean) {
  const next = enabled ? Math.round(value / GRID) * GRID : Math.round(value);
  return next;
}

export default function EditorPage() {
  const [config, setConfig] = useState<DesignConfig>(() => loadDesign());
  const [frameId, setFrameId] = useState<string>('size');
  const [partId, setPartId] = useState<string | null>('label');
  const [grid, setGrid] = useState(true);
  const [note, setNote] = useState('Edits save in this browser.');
  const past = useRef<DesignConfig[]>([]);
  const future = useRef<DesignConfig[]>([]);
  const configRef = useRef(config);
  configRef.current = config;
  const drag = useRef<{
    mode: 'move' | 'resize';
    id: string;
    sx: number;
    sy: number;
    part: Part;
  } | null>(null);

  const frame = config.frames[frameId];
  const part = frame?.parts.find((item) => item.id === partId) ?? null;

  function remember() {
    past.current.push(JSON.parse(JSON.stringify(configRef.current)) as DesignConfig);
    if (past.current.length > 40) past.current.shift();
    future.current = [];
  }

  function write(next: DesignConfig, history: boolean) {
    if (history) remember();
    configRef.current = next;
    setConfig(next);
    saveDesign(next);
  }

  function updateFrame(recipe: (current: Frame) => Frame, history: boolean) {
    const current = configRef.current;
    const target = current.frames[frameId];
    if (!target) return;
    write({ ...current, frames: { ...current.frames, [frameId]: recipe(target) } }, history);
  }

  function updatePart(id: string, patch: Partial<Part>, history: boolean) {
    updateFrame(
      (current) => ({
        ...current,
        parts: current.parts.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      }),
      history,
    );
  }

  function undo() {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(configRef.current);
    configRef.current = prev;
    setConfig(prev);
    saveDesign(prev);
  }

  function redo() {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(configRef.current);
    configRef.current = next;
    setConfig(next);
    saveDesign(next);
  }

  function onPartDown(event: ReactPointerEvent, id: string) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const found = configRef.current.frames[frameId]?.parts.find((item) => item.id === id);
    if (!found) return;
    remember();
    setPartId(id);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { mode: 'move', id, sx: event.clientX, sy: event.clientY, part: { ...found } };
  }

  function onResizeDown(event: ReactPointerEvent, id: string) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const found = configRef.current.frames[frameId]?.parts.find((item) => item.id === id);
    if (!found) return;
    remember();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { mode: 'resize', id, sx: event.clientX, sy: event.clientY, part: { ...found } };
  }

  function onMove(event: ReactPointerEvent) {
    const active = drag.current;
    if (!active) return;
    const dx = event.clientX - active.sx;
    const dy = event.clientY - active.sy;
    if (active.mode === 'move') {
      updatePart(active.id, { x: snap(active.part.x + dx, grid), y: snap(active.part.y + dy, grid) }, false);
    } else {
      updatePart(
        active.id,
        {
          w: Math.max(8, snap(active.part.w + dx, grid)),
          h: Math.max(8, snap(active.part.h + dy, grid)),
        },
        false,
      );
    }
  }

  function onUp() {
    drag.current = null;
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'shape-lab-mono.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        remember();
        const next = mergeDesign(JSON.parse(String(reader.result)));
        configRef.current = next;
        setConfig(next);
        saveDesign(next);
        setNote('Imported. The demo uses this layout.');
      } catch {
        setNote('That file is not a layout JSON.');
      }
    };
    reader.readAsText(file);
  }

  return (
    <main className="editor-app">
      <header className="editor-bar">
        <a href="#/">Back to demo</a>
        <strong>Layout</strong>
        <div className="editor-actions">
          <button type="button" onClick={undo}>Undo</button>
          <button type="button" onClick={redo}>Redo</button>
          <button type="button" aria-pressed={grid} onClick={() => setGrid((value) => !value)}>
            Snap {grid ? 'on' : 'off'}
          </button>
          <button type="button" onClick={() => {
            const fallback = freshDesign().frames[frameId];
            if (!fallback) return;
            updateFrame(() => JSON.parse(JSON.stringify(fallback)) as Frame, true);
            setNote('This piece is back to the default.');
          }}>
            Reset this
          </button>
          <button type="button" onClick={() => {
            const next = freshDesign();
            write(next, true);
            setNote('Every piece is back to the default.');
          }}>
            Reset all
          </button>
          <button type="button" onClick={exportJson}>Export JSON</button>
          <label className="import">
            Import JSON
            <input
              type="file"
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) importJson(file);
                event.target.value = '';
              }}
            />
          </label>
        </div>
      </header>
      <div className="editor-grid">
        <aside>
          <p className="kicker">Gadgets</p>
          {KINDS.map((kind) => (
            <button key={kind} type="button" aria-pressed={frameId === kind} onClick={() => { setFrameId(kind); setPartId('label'); }}>
              {KIND_LABEL[kind]}
            </button>
          ))}
          <p className="kicker">Bodies</p>
          {BODY_IDS.map((id) => (
            <button key={id} type="button" aria-pressed={frameId === `body:${id}`} onClick={() => { setFrameId(`body:${id}`); setPartId(config.frames[`body:${id}`]?.parts[0]?.id ?? null); }}>
              {BODY_LABEL[id]}
            </button>
          ))}
        </aside>
        <section
          className="editor-canvas"
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {frame && (
            <div className="editor-frame" style={{ width: frame.w, height: frame.h, borderRadius: frame.radius }}>
              {frame.parts.map((item) => (
                <div
                  key={item.id}
                  className={partId === item.id ? 'edit-part is-selected' : 'edit-part'}
                  style={{
                    left: item.x,
                    top: item.y,
                    width: item.w,
                    height: item.h,
                    fontSize: item.fontSize,
                    borderRadius: item.radius,
                    opacity: item.visible ? 1 : 0.35,
                  }}
                  onPointerDown={(event) => onPartDown(event, item.id)}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                >
                  <span>{item.text || item.role}</span>
                  {partId === item.id && (
                    <i
                      className="resize-handle"
                      onPointerDown={(event) => onResizeDown(event, item.id)}
                      onPointerMove={onMove}
                      onPointerUp={onUp}
                      onPointerCancel={onUp}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="editor-note">{note}</p>
        </section>
        <aside className="editor-inspector">
          {frame && (
            <>
              <p className="kicker">{frame.name}</p>
              <label>
                Width
                <input type="number" value={frame.w} onChange={(event) => updateFrame((current) => ({ ...current, w: Number(event.target.value) || current.w }), true)} />
              </label>
              <label>
                Height
                <input type="number" value={frame.h} onChange={(event) => updateFrame((current) => ({ ...current, h: Number(event.target.value) || current.h }), true)} />
              </label>
              <label>
                Corner radius
                <input type="number" value={frame.radius} onChange={(event) => updateFrame((current) => ({ ...current, radius: Number(event.target.value) || 0 }), true)} />
              </label>
            </>
          )}
          {part && (
            <>
              <p className="kicker">{part.role}</p>
              {(['x', 'y', 'w', 'h', 'fontSize', 'radius'] as const).map((key) => (
                <label key={key}>
                  {key === 'fontSize' ? 'Font size' : key === 'radius' ? 'Corner radius' : key.toUpperCase()}
                  <input
                    type="number"
                    value={part[key]}
                    onChange={(event) => updatePart(part.id, { [key]: Number(event.target.value) || 0 }, true)}
                  />
                </label>
              ))}
              <label className="check">
                <input type="checkbox" checked={part.visible} onChange={(event) => updatePart(part.id, { visible: event.target.checked }, true)} />
                Visible
              </label>
              <label>
                Label
                <input type="text" value={part.text} onChange={(event) => updatePart(part.id, { text: event.target.value }, true)} />
              </label>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
