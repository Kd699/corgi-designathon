import type { DevIconInfo, DevRect, DevSelection } from '@/lib/devMode';
import { tokenForHex } from '@/lib/design-tokens/colors';

const STYLE_KEYS = [
  'color',
  'backgroundColor',
  'fontSize',
  'fontFamily',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'borderColor',
  'display',
  'flexDirection',
  'gap',
  'opacity',
];

export function shouldIgnore(el: Element): boolean {
  return !!el.closest('[data-dev-overlay], [data-dev-control]');
}

function normalizeColor(v: string): string | null {
  const m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) {
    const hex = v.trim().match(/^#([0-9a-f]{6})$/i);
    return hex ? '#' + hex[1].toUpperCase() : null;
  }
  const h = (n: string) => Number(n).toString(16).padStart(2, '0');
  return ('#' + h(m[1]) + h(m[2]) + h(m[3])).toUpperCase();
}

/**
 * Resolve a computed color string (rgb/rgba/hex) to a design-system token path.
 * Returns paths like "primary.primary1_600" or null if the literal isn't in
 * the design system (per may-14 P9 strict policy: dev panel warns when null).
 *
 * Source of truth: lib/design-tokens/colors.ts -- add tokens there, not here.
 */
export function lookupToken(color: string): string | null {
  const hex = normalizeColor(color);
  if (!hex) return null;
  return tokenForHex(hex);
}

export function rectOf(el: Element): DevRect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function buildPath(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && depth < 4) {
    const tag = cur.tagName.toLowerCase();
    const cls = (cur.getAttribute('class') || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 1)
      .map((c) => '.' + c)
      .join('');
    parts.unshift(tag + cls);
    cur = cur.parentElement;
    depth++;
  }
  return parts.join(' > ');
}

/**
 * Icon detection per v3artboard-may-14 P9.
 * Walks up from the clicked element looking for:
 *   - MUI SVG (data-testid ending Icon + class MuiSvgIcon-root) -> capture name
 *   - inline plain SVG (no MUI marker) -> warn
 *   - <img> from a known assets path -> OK (treat as legitimate logo / illustration)
 */
export function extractIcon(el: HTMLElement): DevIconInfo {
  const info: DevIconInfo = { muiName: null, isInlineNonMuiSvg: false, isAssetImg: false, imgSrc: null };

  // Walk the closest svg or img -- the click might land on a path/span inside.
  const svg = el.closest('svg') as SVGElement | null;
  const img = el.closest('img') as HTMLImageElement | null;

  if (svg) {
    const testId = svg.getAttribute('data-testid');
    const isMui = svg.classList.contains('MuiSvgIcon-root');
    if (isMui && testId) {
      info.muiName = testId; // e.g. "HealthAndSafetyOutlinedIcon"
    } else {
      info.isInlineNonMuiSvg = true;
    }
    return info;
  }

  if (img) {
    info.isAssetImg = true;
    info.imgSrc = img.getAttribute('src');
    return info;
  }

  return info;
}

export function extractSelection(el: HTMLElement): DevSelection {
  const cs = window.getComputedStyle(el);
  const styles: Record<string, string> = {};
  for (const k of STYLE_KEYS) {
    const v = cs.getPropertyValue(k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()));
    if (v) styles[k] = v;
  }
  const sourceEl = el.closest('[data-cr-source]') as HTMLElement | null;
  const source = sourceEl?.dataset.crSource ?? null;
  const html = el.outerHTML.length > 800 ? el.outerHTML.slice(0, 800) + '...' : el.outerHTML;
  return {
    rect: rectOf(el),
    styles,
    source,
    html,
    path: buildPath(el),
    tag: el.tagName.toLowerCase(),
    icon: extractIcon(el),
  };
}
