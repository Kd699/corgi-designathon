/**
 * Overlay layering for Figma export (html.to.design).
 *
 * THE PROBLEM
 * CSS gives positioned elements their own paint layer: an `position:absolute`
 * box paints ABOVE every in-flow sibling regardless of DOM order, and `z-index`
 * reorders it further. Figma has none of that. `html.to.design` walks the DOM
 * and appends one Figma node per element, so a frame's layer order IS its DOM
 * order — `children[0]` at the back, last child on top. `z-index` is dropped.
 *
 * Net effect: any overlay (dropdown, sheet, popover, tooltip) that sits in the
 * MIDDLE of the DOM — e.g. anchored under a form field with fields and a submit
 * button after it — renders on top in the browser and UNDER those later
 * siblings in Figma. That is the "dropdowns render under the components" bug.
 *
 * THE FIX
 * Give every screen ONE overlay root that is its LAST child, and portal all
 * overlays into it. DOM order then equals paint order, so browser and Figma
 * agree without relying on `z-index` at all.
 *
 * `OverlayHost` is mounted inside the frame primitives (PhoneFrame /
 * NativeFrame / DesktopFrame), so labs get correct export layering for free.
 * A mode can nest its own `OverlayHost` if it needs a nearer clipping box.
 *
 * See ~/.claude/v3artboard-conventions.md C9.
 */

import React from 'react'
import { createPortal } from 'react-dom'

const OverlayRootCtx = React.createContext<HTMLElement | null>(null)

/**
 * The overlay root sits last in DOM order, which is all Figma needs. The
 * BROWSER still applies z-index, so the root also has to out-rank the in-frame
 * shells it now sits above (modal scrims at z-10/20/30). 50 clears those and
 * stays below the artboard's own chrome (sidebar z-60, help button z-70,
 * mode pill z-80), so overlays never cover the viewer UI.
 *
 * Contract: in-frame content must stay below z-50.
 */
const OVERLAY_ROOT_Z = 50

/**
 * Renders `children`, then the overlay root as the LAST DOM node.
 * The nearest positioned ancestor is the caller's container — mount this inside
 * a `relative` (or otherwise positioned) box that represents the screen.
 */
export const OverlayHost: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [root, setRoot] = React.useState<HTMLDivElement | null>(null)
  return (
    <OverlayRootCtx.Provider value={root}>
      {children}
      {/* LAST child: everything portaled here paints on top in Figma too. */}
      <div
        ref={setRoot}
        data-overlay-root
        className="absolute inset-0"
        style={{ pointerEvents: 'none', zIndex: OVERLAY_ROOT_Z }}
      />
    </OverlayRootCtx.Provider>
  )
}

/** True when an OverlayHost is available above this point in the tree. */
export const useHasOverlayHost = (): boolean => React.useContext(OverlayRootCtx) !== null

/**
 * Full-screen overlay (scrim + modal / bottom sheet). Children keep their own
 * `absolute inset-0 …` classes — they position against the overlay root, which
 * is itself `inset-0` on the screen, so geometry is unchanged.
 */
export const FrameOverlay: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const root = React.useContext(OverlayRootCtx)
  if (!root) return <>{children}</>
  return createPortal(
    <div style={{ pointerEvents: 'auto' }}>{children}</div>,
    root,
  )
}

/**
 * Anchored overlay (dropdown / popover). The child is a plain panel — no
 * `absolute`, no `z-index`; this positions it under `anchorRef` inside the
 * overlay root.
 *
 * Measurement is scale-invariant: the artboard renders frames under a CSS
 * `transform: scale()`, and dividing the anchor's client rect by the root's own
 * scale factor cancels it, so one measurement is correct at every zoom level.
 */
export const AnchoredOverlay: React.FC<{
  anchorRef: React.RefObject<HTMLElement | null>
  /** px gap between the anchor's bottom edge and the panel. */
  gap?: number
  /** match the anchor's width (select-style dropdowns). */
  matchWidth?: boolean
  /** which edge the panel lines up with when it is wider than its anchor. */
  align?: 'left' | 'right'
  children: React.ReactNode
}> = ({ anchorRef, gap = 4, matchWidth = true, align = 'left', children }) => {
  const root = React.useContext(OverlayRootCtx)
  const [box, setBox] = React.useState<{ top: number; left: number; right: number; width: number } | null>(null)

  React.useLayoutEffect(() => {
    const anchor = anchorRef.current
    if (!anchor || !root) return
    const measure = () => {
      const rootRect = root.getBoundingClientRect()
      const anchorRect = anchor.getBoundingClientRect()
      // Artboard zoom is a CSS transform: recover unscaled px.
      const scale = root.offsetWidth ? rootRect.width / root.offsetWidth : 1
      if (!scale) return
      setBox({
        top: (anchorRect.bottom - rootRect.top) / scale + gap,
        left: (anchorRect.left - rootRect.left) / scale,
        right: (rootRect.right - anchorRect.right) / scale,
        width: anchorRect.width / scale,
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(anchor)
    ro.observe(root)
    // capture-phase: catches scroll in any ancestor scroll container.
    window.addEventListener('scroll', measure, true)
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', measure, true)
    }
  }, [anchorRef, root, gap])

  if (!root) return <>{children}</>
  return createPortal(
    <div
      style={{
        position: 'absolute',
        top: box?.top ?? 0,
        ...(align === 'right' ? { right: box?.right ?? 0 } : { left: box?.left ?? 0 }),
        width: matchWidth ? box?.width : undefined,
        pointerEvents: 'auto',
        // Hide the pre-measurement frame rather than flashing it at 0,0.
        visibility: box ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>,
    root,
  )
}

/* ── Paint-order audit (dev / verify scripts) ────────────────────────────── */

export interface PaintOrderOffender {
  selector: string
  zIndex: string
  overlappedBy: string[]
}

/** Does this element itself put ink on the canvas? Pure layout wrappers don't —
 *  and their painting descendants are evaluated on their own pass. */
const paints = (el: HTMLElement, cs: CSSStyleDeclaration): boolean => {
  if (el.matches('img, svg, canvas, video, input, textarea, select')) return true
  if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') return true
  if (cs.backgroundImage !== 'none') return true
  if (cs.boxShadow !== 'none') return true
  if (parseFloat(cs.borderTopWidth) || parseFloat(cs.borderLeftWidth)) return true
  // Direct text content (ignores text living in child elements).
  return Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || '').trim())
}

const describe = (el: Element): string => {
  const cls = (el as HTMLElement).className
  const s = typeof cls === 'string' ? cls : (cls as unknown as SVGAnimatedString)?.baseVal ?? ''
  return `${el.tagName.toLowerCase()}${s ? `.${s.trim().split(/\s+/).slice(0, 4).join('.')}` : ''}`
}

/**
 * Finds overlays that INVERT on Figma export.
 *
 * The test is browser-order vs DOM-order, decided by hit-testing rather than by
 * reading z-index: for each positioned element A that overlaps some element B
 * appearing LATER in the DOM, ask the browser what it actually paints on top at
 * the overlap. If the browser says A but Figma (DOM order) would say B, that
 * pair inverts on export. Zero offenders == browser and Figma agree.
 *
 * Overlays routed through OverlayHost never appear here, because they are last
 * in the DOM — the two orders coincide by construction.
 */
export function auditFigmaPaintOrder(scope: ParentNode = document): PaintOrderOffender[] {
  const all = Array.from(scope.querySelectorAll<HTMLElement>('*'))
  const index = new Map<HTMLElement, number>(all.map((el, i) => [el, i]))
  const offenders: PaintOrderOffender[] = []

  all.forEach((el, i) => {
    const cs = getComputedStyle(el)
    if (cs.position !== 'absolute' && cs.position !== 'fixed') return
    if (cs.visibility === 'hidden' || cs.display === 'none') return
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return

    const hits: string[] = []
    for (let j = i + 1; j < all.length && hits.length < 5; j++) {
      const other = all[j]
      if (el.contains(other) || other.contains(el)) continue
      if (other.hasAttribute('data-overlay-root')) continue
      const ocs = getComputedStyle(other)
      if (ocs.visibility === 'hidden' || ocs.display === 'none') continue
      if (!paints(other, ocs)) continue
      const ro = other.getBoundingClientRect()
      if (!ro.width || !ro.height) continue
      if (ro.left >= r.right || ro.right <= r.left || ro.top >= r.bottom || ro.bottom <= r.top) continue

      // Probe the centre of the overlap; skip if it is off-screen (hit-testing
      // is viewport-only, so an off-screen pair simply can't be judged).
      const x = (Math.max(r.left, ro.left) + Math.min(r.right, ro.right)) / 2
      const y = (Math.max(r.top, ro.top) + Math.min(r.bottom, ro.bottom)) / 2
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue
      const top = document.elementFromPoint(x, y) as HTMLElement | null
      if (!top) continue

      // Browser paints A on top; DOM order would put B on top in Figma.
      const browserShowsA = top === el || el.contains(top)
      if (!browserShowsA) continue
      const topOfB = other.contains(top) || top === other
      if (topOfB) continue
      // Only count B if it is genuinely in front of A's *area* — i.e. B (or a
      // descendant) is what Figma would stack last over this point.
      const bIdx = index.get(other) ?? -1
      if (bIdx <= i) continue
      hits.push(describe(other))
    }
    if (hits.length) offenders.push({ selector: describe(el), zIndex: cs.zIndex, overlappedBy: hits })
  })
  return offenders
}

if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  ;(window as unknown as Record<string, unknown>).__auditFigmaPaintOrder = auditFigmaPaintOrder
}
