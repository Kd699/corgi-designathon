import type React from 'react'

/* ── Core mode types (self-contained -- do NOT import from sibling pages) ── */

export type ScreenPlatform = 'web' | 'mobile' | 'native'

/** F17: runtime context passed to renderFrame/renderArtboardFrame so a mode can
 *  react to artboard-sidebar state. `revealed` maps toggle id -> whether its
 *  sidebar switch is currently on. Two kinds of id share this map: hidden-flows
 *  section ids (`ArtboardSection.hiddenByDefault`) and spec-level option
 *  toggles (`V3ArtboardSpec.options`), which show/hide nothing by themselves and
 *  exist purely for a mode to read. */
export interface FrameCtx {
  revealed?: Record<string, boolean>
  /** True only in the fullScreenViewer branch (single-frame viewer for a mode
   *  with `fullScreenViewer: true`). Lets a mode render its content edge-to-edge
   *  (drop the fixed 1440×800 browser-chrome card) so the viewer is a real
   *  full screen, like the TRS lab pages — while the artboard rows keep the
   *  bordered device frame. */
  fullScreen?: boolean
}

export interface StateConfig {
  id: string
  label: string
  description?: string
}

export interface ScreenMode {
  id: string
  label: string
  /** Optional concept tag (used by some labs for grouping). */
  concept?: string
  /** F16: optional description shown in sidebar (tooltip) and as artboard subtitle. */
  description?: string
  platforms: ScreenPlatform[]
  states: StateConfig[]
  /** Render the live, interactive frame for this state + platform (viewer surface).
   *  F6: third argument is project-defined sharedProps (passed through by runtime).
   *  F17: fourth argument is the runtime FrameCtx (e.g. `revealed` — which
   *  hidden-flows sidebar toggles are on) so a mode can react to sidebar toggles.
   *  Modes that ignore it keep their previous behavior (backward compatible). */
  renderFrame: (state: StateConfig, platform: ScreenPlatform, sharedProps?: unknown, ctx?: FrameCtx) => React.ReactNode
  /** Render the static, no-op frame for this state + platform (artboard surface).
   *  Optional `opts.grow` (threaded from the per-frame `fitHeight` config) lets a mode
   *  choose grow-to-content vs a fixed device height for mobile/native artboard frames.
   *  F17: fourth argument is the runtime FrameCtx (see renderFrame).
   *  Modes that ignore the 3rd/4th args keep their previous behavior (backward compatible). */
  renderArtboardFrame: (state: StateConfig, platform: ScreenPlatform, opts?: { grow?: boolean }, ctx?: FrameCtx) => React.ReactNode
  /** Label shown in the floating nav pill for this state. */
  floatingNavLabel: (state: StateConfig) => string
  /** F4: per-mode opt-out of FloatingNav + appShell wrapper.
   *  Boolean or predicate (state)=>boolean. When true, mode renders at full viewport. */
  fullScreenViewer?: boolean | ((state: StateConfig) => boolean)
}

/* ── Brand ─────────────────────────────────────────────────────────────── */

export interface BrandWelcomeHelpItem {
  kbd: string
  text: string
}

export interface BrandConfig {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  /** Sidebar active-state highlight tints, cycled per sidebar section. */
  conceptColors?: { bg: string; text: string }[]
  /** F1: keyboard cheat sheet for the welcome help modal. If omitted a default list is used. */
  welcomeHelp?: BrandWelcomeHelpItem[]
}

/* ── Sidebar (left panel manifest) ─────────────────────────────────────── */

export interface SidebarOption {
  modeId: string
  stateId: string
  platform: ScreenPlatform
  /** Single-letter label shown in the multi-platform pill (e.g. 'D', 'M'). */
  platformLabel: string
}

export interface SidebarSubgroup {
  label: string
  items: SidebarItem[]
}

export interface SidebarItem {
  id: string
  label: string
  description?: string
  options: SidebarOption[]
  /** Optional leading glyph rendered in the row's icon tile (top-level items only).
   *  Falls back to the label's first letter when omitted. */
  icon?: React.ReactNode
  /** F14: nested subgroup rendered indented under this item. v9 supports a single level only. */
  subgroup?: SidebarSubgroup
}

export interface SidebarSection {
  sectionLabel: string
  items: SidebarItem[]
}

/* ── Artboard (declarative layout for the static comparison view) ──────── */

export interface ArtboardFrameRef {
  modeId: string
  stateId: string
  platform: ScreenPlatform
  /** Override platform label above the frame; default = capitalized platform.
   *  Empty string omits the platform pill entirely. */
  label?: string
  /** Suppress the bold state-name label above this frame (per-frame override of
   *  the section-wide showStateLabels). */
  hideStateLabel?: boolean
  /** Opt out of v8 auto-wrap chrome detection. Caller takes responsibility. */
  rawFrame?: boolean
  /** Per-frame override of defaults.frameHeight — when true this frame grows to
   *  full content height even if the spec default is 'fixed'. Lets a lab convert
   *  grow-shell modes one at a time without flipping the whole artboard. */
  fitHeight?: boolean
  /** Opt OUT of automatic desktop↔mobile pairing for this frame (see
   *  defineV3ArtboardSpec). Pairing is on by default: a web frame whose mode
   *  also declares a phone platform gets its phone twin rendered beside it. */
  pairMobile?: false
  /** Internal — set by the pairing pass so the renderer/debug can tell an
   *  auto-generated twin from a hand-authored frame. */
  autoPaired?: true
}

export interface ArtboardStep {
  /** Numeric or short text badge (e.g. 1, 'A'). */
  badge?: number | string
  /** Override the dark default badge color (e.g. '#6B7280' for a 'D' badge). */
  badgeColor?: string
  title?: string
  description?: string
  /** Inline pill annotation (e.g. "Optionally add search bar"). */
  pill?: { label: string; bg?: string; color?: string }
  /** Constrain the step width (e.g. 380 to keep a long description from sprawling). */
  maxWidth?: number | string
  /** Horizontal cluster of frames inside this step. */
  frames: ArtboardFrameRef[]
  /** Render a separator after this step. true = arrow; 'vline' = vertical line; false = none.
   *  F19: undefined defaults to auto-arrow (renders an arrow if a next step exists). */
  arrowAfter?: boolean | 'vline'
  /** When true, this step (screen) is omitted from the artboard entirely.
   *  Data-driven hide — flip the flag, the renderer drops it (no JSX branch). */
  hidden?: boolean
  /** When true, renders a "Descoped" chip next to the step title. */
  descoped?: boolean
  /** Opt OUT of automatic desktop↔mobile pairing for every frame in this step. */
  pairMobile?: false
}

export interface ArtboardSection {
  id: string
  /** Top divider style. 'thick' = solid border-grey-20, 'dashed' = dashed, 'space' = spacing only (no border line), 'none' = no divider/no spacing. */
  divider?: 'thick' | 'dashed' | 'space' | 'none'
  /** Flow badge (e.g. "Flow 2") rendered before the section title. */
  flowBadge?: { label: string; bg?: string }
  title?: string
  /** F16: subtitle rendered under the section heading (text-grey-50 small). */
  subtitle?: string
  /** Long descriptive paragraph under the section title (rendered above steps). */
  description?: string
  /** Small uppercase label shown above the steps (e.g. "Filter options"). */
  preLabel?: string
  /** When true, the section is hidden from the artboard until enabled via the
   * reveal control at the bottom of the sidebar. Use for advanced/admin flows. */
  hiddenByDefault?: boolean
  /** Label for this section's reveal toggle (defaults to the section title). */
  revealLabel?: string
  /** When true, a hiddenByDefault section starts in the revealed (toggle-on)
   * state — the reveal switch defaults to on. Use for controls whose "on"
   * effect should be the default view (e.g. a global declutter toggle). */
  defaultRevealed?: boolean
  steps: ArtboardStep[]
}

/* ── Option toggles (sidebar switches a mode can read) ─────────────────── */

/** A named on/off switch rendered in the sidebar under "Options" (viewer AND
 *  artboard tabs). Unlike a hiddenByDefault section it hides nothing — its only
 *  effect is the flag it puts in `FrameCtx.revealed[id]`, so a mode can turn a
 *  piece of UI on/off without the lab hard-coding the choice. */
export interface OptionToggle {
  id: string
  label: string
  /** Optional one-line hint under the label. */
  description?: string
  /** Switch starts on. Default false. */
  default?: boolean
}

/* ── Sidebar context cards (optional info panels at the bottom) ────────── */

export interface ContextCard {
  tone: 'info' | 'warn' | 'success' | 'neutral'
  title: string
  items: string[]
}

/* ── Defaults ──────────────────────────────────────────────────────────── */

export type ViewMode = 'viewer' | 'artboard'

export interface V3ArtboardDefaults {
  viewMode?: ViewMode
  platform?: ScreenPlatform
  /** 0.1 — 1.0 */
  zoom?: number
  /** Artboard web-frame height. 'auto' (default) lets each frame grow to its
   *  full content height so rows below reflow beneath it (no overlap). 'fixed'
   *  is the opt-out: caps each frame at the device viewport (PLATFORM_HEIGHT) —
   *  tall content is cropped or overflows. Per-frame opt-out: fitHeight:false. */
  frameHeight?: 'fixed' | 'auto'
  /** Escape hatch for the automatic desktop↔mobile pairing in
   *  defineV3ArtboardSpec. Pairing is ON by default and there is deliberately no
   *  way to enable it per-section — a lab that renders a screen on both
   *  platforms must show both, side by side. Set false only for a spec whose
   *  phone modes are genuinely unrelated screens, and say why in a comment. */
  pairMobile?: false
}

/* ── Component focus registry (E9 — third "Components" tab) ─────────────── */

export interface ComponentFocusState {
  label: string
  render: (platform: ScreenPlatform) => React.ReactNode
}

export interface ComponentFocusUsage {
  modeId: string
  stateId: string
  platform: ScreenPlatform
}

/** F20: minimum-ceremony shape — only `id` and (optionally) `render` or `states` required. */
export interface ComponentFocusConfig {
  id: string
  /** Optional. Defaults to title-cased id. */
  label?: string
  /** Optional. Defaults to 'atom'. */
  level?: 'atom' | 'molecule' | 'organism'
  /** Optional. Defaults to []. */
  children?: string[]
  /** Optional shortcut: when provided AND `states` is omitted, runtime
   *  synthesises `[{ label: 'default', render }]`. */
  render?: (platform: ScreenPlatform) => React.ReactNode
  /** Optional. Defaults to single-state derived from `render`, or [] if neither given. */
  states?: ComponentFocusState[]
  /** Optional. Defaults to []. */
  usedIn?: ComponentFocusUsage[]
  /** Optional explicit platform override; otherwise derived from `usedIn`. */
  platforms?: ScreenPlatform[]
}

/** Internal — runtime-normalised shape with all fields filled in. */
export interface ComponentFocusConfigResolved {
  id: string
  label: string
  level: 'atom' | 'molecule' | 'organism'
  children: string[]
  states: ComponentFocusState[]
  usedIn: ComponentFocusUsage[]
  platforms: ScreenPlatform[]
}

/* ── Theme override (E11 — CSS variable theming) ───────────────────────── */

export interface V3ArtboardTheme {
  surface?: string
  text?: string
  textMuted?: string
  border?: string
  accent?: string
}

/* ── Top-level spec ────────────────────────────────────────────────────── */

export interface V3ArtboardSpec {
  brand: BrandConfig
  modes: readonly ScreenMode[]
  /** F2: optional. When omitted/empty, sidebar is auto-derived from `modes`. */
  sidebar?: SidebarSection[]
  artboard: ArtboardSection[]
  /** Sidebar on/off switches read by modes via FrameCtx.revealed (see OptionToggle). */
  options?: OptionToggle[]
  context?: ContextCard[]
  defaults?: V3ArtboardDefaults
  /** Optional third tab — components catalog (E9). */
  componentFocus?: ComponentFocusConfig[]
  /** F9: 'grid' (default v8 ComponentFocusPanel) or 'detail' (one-at-a-time radio + main canvas). */
  componentFocusLayout?: 'grid' | 'detail'
}

/* ── defineV3ArtboardSpec helper (E12) ─────────────────────────────────── */

/** Phone platforms a web frame can be paired with, in preference order. */
const PHONE_PLATFORMS: ScreenPlatform[] = ['mobile', 'native']

/**
 * Desktop↔mobile pairing (2026-07-29 convention).
 *
 * Every artboard web frame whose mode ALSO declares a phone platform gets its
 * phone twin inserted immediately after it, so the two always read side by
 * side. This is a spec-level normalisation rather than a per-section option on
 * purpose: "did we remember to show mobile next to desktop?" stopped being a
 * question a lab author can get wrong.
 *
 * Skipped when: the step already hand-authors a frame for that mode+state on a
 * phone platform (respects manual ordering), the frame/step sets
 * `pairMobile: false`, or the spec sets `defaults.pairMobile: false`.
 *
 * The twin inherits nothing but identity — it gets the platform pill and drops
 * the state label, so a paired cluster reads "STATE NAME / [desktop] [mobile]".
 */
const pairMobileFrames = (spec: V3ArtboardSpec): ArtboardSection[] => {
  const phoneFor = new Map<string, ScreenPlatform>()
  for (const m of spec.modes) {
    const phone = PHONE_PLATFORMS.find((p) => m.platforms.includes(p))
    if (phone && m.platforms.includes('web')) phoneFor.set(m.id, phone)
  }
  if (phoneFor.size === 0) return spec.artboard

  return spec.artboard.map((section) => ({
    ...section,
    steps: section.steps.map((step) => {
      if (step.pairMobile === false) return step
      const authored = new Set(
        step.frames
          .filter((f) => f.platform !== 'web')
          .map((f) => `${f.modeId}|${f.stateId}`),
      )
      const frames = step.frames.flatMap((f) => {
        const phone = phoneFor.get(f.modeId)
        if (
          f.platform !== 'web' ||
          f.pairMobile === false ||
          !phone ||
          authored.has(`${f.modeId}|${f.stateId}`)
        ) {
          return [f]
        }
        return [f, { ...f, platform: phone, label: undefined, hideStateLabel: true, autoPaired: true as const }]
      })
      return { ...step, frames }
    }),
  }))
}

/** Preserves literal types via const-narrowing at write time; at runtime it
 *  normalises the artboard (currently: desktop↔mobile frame pairing). */
export function defineV3ArtboardSpec<S extends V3ArtboardSpec>(spec: S): S {
  if (spec.defaults?.pairMobile === false) return spec
  return { ...spec, artboard: pairMobileFrames(spec) }
}
