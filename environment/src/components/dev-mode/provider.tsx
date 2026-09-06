import { useEffect, useRef, type ReactNode } from 'react';
import { useDevMode } from '@/lib/devMode';
import { extractSelection, rectOf, shouldIgnore } from './extractMeta';
import { DevOverlays } from './overlays';

interface Props {
  children: ReactNode;
}

export function DevModeProvider({ children }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const devMode = useDevMode((s) => s.devMode);
  const setHover = useDevMode((s) => s.setHover);
  const setSelected = useDevMode((s) => s.setSelected);

  useEffect(() => {
    if (!devMode) {
      setHover(null);
      return;
    }
    const root = rootRef.current;
    if (!root) return;

    const onMove = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || shouldIgnore(t)) return setHover(null);
      setHover(rectOf(t));
    };

    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || shouldIgnore(t)) return;
      e.preventDefault();
      e.stopPropagation();
      setSelected(extractSelection(t));
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };

    root.addEventListener('mousemove', onMove, true);
    root.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('mousemove', onMove, true);
      root.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [devMode, setHover, setSelected]);

  return (
    <div ref={rootRef} style={{ position: 'relative', minHeight: '100%' }}>
      {children}
      {devMode && <DevOverlays />}
    </div>
  );
}
