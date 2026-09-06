import { useDevMode } from '@/lib/devMode';
import type { DevRect } from '@/lib/devMode';

const PINK = '#EC4899';

interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
}

function rectEq(a: DevRect, b: DevRect) {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

function computeLines(a: DevRect, b: DevRect): Line[] {
  const aR = a.left + a.width;
  const aB = a.top + a.height;
  const bR = b.left + b.width;
  const bB = b.top + b.height;
  const aContainsB = a.left <= b.left && a.top <= b.top && aR >= bR && aB >= bB;
  const bContainsA = b.left <= a.left && b.top <= a.top && bR >= aR && bB >= aB;
  const lines: Line[] = [];

  if (aContainsB || bContainsA) {
    const outer = aContainsB ? a : b;
    const inner = aContainsB ? b : a;
    const oR = outer.left + outer.width;
    const oB = outer.top + outer.height;
    const iR = inner.left + inner.width;
    const iB = inner.top + inner.height;
    const cx = inner.left + inner.width / 2;
    const cy = inner.top + inner.height / 2;
    lines.push({ x1: cx, y1: outer.top, x2: cx, y2: inner.top, label: String(Math.round(inner.top - outer.top)) });
    lines.push({ x1: cx, y1: iB, x2: cx, y2: oB, label: String(Math.round(oB - iB)) });
    lines.push({ x1: outer.left, y1: cy, x2: inner.left, y2: cy, label: String(Math.round(inner.left - outer.left)) });
    lines.push({ x1: iR, y1: cy, x2: oR, y2: cy, label: String(Math.round(oR - iR)) });
    return lines;
  }

  if (b.left >= aR) {
    const y = (Math.max(a.top, b.top) + Math.min(aB, bB)) / 2;
    lines.push({ x1: aR, y1: y, x2: b.left, y2: y, label: String(Math.round(b.left - aR)) });
  } else if (a.left >= bR) {
    const y = (Math.max(a.top, b.top) + Math.min(aB, bB)) / 2;
    lines.push({ x1: bR, y1: y, x2: a.left, y2: y, label: String(Math.round(a.left - bR)) });
  }
  if (b.top >= aB) {
    const x = (Math.max(a.left, b.left) + Math.min(aR, bR)) / 2;
    lines.push({ x1: x, y1: aB, x2: x, y2: b.top, label: String(Math.round(b.top - aB)) });
  } else if (a.top >= bB) {
    const x = (Math.max(a.left, b.left) + Math.min(aR, bR)) / 2;
    lines.push({ x1: x, y1: bB, x2: x, y2: a.top, label: String(Math.round(a.top - bB)) });
  }
  return lines;
}

export function DistanceOverlay() {
  const selected = useDevMode((s) => s.selected);
  const hover = useDevMode((s) => s.hover);
  if (!selected || !hover) return null;
  if (rectEq(selected.rect, hover)) return null;
  const lines = computeLines(selected.rect, hover);
  if (!lines.length) return null;
  return (
    <svg
      data-dev-overlay="distance"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 9998,
      }}
    >
      {lines.map((l, i) => {
        const mx = (l.x1 + l.x2) / 2;
        const my = (l.y1 + l.y2) / 2;
        const w = Math.max(20, l.label.length * 7 + 8);
        return (
          <g key={i}>
            <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={PINK} strokeWidth={1} strokeDasharray="4 3" />
            <rect x={mx - w / 2} y={my - 8} width={w} height={16} rx={3} fill="white" stroke={PINK} />
            <text x={mx} y={my + 4} textAnchor="middle" fontSize="10" fill={PINK}>
              {l.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
