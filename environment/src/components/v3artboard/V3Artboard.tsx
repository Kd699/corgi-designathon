import React, { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type {
  V3ArtboardSpec,
  ScreenMode,
  ScreenPlatform,
  SidebarSection,
  ArtboardSection,
  ArtboardStep,
  ArtboardFrameRef,
  ViewMode,
  V3ArtboardTheme,
  ComponentFocusConfigResolved,
} from './types'
import {
  validateSpec,
  autoWrapFrame,
  loadPersisted,
  savePersisted,
  parseHash,
  serializeHash,
  buildThemeStyle,
  deriveSidebarFromModes,
  isAutoSidebar,
  autoSectionTitle,
  autoSectionMeta,
  resolveComponentFocus,
} from './internal/runtime'
import { ComponentFocusPanel, ComponentFocusDetailPanel } from './internal/component-focus'
import { Sidebar, type SidebarTab } from './internal/sidebar'
import { DevModeProvider } from '@/components/dev-mode/provider'
import { DevPanel } from '@/components/dev-mode/panel'
import { useDevMode } from '@/lib/devMode'

const PLATFORM_LABELS: Record<ScreenPlatform, string> = { web: 'Desktop', mobile: 'Mobile', native: 'Native' }
const PLATFORM_WIDTH: Record<ScreenPlatform, number> = { web: 1440, mobile: 358, native: 358 }
const PLATFORM_HEIGHT: Record<ScreenPlatform, number> = { web: 800, mobile: 780, native: 780 }
const DEFAULT_WELCOME_HELP = [
  { kbd: 'Cmd / Ctrl + scroll', text: 'Zoom in & out' },
  { kbd: 'Click any frame',     text: 'Open the live viewer' },
  { kbd: 'Sidebar',              text: 'Jump between flows + states' },
  { kbd: '←  →',                 text: 'Step prev / next' },
]

/* ── Layout primitives ────────────────────────────────────────────────── */

const StepBadge: React.FC<{ value: number | string; color?: string }> = ({ value, color = '#03072d' }) => (
  <div
    className="flex items-center justify-center rounded-full text-white text-xs font-bold shrink-0"
    style={{ width: 24, height: 24, background: color }}
  >
    {value}
  </div>
)

const ArrowSeparator: React.FC = () => (
  <div className="flex items-center justify-center px-6 self-center" data-v3-arrow>
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <path d="M8 20H32M32 20L24 12M32 20L24 28" stroke="#9CA3AF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
)

const VLineSeparator: React.FC = () => (
  <div className="mx-12 self-stretch flex items-center" data-v3-vline>
    <div className="w-px h-full" style={{ background: 'var(--v3-border, #d7d6da)' }} />
  </div>
)

const PlatformPill: React.FC<{ label: string }> = ({ label }) => (
  <p className="mb-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-blue-500">{label}</p>
)

const FlowBadge: React.FC<{ label: string; bg?: string }> = ({ label, bg }) => (
  <div className="flex items-center justify-center rounded-lg text-white text-sm font-bold px-3 py-1" style={{ background: bg ?? 'var(--v3-accent, #402AFF)' }} data-v3-flow-badge>
    {label}
  </div>
)

/* ── F1 — Welcome help modal ──────────────────────────────────────────── */

const WelcomeHelpModal: React.FC<{ items: { kbd: string; text: string }[]; onClose: () => void }> = ({ items, onClose }) => (
  <div
    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 font-perk-sans"
    onClick={onClose}
    data-v3-help-modal
  >
    <div
      className="bg-white rounded-2xl max-w-[480px] w-full mx-4 p-8"
      style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--v3-text, #03072d)' }}>Welcome</h2>
      <p className="text-sm mb-2" style={{ color: 'var(--v3-text-muted, #73727c)' }}>Navigate this prototype like Figma.</p>
      <p className="text-sm mb-6" style={{ color: 'var(--v3-text, #03072d)' }}>Bird's eye view of every flow and state.</p>
      <ul className="space-y-3 mb-6">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-3">
            <span
              className="shrink-0 px-2 py-1 rounded-md font-mono text-[12px] whitespace-nowrap"
              style={{ background: 'var(--v3-bg-muted, #f8f8fb)', border: '1px solid var(--v3-border, #d7d6da)', color: 'var(--v3-text, #03072d)' }}
            >{it.kbd}</span>
            <span className="text-sm" style={{ color: 'var(--v3-text, #03072d)' }}>{it.text}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2.5 rounded-md text-white text-sm font-bold transition-colors"
          style={{ background: 'var(--v3-accent, #402aff)' }}
        >Got it</button>
      </div>
    </div>
  </div>
)

/* ── Floating viewer nav (with help button F1) ────────────────────────── */

const FloatingViewerNav: React.FC<{
  label: string
  platforms: ScreenPlatform[]
  activePlatform: ScreenPlatform
  onPlatformChange: (p: ScreenPlatform) => void
  viewMode: ViewMode
  onViewModeChange: (m: ViewMode) => void
  onPrev: () => void
  onNext: () => void
  canPrev: boolean
  canNext: boolean
  onHelp: () => void
}> = ({ label, platforms, activePlatform, onPlatformChange, viewMode, onViewModeChange, onPrev, onNext, canPrev, canNext, onHelp }) => {
  const btn = 'px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors'
  const btnOn = 'text-grey-50 hover:bg-grey-03 hover:text-brand-black'
  const btnOff = 'text-grey-20 cursor-not-allowed'

  // Per /v3artboard-may-22: dynamic island defaults to compact pill, expands on hover/focus.
  const [expanded, setExpanded] = React.useState(false)
  const collapseTimer = React.useRef<number | null>(null)
  const onEnter = React.useCallback(() => {
    if (collapseTimer.current) { window.clearTimeout(collapseTimer.current); collapseTimer.current = null }
    setExpanded(true)
  }, [])
  const onLeave = React.useCallback(() => {
    if (collapseTimer.current) window.clearTimeout(collapseTimer.current)
    collapseTimer.current = window.setTimeout(() => setExpanded(false), 350)
  }, [])
  React.useEffect(() => () => { if (collapseTimer.current) window.clearTimeout(collapseTimer.current) }, [])

  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[80] px-2 max-w-[calc(100vw-12px)] font-perk-sans"
      data-v3-floating-nav
      data-expanded={expanded || undefined}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
    >
      {!expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label={`Show viewer controls — ${label}`}
          aria-expanded={false}
          className="rounded-full bg-white inline-flex items-center gap-2 px-3 py-1.5 transition-shadow hover:shadow-md"
          style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.05)', border: '1px solid var(--v3-border, #d7d6da)' }}
        >
          <span className="text-[12px] font-semibold whitespace-nowrap" style={{ color: 'var(--v3-text, #03072d)' }}>{label}</span>
          <span aria-hidden className="inline-flex items-center gap-0.5 ml-1">
            <span className="h-1 w-1 rounded-full bg-grey-20" />
            <span className="h-1 w-1 rounded-full bg-grey-20" />
            <span className="h-1 w-1 rounded-full bg-grey-20" />
          </span>
        </button>
      )}
      {expanded && (
        <div
          className="rounded-full bg-white inline-flex items-center gap-1.5 px-2 py-1.5"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)', border: '1px solid var(--v3-border, #d7d6da)' }}
          aria-expanded={true}
        >
          <button type="button" onClick={() => window.history.back()} className={`${btn} ${btnOn} flex items-center gap-1`}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-3 h-3">
              <path d="M10 3L5 8l5 5" />
            </svg>
            Back
          </button>
          <div className="h-5 w-px" style={{ background: 'var(--v3-border, #d7d6da)' }} />
          <button type="button" onClick={onPrev} disabled={!canPrev} className={`${btn} ${canPrev ? btnOn : btnOff}`}>Prev</button>
          <p className="px-2 text-[12px] font-semibold whitespace-nowrap" style={{ color: 'var(--v3-text, #03072d)' }}>{label}</p>
          <button type="button" onClick={onNext} disabled={!canNext} className={`${btn} ${canNext ? btnOn : btnOff}`}>Next</button>
          <div className="h-5 w-px" style={{ background: 'var(--v3-border, #d7d6da)' }} />
          <div className="flex items-center p-0.5 rounded-full" style={{ background: 'var(--v3-bg-muted, #f8f8fb)', border: '1px solid var(--v3-border, #d7d6da)' }}>
            {platforms.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onPlatformChange(p)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
                  activePlatform === p && viewMode === 'viewer'
                    ? 'bg-white text-brand-black shadow-sm'
                    : 'text-grey-50 hover:text-brand-black'
                }`}
              >
                {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>
          <div className="h-5 w-px" style={{ background: 'var(--v3-border, #d7d6da)' }} />
          <button
            type="button"
            onClick={() => onViewModeChange(viewMode === 'viewer' ? 'artboard' : 'viewer')}
            className={`${btn} font-semibold ${viewMode === 'artboard' ? 'text-white' : 'text-grey-50 hover:bg-grey-03 hover:text-brand-black'}`}
            style={viewMode === 'artboard' ? { background: 'var(--v3-accent, #402aff)' } : undefined}
          >
            {viewMode === 'artboard' ? 'Full screen' : "Bird's eye"}
          </button>
          <button type="button" onClick={onHelp} aria-label="How to navigate" data-v3-help-button className={`${btn} ${btnOn} w-7 h-7 p-0 flex items-center justify-center`}>?</button>
        </div>
      )}
    </div>
  )
}

/* ── Frame codes (A1, A2, B1 …) ───────────────────────────────────────────
 * Every artboard frame gets a short alphanumeric handle so a frame can be named
 * in one token ("fix B3") instead of "the manager hub frame in the see-more
 * section". Letter = section, number = frame within that section in reading
 * order across its steps.
 *
 * Both indices are taken from the UNFILTERED spec — hidden-by-default sections
 * and hidden steps still consume their code. Revealing a section therefore never
 * renumbers the frames around it, which is the whole point: a code written down
 * in a comment or a message has to still mean the same frame tomorrow. */
const sectionLetter = (i: number): string => {
  let n = i, out = ''
  do { out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26) - 1 } while (n >= 0)
  return out
}

const FrameCode: React.FC<{ code: string }> = ({ code }) => (
  <span
    data-v3-frame-code
    /* Geometry (padding/radius/size) stays in classes, never inline: an inline
       style beats any stylesheet, which would stop the zoom lab's counter-scale
       rules from holding the chip at screen size. Colour is inline — it has no
       reason to scale. */
    className="inline-flex items-center rounded-[3px] px-[5px] py-[3px] font-mono text-[10px] font-bold leading-none tracking-wider"
    style={{
      background: 'var(--v3-code-bg, #dcdce4)',
      color: 'var(--v3-code-text, #43424c)',
    }}
  >
    {code}
  </span>
)

/* ── Artboard frame (clickable static frame) — F12, F13 ───────────────── */

const ArtboardClickFrame: React.FC<{
  modes: readonly ScreenMode[]
  ref_: ArtboardFrameRef
  zoom: number
  showStateLabel: boolean
  code?: string
  fitHeight?: boolean
  revealed?: Record<string, boolean>
  onClick: () => void
}> = ({ modes, ref_, zoom, showStateLabel, code, fitHeight, revealed, onClick }) => {
  const mode = modes.find((m) => m.id === ref_.modeId)
  const state = mode?.states.find((s) => s.id === ref_.stateId)
  if (!mode || !state) {
    return <div className="text-red-500 text-xs p-4 border border-red-200 rounded">Missing {ref_.modeId}/{ref_.stateId}</div>
  }
  const platLabel = ref_.label ?? PLATFORM_LABELS[ref_.platform]
  // Grow flag threaded into the mode's artboard frame. DEFAULT: mobile/native
  // frames grow to their full content height (the whole phone screen is shown,
  // no internal scroll) — a frame opts OUT with `fitHeight: false`. Web stays
  // opt-IN to grow (spec default frameHeight:'auto' or per-frame fitHeight).
  // Modes that ignore this arg are unaffected (they self-size via rawArtboardFrame).
  const grow = ref_.fitHeight ?? (ref_.platform !== 'web' ? true : !!fitHeight)
  const raw = mode.renderArtboardFrame(state, ref_.platform, { grow }, { revealed })
  const rendered = ref_.rawFrame ? raw : autoWrapFrame(raw, ref_.platform)
  // F13: state label + platform pill live OUTSIDE the (zoom) wrapper.
  // Native widths come from frames.tsx (1440 web, 358 mobile/native).
  const w = PLATFORM_WIDTH[ref_.platform]
  const h = PLATFORM_HEIGHT[ref_.platform]
  return (
    <div
      id={`frame-${mode.id}-${state.id}`}
      data-v3-frame
      data-v3-code={code}
      className="cursor-pointer rounded-xl transition-all hover:shadow-[0_0_0_3px_rgba(64,42,255,0.35)] flex flex-col"
      style={{ width: w * zoom }}
      onClick={onClick}
    >
      {/* The code renders even when the state label is suppressed — a frame with
          no visible name is exactly the one that most needs a handle. */}
      {(code || (showStateLabel && !ref_.hideStateLabel)) && (
        /* data-v3-frame-label: the counter-scale CSS in the zoom lab targets this
           row, since the label is no longer a direct <p> child of the frame. */
        <div data-v3-frame-label className="flex items-center gap-1.5 mb-1">
          {code && <FrameCode code={code} />}
          {showStateLabel && !ref_.hideStateLabel && (
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--v3-text, #03072d)' }}>
              {state.label}
            </p>
          )}
        </div>
      )}
      {platLabel && <PlatformPill label={platLabel} />}
      {/* Height: mobile/native device frames self-size (PhoneFrame/NativeFrame own
          their height — fixed 780 or grown full-length), so never cap them here.
          Web: drop the fixed viewport height only when fitHeight (spec default or
          per-frame ref_.fitHeight opt-in) so the page grows + rows below reflow. */}
      <div className="pointer-events-none" style={{ zoom, width: w, height: ref_.platform !== 'web' ? undefined : ((fitHeight || ref_.fitHeight) ? undefined : h) }}>{rendered}</div>
    </div>
  )
}

const ArtboardStepBlock: React.FC<{
  step: ArtboardStep
  modes: readonly ScreenMode[]
  zoom: number
  showStateLabels: boolean
  /** Section letter; absent = codes off for this board. */
  codePrefix?: string
  /** How many frames precede this step inside its section. */
  codeStart?: number
  fitHeight?: boolean
  revealed?: Record<string, boolean>
  onFrameClick: (modeId: string, stateId: string, platform: ScreenPlatform) => void
}> = ({ step, modes, zoom, showStateLabels, codePrefix, codeStart = 0, fitHeight, revealed, onFrameClick }) => {
  // The step title is a text link to this step's page — clicking opens the
  // live viewer for its primary (first) frame. Mirrors the click-to-open frame
  // affordance but makes it discoverable as text in the artboard space.
  const primaryFrame = step.frames[0]
  const openPage = primaryFrame
    ? () => onFrameClick(primaryFrame.modeId, primaryFrame.stateId, primaryFrame.platform)
    : undefined
  return (
  <div className="shrink-0" style={step.maxWidth ? { maxWidth: step.maxWidth } : undefined}>
    {(step.badge !== undefined || step.title) && (
      <div className="flex items-center gap-2 mb-1">
        {step.badge !== undefined && <StepBadge value={step.badge} color={step.badgeColor} />}
        {step.title && (
          openPage ? (
            <button
              type="button"
              onClick={openPage}
              className="group inline-flex items-center gap-1 transition-colors hover:text-[var(--v3-accent,#402aff)]"
              style={{ fontSize: 18, fontWeight: 700, color: 'var(--v3-text, #03072d)' }}
            >
              <span className="group-hover:underline underline-offset-2">{step.title}</span>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 opacity-0 -translate-x-0.5 transition-all group-hover:opacity-100 group-hover:translate-x-0">
                <path d="M5 11L11 5M11 5H6M11 5V10" />
              </svg>
            </button>
          ) : (
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--v3-text, #03072d)' }}>{step.title}</span>
          )
        )}
      </div>
    )}
    {step.description && <p className="text-[11px] mb-3 ml-8" style={{ color: 'var(--v3-text-muted, #73727c)' }}>{step.description}</p>}
    {step.pill && (
      <div className="ml-8 mb-3">
        <span style={{ background: step.pill.bg ?? '#EEF0FF', color: step.pill.color ?? 'var(--v3-accent, #402AFF)', fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 8px' }}>
          {step.pill.label}
        </span>
      </div>
    )}
    <div className="flex items-start gap-6">
      {step.frames.map((f, fi) => (
        <ArtboardClickFrame
          key={`${f.modeId}-${f.stateId}-${f.platform}`}
          modes={modes}
          ref_={f}
          zoom={zoom}
          showStateLabel={showStateLabels}
          code={codePrefix ? `${codePrefix}${codeStart + fi + 1}` : undefined}
          fitHeight={fitHeight}
          revealed={revealed}
          onClick={() => onFrameClick(f.modeId, f.stateId, f.platform)}
        />
      ))}
    </div>
  </div>
  )
}

/* ── F3, F16, F19 — artboard section ──────────────────────────────────── */

const ArtboardSectionBlock: React.FC<{
  section: ArtboardSection
  modes: readonly ScreenMode[]
  zoom: number
  autoNumber: boolean
  showStateLabels: boolean
  /** Section letter for frame codes; absent = codes off. */
  codePrefix?: string
  fitHeight?: boolean
  revealed?: Record<string, boolean>
  onFrameClick: (modeId: string, stateId: string, platform: ScreenPlatform) => void
}> = ({ section, modes, zoom, autoNumber, showStateLabels, codePrefix, fitHeight, revealed, onFrameClick }) => {
  const dividerCls =
    section.divider === 'thick'  ? 'mt-12 pt-8 border-t-2 border-grey-20' :
    section.divider === 'dashed' ? 'mt-10 pt-8 border-t border-dashed border-grey-20' :
    section.divider === 'space'  ? 'mt-12 pt-8' : ''

  const computedTitle = autoNumber ? autoSectionTitle(modes, section.id, section.title) : section.title
  const computedMeta = autoNumber ? autoSectionMeta(modes, section.id) : undefined

  const mode = modes.find((m) => m.id === section.id)
  const subtitle = section.subtitle ?? mode?.description

  return (
    <div className={dividerCls} data-v3-section>
      {(section.flowBadge || computedTitle) && (
        <div className="flex items-center gap-3 mb-2">
          {section.flowBadge && <FlowBadge label={section.flowBadge.label} bg={section.flowBadge.bg} />}
          {computedTitle && <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--v3-text, #03072d)' }}>{computedTitle}</span>}
          {computedMeta && <span className="text-xs" style={{ color: 'var(--v3-text-muted, #73727c)' }}>{computedMeta}</span>}
        </div>
      )}
      {subtitle && <p className="text-xs mb-4" style={{ color: 'var(--v3-text-muted, #73727c)' }}>{subtitle}</p>}
      {section.description && <p className="text-[12px] mb-6 max-w-[640px]" style={{ color: 'var(--v3-text-muted, #73727c)' }}>{section.description}</p>}
      {section.preLabel && <p className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--v3-text-muted, #73727c)' }}>{section.preLabel}</p>}
      <div className="flex items-start">
        {/* Code offsets are accumulated over ALL steps, including hidden ones, so
            unhiding a step never renumbers the frames after it. */}
        {(() => {
          let seen = 0
          const offsets = section.steps.map((step) => {
            const start = seen
            seen += step.frames.length
            return start
          })
          return section.steps.map((step, idx) => ({ step, codeStart: offsets[idx] }))
        })().filter(({ step }) => !step.hidden).map(({ step, codeStart }, i, steps) => {
          const isLast = i === steps.length - 1
          const sep = step.arrowAfter
          const renderSep = sep === 'vline'
            ? <VLineSeparator />
            : sep === false
              ? null
              : sep === true
                ? <ArrowSeparator />
                : isLast ? null : <ArrowSeparator />
          return (
            <React.Fragment key={i}>
              <ArtboardStepBlock step={step} modes={modes} zoom={zoom} showStateLabels={showStateLabels} codePrefix={codePrefix} codeStart={codeStart} fitHeight={fitHeight} revealed={revealed} onFrameClick={onFrameClick} />
              {renderSep}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

/* ── Frame tray (overlay drawer, slides up over the artboard) ─────────── */

/* ── E7: Imperative ref API ───────────────────────────────────────────── */

export interface V3ArtboardHandle {
  selectByIds: (modeId: string, stateId: string, platform: ScreenPlatform) => boolean
  setViewMode: (mode: ViewMode) => void
  setZoom: (z: number) => void
  getCurrent: () => { modeId: string; stateId: string; platform: ScreenPlatform; viewMode: ViewMode; zoom: number }
}

/* ── Top-level V3Artboard ─────────────────────────────────────────────── */

export interface V3ArtboardProps {
  spec: V3ArtboardSpec
  theme?: V3ArtboardTheme
  /** F5 — optional app shell wrapper applied to viewer rendering. */
  appShell?: React.ComponentType<{ children: React.ReactNode }>
  /** F6 — sharedProps passed through to mode.renderFrame as 3rd arg. */
  sharedProps?: unknown
  /** Who owns the artboard transform. 'external' hands it to a parent zoom shell. */
  zoomControl?: 'internal' | 'external'
}

export const V3Artboard = React.forwardRef<V3ArtboardHandle, V3ArtboardProps>(({ spec, theme, appShell: AppShell, sharedProps, zoomControl = 'internal' }, ref) => {
  const externalZoom = zoomControl === 'external'
  const { modes } = spec
  const defaults = spec.defaults ?? {}
  const storageKey = `v3artboard:${spec.brand.title}`
  const helpSeenKey = `v3artboard:helpSeen:${spec.brand.title}`
  const componentFocusLayout: 'grid' | 'detail' = spec.componentFocusLayout ?? 'grid'

  const resolvedComponents = useMemo<ComponentFocusConfigResolved[]>(
    () => (spec.componentFocus ?? []).map(resolveComponentFocus),
    [spec.componentFocus],
  )
  const hasComponents = resolvedComponents.length > 0

  const effectiveSidebar = useMemo<SidebarSection[]>(
    () => (isAutoSidebar(spec) ? deriveSidebarFromModes(modes) : (spec.sidebar ?? [])),
    [spec, modes],
  )
  const autoNumber = isAutoSidebar(spec)

  const validatedRef = useRef(false)
  const [validationIssues, setValidationIssues] = useState<string[]>([])
  if (!validatedRef.current) {
    validatedRef.current = true
    const issues = validateSpec(spec)
    if (issues.length > 0) {
      console.warn(`[V3Artboard] spec validation: ${issues.length} issue(s)`)
      issues.forEach((i) => console.warn(`[V3Artboard] spec validation: ${i}`))
    }
    const isDev = (typeof import.meta !== 'undefined') && (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV
    if (isDev) {
      setTimeout(() => setValidationIssues(issues), 0)
    }
    // Tour Composer auto-discovery: publish an enumerable summary of this
    // artboard's modes/states/platforms so a same-origin iframe can read it.
    ;(window as Window & { __V3_DISCOVERY?: unknown }).__V3_DISCOVERY = {
      title: spec.brand.title,
      modes: modes.map((m) => ({
        id: m.id,
        label: m.label,
        platforms: m.platforms,
        states: m.states.map((s) => ({ id: s.id, label: s.label })),
      })),
    }
  }

  if (modes.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center font-perk-sans" style={{ background: 'var(--v3-bg-muted, #f8f8fb)', ...buildThemeStyle(theme) }}>
        <div className="text-center">
          <p className="text-base font-bold" style={{ color: 'var(--v3-text, #03072d)' }}>No modes configured.</p>
          <p className="text-xs mt-1" style={{ color: 'var(--v3-text-muted, #73727c)' }}>Add to spec.modes[]</p>
        </div>
      </div>
    )
  }

  const firstModePlatforms = modes[0].platforms
  let initialPlatform: ScreenPlatform = defaults.platform ?? firstModePlatforms[0] ?? 'web'
  if (defaults.platform && !firstModePlatforms.includes(defaults.platform)) {
    const fallback = firstModePlatforms[0] ?? 'web'
    console.warn(`[V3Artboard] defaults.platform "${defaults.platform}" not in modes[0].platforms; clamping to "${fallback}"`)
    initialPlatform = fallback
  }

  const persisted = loadPersisted(storageKey)
  const hash = parseHash()

  const findByIds = (modeId?: string, stateId?: string): { mi: number; si: number } | null => {
    if (!modeId || !stateId) return null
    const mi = modes.findIndex((m) => m.id === modeId)
    if (mi < 0) return null
    const si = modes[mi].states.findIndex((s) => s.id === stateId)
    if (si < 0) return null
    return { mi, si }
  }

  const persistedIds = persisted
    ? findByIds(modes[persisted.activeModeIndex ?? -1]?.id, modes[persisted.activeModeIndex ?? -1]?.states[persisted.activeStateIndex ?? -1]?.id)
    : null
  const hashIds = findByIds(hash.m, hash.s)

  const initialMI = hashIds?.mi ?? persistedIds?.mi ?? 0
  const initialSI = hashIds?.si ?? persistedIds?.si ?? 0
  const initialPlat: ScreenPlatform =
    (hash.p && modes[initialMI]?.platforms.includes(hash.p) ? hash.p : null) ??
    (persisted?.activePlatform && modes[initialMI]?.platforms.includes(persisted.activePlatform) ? persisted.activePlatform : null) ??
    initialPlatform

  // `&panel=0` in the URL forces the sidebar closed on load (for shared proto
  // links); otherwise fall back to persisted state, then open.
  const [panelOpen, setPanelOpen] = useState<boolean>(hash.panel === '0' ? false : (persisted?.panelOpen ?? true))
  // Priority: URL hash.v > spec.defaults.viewMode > localStorage persisted > 'artboard'.
  // Spec defaults outrank stale localStorage so a shared URL renders the author-intended view.
  const initialTab: SidebarTab =
    (hash.v as SidebarTab | undefined) ??
    (defaults.viewMode as SidebarTab | undefined) ??
    (persisted?.viewMode as SidebarTab | undefined) ??
    'artboard'
  const [tab, setTab] = useState<SidebarTab>(initialTab)
  const [activeModeIndex, setActiveModeIndex] = useState(initialMI)
  const [activeStateIndex, setActiveStateIndex] = useState(initialSI)
  const [activePlatform, setActivePlatform] = useState<ScreenPlatform>(initialPlat)
  const [zoom, setZoom] = useState(persisted?.zoom ?? defaults.zoom ?? 0.3)
  const [itemPlatform, setItemPlatform] = useState<Record<string, ScreenPlatform>>(persisted?.itemPlatform ?? {})
  const [activeComponentId, setActiveComponentId] = useState<string | null>(hasComponents ? resolvedComponents[0].id : null)
  const [activeComponentStateIndex, setActiveComponentStateIndex] = useState(0)
  const [helpOpen, setHelpOpen] = useState(false)
  const devMode = useDevMode((s) => s.devMode)
  const setDevMode = useDevMode((s) => s.setDevMode)
  const [helpSeenInitialized, setHelpSeenInitialized] = useState(false)
  // One map for both switch kinds: hidden-flows sections and spec-level option
  // toggles. Option ids never appear in `hiddenSections`, so they hide nothing —
  // they only surface in FrameCtx.revealed for a mode to read.
  const [revealedSectionIds, setRevealedSectionIds] = useState<Record<string, boolean>>(() =>
    Object.fromEntries([
      ...spec.artboard.filter((s) => s.hiddenByDefault && s.defaultRevealed).map((s) => [s.id, true] as const),
      ...(spec.options ?? []).filter((o) => o.default).map((o) => [o.id, true] as const),
    ]),
  )
  const hiddenSections = useMemo(() => spec.artboard.filter((s) => s.hiddenByDefault), [spec.artboard])
  const artboardRef = useRef<HTMLDivElement>(null)
  /* Tracks the previous tab so returning to the artboard can scroll back to the
   * frame that was on screen, instead of dumping you at the top. */
  const prevTabRef = useRef(tab)
  const panelWidth = panelOpen ? 288 : 0

  const viewMode: ViewMode = tab === 'components' ? 'viewer' : tab

  useEffect(() => {
    if (helpSeenInitialized) return
    setHelpSeenInitialized(true)
    try {
      const seen = window.localStorage.getItem(helpSeenKey)
      if (!seen) setHelpOpen(true)
    } catch {}
  }, [helpSeenInitialized, helpSeenKey])

  const closeHelp = () => {
    try { window.localStorage.setItem(helpSeenKey, '1') } catch {}
    setHelpOpen(false)
  }

  useEffect(() => {
    savePersisted(storageKey, {
      viewMode: tab === 'components' ? undefined : tab,
      activeModeIndex,
      activeStateIndex,
      activePlatform,
      zoom,
      panelOpen,
      itemPlatform,
    })
  }, [storageKey, tab, activeModeIndex, activeStateIndex, activePlatform, zoom, panelOpen, itemPlatform])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mode = modes[activeModeIndex]
    const state = mode?.states[activeStateIndex]
    if (!mode || !state) return
    const hashViewMode = tab === 'components' ? undefined : (tab as 'viewer' | 'artboard')
    const next = serializeHash(mode.id, state.id, activePlatform, hashViewMode)
    if (window.location.hash !== next) {
      try { window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${next}`) } catch {}
    }
  }, [activeModeIndex, activeStateIndex, activePlatform, modes, tab])

  // Listen for external hash changes (e.g. navigateLab() click handlers inside lab pages)
  // and project them onto component state. Guard each setter against no-op writes so the
  // sibling effect above doesn't trigger a write -> read -> write loop.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sync = () => {
      const h = parseHash()
      const ids = h.m && h.s ? findByIds(h.m, h.s) : null
      if (ids) {
        setActiveModeIndex((prev) => (prev === ids.mi ? prev : ids.mi))
        setActiveStateIndex((prev) => (prev === ids.si ? prev : ids.si))
        const targetPlatforms = modes[ids.mi]?.platforms
        if (h.p && targetPlatforms?.includes(h.p)) {
          setActivePlatform((prev) => (prev === h.p ? prev : h.p!))
        }
      }
      if (h.v === 'viewer' || h.v === 'artboard') {
        setTab((prev) => (prev === h.v ? prev : (h.v as SidebarTab)))
      }
    }
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [modes])

  /* Coming back from full screen: scroll the artboard to the frame you were just
   * looking at. Anchored on the frame's id (not a saved pixel offset) so it still
   * lands correctly after a zoom change or a section being revealed. */
  useEffect(() => {
    const was = prevTabRef.current
    prevTabRef.current = tab
    if (tab !== 'artboard' || was === 'artboard') return
    const mode = modes[activeModeIndex]
    const state = mode?.states[activeStateIndex]
    if (!mode || !state) return
    let raf = 0
    // Two frames: the artboard has just mounted, so wait for it to lay out.
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        const c = artboardRef.current
        const el = document.getElementById(`frame-${mode.id}-${state.id}`)
        if (!c || !el) return
        const r = el.getBoundingClientRect()
        const cr = c.getBoundingClientRect()
        c.scrollTop += r.top - cr.top - 80
        c.scrollLeft += r.left - cr.left - 40
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [tab, modes, activeModeIndex, activeStateIndex])

  /* F7 — cursor-anchored Cmd/Ctrl + scroll zoom. Off when a shell owns the transform. */
  useEffect(() => {
    if (tab !== 'artboard' || externalZoom) return
    const el = artboardRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const c = el
      const rect = c.getBoundingClientRect()
      setZoom((prev) => {
        const next = Math.max(0.1, Math.min(1, prev - e.deltaY * 0.002))
        const cx = (e.clientX - rect.left + c.scrollLeft) / prev
        const cy = (e.clientY - rect.top + c.scrollTop) / prev
        requestAnimationFrame(() => {
          c.scrollLeft = cx * next - (e.clientX - rect.left)
          c.scrollTop = cy * next - (e.clientY - rect.top)
        })
        return next
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [tab, externalZoom])

  const activeMode: ScreenMode | null = modes[activeModeIndex] ?? null
  const activeModeHasStates = !!activeMode && activeMode.states.length > 0
  const activeModeHasPlatforms = !!activeMode && activeMode.platforms.length > 0
  const clampedStateIndex = activeModeHasStates ? Math.min(activeStateIndex, activeMode!.states.length - 1) : 0
  const activeState = activeModeHasStates ? activeMode!.states[clampedStateIndex] : null

  const allStatesFlat = useMemo(
    () => modes.flatMap((m, mi) => m.states.map((_s, si) => ({ mi, si }))),
    [modes]
  )
  const currentFlat = allStatesFlat.findIndex((f) => f.mi === activeModeIndex && f.si === clampedStateIndex)

  const goToFlat = (idx: number) => {
    const e = allStatesFlat[idx]
    if (!e) return
    setActiveModeIndex(e.mi)
    setActiveStateIndex(e.si)
  }

  const selectByIdsInternal = (modeId: string, stateId: string, platform: ScreenPlatform): boolean => {
    const mi = modes.findIndex((m) => m.id === modeId)
    if (mi < 0) return false
    const mode = modes[mi]
    const si = mode.states.findIndex((s) => s.id === stateId)
    if (si < 0) return false
    if (!mode.platforms.includes(platform)) return false
    setActiveModeIndex(mi)
    setActiveStateIndex(si)
    setActivePlatform(platform)
    if (tab === 'artboard' && typeof document !== 'undefined') {
      requestAnimationFrame(() => {
        document.getElementById(`frame-${modeId}-${stateId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
      })
    }
    return true
  }

  const handleArtboardFrameClick = (modeId: string, stateId: string, platform: ScreenPlatform) => {
    const mi = modes.findIndex((m) => m.id === modeId)
    const mode = modes[mi]
    const si = mode?.states.findIndex((s) => s.id === stateId) ?? -1
    if (mi < 0 || si < 0) return
    if (!mode.platforms.includes(platform)) return
    // Open the clicked frame full screen. Selecting it (rather than showing an
    // overlay) is what lets Exit full screen come back to this exact frame.
    setActiveModeIndex(mi)
    setActiveStateIndex(si)
    setActivePlatform(platform)
    setTab('viewer')
  }

  useEffect(() => {
    const isEditable = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (el.isContentEditable) return true
      return false
    }
    const handler = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return
      if ((e.metaKey || e.ctrlKey) && (e.key === '1' || e.key === '2')) {
        e.preventDefault()
        setTab(e.key === '1' ? 'viewer' : 'artboard')
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (currentFlat > 0) goToFlat(currentFlat - 1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (currentFlat < allStatesFlat.length - 1) goToFlat(currentFlat + 1)
      } else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        setHelpOpen(true)
      } else if (e.key === 'Escape' && helpOpen) {
        setHelpOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentFlat, allStatesFlat.length, helpOpen])

  useImperativeHandle(ref, () => ({
    selectByIds: (modeId, stateId, platform) => selectByIdsInternal(modeId, stateId, platform),
    setViewMode: (m) => setTab(m),
    setZoom: (z) => setZoom(Math.min(1, Math.max(0.1, z))),
    getCurrent: () => ({
      modeId: activeMode?.id ?? '',
      stateId: activeState?.id ?? '',
      platform: activePlatform,
      viewMode,
      zoom,
    }),
  }))

  const fullScreen = !!(activeMode && activeState && (
    typeof activeMode.fullScreenViewer === 'function'
      ? activeMode.fullScreenViewer(activeState)
      : activeMode.fullScreenViewer
  ))

  const renderViewer = () => {
    if (!activeMode || !activeState || !activeModeHasPlatforms) {
      console.warn(`[V3Artboard] viewer skipped: mode "${activeMode?.id ?? '?'}" has no states or platforms`)
      return (
        <div className="flex items-center justify-center min-h-[calc(100vh-49px)]" style={{ background: 'var(--v3-bg-muted, #e8e8ec)' }}>
          <p className="text-xs" style={{ color: 'var(--v3-text-muted, #73727c)' }}>Mode has no renderable state.</p>
        </div>
      )
    }
    const inner = activeMode.renderFrame(activeState, activePlatform, sharedProps, { revealed: revealedSectionIds })
    const wrapped = AppShell ? <AppShell>{inner}</AppShell> : inner
    // Scale the web frame to fit the available width. Divide by the REAL frame
    // width (PLATFORM_WIDTH.web = 1440), not a hardcoded 1280 — otherwise the
    // scaled content ends up wider than the space and gets clipped by the
    // centering container. Mobile/native render 1:1.
    const contentW = PLATFORM_WIDTH[activePlatform] ?? 1440
    const availableW = (typeof window !== 'undefined' ? window.innerWidth : 1440) - panelWidth - 64
    const scale = activePlatform === 'web' ? Math.min(1, availableW / contentW) : 1
    return (
      <div className="flex items-start justify-center p-8 pt-16 min-h-[calc(100vh-49px)] overflow-auto" style={{ background: 'var(--v3-bg-muted, #e8e8ec)' }}>
        <div style={{ zoom: scale, flexShrink: 0 }}>{wrapped}</div>
      </div>
    )
  }

  // External zoom: the shell owns scroll + transform, so drop the viewport clamp.
  const renderArtboard = () => (
    <div ref={artboardRef} className={externalZoom ? undefined : 'overflow-auto'} style={{ height: externalZoom ? undefined : 'calc(100vh - 49px)', background: 'var(--v3-bg-muted, #e8e8ec)' }}>
      <div className="origin-top-left px-8 py-6 pt-16">
        {/* Letter comes from the position in the FULL spec, so revealing a
            hidden section never re-letters the ones after it. */}
        {spec.artboard
          .map((section, i) => ({ section, letter: sectionLetter(i) }))
          .filter(({ section }) => !section.hiddenByDefault || revealedSectionIds[section.id])
          .map(({ section, letter }) => (
          <ArtboardSectionBlock
            key={section.id}
            section={section}
            modes={modes}
            zoom={externalZoom ? 1 : zoom}
            autoNumber={autoNumber}
            showStateLabels
            codePrefix={letter}
            fitHeight={(defaults.frameHeight ?? 'auto') === 'auto'}
            revealed={revealedSectionIds}
            onFrameClick={handleArtboardFrameClick}
          />
        ))}
      </div>
    </div>
  )

  const activeComponent = hasComponents ? resolvedComponents.find((c) => c.id === activeComponentId) ?? resolvedComponents[0] : null

  const sidebar = panelOpen ? (
    <Sidebar
      spec={spec}
      effectiveSidebar={effectiveSidebar}
      validationIssues={validationIssues}
      viewMode={viewMode}
      tab={tab}
      onTabChange={setTab}
      hasComponents={hasComponents}
      activePlatform={activePlatform}
      onPlatformChange={setActivePlatform}
      activeMode={activeMode}
      zoom={zoom}
      onZoomChange={setZoom}
      activeModeId={activeMode?.id ?? null}
      activeStateId={activeState?.id ?? null}
      itemPlatform={itemPlatform}
      onItemPlatformChange={(itemId, pf) => setItemPlatform((prev) => ({ ...prev, [itemId]: pf }))}
      onSelect={selectByIdsInternal}
      resolvedComponents={resolvedComponents}
      componentFocusLayout={componentFocusLayout}
      activeComponentId={activeComponentId}
      onComponentSelect={(id) => { setActiveComponentId(id); setActiveComponentStateIndex(0) }}
      activeComponentStateIndex={activeComponentStateIndex}
      onComponentStateIndexChange={setActiveComponentStateIndex}
      onHelpClick={() => setHelpOpen(true)}
      devMode={devMode}
      onDevModeChange={setDevMode}
      hiddenSections={hiddenSections}
      revealedSectionIds={revealedSectionIds}
      onToggleRevealSection={(id) => setRevealedSectionIds((prev) => ({ ...prev, [id]: !prev[id] }))}
    />
  ) : null

  // Shared chrome: floating dynamic-island nav + panel-collapse chevron.
  // Rendered in BOTH the fullscreen-viewer branch and the regular branch so
  // fullScreenViewer modes still get Prev/Next/Platform/Bird's-eye/Dev/Help
  // and the sidebar slide-away toggle.
  const floatingNav = tab !== 'components' && activeMode && activeState ? (
    <FloatingViewerNav
      label={activeMode.floatingNavLabel(activeState)}
      platforms={activeMode.platforms}
      activePlatform={activePlatform}
      onPlatformChange={setActivePlatform}
      viewMode={viewMode}
      onViewModeChange={(m) => setTab(m)}
      onPrev={() => goToFlat(currentFlat - 1)}
      onNext={() => goToFlat(currentFlat + 1)}
      canPrev={currentFlat > 0}
      canNext={currentFlat < allStatesFlat.length - 1}
      onHelp={() => setHelpOpen(true)}
    />
  ) : null

  const panelToggleBtn = (
    <button
      onClick={() => setPanelOpen((v) => !v)}
      aria-label={panelOpen ? 'Hide sidebar' : 'Show sidebar'}
      className="fixed top-[14px] z-[70] flex h-7 w-7 items-center justify-center rounded-lg bg-white shadow-sm transition-all hover:bg-grey-03"
      style={{ left: panelOpen ? 288 + 8 : 8, border: '1px solid var(--v3-border, #d7d6da)', color: 'var(--v3-text-muted, #73727c)' }}
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-3.5 h-3.5">
        {panelOpen ? <path d="M10 3L5 8l5 5" /> : <path d="M6 3l5 5-5 5" />}
      </svg>
    </button>
  )

  // Standalone "Exit full screen" pill, sitting just under the floating nav.
  // Only rendered in the fullscreen-viewer branch below; exits to bird's-eye.
  const exitFullScreenBtn = (
    <button
      type="button"
      onClick={() => setTab('artboard')}
      aria-label="Exit full screen"
      className="fixed left-1/2 z-[79] inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-lg transition-opacity hover:opacity-90"
      style={{ top: 60, background: '#03072d' }}
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
        <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />
      </svg>
      Exit full screen
    </button>
  )

  // In viewer mode, a frame-scoped modal overlay (absolute inset-0) gets clipped
  // by the V3 sidebar's marginLeft. Promote any such overlay to fixed positioning
  // bounded by --v3-panel-width on the left so the modal fills the non-artboard
  // area without covering the sidebar. Data-driven: V3Artboard exposes
  // --v3-panel-width on the root; the override reads it. Scoped to viewer mode
  // only — artboard (bird's-eye) keeps in-frame absolute z-30 scoping.
  const viewerModalOverride = tab === 'viewer' ? (
    <style>{`[data-testid="widgets-modal-overlay"]{position:fixed;top:0;right:0;bottom:0;left:var(--v3-panel-width,0);z-index:90}`}</style>
  ) : null

  // F4 fullscreen viewer: edge-to-edge frame in <main>, but still get the
  // floating nav + panel toggle (chrome stays consistent across modes).
  if (tab === 'viewer' && fullScreen && activeMode && activeState) {
    return (
      <DevModeProvider>
        <div className="font-perk-sans min-h-screen" style={{ background: 'var(--v3-bg-muted, #f8f8fb)', ['--v3-panel-width' as string]: `${panelWidth}px`, ...buildThemeStyle(theme) }} data-v3artboard-root data-v3-fullscreen>
          {viewerModalOverride}
          {sidebar}
          {floatingNav}
          {exitFullScreenBtn}
          <main className="transition-all duration-200" style={{ marginLeft: panelWidth, minHeight: '100vh' }}>
            {panelToggleBtn}
            {activeMode.renderFrame(activeState, activePlatform, sharedProps, { revealed: revealedSectionIds, fullScreen: true })}
          </main>
          {helpOpen && <WelcomeHelpModal items={spec.brand.welcomeHelp ?? DEFAULT_WELCOME_HELP} onClose={closeHelp} />}
        </div>
        <DevPanel />
      </DevModeProvider>
    )
  }

  return (
    <DevModeProvider>
    <div className="flex min-h-screen font-perk-sans" style={{ background: 'var(--v3-bg-muted, #f8f8fb)', ['--v3-panel-width' as string]: `${panelWidth}px`, ...buildThemeStyle(theme) }} data-v3artboard-root>
      {viewerModalOverride}
      {sidebar}
      {floatingNav}

      <main className="flex-1 min-w-0 transition-all duration-200" style={{ marginLeft: panelWidth }}>
        {panelToggleBtn}

        {tab === 'viewer' && renderViewer()}
        {tab === 'artboard' && renderArtboard()}
        {tab === 'components' && activeComponent && (
          componentFocusLayout === 'detail'
            ? <ComponentFocusDetailPanel component={activeComponent} activeStateIndex={activeComponentStateIndex} activePlatform={activePlatform} />
            : <ComponentFocusPanel component={activeComponent} />
        )}
      </main>

      {helpOpen && <WelcomeHelpModal items={spec.brand.welcomeHelp ?? DEFAULT_WELCOME_HELP} onClose={closeHelp} />}
    </div>
    <DevPanel />
    </DevModeProvider>
  )
})

V3Artboard.displayName = 'V3Artboard'

export default V3Artboard
