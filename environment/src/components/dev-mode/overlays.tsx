import { useDevMode } from '@/lib/devMode';
import type { DevRect } from '@/lib/devMode';
import { DistanceOverlay } from './distance';

const base: React.CSSProperties = {
  position: 'fixed',
  pointerEvents: 'none',
  zIndex: 9998,
  boxSizing: 'border-box',
};

function box(r: DevRect, style: React.CSSProperties): React.CSSProperties {
  return { ...base, top: r.top, left: r.left, width: r.width, height: r.height, ...style };
}

export function DevOverlays() {
  const hover = useDevMode((s) => s.hover);
  const selected = useDevMode((s) => s.selected);
  return (
    <>
      {hover && (
        <div
          data-dev-overlay="hover"
          style={box(hover, { border: '1px dashed #22D3EE' })}
        />
      )}
      {selected && (
        <div
          data-dev-overlay="selected"
          style={box(selected.rect, { border: '2px solid #22D3EE', zIndex: 9999 })}
        />
      )}
      <DistanceOverlay />
    </>
  );
}
