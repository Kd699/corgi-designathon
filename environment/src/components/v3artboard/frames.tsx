// V3Artboard runtime — frame primitives
//
// Built 2026-05-25. PhoneFrame/NativeFrame self-wrap (358×780 rounded shell);
// DesktopFrame mimics a desktop browser surface (1440×800). createPlatformRenderer
// returns a unified StateRenderer that dispatches by platform.

import React, { useEffect, useState, type ReactNode } from 'react'
import type { Platform, ScreenState, StateRenderer } from './types'

// Pin a full-bleed mobile screen to the VISUAL viewport: position:fixed at
// visualViewport.offsetTop with height=visualViewport.height. The page itself
// can't scroll, so the iOS keyboard can't push the composer out of view — it
// stays fixed right above the keyboard. Falls back to a static full-height box.
function useVisualViewport(): { height: string; top: string } {
  const [v, setV] = useState<{ height: string; top: string }>({ height: '100dvh', top: '0px' })
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const on = () => setV({ height: `${Math.round(vv.height)}px`, top: `${Math.round(vv.offsetTop)}px` })
    on()
    vv.addEventListener('resize', on)
    vv.addEventListener('scroll', on)
    return () => {
      vv.removeEventListener('resize', on)
      vv.removeEventListener('scroll', on)
    }
  }, [])
  return v
}

// ----- Phone shell (mobile platform) ---------------------------------------

// When true (mobile viewer), PhoneFrame drops its device bezel and renders the
// screen edge-to-edge (full-bleed). Provided by the V3Artboard viewer.
export const FrameBleedContext = React.createContext(false)

export const PhoneFrame: React.FC<{ children: ReactNode }> = ({ children }) => {
  const bleed = React.useContext(FrameBleedContext)
  const vv = useVisualViewport()
  if (bleed) {
    return (
      <div
        className="bg-white overflow-hidden flex flex-col fixed left-0 right-0 z-20"
        style={{ top: vv.top, height: vv.height }}
      >
        {children}
      </div>
    )
  }
  return (
    <div
      className="bg-black rounded-[40px] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.35)] p-[6px]"
      style={{ width: 358, height: 780 }}
    >
      <div className="bg-white rounded-[34px] overflow-hidden relative flex flex-col w-full h-full">
        {children}
      </div>
    </div>
  )
}

// ----- Native shell (native iOS/Android via expo) --------------------------

export const NativeFrame: React.FC<{ children: ReactNode }> = ({ children }) => (
  <PhoneFrame>{children}</PhoneFrame>
)

// ----- Desktop shell (web platform) ----------------------------------------

export const DesktopFrame: React.FC<{ children: ReactNode }> = ({ children }) => (
  <div
    className="bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col shadow-[0_12px_36px_-12px_rgba(0,0,0,0.18)]"
    style={{ width: 1440, height: 800 }}
  >
    <div className="bg-gray-50 border-b border-gray-200 flex items-center gap-2 px-4 py-2.5">
      <span className="w-3 h-3 rounded-full bg-[#FF5F57]" />
      <span className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
      <span className="w-3 h-3 rounded-full bg-[#28C840]" />
      <div className="ml-4 flex-1 bg-white rounded-md border border-gray-200 px-3 py-1 text-xs text-gray-500">
        localhost
      </div>
    </div>
    <div className="flex-1 min-h-0 relative">{children}</div>
  </div>
)

// ----- iOS status bar (top of mobile) --------------------------------------

export const IOSStatusBar: React.FC = () => (
  <div className="flex items-center justify-between text-[12px] font-semibold text-gray-900 select-none">
    <span>9:41</span>
    <div className="flex items-center gap-1">
      <span>•••</span>
      <span>WiFi</span>
      <span>100%</span>
    </div>
  </div>
)

// ----- createPlatformRenderer ----------------------------------------------

type RendererMap = Partial<Record<Platform, (state: ScreenState) => ReactNode>>

export function createPlatformRenderer(map: RendererMap): StateRenderer {
  return (state, platform) => {
    const fn = map[platform] ?? map.web ?? map.mobile ?? map.native
    if (!fn) {
      return (
        <div className="p-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded">
          No renderer for platform "{platform}"
        </div>
      )
    }
    return fn(state)
  }
}
