export type Axis = 'horizontal' | 'vertical';

export type Rect = { x: number; y: number; w: number; h: number };

export type Control = {
  id: number;
  axis: Axis;
  x: number;
  y: number;
  value: number;
};

export const REST_SIZE = 21;
export const REST_LEAD = 1.5;
export const SPAWN_SIZE = 36;
export const SPAWN_LEAD = 2.2;
export const SIZE_MIN = 14;
export const SIZE_MAX = 44;
export const LEAD_MIN = 1.1;
export const LEAD_MAX = 2.4;
export const SIZE_STEP = 1;
export const LEAD_STEP = 0.05;

export const REACH = 156;
export const INK_PAD = 18;
export const LINK_AT = 0.58;

export const CONTROL_BOX: Record<Axis, { w: number; h: number }> = {
  horizontal: { w: 252, h: 108 },
  vertical: { w: 140, h: 268 },
};

export const NUDGE_STEP = 16;
export const KEY_STEP = 8;
export const KEY_STEP_LARGE = 32;

export function surfaceSize(fieldW: number, fieldH: number): { w: number; h: number } {
  if (fieldW < 40 || fieldH < 40) return { w: 480, h: 300 };
  return {
    w: Math.min(480, Math.max(280, fieldW - 40)),
    h: Math.min(348, Math.max(240, fieldH - 32)),
  };
}

export function controlBox(control: Pick<Control, 'axis' | 'x' | 'y'>): Rect {
  const size = CONTROL_BOX[control.axis];
  return { x: control.x, y: control.y, w: size.w, h: size.h };
}

export function inkBounds(surface: { x: number; y: number }, size: { w: number; h: number }): Rect {
  return {
    x: surface.x - INK_PAD,
    y: surface.y - INK_PAD,
    w: size.w + INK_PAD * 2,
    h: size.h + INK_PAD * 2,
  };
}

export function inflate(rect: Rect, pad: number): Rect {
  return { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 };
}

export function scaleAboutCenter(rect: Rect, scale: number): Rect {
  const w = rect.w * scale;
  const h = rect.h * scale;
  return {
    x: rect.x + (rect.w - w) / 2,
    y: rect.y + (rect.h - h) / 2,
    w,
    h,
  };
}

/** Shortest distance between two rectangles. Zero when they overlap. */
export function gapBetween(a: Rect, b: Rect): number {
  const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0);
  const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0);
  return Math.hypot(dx, dy);
}

/** 1 when touching, 0 at REACH, smooth in between. */
export function pullFromGap(gap: number): number {
  if (gap <= 0) return 1;
  if (gap >= REACH) return 0;
  const t = 1 - gap / REACH;
  return t * t * (3 - 2 * t);
}

/**
 * Mix control values by pull. While the weights sum to less than 1, the
 * resting value keeps the remaining share, so type eases away from rest
 * instead of jumping to the first nearby slider. Once the weights reach 1,
 * nearby controls share the result among themselves.
 */
export function blendWithRest(parts: { value: number; weight: number }[], rest: number): number {
  let weight = 0;
  let acc = 0;
  for (const part of parts) {
    if (part.weight <= 0) continue;
    weight += part.weight;
    acc += part.weight * part.value;
  }
  if (weight <= 0) return rest;
  if (weight < 1) return acc + (1 - weight) * rest;
  return acc / weight;
}

export function bridgeThickness(pull: number): number {
  if (pull <= 0.045) return 0;
  return 16 + Math.pow(pull, 0.8) * 72;
}

export function satelliteScale(pull: number): number {
  if (pull <= 0.045) return 0;
  return Math.min(1.16, (pull / LINK_AT) * 1.16);
}

export function clampInside(x: number, y: number, w: number, h: number, field: { w: number; h: number }): { x: number; y: number } {
  if (field.w <= 0 || field.h <= 0) return { x, y };
  const maxX = Math.max(0, field.w - w);
  const maxY = Math.max(0, field.h - h);
  return {
    x: Math.min(maxX, Math.max(0, x)),
    y: Math.min(maxY, Math.max(0, y)),
  };
}

/**
 * Follow the pointer exactly. While the pointer is still outside the field
 * (a drag that starts in the library), allow the box to sit off-canvas so it
 * tracks under the cursor. Once the pointer is inside, keep the box fully
 * on the field. Interior releases therefore stay on the coordinates where
 * the pointer let go.
 */
export function dragPosition(
  pointer: { x: number; y: number },
  offset: { x: number; y: number },
  box: { w: number; h: number },
  field: { w: number; h: number },
): { x: number; y: number } {
  const raw = { x: pointer.x - offset.x, y: pointer.y - offset.y };
  const inside =
    pointer.x >= 0 && pointer.y >= 0 && pointer.x <= field.w && pointer.y <= field.h;
  if (!inside) return raw;
  return clampInside(raw.x, raw.y, box.w, box.h, field);
}

export function formatSize(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatLead(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

export function controlTitle(control: Pick<Control, 'id' | 'axis'>): string {
  return control.axis === 'horizontal' ? `Font size ${control.id}` : `Line spacing ${control.id}`;
}

export function centerOf(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}
