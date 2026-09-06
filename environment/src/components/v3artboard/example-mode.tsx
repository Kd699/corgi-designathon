/**
 * Reference example mode -- minimum viable ScreenMode authored ONLY from
 * components/v3artboard/ primitives. New projects can copy this as a starting
 * scaffold; no dependency on any sibling page folder.
 */

import React from 'react'
import {
  PhoneFrame, NativeFrame, DesktopFrame, IOSStatusBar,
  createPlatformRenderer,
} from './frames'
import type { ScreenMode, StateConfig } from './types'

/* ── Tiny self-contained content (replace per project) ─────────────────── */

const HelloCard: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <div className="rounded-xl border border-grey-12 bg-white p-5 shadow-sm">
    <p className="text-sm font-bold text-brand-black">{title}</p>
    <p className="mt-2 text-xs text-grey-50 leading-relaxed">{body}</p>
  </div>
)

/* ── Per-platform renderers ────────────────────────────────────────────── */

const renderWeb = (state: StateConfig) => (
  <DesktopFrame>
    <div className="p-12">
      <h1 className="text-2xl font-bold text-brand-black mb-6">Example -- {state.label}</h1>
      <div className="grid grid-cols-2 gap-4 max-w-[640px]">
        <HelloCard title="Card A" body="Replace this with your project's content. The frame chrome stays; the body changes." />
        <HelloCard title="Card B" body="Use this mode as a reference -- two render fns (live + artboard), one floatingNavLabel." />
      </div>
    </div>
  </DesktopFrame>
)

const renderMobile = (state: StateConfig) => (
  <PhoneFrame>
    <div className="flex h-full flex-col bg-grey-03">
      <div className="bg-white px-5 pt-7 pb-3"><IOSStatusBar /></div>
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-3">
        <h2 className="text-base font-bold text-brand-black">Example -- {state.label}</h2>
        <HelloCard title="Card A" body="Replace this content per project." />
        <HelloCard title="Card B" body="The PhoneFrame + IOSStatusBar are reusable." />
      </div>
    </div>
  </PhoneFrame>
)

const renderNative = (state: StateConfig) => (
  <NativeFrame>
    <div className="flex h-full flex-col bg-grey-03">
      <div className="pt-12 px-4 pb-3"><IOSStatusBar /></div>
      <div className="flex-1 overflow-y-auto px-4 space-y-3">
        <h2 className="text-base font-bold text-brand-black">Example -- {state.label}</h2>
        <HelloCard title="Native frame" body="NativeFrame ships its own dynamic island. Don't double-wrap." />
      </div>
    </div>
  </NativeFrame>
)

/* ── ScreenMode export ─────────────────────────────────────────────────── */

const renderFrame = createPlatformRenderer({ web: renderWeb, mobile: renderMobile, native: renderNative })

export const EXAMPLE_MODE: ScreenMode = {
  id: 'example',
  label: 'Example',
  platforms: ['web', 'mobile', 'native'],
  states: [
    { id: 'idle',   label: 'Idle',     description: 'Default empty/loaded state' },
    { id: 'filled', label: 'Filled',   description: 'With content' },
  ],
  renderFrame,
  renderArtboardFrame: renderFrame,
  floatingNavLabel: (state) => `Example -- ${state.label}`,
}
