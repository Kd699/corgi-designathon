// V3Artboard runtime component
//
// Built 2026-05-25. Implements the may-22 contract:
//   - Sidebar (brand + viewer/artboard toggle + platform toggle + zoom + sections + context)
//   - Viewer (renderFrame scaled-to-fit, fullScreenViewer opt-out for app-shell modes)
//   - Artboard (declarative dispatch of renderArtboardFrame per spec)
//   - FloatingViewerNav with may-22 collapsed-pill-hover-to-expand behaviour
//   - Keyboard nav (Arrow keys, Cmd+1/2)
//   - ctrl-scroll zoom
//   - Click-frame-to-route (artboard frame -> viewer)
//
// Deferred (surface as known limits in lab terminus reports):
//   - Dev-mode inspector overlay + tokens.ts registry (P9). Toggle exists, no
//     resolution yet. Inspector card is informational placeholder only.
//   - localStorage / URL-hash persistence (E5, E6).
//   - Imperative ref API (E7).
//   - LossTest companion (E14).
//   - COMPONENT_FOCUS_REGISTRY third surface (E9).
//   - CSS-variable theming (E11) — Perkbox-ish defaults inlined.

import React, {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { PhoneFrame, DesktopFrame, NativeFrame, FrameBleedContext } from './frames'
import type {
  ArtboardFrameRef,
  ArtboardSection,
  ContextCard,
  ContextTone,
  Platform,
  ScreenMode,
  ScreenState,
  V3ArtboardSpec,
} from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PANEL_WIDTH = 260
// Tailwind `md` breakpoint. Below this the sidebar becomes an off-canvas drawer
// so the viewer is usable on a phone (per /v3artboard-may-22 mobile-viewer rule).
const MOBILE_BP = 768

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BP,
  )
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BP)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isMobile
}

const PLATFORM_LABEL: Record<Platform, string> = {
  web: 'Desktop',
  mobile: 'Mobile',
  native: 'Native',
}

const PLATFORM_SHORT: Record<Platform, string> = {
  web: 'D',
  mobile: 'M',
  native: 'N',
}

const TONE_STYLE: Record<ContextTone, string> = {
  info: 'bg-blue-50 border-blue-200 text-blue-900',
  warn: 'bg-amber-50 border-amber-200 text-amber-900',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  neutral: 'bg-gray-50 border-gray-200 text-gray-900',
}

type FlatRoute = {
  key: string
  modeId: string
  stateId: string
  platform: Platform
  label: string
  sectionLabel: string
}

function buildFlatRoutes(
  modes: ScreenMode[],
  sidebar: V3ArtboardSpec['sidebar'],
): FlatRoute[] {
  if (sidebar && sidebar.length) {
    return sidebar.flatMap((section) =>
      section.items.flatMap((item) =>
        item.options.map((opt) => ({
          key: `${opt.modeId}/${opt.stateId}/${opt.platform}`,
          modeId: opt.modeId,
          stateId: opt.stateId,
          platform: opt.platform,
          label: item.label,
          sectionLabel: section.sectionLabel,
        })),
      ),
    )
  }
  return modes.flatMap((m) =>
    m.states.flatMap((s) =>
      m.platforms.map((p) => ({
        key: `${m.id}/${s.id}/${p}`,
        modeId: m.id,
        stateId: s.id,
        platform: p,
        label: `${m.label} - ${s.label}`,
        sectionLabel: m.label,
      })),
    ),
  )
}

function findMode(modes: ScreenMode[], id: string): ScreenMode | undefined {
  return modes.find((m) => m.id === id)
}

function findState(mode: ScreenMode | undefined, id: string): ScreenState | undefined {
  return mode?.states.find((s) => s.id === id)
}

// Auto-wrap bare content in a platform frame (E10). Skipped when rawFrame:true.
function wrapForArtboard(
  node: ReactNode,
  platform: Platform,
  raw: boolean | undefined,
): ReactNode {
  if (raw) return node
  if (platform === 'mobile') return <PhoneFrame>{node}</PhoneFrame>
  if (platform === 'native') return <NativeFrame>{node}</NativeFrame>
  return <DesktopFrame>{node}</DesktopFrame>
}

// ---------------------------------------------------------------------------
// FloatingViewerNav (may-22 collapsed-pill, hover-to-expand)
// ---------------------------------------------------------------------------

interface FloatingNavProps {
  routes: FlatRoute[]
  currentIdx: number
  onPrev: () => void
  onNext: () => void
  platform: Platform
  availablePlatforms: Platform[]
  onPlatform: (p: Platform) => void
  viewMode: 'viewer' | 'artboard'
  onViewMode: (m: 'viewer' | 'artboard') => void
  devMode: boolean
  onDevMode: () => void
  onHelp: () => void
  labelOverride?: string
}

const FloatingViewerNav: React.FC<FloatingNavProps> = ({
  routes,
  currentIdx,
  onPrev,
  onNext,
  onViewMode,
  labelOverride,
}) => {
  // Simplified island (user 2026-06-07): back · truncated title · forward · ✕→bird's-eye.
  // Replaces the may-22 hover-to-expand pill; platform/dev/help live in the sidebar.
  const current = routes[currentIdx]
  const label = labelOverride ?? current?.label ?? '—'

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[80]">
      <div className="flex items-center gap-0.5 bg-black/85 backdrop-blur text-white rounded-full px-1 py-1 shadow-lg max-w-[88vw]">
        <NavBtn onClick={onPrev} disabled={currentIdx <= 0} title="Previous (←)">
          ←
        </NavBtn>
        <span
          className="px-2 text-[12px] truncate max-w-[44vw] sm:max-w-[220px] text-white/90"
          title={label}
        >
          {label}
        </span>
        <NavBtn onClick={onNext} disabled={currentIdx >= routes.length - 1} title="Next (→)">
          →
        </NavBtn>
        <NavBtn onClick={() => onViewMode('artboard')} title="Bird's-eye">
          ✕
        </NavBtn>
      </div>
    </div>
  )
}

const NavBtn: React.FC<{
  onClick: () => void
  disabled?: boolean
  active?: boolean
  title?: string
  children: ReactNode
}> = ({ onClick, disabled, active, title, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`rounded-full text-xs px-2.5 py-1 transition-colors ${
      active ? 'bg-white text-black' : 'text-white/80 hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent'
    }`}
  >
    {children}
  </button>
)


// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

interface SidebarProps {
  spec: V3ArtboardSpec
  viewMode: 'viewer' | 'artboard'
  onViewMode: (m: 'viewer' | 'artboard') => void
  platform: Platform
  onPlatform: (p: Platform) => void
  availablePlatforms: Platform[]
  zoom: number
  onZoom: (z: number) => void
  currentKey: string
  onPick: (modeId: string, stateId: string, platform: Platform) => void
  mobileOpen?: boolean
  onClose?: () => void
}

const Sidebar: React.FC<SidebarProps> = ({
  spec,
  viewMode,
  onViewMode,
  platform,
  onPlatform,
  availablePlatforms,
  zoom,
  onZoom,
  currentKey,
  onPick,
  mobileOpen = false,
  onClose,
}) => (
  <aside
    className={`fixed top-0 left-0 h-screen bg-white border-r border-gray-200 flex flex-col overflow-hidden z-[60] transition-transform duration-300 md:translate-x-0 md:shadow-none ${
      mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
    }`}
    style={{ width: PANEL_WIDTH }}
  >
    {onClose && (
      <button
        onClick={onClose}
        aria-label="Close menu"
        className="md:hidden absolute top-3 right-3 z-10 w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
      >
        ✕
      </button>
    )}
    <div className="px-4 py-4 border-b border-gray-100">
      <div className="flex items-center gap-2 mb-1">
        {spec.brand.icon && <span className="text-base">{spec.brand.icon}</span>}
        <h1 className="text-sm font-bold text-gray-900 truncate">{spec.brand.title}</h1>
      </div>
      {spec.brand.subtitle && (
        <p className="text-[11px] text-gray-500">{spec.brand.subtitle}</p>
      )}
    </div>

    <div className="px-4 py-3 border-b border-gray-100 space-y-2.5">
      <div>
        <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-1">Surface</p>
        <div className="flex gap-1">
          <SegBtn active={viewMode === 'viewer'} onClick={() => onViewMode('viewer')}>
            Viewer
          </SegBtn>
          <SegBtn active={viewMode === 'artboard'} onClick={() => onViewMode('artboard')}>
            Bird's-eye
          </SegBtn>
        </div>
      </div>

      {availablePlatforms.length > 1 && (
        <div>
          <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-1">Platform</p>
          <div className="flex gap-1">
            {availablePlatforms.map((p) => (
              <SegBtn key={p} active={platform === p} onClick={() => onPlatform(p)}>
                {PLATFORM_LABEL[p]}
              </SegBtn>
            ))}
          </div>
        </div>
      )}

      {/* Zoom only affects bird's-eye (artboard). Viewer always renders 1:1. */}
      {viewMode === 'artboard' && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[9px] uppercase tracking-widest text-gray-400">Zoom</p>
            <span className="text-[10px] text-gray-500">{Math.round(zoom * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={zoom}
            onChange={(e) => onZoom(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>
      )}
    </div>

    <nav className="flex-1 overflow-y-auto px-2 py-3">
      {(spec.sidebar ?? []).map((section) => (
        <div key={section.sectionLabel} className="mb-4">
          <p className="px-2 text-[9px] uppercase tracking-widest text-gray-400 mb-1.5">
            {section.sectionLabel}
          </p>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const primary = item.options[0]
              const matches = item.options.some(
                (o) => `${o.modeId}/${o.stateId}/${o.platform}` === currentKey,
              )
              return (
                <button
                  key={item.id}
                  onClick={() =>
                    onPick(primary.modeId, primary.stateId, primary.platform)
                  }
                  className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                    matches
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{item.label}</span>
                    <span
                      className={`flex gap-0.5 shrink-0 ${matches ? 'text-white/50' : 'text-gray-400'}`}
                    >
                      {item.options.map((o) => (
                        <span
                          key={o.platform}
                          className="text-[9px] font-mono"
                        >
                          {o.platformLabel ?? PLATFORM_SHORT[o.platform]}
                        </span>
                      ))}
                    </span>
                  </div>
                  {item.description && (
                    <p
                      className={`text-[10px] mt-0.5 truncate ${matches ? 'text-white/60' : 'text-gray-500'}`}
                    >
                      {item.description}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </nav>

    {spec.context && spec.context.length > 0 && (
      <div className="border-t border-gray-100 px-3 py-3 space-y-2 max-h-[40vh] overflow-y-auto">
        {spec.context.map((card, i) => (
          <ContextCardView key={i} card={card} />
        ))}
      </div>
    )}
  </aside>
)

const SegBtn: React.FC<{
  active: boolean
  onClick: () => void
  children: ReactNode
}> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`flex-1 px-2 py-1 text-[11px] font-medium rounded transition-colors ${
      active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    }`}
  >
    {children}
  </button>
)

const ContextCardView: React.FC<{ card: ContextCard }> = ({ card }) => (
  <div className={`rounded border px-2.5 py-2 ${TONE_STYLE[card.tone]}`}>
    <p className="text-[10px] font-bold uppercase tracking-widest mb-1">{card.title}</p>
    <ul className="text-[11px] space-y-0.5 list-disc list-inside marker:text-current/40">
      {card.items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  </div>
)

// ---------------------------------------------------------------------------
// Welcome / Help Modal (P8 — includes dev mode tip)
// ---------------------------------------------------------------------------

const HelpModal: React.FC<{
  spec: V3ArtboardSpec
  onClose: () => void
}> = ({ spec, onClose }) => {
  const items = spec.brand.welcomeHelp ?? DEFAULT_HELP
  return (
    <div
      className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-8"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{spec.brand.title} — help</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900">
            ✕
          </button>
        </div>
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="w-14 shrink-0 text-center">
                {item.kbd && (
                  <span className="inline-block px-2 py-1 bg-gray-100 border border-gray-200 rounded text-xs font-mono">
                    {item.kbd}
                  </span>
                )}
                {item.badge && (
                  <span className="inline-block px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold uppercase">
                    {item.badge}
                  </span>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                <p className="text-xs text-gray-600">{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const DEFAULT_HELP = [
  { kbd: '←/→', title: 'Step through', text: 'Move between states.' },
  { kbd: 'Cmd+1', title: 'Viewer', text: 'Single frame, scale-to-fit.' },
  { kbd: 'Cmd+2', title: 'Bird\'s-eye', text: 'Artboard grid of all frames.' },
  { kbd: 'click', title: 'Frame -> Viewer', text: 'Click any artboard frame to open it.' },
  { kbd: '</>', badge: 'NEW', title: 'Dev Mode', text: 'Toggle the inspection overlay in the floating nav. Click any element -> source file:line (coming). Hover -> reveal annotations.' },
]

// ---------------------------------------------------------------------------
// Viewer surface
// ---------------------------------------------------------------------------

interface ViewerProps {
  mode: ScreenMode
  state: ScreenState
  platform: Platform
  zoom: number
  bleed?: boolean
}

const Viewer: React.FC<ViewerProps> = ({ mode, state, platform, zoom, bleed }) => {
  const fullScreen =
    typeof mode.fullScreenViewer === 'function'
      ? mode.fullScreenViewer(state, platform)
      : Boolean(mode.fullScreenViewer)

  const frame = mode.renderFrame(state, platform)

  if (fullScreen) {
    return (
      // cbt 2026-09-02: h-[100dvh] so a component that fills its parent (h-full) fills the viewer,
      // matching how it fills the PhoneFrame on the board. min-h-screen alone leaves height auto.
      <main className="h-[100dvh] min-h-screen ml-0 md:ml-[260px]">
        {frame}
      </main>
    )
  }

  // Mobile full-bleed: drop the device bezel + centering, fill the screen.
  if (bleed) {
    return (
      <FrameBleedContext.Provider value={true}>
        <main className="bg-white ml-0 overflow-hidden">{frame}</main>
      </FrameBleedContext.Provider>
    )
  }

  // Viewer always renders 1:1; the sidebar zoom slider only affects bird's-eye.
  // `zoom` is intentionally ignored here.
  void zoom
  return (
    <main
      className="min-h-screen flex items-start justify-center p-4 pt-16 md:p-8 bg-[#f0f0f0] ml-0 md:ml-[260px]"
    >
      <div className="shrink-0">{frame}</div>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Artboard surface
// ---------------------------------------------------------------------------

interface ArtboardProps {
  modes: ScreenMode[]
  artboard: ArtboardSection[]
  zoom: number
  onFrameClick: (frame: ArtboardFrameRef) => void
}

const Artboard: React.FC<ArtboardProps> = ({ modes, artboard, zoom, onFrameClick }) => (
  <main
    className="min-h-screen bg-[#f0f0f0] p-4 pt-20 md:p-10 ml-0 md:ml-[260px]"
  >
    <div className="space-y-16">
      {artboard.map((section, sIdx) => (
        <ArtboardSectionView
          key={section.id}
          section={section}
          modes={modes}
          zoom={zoom}
          onFrameClick={onFrameClick}
          showDivider={sIdx > 0}
        />
      ))}
    </div>
  </main>
)

const ArtboardSectionView: React.FC<{
  section: ArtboardSection
  modes: ScreenMode[]
  zoom: number
  onFrameClick: (f: ArtboardFrameRef) => void
  showDivider: boolean
}> = ({ section, modes, zoom, onFrameClick, showDivider }) => (
  <Fragment>
    {showDivider && section.divider !== 'none' && (
      <hr
        className={`border-0 border-t-2 ${
          section.divider === 'dashed'
            ? 'border-dashed border-gray-300'
            : 'border-gray-400'
        }`}
      />
    )}
    <section>
      <header className="mb-4 flex items-center gap-3">
        {section.flowBadge && (
          <span
            className="text-[10px] font-bold uppercase tracking-widest text-white px-2 py-0.5 rounded"
            style={{ backgroundColor: section.flowBadge.bg ?? '#111827' }}
          >
            {section.flowBadge.label}
          </span>
        )}
        {section.title && (
          <h2 className="text-xl font-bold text-gray-900">{section.title}</h2>
        )}
      </header>
      {section.description && (
        <p className="text-sm text-gray-600 max-w-3xl mb-6">{section.description}</p>
      )}

      <div className="flex items-start gap-8 flex-wrap">
        {section.steps.map((step, i) => (
          <Fragment key={i}>
            <div>
              {(step.badge !== undefined || step.title) && (
                <div className="mb-3 flex items-center gap-2">
                  {step.badge !== undefined && (
                    <span
                      className="w-6 h-6 rounded-full text-white text-[11px] font-bold flex items-center justify-center"
                      style={{ backgroundColor: step.badgeColor ?? '#111827' }}
                    >
                      {step.badge}
                    </span>
                  )}
                  {step.title && (
                    <h3 className="text-sm font-semibold text-gray-900">
                      {step.title}
                    </h3>
                  )}
                  {step.pill && (
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: step.pill.bg ?? '#e5e7eb',
                        color: step.pill.color ?? '#374151',
                      }}
                    >
                      {step.pill.label}
                    </span>
                  )}
                </div>
              )}
              {step.description && (
                <p className="text-xs text-gray-600 max-w-xs mb-3">
                  {step.description}
                </p>
              )}
              <div className="flex gap-4 items-start">
                {step.frames.map((ref, fi) => (
                  <ArtboardFrameView
                    key={fi}
                    frame={ref}
                    modes={modes}
                    zoom={zoom}
                    onClick={() => onFrameClick(ref)}
                  />
                ))}
              </div>
            </div>
            {step.arrowAfter && i < section.steps.length - 1 && (
              <div className="self-center pt-10">
                {step.arrowAfter === 'vline' ? (
                  <div className="w-px h-32 bg-gray-300" />
                ) : (
                  <div className="text-3xl text-gray-300 leading-none">→</div>
                )}
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </section>
  </Fragment>
)

const ArtboardFrameView: React.FC<{
  frame: ArtboardFrameRef
  modes: ScreenMode[]
  zoom: number
  onClick: () => void
}> = ({ frame, modes, zoom, onClick }) => {
  const mode = findMode(modes, frame.modeId)
  const state = findState(mode, frame.stateId)
  if (!mode || !state) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 text-xs text-red-700 rounded">
        Missing modeId={frame.modeId} or stateId={frame.stateId}
      </div>
    )
  }
  const renderer = mode.renderArtboardFrame ?? mode.renderFrame
  const node = renderer(state, frame.platform)
  const wrapped = wrapForArtboard(node, frame.platform, frame.rawFrame)

  // E3: outer wrapper is <div role="button">, not <button>. Frame content may
  // include its own buttons (composer send, sidebar toggles); button-in-button
  // is invalid DOM nesting and React warns at mount.
  return (
    <div>
      {frame.label && (
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
          {frame.label}
        </p>
      )}
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick()
          }
        }}
        data-route-key={`${frame.modeId}/${frame.stateId}/${frame.platform}`}
        className="block cursor-pointer hover:ring-2 hover:ring-gray-900/50 rounded transition-all text-left"
        style={{ zoom }}
      >
        <div className="pointer-events-none">{wrapped}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// V3Artboard top-level
// ---------------------------------------------------------------------------

export const V3Artboard: React.FC<{ spec: V3ArtboardSpec }> = ({ spec }) => {
  const routes = useMemo(() => buildFlatRoutes(spec.modes, spec.sidebar), [spec])
  // Parse the deep-link hash ONCE, synchronously, so the initial state reflects it.
  // Doing this in a mount effect races the URL write-back effect (and StrictMode's
  // double-mount re-reads the already-clobbered hash), which silently dropped the
  // deep link. #m=<mode>&s=<state>&p=<platform>&v=<viewer|artboard>
  const initialHash = useMemo(() => {
    if (typeof window === 'undefined') return null
    const h = window.location.hash.replace(/^#/, '')
    if (!h) return null
    const q = new URLSearchParams(h)
    return { m: q.get('m'), s: q.get('s'), p: q.get('p') as Platform | null, v: q.get('v') }
  }, [])
  const [viewMode, setViewMode] = useState<'viewer' | 'artboard'>(
    initialHash?.v === 'viewer' || initialHash?.v === 'artboard'
      ? initialHash.v
      : spec.defaults?.viewMode ?? 'artboard',
  )
  const [platform, setPlatform] = useState<Platform>(
    initialHash?.p ?? spec.defaults?.platform ?? routes[0]?.platform ?? 'web',
  )
  const [currentIdx, setCurrentIdx] = useState(() => {
    if (initialHash?.m) {
      const hi = routes.findIndex(
        (r) =>
          r.modeId === initialHash.m &&
          (!initialHash.s || r.stateId === initialHash.s) &&
          (!initialHash.p || r.platform === initialHash.p),
      )
      if (hi >= 0) return hi
    }
    const pl = initialHash?.p ?? spec.defaults?.platform ?? routes[0]?.platform ?? 'web'
    const idx = routes.findIndex((r) => r.platform === pl)
    return idx >= 0 ? idx : 0
  })
  const [zoom, setZoom] = useState(spec.defaults?.zoom ?? 0.4)
  const [devMode, setDevMode] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const isMobile = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const current = routes[currentIdx]
  const activeMode = current ? findMode(spec.modes, current.modeId) : undefined
  const activeState = findState(activeMode, current?.stateId ?? '')

  const availablePlatforms = useMemo(() => {
    const set = new Set<Platform>()
    spec.modes.forEach((m) => m.platforms.forEach((p) => set.add(p)))
    const order: Platform[] = ['web', 'mobile', 'native']
    return order.filter((p) => set.has(p))
  }, [spec])

  // Keep platform in sync with the active route if the route only supports
  // one platform.
  useEffect(() => {
    if (current && current.platform !== platform) {
      setPlatform(current.platform)
    }
  }, [current?.key])  // eslint-disable-line react-hooks/exhaustive-deps

  const onPrev = useCallback(() => {
    setCurrentIdx((i) => Math.max(0, i - 1))
  }, [])

  const onNext = useCallback(() => {
    setCurrentIdx((i) => Math.min(routes.length - 1, i + 1))
  }, [routes.length])

  const pickByIds = useCallback(
    (modeId: string, stateId: string, p: Platform) => {
      const idx = routes.findIndex(
        (r) => r.modeId === modeId && r.stateId === stateId && r.platform === p,
      )
      if (idx >= 0) {
        setCurrentIdx(idx)
        setPlatform(p)
      }
    },
    [routes],
  )

  // Deep-link read now happens synchronously in the useState initializers above
  // (see `initialHash`) to avoid the mount-effect race with the write-back below.

  // Keep the URL in sync so the current view is a shareable deep link.
  useEffect(() => {
    if (!current) return
    const h = `m=${current.modeId}&s=${current.stateId}&p=${platform}&v=${viewMode}`
    window.history.replaceState(null, '', `#${h}`)
  }, [current?.key, platform, viewMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard nav (Arrow keys, Cmd+1/2)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey && e.key === '1') {
        e.preventDefault()
        setViewMode('viewer')
      } else if (e.metaKey && e.key === '2') {
        e.preventDefault()
        setViewMode('artboard')
      } else if (e.key === 'ArrowLeft') {
        onPrev()
      } else if (e.key === 'ArrowRight') {
        onNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onPrev, onNext])

  // ctrl-scroll zoom
  const mainRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom((z) =>
        Math.min(1, Math.max(0.1, z - e.deltaY * 0.001)),
      )
    }
    const el = mainRef.current
    if (el) el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      if (el) el.removeEventListener('wheel', onWheel)
    }
  }, [])

  const onFrameClick = useCallback(
    (frame: ArtboardFrameRef) => {
      pickByIds(frame.modeId, frame.stateId, frame.platform)
      setViewMode('viewer')
    },
    [pickByIds],
  )

  // Scroll the active frame into view + flash a highlight when toggling
  // viewer -> artboard (or when the route changes while already in artboard).
  const currentRouteKey = current
    ? `${current.modeId}/${current.stateId}/${current.platform}`
    : ''
  useEffect(() => {
    if (viewMode !== 'artboard' || !currentRouteKey) return
    const t = setTimeout(() => {
      const root = mainRef.current
      if (!root) return
      const el = root.querySelector<HTMLElement>(
        `[data-route-key="${CSS.escape(currentRouteKey)}"]`,
      )
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const cls = ['ring-4', 'ring-amber-400']
      el.classList.add(...cls)
      const r = setTimeout(() => el.classList.remove(...cls), 1500)
      ;(el as any).__rmHighlight = r
    }, 50)
    return () => clearTimeout(t)
  }, [viewMode, currentRouteKey])

  return (
    <div ref={mainRef} className="min-h-screen bg-[#f0f0f0] text-gray-900">
      {/* Mobile-only: hamburger to open the sidebar drawer. Hidden >= md. */}
      <button
        onClick={() => setSidebarOpen(true)}
        aria-label="Open menu"
        className="md:hidden fixed top-3 left-3 z-[55] w-10 h-10 flex items-center justify-center rounded-full bg-white border border-gray-200 shadow text-gray-700 active:scale-95"
      >
        <span className="text-lg leading-none">☰</span>
      </button>

      {/* Mobile-only: backdrop behind the open drawer. */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="md:hidden fixed inset-0 z-[58] bg-black/40"
        />
      )}

      <Sidebar
        spec={spec}
        viewMode={viewMode}
        onViewMode={setViewMode}
        platform={platform}
        onPlatform={(p) => {
          setPlatform(p)
          const idx = routes.findIndex(
            (r) =>
              r.modeId === current?.modeId &&
              r.stateId === current?.stateId &&
              r.platform === p,
          )
          if (idx >= 0) setCurrentIdx(idx)
        }}
        availablePlatforms={availablePlatforms}
        zoom={zoom}
        onZoom={setZoom}
        currentKey={current?.key ?? ''}
        onPick={(modeId, stateId, p) => {
          pickByIds(modeId, stateId, p)
          setSidebarOpen(false) // dismiss drawer after picking on mobile
        }}
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {viewMode === 'viewer' && activeMode && activeState && (
        <Viewer
          mode={activeMode}
          state={activeState}
          platform={platform}
          zoom={zoom}
          bleed={isMobile}
        />
      )}

      {viewMode === 'artboard' && (
        <Artboard
          modes={spec.modes}
          artboard={spec.artboard ?? []}
          zoom={zoom}
          onFrameClick={onFrameClick}
        />
      )}

      <FloatingViewerNav
        routes={routes}
        currentIdx={currentIdx}
        onPrev={onPrev}
        onNext={onNext}
        platform={platform}
        availablePlatforms={availablePlatforms}
        onPlatform={setPlatform}
        viewMode={viewMode}
        onViewMode={setViewMode}
        devMode={devMode}
        onDevMode={() => setDevMode((d) => !d)}
        onHelp={() => setHelpOpen(true)}
        labelOverride={
          activeMode && activeState
            ? activeMode.floatingNavLabel?.(activeState, platform)
            : undefined
        }
      />

      {devMode && (
        <div className="fixed bottom-3 right-3 z-[80] bg-amber-100 border border-amber-300 text-amber-900 rounded px-3 py-2 text-xs max-w-xs shadow">
          <p className="font-bold">Dev Mode (placeholder)</p>
          <p>
            Inspector overlay not yet wired. tokens.ts registry deferred. Click target
            -&gt; source file:line coming.
          </p>
        </div>
      )}

      {helpOpen && <HelpModal spec={spec} onClose={() => setHelpOpen(false)} />}
    </div>
  )
}
