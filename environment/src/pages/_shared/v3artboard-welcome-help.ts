/**
 * Shared welcomeHelp presets for V3Artboard labs.
 *
 * Per v3artboard-may-14 P8: every lab should expose the Dev Mode `</>` tip in
 * its WelcomeHelpModal so designers can discover the inspector. Import the
 * preset that matches your lab and pass it into `spec.brand.welcomeHelp`.
 *
 * Adding / changing a tip = ONE edit here, applied to every lab automatically.
 */

import type { BrandWelcomeHelpItem } from '../../components/v3artboard'

const ZOOM_TIP:    BrandWelcomeHelpItem = { kbd: 'Cmd / Ctrl + scroll', text: 'Zoom in & out' }
const FRAME_TIP:   BrandWelcomeHelpItem = { kbd: 'Click any frame',     text: 'Open the live viewer' }
const SIDEBAR_TIP: BrandWelcomeHelpItem = { kbd: 'Sidebar',             text: 'Jump between flows + states' }
const NAV_TIP:     BrandWelcomeHelpItem = { kbd: '← →',                 text: 'Step prev / next' }
const DEV_MODE_TIP: BrandWelcomeHelpItem = {
  kbd: '</>',
  text: 'Toggle Dev Mode -- click any element to see its source file:line; hover to reveal annotations. (Coming: swap icons / colors / copy inline.)',
}

/**
 * Standard 5-tip set: zoom + frame + sidebar + nav + Dev Mode.
 * Use this for every V3Artboard lab unless the lab has a special reason to omit a tip.
 */
export const STANDARD_WELCOME_HELP: BrandWelcomeHelpItem[] = [
  ZOOM_TIP,
  FRAME_TIP,
  SIDEBAR_TIP,
  NAV_TIP,
  DEV_MODE_TIP,
]
