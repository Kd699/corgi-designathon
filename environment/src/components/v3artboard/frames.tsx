/**
 * Stand-alone frame primitives for V3Artboard. Self-contained -- a new project
 * can import these without bringing in the manager-notifications-v2 page tree.
 *
 * Mirrors the canonical primitives originally in pages/manager-notifications-v2/shell.tsx,
 * but lives in components/v3artboard/ so V3Artboard never reaches into a page folder.
 */

import React from 'react'
import type { ScreenPlatform, StateConfig, FrameCtx } from './types'
import { OverlayHost } from './overlay'

/* ── iOS status bar ────────────────────────────────────────────────────── */

export const IOSStatusBar: React.FC<{ dark?: boolean }> = ({ dark }) => (
  <div className={`flex items-center justify-between px-7 pb-1 pt-3 text-[11px] font-semibold ${dark ? 'text-white' : 'text-brand-black'}`}>
    <span>9:41</span>
    <div className="flex items-center gap-1.5">
      <div className="flex items-end gap-[1.5px]">
        {[4, 6, 8, 10].map((h, i) => (
          <div key={i} className={`w-[3px] rounded-[1px] ${dark ? 'bg-white' : 'bg-brand-black'}`} style={{ height: h, opacity: i === 3 ? 0.3 : 1 }} />
        ))}
      </div>
      <span className="text-[10px] tracking-tight">5G</span>
      <div className="flex items-center gap-[2px]">
        <div className={`relative rounded-[2px] border ${dark ? 'border-white/60' : 'border-brand-black/50'}`} style={{ width: 22, height: 11 }}>
          <div className={`absolute rounded-[1px] ${dark ? 'bg-white' : 'bg-brand-black'}`} style={{ inset: '1.5px' }} />
        </div>
        <div className={`h-[7px] w-[2px] rounded-r-sm ${dark ? 'bg-white/40' : 'bg-grey-20'}`} />
      </div>
    </div>
  </div>
)

/* ── PhoneFrame: bezeled mobile-web phone (358 × 780) ─────────────────── */

// `grow` (artboard full-height): drop the fixed 780 so the phone grows to its
// content — pair with a grow content shell (no h-full/overflow) + frame
// fitHeight so the runtime box doesn't re-cap it. Viewer keeps the 780 device.
// `height` (artboard crop): a shorter device box for rows that only need the
// part of the screen a change actually lands in — the frame still clips, the
// content shell just has less room, so pair it with a scroll-into-view.
export const PhoneFrame: React.FC<{ children: React.ReactNode; grow?: boolean; height?: number }> = ({ children, grow, height }) => (
  <div data-phone-frame className="relative isolate flex w-[358px] flex-col overflow-hidden rounded-[2.5rem] border border-grey-20 bg-white" style={{ height: height ?? (grow ? undefined : 780), minHeight: grow && !height ? 780 : undefined, boxShadow: '0 24px 60px rgba(0,0,0,0.22)' }}>
    <OverlayHost>{children}</OverlayHost>
  </div>
)

/* ── NativeFrame: iPhone-like hardware shell with Dynamic Island ──────── */

export const NativeFrame: React.FC<{ children: React.ReactNode; darkScreen?: boolean; grow?: boolean; noDynamicIsland?: boolean; softFrame?: boolean; height?: number }> = ({ children, darkScreen, grow, noDynamicIsland, softFrame, height }) => {
  if (softFrame) {
    return (
      <div data-phone-frame className="relative isolate flex w-[358px] flex-col overflow-hidden rounded-[2.5rem] border border-grey-20 bg-white" style={{ height: height ?? (grow ? undefined : 780), minHeight: grow && !height ? 780 : undefined, boxShadow: '0 24px 60px rgba(0,0,0,0.12)' }}>
        <OverlayHost>{children}</OverlayHost>
        {/* Dynamic Island LAST: it is hardware, so it sits above the screen and
         * above any overlay. DOM order carries that on Figma export (C9); a
         * z-index would be dropped on import. */}
        {!noDynamicIsland && (
          <div className="absolute top-3 left-1/2 z-[60] -translate-x-1/2">
            <div className="flex items-center justify-center rounded-full" style={{ width: 126, height: 36, background: '#e5e7eb' }}>
              <div className="w-3 h-3 rounded-full bg-grey-20" />
            </div>
          </div>
        )}
      </div>
    )
  }
  return (
  <div className="relative flex w-[358px] flex-col overflow-hidden rounded-[2.75rem]" style={{ height: height ?? (grow ? undefined : 780), minHeight: grow && !height ? 780 : undefined, background: '#111', boxShadow: '0 32px 80px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.08)' }}>
    {/* grow: screen flows (relative + 2px margin) so the shell grows; fixed: absolute inset device.
     * `grow` (flex-grow:1) is what makes the flowed screen still FILL a device body
     * that is taller than the content — the body carries minHeight 780 (or an
     * explicit `height`), and without flex-grow the screen stopped at its content
     * height and the black #111 body showed through below it. Anything anchored to
     * the bottom of the screen (a bottom sheet) then landed mid-device with square
     * corners sitting on black. flex-basis stays `auto`, so content taller than the
     * body still grows the shell exactly as before. */}
    <div className={`isolate rounded-[2.65rem] overflow-hidden ${grow ? 'relative m-[2px] grow' : 'absolute inset-[2px]'} ${darkScreen ? '' : 'bg-white'}`}>
      <OverlayHost>{children}</OverlayHost>
      {/* Dynamic Island LAST: hardware sits above the screen and above any
       * overlay, and DOM order is what survives the Figma export (C9). */}
      {!noDynamicIsland && (
        <div className="absolute top-3 left-1/2 z-[60] -translate-x-1/2">
          <div className="flex items-center justify-center rounded-full" style={{ width: 126, height: 36, background: '#000' }}>
            <div className="w-3 h-3 rounded-full" style={{ background: '#1a1a1a', boxShadow: 'inset 0 0 0 1px #333' }} />
          </div>
        </div>
      )}
    </div>
    {/* Hardware buttons AFTER the screen: they overlap its rounded edge, and
     * Figma export layers strictly by DOM order (C9) — z-10 alone would put
     * them behind the screen on import. */}
    <div className="absolute left-0 top-[118px] w-[2px] h-7  rounded-r-sm z-10" style={{ background: '#333' }} />
    <div className="absolute left-0 top-[160px] w-[2px] h-10 rounded-r-sm z-10" style={{ background: '#333' }} />
    <div className="absolute left-0 top-[208px] w-[2px] h-10 rounded-r-sm z-10" style={{ background: '#333' }} />
    <div className="absolute right-0 top-[148px] w-[2px] h-16 rounded-l-sm z-10" style={{ background: '#333' }} />
  </div>
  )
}

/* ── DesktopFrame: browser-chrome wrapper (1440 × 800) ────────────────── */

export const DesktopFrame: React.FC<{ children: React.ReactNode; url?: string; grow?: boolean; fullScreen?: boolean; height?: number }> = ({ children, url = 'app.example.com', grow, fullScreen, height }) => {
  // fullScreen: drop the fixed 1440×800 browser-chrome card entirely and let the
  // page fill the viewport edge-to-edge — the "real full screen" TRS-lab look for
  // the single-frame viewer. Artboard rows keep the bordered frame (fullScreen off).
  if (fullScreen) {
    // h-screen (definite height), NOT just min-h-screen: pages whose root is
    // `relative h-full` with `absolute inset-0` content (e.g. DesktopCelebrationPage)
    // need a definite parent height or they collapse to 0 and render invisibly.
    // Content taller than the viewport scrolls via its own inner overflow-y-auto.
    return <div className="relative isolate w-full h-screen overflow-x-hidden bg-grey-03"><OverlayHost>{children}</OverlayHost></div>
  }
  // When an explicit height is provided, use it as a definite height regardless of grow
  // (so h-full children resolve correctly — e.g. DesktopCelebrationPage uses relative h-full).
  // When grow=true with no explicit height, fall back to min-height so the frame expands
  // with its content (for non-h-full shells like LeaderboardWidget wrappers).
  const definiteHeight = height ?? (grow ? undefined : 800)
  const minH = grow && !height ? 800 : undefined
  return (
    <div className="relative overflow-hidden rounded-lg border border-grey-20 bg-grey-03" style={{ width: 1440, height: definiteHeight, minHeight: minH, boxShadow: '0 12px 40px rgba(0,0,0,0.15)' }}>
      <div className="flex items-center gap-2 border-b border-grey-12 bg-white px-4 py-2">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 mx-4 max-w-[480px] rounded-md border border-grey-12 bg-grey-03 px-3 py-1 text-center text-[11px] text-grey-50">{url}</div>
      </div>
      <div className="relative isolate overflow-hidden" style={{ height: definiteHeight ? 'calc(100% - 33px)' : undefined }}><OverlayHost>{children}</OverlayHost></div>
    </div>
  )
}

/* ── createPlatformRenderer: dispatch helper for ScreenMode.renderFrame ─ */

// Opts passed from the artboard runtime to a mode's platform renderer.
// `grow`: the frame should expand to its full content height (mobile/native
// device frames drop their fixed 780 so tall content isn't clipped).
export interface FrameRenderOpts { grow?: boolean }

export function createPlatformRenderer(renderers: {
  // 2nd arg is the optional FrameRenderOpts (e.g. { grow }); typed `any` so modes
  // that declare a differently-typed 2nd param (legacy) stay assignable.
  // 3rd arg is the optional FrameCtx (e.g. { revealed }) forwarded from the runtime.
  web?:    (state: StateConfig, opts?: any, ctx?: FrameCtx) => React.ReactNode
  mobile?: (state: StateConfig, opts?: any, ctx?: FrameCtx) => React.ReactNode
  native?: (state: StateConfig, opts?: any, ctx?: FrameCtx) => React.ReactNode
}): (state: StateConfig, platform: ScreenPlatform, opts?: unknown, ctx?: FrameCtx) => React.ReactNode {
  return (state, platform, opts, ctx) => {
    const fn = renderers[platform] ?? renderers.native ?? renderers.mobile ?? renderers.web
    return fn ? fn(state, opts as FrameRenderOpts | undefined, ctx) : null
  }
}

/* ── rawArtboardFrame: platform-aware artboard wrapper for ScreenMode.renderArtboardFrame ─
 * Web fills the 1440×800 artboard slot inside a bordered card. Mobile/native are
 * already self-sized device frames (PhoneFrame 358×780), so they render raw — a
 * fixed-width card would overflow the 358px slot. */
export const rawArtboardFrame =
  (render: (state: StateConfig, platform: ScreenPlatform, opts?: unknown) => React.ReactNode) =>
  (state: StateConfig, platform: ScreenPlatform): React.ReactNode =>
    platform === 'web' ? (
      <div className="rounded-lg border border-grey-20 overflow-hidden bg-white pointer-events-none" style={{ width: 1440, height: 800 }}>
        {render(state, platform)}
      </div>
    ) : (
      // mobile/native: grow the device frame to its full content length in the
      // artboard so tall screens aren't clipped at the 780 device height.
      render(state, platform, { grow: true })
    )
