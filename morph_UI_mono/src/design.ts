import { useEffect, useState } from 'react';
import { CONTROL_BOX, KIND_LABEL } from './geometry';
import type { Kind } from './geometry';

export type PartRole =
  | 'label'
  | 'index'
  | 'move'
  | 'close'
  | 'readout'
  | 'slider'
  | 'dial'
  | 'pinch-a'
  | 'pinch-b'
  | 'lever'
  | 'mark'
  | 'cycle'
  | 'wave'
  | 'wave-handle'
  | 'restore'
  | 'pull-label'
  | 'pull-bar'
  | 'pull-value'
  | 'title'
  | 'copy'
  | 'meta'
  | 'writing'
  | 'button'
  | 'art'
  | 'caption'
  | 'play'
  | 'time'
  | 'progress'
  | 'field-label'
  | 'field'
  | 'submit'
  | 'bar';

export type Part = {
  id: string;
  role: PartRole;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  radius: number;
  visible: boolean;
  text: string;
};

export type Frame = {
  id: string;
  name: string;
  group: 'gadget' | 'body';
  w: number;
  h: number;
  radius: number;
  parts: Part[];
};

export type DesignConfig = {
  version: 1;
  frames: Record<string, Frame>;
};

export const BODY_IDS = ['text', 'button', 'card', 'image', 'music', 'form', 'chart'] as const;
export type BodyId = (typeof BODY_IDS)[number];

export const BODY_LABEL: Record<BodyId, string> = {
  text: 'Text',
  button: 'Button',
  card: 'Card',
  image: 'Image',
  music: 'Music',
  form: 'Form',
  chart: 'Chart',
};

const STORAGE_KEY = 'morph-mono-design-v1';

function part(
  id: string,
  role: PartRole,
  x: number,
  y: number,
  w: number,
  h: number,
  text = '',
  fontSize = 11,
  radius = 0,
): Part {
  return { id, role, x, y, w, h, fontSize, radius, visible: true, text };
}

function chrome(label: string, w: number, h: number): Part[] {
  return [
    part('label', 'label', 10, 8, Math.max(48, w - 118), 18, label, 10),
    part('index', 'index', w - 104, 8, 26, 16, '01', 10),
    part('move', 'move', w - 74, 6, 36, 20, 'Move', 10, 8),
    part('close', 'close', w - 34, 4, 26, 26, '×', 16, 13),
    part('pull-label', 'pull-label', 10, h - 22, 34, 14, 'Pull', 10),
    part('pull-bar', 'pull-bar', 48, h - 16, Math.max(24, w - 96), 2, ''),
    part('pull-value', 'pull-value', w - 44, h - 22, 34, 14, '%', 10),
  ];
}

function gadget(kind: Kind, extra: Part[]): Frame {
  const box = CONTROL_BOX[kind];
  return {
    id: kind,
    name: KIND_LABEL[kind],
    group: 'gadget',
    w: box.w,
    h: box.h,
    radius: 16,
    parts: [...chrome(KIND_LABEL[kind], box.w, box.h), ...extra],
  };
}

function defaults(): DesignConfig {
  const size = gadget('size', [
    part('readout', 'readout', 10, 36, 58, 26, 'px', 18),
    part('slider', 'slider', 74, 40, 166, 22, '', 12, 8),
  ]);
  const lead = gadget('lead', [
    part('readout', 'readout', 36, 40, 68, 24, '×', 16),
    part('slider', 'slider', 54, 72, 28, 150, '', 12, 8),
  ]);
  const weight = gadget('weight', [
    part('dial', 'dial', 14, 40, 72, 72, '', 12, 36),
    part('readout', 'readout', 96, 58, 58, 28, '', 18),
  ]);
  const tracking = gadget('tracking', [
    part('pinch-a', 'pinch-a', 16, 52, 16, 16, '', 12, 8),
    part('pinch-b', 'pinch-b', 120, 52, 16, 16, '', 12, 8),
    part('readout', 'readout', 150, 46, 58, 26, 'em', 16),
  ]);
  const slant = gadget('slant', [
    part('lever', 'lever', 16, 40, 136, 72, '°', 12, 12),
  ]);
  const gravity = gadget('gravity', [part('mark', 'mark', 40, 40, 56, 56, '', 12, 28)]);
  const contrast = gadget('contrast', [part('mark', 'mark', 40, 40, 56, 56, '', 12, 28)]);
  const caseFrame = gadget('case', [part('cycle', 'cycle', 14, 48, 110, 32, 'ABC', 13, 16)]);
  const wave = gadget('wave', [
    part('wave', 'wave', 12, 36, 168, 40, '', 12, 0),
    part('wave-handle', 'wave-handle', 96, 44, 16, 16, '', 12, 8),
  ]);
  const eraser = gadget('eraser', [
    part('mark', 'mark', 16, 44, 40, 40, '', 12, 20),
    part('restore', 'restore', 66, 52, 74, 28, 'Restore', 12, 14),
  ]);
  const frames: Record<string, Frame> = {
    size,
    lead,
    weight,
    tracking,
    slant,
    gravity,
    contrast,
    case: caseFrame,
    wave,
    eraser,
    'body:text': {
      id: 'body:text',
      name: 'Text',
      group: 'body',
      w: 480,
      h: 348,
      radius: 36,
      parts: [
        part('move', 'move', 18, 14, 128, 28, 'Move surface', 10, 14),
        part('count', 'meta', 340, 18, 122, 16, 'words', 10),
        part('writing', 'writing', 18, 52, 444, 236, '', 21, 0),
        part('foot-name', 'caption', 18, 308, 140, 16, 'Untitled', 10),
        part('foot-read', 'readout', 280, 308, 182, 16, 'px', 10),
      ],
    },
    'body:button': {
      id: 'body:button',
      name: 'Button',
      group: 'body',
      w: 360,
      h: 160,
      radius: 28,
      parts: [part('button', 'button', 36, 44, 288, 72, 'Continue', 22, 36)],
    },
    'body:card': {
      id: 'body:card',
      name: 'Card',
      group: 'body',
      w: 400,
      h: 240,
      radius: 28,
      parts: [
        part('title', 'title', 24, 22, 340, 28, 'Field note', 22),
        part('copy', 'copy', 24, 64, 352, 100, 'A quiet card on the ink. Spacing and weight still reach it.', 15),
        part('meta', 'meta', 24, 190, 200, 16, 'Local only', 11),
      ],
    },
    'body:image': {
      id: 'body:image',
      name: 'Image',
      group: 'body',
      w: 400,
      h: 280,
      radius: 24,
      parts: [
        part('art', 'art', 20, 18, 360, 196, '', 12, 8),
        part('caption', 'caption', 20, 228, 360, 22, 'Untitled plate', 13),
      ],
    },
    'body:music': {
      id: 'body:music',
      name: 'Music',
      group: 'body',
      w: 420,
      h: 168,
      radius: 28,
      parts: [
        part('title', 'title', 20, 18, 240, 24, 'Night study', 16),
        part('time', 'time', 300, 22, 96, 16, '1:24', 11),
        part('play', 'play', 20, 64, 52, 52, 'Play', 12, 26),
        part('progress', 'progress', 88, 82, 308, 18, '', 11, 8),
      ],
    },
    'body:form': {
      id: 'body:form',
      name: 'Form',
      group: 'body',
      w: 400,
      h: 260,
      radius: 24,
      parts: [
        part('label-name', 'field-label', 24, 18, 200, 16, 'Name', 11),
        part('name', 'field', 24, 38, 352, 36, 'Your name', 14, 8),
        part('label-note', 'field-label', 24, 88, 200, 16, 'Note', 11),
        part('note', 'field', 24, 108, 352, 36, 'A line', 14, 8),
        part('submit', 'submit', 24, 176, 120, 40, 'Send', 14, 20),
      ],
    },
    'body:chart': {
      id: 'body:chart',
      name: 'Chart',
      group: 'body',
      w: 400,
      h: 240,
      radius: 24,
      parts: [
        part('caption', 'caption', 20, 16, 180, 18, 'This week', 12),
        part('bar-a', 'bar', 48, 52, 40, 150, 'Mon', 11, 4),
        part('bar-b', 'bar', 120, 78, 40, 124, 'Tue', 11, 4),
        part('bar-c', 'bar', 192, 44, 40, 158, 'Wed', 11, 4),
        part('bar-d', 'bar', 264, 96, 40, 106, 'Thu', 11, 4),
      ],
    },
  };
  return { version: 1, frames };
}

export const DEFAULT_DESIGN: DesignConfig = defaults();

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function freshDesign(): DesignConfig {
  return clone(DEFAULT_DESIGN);
}

function isPart(value: unknown): value is Part {
  if (!value || typeof value !== 'object') return false;
  const partValue = value as Partial<Part>;
  return typeof partValue.id === 'string' && typeof partValue.x === 'number' && typeof partValue.w === 'number';
}

export function mergeDesign(input: unknown): DesignConfig {
  const base = freshDesign();
  if (!input || typeof input !== 'object') return base;
  const frames = (input as { frames?: unknown }).frames;
  if (!frames || typeof frames !== 'object') return base;
  for (const [id, fallback] of Object.entries(base.frames)) {
    const saved = (frames as Record<string, unknown>)[id];
    if (!saved || typeof saved !== 'object') continue;
    const source = saved as Partial<Frame>;
    const parts = Array.isArray(source.parts) ? source.parts.filter(isPart) : [];
    const byId = new Map(parts.map((item) => [item.id, item]));
    base.frames[id] = {
      ...fallback,
      w: typeof source.w === 'number' ? source.w : fallback.w,
      h: typeof source.h === 'number' ? source.h : fallback.h,
      radius: typeof source.radius === 'number' ? source.radius : fallback.radius,
      parts: fallback.parts.map((item) => ({ ...item, ...(byId.get(item.id) ?? {}) })),
    };
  }
  return base;
}

export function loadDesign(): DesignConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshDesign();
    return mergeDesign(JSON.parse(raw));
  } catch {
    return freshDesign();
  }
}

export function saveDesign(config: DesignConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new Event('morph-design'));
}

export function useDesign() {
  const [design, setDesign] = useState<DesignConfig>(() => loadDesign());
  useEffect(() => {
    const sync = () => setDesign(loadDesign());
    window.addEventListener('morph-design', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('morph-design', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return design;
}

export const layoutNow: { surface: { w: number; h: number }; box: Record<string, { w: number; h: number }> } = {
  surface: { w: 480, h: 348 },
  box: {},
};

export function publishLayout(design: DesignConfig, field: { w: number; h: number }, body: BodyId) {
  const boxes: Record<string, { w: number; h: number }> = {};
  for (const frame of Object.values(design.frames)) boxes[frame.id] = { w: frame.w, h: frame.h };
  const bodyFrame = design.frames[`body:${body}`];
  const capW = Math.max(180, field.w - 20);
  const capH = Math.max(140, field.h - 20);
  layoutNow.box = boxes;
  layoutNow.surface = bodyFrame
    ? { w: Math.min(Math.max(180, bodyFrame.w), capW), h: Math.min(Math.max(140, bodyFrame.h), capH) }
    : { w: Math.min(480, capW), h: Math.min(348, capH) };
}
