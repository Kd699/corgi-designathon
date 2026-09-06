// V3Artboard runtime — types
//
// Built 2026-05-25 to support /v3artboard-may-22. Minimal-but-complete spec
// surface: enough for caller files to define a multi-mode, multi-platform lab
// with sidebar + artboard + context cards. Deferred (see V3Artboard.tsx):
//   - dev mode inspector (P9) — placeholder only
//   - localStorage / URL-hash persistence (E5/E6)
//   - imperative ref API (E7)
//   - LossTest companion (E14)

import type { ReactNode } from 'react'

export type Platform = 'web' | 'mobile' | 'native'

export type PlatformLabel = 'D' | 'M' | 'N' | string

export interface ScreenState {
  id: string
  label: string
  description?: string
}

export type StateRenderer = (state: ScreenState, platform: Platform) => ReactNode

export interface ScreenMode {
  id: string
  label: string
  description?: string
  platforms: Platform[]
  states: ScreenState[]
  renderFrame: StateRenderer
  // Static artboard render — no live state, no handlers. Defaults to renderFrame.
  renderArtboardFrame?: StateRenderer
  // Label printed in the floating dynamic-island pill.
  floatingNavLabel?: (state: ScreenState, platform: Platform) => string
  // may-17 / may-22: edge-to-edge fill bypass for app-shell modes. Boolean or
  // predicate over (state, platform).
  fullScreenViewer?: boolean | ((state: ScreenState, platform: Platform) => boolean)
}

export interface SidebarOption {
  modeId: string
  stateId: string
  platform: Platform
  platformLabel?: PlatformLabel
}

export interface SidebarItem {
  id: string
  label: string
  description?: string
  options: SidebarOption[]
}

export interface SidebarSection {
  sectionLabel: string
  items: SidebarItem[]
}

export interface ArtboardFrameRef {
  modeId: string
  stateId: string
  platform: Platform
  label?: string
  // P6 / may-17: skip the runtime's auto-wrap in DesktopFrame/PhoneFrame.
  rawFrame?: boolean
}

export interface ArtboardStep {
  badge?: number | string
  badgeColor?: string
  title?: string
  description?: string
  pill?: { label: string; bg?: string; color?: string }
  maxWidth?: number
  frames: ArtboardFrameRef[]
  arrowAfter?: boolean | 'vline'
}

export interface ArtboardSection {
  id: string
  divider?: 'thick' | 'dashed' | 'none'
  flowBadge?: { label: string; bg?: string }
  title?: string
  description?: string
  preLabel?: string
  steps: ArtboardStep[]
}

export type ContextTone = 'info' | 'warn' | 'success' | 'neutral'

export interface ContextCard {
  tone: ContextTone
  title: string
  items: string[]
}

export interface WelcomeHelpItem {
  kbd?: string
  badge?: string
  title: string
  text: string
}

export interface V3ArtboardSpec {
  brand: {
    title: string
    subtitle?: string
    icon?: ReactNode
    conceptColors?: { bg: string; text: string }[]
    welcomeHelp?: WelcomeHelpItem[]
  }
  modes: ScreenMode[]
  defaults?: {
    viewMode?: 'viewer' | 'artboard'
    platform?: Platform
    zoom?: number
  }
  sidebar?: SidebarSection[]
  artboard?: ArtboardSection[]
  context?: ContextCard[]
}

// Typed factory — identity at runtime, autocomplete + literal narrowing at
// write time. E12.
export function defineV3ArtboardSpec<T extends V3ArtboardSpec>(spec: T): T {
  return spec
}
