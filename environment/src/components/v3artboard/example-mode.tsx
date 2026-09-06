// V3Artboard runtime — example mode template.
//
// Copy this file as a starting point for new modes. Each mode lives in its
// own file under apps/main/src/pages/<lab-folder>/. Modes import ONLY from
// `../../../components/v3artboard` — never from sibling page folders.


import { createPlatformRenderer, PhoneFrame, DesktopFrame, IOSStatusBar } from './frames'
import type { ScreenMode } from './types'

export const EXAMPLE_MODE: ScreenMode = {
  id: 'example',
  label: 'Example',
  description: 'Minimum viable ScreenMode — copy as a starting template.',
  platforms: ['web', 'mobile'],
  states: [
    { id: 'idle', label: 'Idle', description: 'Default loaded state' },
    { id: 'active', label: 'Active', description: 'After interaction' },
  ],
  renderFrame: createPlatformRenderer({
    web: (state) => (
      <DesktopFrame>
        <div className="p-12">
          <h1 className="text-2xl font-bold">Example — {state.label}</h1>
          <p className="text-sm text-gray-600 mt-2">{state.description}</p>
        </div>
      </DesktopFrame>
    ),
    mobile: (state) => (
      <PhoneFrame>
        <div className="flex h-full flex-col">
          <div className="pt-7 pb-1 px-5">
            <IOSStatusBar />
          </div>
          <div className="flex-1 p-6">
            <h1 className="text-lg font-bold">Example — {state.label}</h1>
            <p className="text-xs text-gray-600 mt-1">{state.description}</p>
          </div>
        </div>
      </PhoneFrame>
    ),
  }),
  floatingNavLabel: (state) => `Example · ${state.label}`,
}
