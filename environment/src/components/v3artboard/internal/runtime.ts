import React from 'react'
import { PhoneFrame, NativeFrame, DesktopFrame } from '../frames'
import type {
  V3ArtboardSpec,
  V3ArtboardTheme,
  ScreenPlatform,
  ScreenMode,
  ViewMode,
  SidebarSection,
  ComponentFocusConfig,
  ComponentFocusConfigResolved,
} from '../types'

/* ── E1: spec validation ──────────────────────────────────────────────── */

export function validateSpec(spec: V3ArtboardSpec): string[] {
  const issues: string[] = []
  const modeIds = new Set(spec.modes.map((m) => m.id))

  if (spec.modes.length === 0) issues.push('spec has 0 modes')
  spec.modes.forEach((m) => {
    if (m.states.length === 0) issues.push(`mode "${m.id}" has 0 states`)
    if (m.platforms.length === 0) issues.push(`mode "${m.id}" has 0 platforms`)
  })

  ;(spec.sidebar ?? []).forEach((sec) => {
    sec.items.forEach((it) => {
      it.options.forEach((opt) => {
        if (!modeIds.has(opt.modeId)) {
          issues.push(`sidebar item "${it.id}" -> modeId "${opt.modeId}" not in spec.modes[]`)
          return
        }
        const mode = spec.modes.find((m) => m.id === opt.modeId)!
        if (!mode.states.find((s) => s.id === opt.stateId)) {
          issues.push(`sidebar item "${it.id}" -> stateId "${opt.stateId}" not in mode "${opt.modeId}".states[]`)
        }
        if (!mode.platforms.includes(opt.platform)) {
          issues.push(`sidebar item "${it.id}" -> platform "${opt.platform}" not in mode "${opt.modeId}".platforms[]`)
        }
      })
    })
  })

  spec.artboard.forEach((sec) => {
    sec.steps.forEach((step) => {
      step.frames.forEach((f) => {
        if (!modeIds.has(f.modeId)) {
          issues.push(`artboard "${sec.id}" -> frame modeId "${f.modeId}" not in spec.modes[]`)
          return
        }
        const mode = spec.modes.find((m) => m.id === f.modeId)!
        if (!mode.states.find((s) => s.id === f.stateId)) {
          issues.push(`artboard "${sec.id}" -> stateId "${f.stateId}" not in mode "${f.modeId}".states[]`)
        }
        if (!mode.platforms.includes(f.platform)) {
          issues.push(`artboard "${sec.id}" -> platform "${f.platform}" not in mode "${f.modeId}".platforms[]`)
        }
      })
    })
  })

  return issues
}

/* ── E10: chrome auto-wrap ────────────────────────────────────────────── */

export function isAlreadyChromed(node: React.ReactNode): boolean {
  if (!React.isValidElement(node)) return false
  const t = node.type as unknown
  return t === PhoneFrame || t === NativeFrame || t === DesktopFrame
}

export function autoWrapFrame(node: React.ReactNode, platform: ScreenPlatform): React.ReactNode {
  if (isAlreadyChromed(node)) return node
  if (platform === 'mobile') return React.createElement(PhoneFrame, null, node)
  if (platform === 'native') return React.createElement(NativeFrame, null, node)
  return React.createElement(DesktopFrame, null, node)
}

/* ── E5: localStorage persistence ─────────────────────────────────────── */

export interface PersistedState {
  viewMode?: ViewMode
  activeModeIndex?: number
  activeStateIndex?: number
  activePlatform?: ScreenPlatform
  zoom?: number
  panelOpen?: boolean
  itemPlatform?: Record<string, ScreenPlatform>
}

export function loadPersisted(key: string): PersistedState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

export function savePersisted(key: string, data: PersistedState) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(key, JSON.stringify(data)) } catch {}
}

/* ── E6: URL hash sync ────────────────────────────────────────────────── */

export function parseHash(): { m?: string; s?: string; p?: ScreenPlatform; v?: 'viewer' | 'artboard'; panel?: string } {
  if (typeof window === 'undefined') return {}
  const raw = window.location.hash.replace(/^#/, '')
  if (!raw) return {}
  const params = new URLSearchParams(raw)
  const p = params.get('p')
  const v = params.get('v')
  return {
    m: params.get('m') ?? undefined,
    s: params.get('s') ?? undefined,
    p: p === 'web' || p === 'mobile' || p === 'native' ? p : undefined,
    v: v === 'viewer' || v === 'artboard' ? v : undefined,
    // Shareable-link override: `&panel=0` opens with the sidebar collapsed.
    panel: params.get('panel') ?? undefined,
  }
}

export function serializeHash(
  modeId: string,
  stateId: string,
  platform: ScreenPlatform,
  viewMode?: 'viewer' | 'artboard',
): string {
  const base = `#m=${encodeURIComponent(modeId)}&s=${encodeURIComponent(stateId)}&p=${encodeURIComponent(platform)}`
  return viewMode ? `${base}&v=${encodeURIComponent(viewMode)}` : base
}

/* ── E11: theme → CSS vars ────────────────────────────────────────────── */

/* ── F2: auto-derive sidebar from modes ───────────────────────────────── */

export function deriveSidebarFromModes(modes: readonly ScreenMode[]): SidebarSection[] {
  return modes.map((m) => ({
    sectionLabel: m.label,
    items: m.states.map((s) => ({
      id: `${m.id}-${s.id}`,
      label: s.label,
      description: s.description,
      options: [{
        modeId: m.id,
        stateId: s.id,
        platform: m.platforms[0] ?? 'web',
        platformLabel: 'D',
      }],
    })),
  }))
}

/** True when caller did not supply spec.sidebar (we synthesise it). Used by F3 to
 *  decide whether to auto-number artboard section titles. */
export function isAutoSidebar(spec: V3ArtboardSpec): boolean {
  return !spec.sidebar || spec.sidebar.length === 0
}

/* ── F3: auto-numbered "Step N — Label" formatter ─────────────────────── */

export function autoSectionTitle(
  modes: readonly ScreenMode[],
  modeId: string | undefined,
  fallback: string | undefined,
): string | undefined {
  if (fallback) return fallback
  if (!modeId) return undefined
  const idx = modes.findIndex((m) => m.id === modeId)
  if (idx < 0) return undefined
  const m = modes[idx]
  return `Step ${idx + 1} — ${m.label}`
}

export function autoSectionMeta(
  modes: readonly ScreenMode[],
  modeId: string | undefined,
): string | undefined {
  if (!modeId) return undefined
  const m = modes.find((x) => x.id === modeId)
  if (!m) return undefined
  const n = m.states.length
  return `· ${n} state${n === 1 ? '' : 's'}`
}

/* ── F20: normalise componentFocus to a fully-populated shape ─────────── */

const titleCase = (id: string): string =>
  id.split(/[-_\s]+/).filter(Boolean).map((s) => s[0].toUpperCase() + s.slice(1)).join(' ')

export function resolveComponentFocus(c: ComponentFocusConfig): ComponentFocusConfigResolved {
  const states = c.states && c.states.length > 0
    ? c.states
    : (c.render ? [{ label: 'default', render: c.render }] : [])
  const usedIn = c.usedIn ?? []
  let platforms = c.platforms
  if (!platforms || platforms.length === 0) {
    const set = new Set<ScreenPlatform>()
    usedIn.forEach((u) => set.add(u.platform))
    const out: ScreenPlatform[] = []
    for (const p of ['web', 'mobile', 'native'] as const) if (set.has(p)) out.push(p)
    platforms = out.length > 0 ? out : ['web']
  }
  return {
    id: c.id,
    label: c.label ?? titleCase(c.id),
    level: c.level ?? 'atom',
    children: c.children ?? [],
    states,
    usedIn,
    platforms,
  }
}

export function buildThemeStyle(theme?: V3ArtboardTheme): React.CSSProperties {
  if (!theme) return {}
  const out: Record<string, string> = {}
  if (theme.surface !== undefined) out['--v3-bg-muted'] = theme.surface
  if (theme.text !== undefined) out['--v3-text'] = theme.text
  if (theme.textMuted !== undefined) out['--v3-text-muted'] = theme.textMuted
  if (theme.border !== undefined) out['--v3-border'] = theme.border
  if (theme.accent !== undefined) out['--v3-accent'] = theme.accent
  return out as React.CSSProperties
}
