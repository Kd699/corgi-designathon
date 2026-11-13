export type PlacedWord = {
  text: string;
  start: number;
  x: number;
  y: number;
  w: number;
};

export type StyledWord = PlacedWord & {
  dx: number;
  dy: number;
  opacity: number;
  color: string;
  rotate: number;
};

export type PullPoint = { x: number; y: number; pull: number; value: number };

const widths = new Map<string, number>();
let ctx: CanvasRenderingContext2D | null = null;

function measure(text: string, font: string): number {
  const key = font + '\n' + text;
  const cached = widths.get(key);
  if (cached !== undefined) return cached;
  if (!ctx) {
    const canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d');
  }
  if (!ctx) return text.length * 8;
  ctx.font = font;
  const width = ctx.measureText(text).width;
  if (widths.size > 2000) widths.clear();
  widths.set(key, width);
  return width;
}

export function layoutWords(
  text: string,
  maxWidth: number,
  fontSize: number,
  lineHeight: number,
  weight: number,
  trackingEm: number,
): PlacedWord[] {
  const width = Math.max(40, maxWidth);
  const font = `${Math.round(weight)} ${fontSize}px "Roboto Flex Variable", sans-serif`;
  const track = trackingEm * fontSize;
  const linePx = fontSize * lineHeight;
  const space = measure(' ', font) + track;
  const placed: PlacedWord[] = [];
  let x = 0;
  let y = 0;
  const tokens = text.split(/(\s+)/);
  let cursor = 0;
  for (const token of tokens) {
    const start = cursor;
    cursor += token.length;
    if (token.length === 0) continue;
    if (token.includes('\n')) {
      const lines = token.split('\n').length - 1;
      y += linePx * lines;
      x = 0;
      continue;
    }
    if (/^\s+$/.test(token)) {
      x += space * token.length;
      continue;
    }
    const wordWidth = measure(token, font) + Math.max(0, token.length - 1) * track;
    if (x > 0 && x + wordWidth > width) {
      x = 0;
      y += linePx;
    }
    placed.push({ text: token, start, x, y, w: wordWidth });
    x += wordWidth + space * 0.35;
  }
  return placed;
}

function mixGrey(from: string, to: string, t: number): string {
  const amount = Math.min(1, Math.max(0, t));
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const a = parse(from);
  const b = parse(to);
  const channel = a.map((value, index) => Math.round(value + (b[index] - value) * amount));
  return `#${channel.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

export function styleWords(
  words: PlacedWord[],
  originX: number,
  originY: number,
  linePx: number,
  gravity: PullPoint[],
  contrast: PullPoint[],
  waves: PullPoint[],
  erasers: PullPoint[],
  erased: Set<number>,
): StyledWord[] {
  return words.map((word) => {
    const cx = originX + word.x + word.w / 2;
    const cy = originY + word.y + linePx * 0.5;
    let dx = 0;
    let dy = 0;
    let rotate = 0;
    let fade = 0;
    let opacity = erased.has(word.start) ? 0.14 : 1;
    for (const well of gravity) {
      if (well.pull <= 0) continue;
      const vx = well.x - cx;
      const vy = well.y - cy;
      const distance = Math.hypot(vx, vy) || 1;
      const reach = 230;
      if (distance > reach) continue;
      const force = (1 - distance / reach) ** 1.35 * well.pull * well.value;
      dx += (vx / distance) * force * 42;
      dy += (vy / distance) * force * 30;
      rotate += (vx / distance) * force * 10;
    }
    for (const puck of contrast) {
      if (puck.pull <= 0) continue;
      const distance = Math.hypot(puck.x - cx, puck.y - cy);
      fade = Math.max(fade, Math.min(1, distance / 210) * puck.pull);
    }
    for (const wave of waves) {
      if (wave.pull <= 0) continue;
      dy += Math.sin(word.x * 0.085 + wave.x * 0.02) * wave.value * wave.pull;
    }
    for (const blob of erasers) {
      if (blob.pull < 0.15) continue;
      if (Math.hypot(blob.x - cx, blob.y - cy) < 46) opacity = Math.min(opacity, 0.14);
    }
    return {
      ...word,
      dx,
      dy,
      rotate,
      opacity,
      color: mixGrey('#f4f4f2', '#7a7a78', fade),
    };
  });
}

export function wordsUnderEraser(
  words: PlacedWord[],
  originX: number,
  originY: number,
  linePx: number,
  x: number,
  y: number,
): number[] {
  const hits: number[] = [];
  for (const word of words) {
    const cx = originX + word.x + word.w / 2;
    const cy = originY + word.y + linePx * 0.5;
    if (Math.hypot(x - cx, y - cy) < 46) hits.push(word.start);
  }
  return hits;
}

/** True when the recent horizontal motion has reversed several times. */
export function isShake(samples: { t: number; x: number }[], now: number): boolean {
  const recent = samples.filter((sample) => now - sample.t < 650);
  let flips = 0;
  let previous = 0;
  for (let index = 1; index < recent.length; index += 1) {
    const delta = recent[index].x - recent[index - 1].x;
    if (Math.abs(delta) < 4) continue;
    const sign = Math.sign(delta);
    if (previous !== 0 && sign !== previous) flips += 1;
    previous = sign;
  }
  return flips >= 4;
}
