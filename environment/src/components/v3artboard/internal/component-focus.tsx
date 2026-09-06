import React from 'react'
import type { ComponentFocusConfigResolved, ScreenPlatform } from '../types'

const PLATFORM_LABELS: Record<ScreenPlatform, string> = { web: 'Desktop', mobile: 'Mobile', native: 'Native' }

export function derivePlatforms(usedIn: ComponentFocusConfigResolved['usedIn']): ScreenPlatform[] {
  const set = new Set<ScreenPlatform>()
  usedIn.forEach((u) => set.add(u.platform))
  const out: ScreenPlatform[] = []
  for (const p of ['web', 'mobile', 'native'] as const) if (set.has(p)) out.push(p)
  return out
}

/** Default v8 grid layout — every state x platform pair shown as a tile cluster. */
export const ComponentFocusPanel: React.FC<{ component: ComponentFocusConfigResolved }> = ({ component }) => {
  const platforms = component.platforms.length > 0 ? component.platforms : ['web' as ScreenPlatform]
  return (
    <div className="overflow-auto px-8 py-6 pt-16" style={{ height: 'calc(100vh - 49px)', background: 'var(--v3-bg-muted, #e8e8ec)' }}>
      <div className="flex items-baseline gap-3 mb-4">
        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded" style={{ background: '#EEF0FF', color: 'var(--v3-accent, #402aff)' }}>{component.level}</span>
        <h2 className="text-xl font-bold" style={{ color: 'var(--v3-text, #03072d)' }}>{component.label}</h2>
      </div>
      {component.children && component.children.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-1.5">
          {component.children.map((c) => (
            <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-white" style={{ border: '1px solid var(--v3-border, #d7d6da)', color: 'var(--v3-text-muted, #73727c)' }}>{c}</span>
          ))}
        </div>
      )}
      <div className="space-y-8">
        {component.states.map((st, si) => (
          <div key={si}>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--v3-text-muted, #73727c)' }}>{st.label}</p>
            <div className="flex items-start gap-6 flex-wrap">
              {platforms.map((p) => (
                <div key={p}>
                  <p className="mb-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-blue-500">{PLATFORM_LABELS[p]}</p>
                  <div>{st.render(p)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* F9: detail layout — one component selected at a time, single live render + usedIn footer.
 * State picker is the radio list inside the sidebar (handled by V3Artboard.tsx);
 * this panel just renders the current state at the main canvas. */
export const ComponentFocusDetailPanel: React.FC<{
  component: ComponentFocusConfigResolved
  activeStateIndex: number
  activePlatform: ScreenPlatform
}> = ({ component, activeStateIndex, activePlatform }) => {
  const safeIdx = Math.max(0, Math.min(activeStateIndex, component.states.length - 1))
  const state = component.states[safeIdx]
  const platform = component.platforms.includes(activePlatform)
    ? activePlatform
    : component.platforms[0] ?? 'web'
  return (
    <div className="overflow-auto p-8 pt-16" style={{ height: 'calc(100vh - 49px)', background: 'var(--v3-bg-muted, #e8e8ec)' }}>
      <div className="max-w-[1100px] mx-auto bg-white rounded-lg p-8 space-y-6" style={{ border: '1px solid var(--v3-border, #d7d6da)' }}>
        <div className="flex items-baseline gap-3">
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded" style={{ background: '#EEF0FF', color: 'var(--v3-accent, #402aff)' }}>{component.level}</span>
          <h2 className="text-xl font-bold" style={{ color: 'var(--v3-text, #03072d)' }}>{component.label}</h2>
          <span className="text-xs" style={{ color: 'var(--v3-text-muted, #73727c)' }}>· {PLATFORM_LABELS[platform]}</span>
        </div>
        {component.children && component.children.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {component.children.map((c) => (
              <span key={c} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--v3-bg-muted, #f8f8fb)', border: '1px solid var(--v3-border, #d7d6da)', color: 'var(--v3-text-muted, #73727c)' }}>{c}</span>
            ))}
          </div>
        )}
        {state && (
          <div className="border-t pt-6" style={{ borderColor: 'var(--v3-border, #d7d6da)' }}>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--v3-text-muted, #73727c)' }}>{state.label}</p>
            <div className="rounded p-6" style={{ background: 'var(--v3-bg-muted, #f8f8fb)' }}>
              {state.render(platform)}
            </div>
          </div>
        )}
        <div className="border-t pt-4 text-[11px]" style={{ borderColor: 'var(--v3-border, #d7d6da)', color: 'var(--v3-text-muted, #73727c)' }}>
          Used in {component.usedIn.length} state{component.usedIn.length === 1 ? '' : 's'}
          {component.usedIn.length > 0 && ': '}
          {component.usedIn.map((u, i) => (
            <span key={i}>
              {i > 0 && ', '}
              <span className="font-mono">{u.modeId}/{u.stateId}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
