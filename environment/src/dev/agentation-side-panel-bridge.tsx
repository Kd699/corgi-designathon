/**
 * Agentation Side Panel Bridge (SPB)
 *
 * The default annotation review surface. Click a row in the Annotations drawer
 * → initial-state screenshot + full CC chat stream + follow-up send (same
 * bridge /annotate + SSE as the popup).
 *
 * Opt OUT (renders AgentationDevtoolsV2_2 exactly as before):
 *   window.__AGENTATION_SIDE_PANEL_BRIDGE__ = false
 *   or URL ?spb=0
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AgentationDevtoolsV2_2, readPersistedRecords } from './agentation-devtools-v2_2'

type ChatMsg = { role: 'human' | 'agent'; content: string }
type SpbRecord = {
  id: string
  threadId?: string
  sessionUuid?: string
  label: string
  comment: string
  element?: string
  pageUrl: string
  createdAt: number
  status?: string
  activity?: string
  shotDataUrl?: string | null
  // Why the shot is missing, when it is. Rendered in the detail pane instead
  // of a generic placeholder -- a silent null is what hid the taint bug.
  shotError?: string
  // Non-fatal caveat about the shot (e.g. "2 images omitted").
  shotNote?: string
  // How the capture subject was resolved. 'page-fallback' means we could not
  // find the annotated element and are showing the whole page -- the UI must
  // say so rather than implying this is a shot of the component.
  shotHow?: string
  // Geometry/selector of the annotated element, kept so a historical row can
  // re-resolve its target and re-capture on demand.
  ann?: AnnElement
  // True while the record-time capture is in flight. Stops the focus-time
  // re-capture from racing and overwriting it.
  shotPending?: boolean
  // Set when the shot was taken at view time rather than at annotate time --
  // it shows current state, which may have drifted from what was annotated.
  shotRecaptured?: boolean
  chat: ChatMsg[]
  savedOnly?: boolean
}

const CC_STORE = '__cc_thread_store__'
const CC_META = '__cc_thread_meta__'
const BRIDGE =
  (typeof window !== 'undefined' && (window as any).__AGENTATION_BRIDGE__) ||
  'http://localhost:4747'

/**
 * SPB is the default review surface. This returns TRUE unless you opt out.
 *
 * Opt out with `?spb=0` (also accepts `false`/`off`) or by setting the global to
 * a literal false. The global is the programmatic override and wins, because
 * that is what thrash/inject drives; the query param is the human override.
 * `?spb=1` and `__AGENTATION_SIDE_PANEL_BRIDGE__ = true` remain valid and are
 * now no-ops.
 */
const SPB_OFF = /^(0|false|off)$/i

/**
 * SPB_NEXT — the kill switch for behaviour added on 2026-08-13, and the pattern
 * every subsequent change should follow.
 *
 * Why it exists: there is no file-level sandbox here. One copy of this component
 * on disk is served by every dev server on the machine, so anything landed here
 * is live everywhere the moment it is saved. A flag is the only isolation
 * available, and shipping seven changes without one is how "sandboxed" came to
 * mean less than it sounded.
 *
 * Default ON: these behaviours were reviewed and asked for, and silently
 * reverting a day's work would be its own surprise. Flipping the default is one
 * line. `?spbnext=0` (or `window.__SPB_NEXT__ = false`) restores the prior
 * behaviour of everything still restorable in place: plain-text chat, blocking
 * composer with no queue, no attachments, no agent shots, no model picker, the
 * old record handling, and the purple header.
 *
 * NOT covered: the classic two-pane layout, which was deleted on request. That
 * one is a git revert, not a flag.
 *
 * RULE FOR SUBSEQUENT CHANGES: new behaviour goes behind this gate (or its
 * successor) rather than landing unconditionally. Add the branch, then assert
 * BOTH sides in the suite -- an untested off-path is not a way back.
 */
function spbNextEnabled(): boolean {
  if (typeof window === 'undefined') return true
  const flag = (window as any).__SPB_NEXT__
  if (typeof flag === 'boolean') return flag
  try {
    const q = new URLSearchParams(window.location.search).get('spbnext')
    if (q !== null && SPB_OFF.test(q)) return false
  } catch {}
  return true
}

const SPB_NEXT = typeof window === 'undefined' ? true : spbNextEnabled()

function spbEnabled(): boolean {
  if (typeof window === 'undefined') return false
  const flag = (window as any).__AGENTATION_SIDE_PANEL_BRIDGE__
  if (typeof flag === 'boolean') return flag
  try {
    const q = new URLSearchParams(window.location.search).get('spb')
    if (q !== null && SPB_OFF.test(q)) return false
  } catch {
    // Unparseable search string is not a reason to drop the default surface.
  }
  return true
}

function ccKey(el: string) {
  return `${window.location.pathname}|${el || ''}`
}

function loadChatForElement(element: string): ChatMsg[] {
  try {
    const s = JSON.parse(localStorage.getItem(CC_STORE) || '{}')
    const k = ccKey(element)
    if (Array.isArray(s[k])) return s[k]
    const suffix = `|${element}`
    let best: ChatMsg[] = []
    for (const key of Object.keys(s)) {
      if (key === k || key.endsWith(suffix)) {
        if (Array.isArray(s[key]) && s[key].length >= best.length) best = s[key]
      }
    }
    return best
  } catch {
    return []
  }
}

function loadMeta(element: string): { threadId?: string; sessionUuid?: string } {
  try {
    const s = JSON.parse(localStorage.getItem(CC_META) || '{}')
    return s[ccKey(element)] || {}
  } catch {
    return {}
  }
}

function saveMeta(element: string, patch: { threadId?: string; sessionUuid?: string }) {
  try {
    const s = JSON.parse(localStorage.getItem(CC_META) || '{}')
    const k = ccKey(element)
    s[k] = { ...(s[k] || {}), ...patch, updatedAt: Date.now() }
    localStorage.setItem(CC_META, JSON.stringify(s))
  } catch {}
}

function persistChat(element: string, chat: ChatMsg[]) {
  try {
    const s = JSON.parse(localStorage.getItem(CC_STORE) || '{}')
    s[ccKey(element)] = chat
    localStorage.setItem(CC_STORE, JSON.stringify(s))
    window.dispatchEvent(new CustomEvent('cc-thread'))
  } catch {}
}

type ShotResult = { dataUrl: string | null; reason?: string; note?: string }

/**
 * Concatenated cssText of every same-origin stylesheet, XML-escaped for
 * embedding inside the foreignObject. Without this the clone renders with
 * zero Tailwind/CSS-module rules applied -- i.e. unstyled text, which reads
 * as "empty" to a reviewer. Cross-origin sheets throw on .cssRules; skip them.
 *
 * Memoised: on this app document.styleSheets is ~27 sheets / ~458k chars, so
 * rebuilding per capture costs ~190ms on a full-page target.
 */
let _cssTextCache: string | null = null
let _cssTextCacheKey = ''
/**
 * Cache key = sheet count + total rule count. A permanent memo goes stale under
 * Vite CSS HMR (which mutates style.textContent in place), so a shot taken after
 * an edit would embed pre-edit CSS and show the OLD design as "initial state".
 */
function styleSheetsKey(): string {
  let sheets = 0
  let rules = 0
  for (const sheet of Array.from(document.styleSheets)) {
    sheets++
    try {
      rules += (sheet as CSSStyleSheet).cssRules?.length || 0
    } catch {}
  }
  return `${sheets}:${rules}:${_cssEpoch}`
}

/**
 * Sheet+rule COUNT alone does not change when Vite HMR edits a declaration:
 * its client does `style.textContent = content` on the SAME <style> node, so
 * editing a colour keeps the rule count identical and the memo goes stale --
 * a shot taken after the edit then shows the OLD design as "initial state".
 * Bump an epoch whenever any style/link node is added, removed or rewritten.
 */
let _cssEpoch = 0
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  try {
    new MutationObserver((records) => {
      for (const rec of records) {
        const t = rec.target as Element
        const nodes = [
          ...Array.from(rec.addedNodes),
          ...Array.from(rec.removedNodes),
          t,
        ] as Element[]
        if (nodes.some((n) => n && /^(STYLE|LINK)$/.test((n as Element).nodeName || ''))) {
          _cssEpoch++
          return
        }
      }
    }).observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  } catch {}
}
function inlinedStyleSheetText(): string {
  const key = styleSheetsKey()
  if (_cssTextCache !== null && _cssTextCacheKey === key) return _cssTextCache
  const parts: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = (sheet as CSSStyleSheet).cssRules
      if (!rules) continue
      for (const rule of Array.from(rules)) parts.push(rule.cssText)
    } catch {
      // cross-origin sheet -- unreadable by design, skip it
    }
  }
  _cssTextCache = parts.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  _cssTextCacheKey = key
  return _cssTextCache
}

/**
 * Prepare the detached clone for layout inside the foreignObject wrapper.
 *
 * Two things the naive clone gets wrong, both of which render as a PURE WHITE
 * shot with no error:
 *
 * 1. The clone inherits the original's own position/top/left. A
 *    `position:fixed; top:600px` element laid out inside an 80px-tall wrapper
 *    with overflow:hidden is clipped away entirely. This codebase uses
 *    `absolute` heavily (it is the mandated idiom for artboard-composed
 *    overlays), so this is the common case, not an edge case.
 * 2. cloneNode does not copy scrollTop/scrollLeft, and setting it on a detached
 *    node is a no-op. A scrolled container therefore renders from the top --
 *    showing content the annotator was demonstrably not looking at.
 */
function normaliseClone(src: HTMLElement, clone: HTMLElement): { imagesOmitted: number } {
  clone.style.setProperty('position', 'static', 'important')
  for (const p of ['top', 'left', 'right', 'bottom']) {
    clone.style.setProperty(p, 'auto', 'important')
  }
  clone.style.setProperty('margin', '0', 'important')
  clone.style.setProperty('float', 'none', 'important')
  // NOTE: transform is deliberately NOT reset. Forcing `transform:none` renders
  // a rotated/scaled component as an unrotated rectangle stretched to its
  // bounding box -- a component that does not exist in the UI. Neutralising
  // position is what stops the off-canvas layout; transform is presentation.

  const srcNodes = [src, ...Array.from(src.querySelectorAll('*'))] as HTMLElement[]
  const clNodes = [clone, ...Array.from(clone.querySelectorAll('*'))] as HTMLElement[]
  const n = Math.min(srcNodes.length, clNodes.length)

  for (let i = 0; i < n; i++) {
    const s = srcNodes[i]
    const c = clNodes[i]
    // Re-apply lost scroll offset by shifting the children, since the clone is
    // never laid out live and cannot be scrolled.
    const st = s.scrollTop || 0
    const sl = s.scrollLeft || 0
    if (st || sl) {
      const srcKids = Array.from(s.children) as HTMLElement[]
      const clKids = Array.from(c.children) as HTMLElement[]
      for (let k = 0; k < clKids.length; k++) {
        // COMPOSE with whatever transform the child already has -- replacing it
        // silently drops translated rows, carousels and transform-based sticky
        // offsets from the "initial state" the reviewer is shown. Read the
        // transform from the LIVE node: a detached clone has no computed style.
        const live = srcKids[k]
        const existing = live ? getComputedStyle(live).transform : 'none'
        const base = existing && existing !== 'none' ? `${existing} ` : ''
        clKids[k].style.setProperty('transform', `${base}translate(${-sl}px, ${-st}px)`, 'important')
      }
    }
  }

  // Images never rasterise inside an SVG-as-image (secure static mode blocks
  // subresource loading -- verified for same-origin, http and data: URIs alike).
  // Substitute a visible placeholder so the omission reads as "image omitted"
  // rather than as blank app UI.
  let imagesOmitted = 0
  const srcImgs = Array.from(src.querySelectorAll('img')) as HTMLImageElement[]
  const clImgs = Array.from(clone.querySelectorAll('img')) as HTMLImageElement[]
  for (let i = 0; i < clImgs.length; i++) {
    // Size from the LIVE node's rendered box. Reading width/height off the
    // detached clone yields the image's INTRINSIC size, which is wrong in both
    // directions: an 8x8 icon shown at 240x120 becomes an 8px speck, and a
    // 600x400 asset shown at 120x80 overflows and covers the whole card.
    const liveRect = srcImgs[i]?.getBoundingClientRect()
    const w = Math.round(liveRect?.width || 0)
    const h = Math.round(liveRect?.height || 0)
    const ph = document.createElement('div')
    ph.style.cssText = `width:${w || 24}px;height:${h || 24}px;background:repeating-linear-gradient(45deg,#e2e8f0,#e2e8f0 6px,#cbd5e1 6px,#cbd5e1 12px);border-radius:2px;display:inline-block;vertical-align:top;`
    clImgs[i].replaceWith(ph)
    imagesOmitted++
  }
  return { imagesOmitted }
}

/**
 * Zero-dep element snapshot (SVG foreignObject -> canvas).
 *
 * Three things here are load-bearing and must not be "simplified" back:
 *
 * 1. The SVG is handed to the Image as a `data:` URL, NOT a Blob object URL.
 *    Chromium treats a blob:-sourced SVG containing a <foreignObject> as not
 *    origin-clean, so drawImage taints the canvas and toDataURL throws
 *    SecurityError on 100% of calls. Verified by isolation matrix:
 *    blob:+foreignObject = taint, data:+foreignObject = clean,
 *    blob: without foreignObject = clean. img.crossOrigin is a no-op on blob:.
 * 2. Stylesheets are inlined (see above), or the render is unstyled text.
 * 3. Downscaling uses viewBox, NOT transform:scale on the foreignObject. The
 *    old code authored the SVG at the *scaled* size while the foreignObject
 *    laid out at full width and was then scaled again, clipping content to a
 *    scale-fraction of the frame (measured: 33% width coverage on a 1440x900
 *    target vs 99.8% with viewBox).
 *
 * Returns a reason on every failure path -- silent nulls are what let this
 * bug survive.
 */
async function captureElementShot(el: Element | null): Promise<ShotResult> {
  if (!el || !(el instanceof HTMLElement)) return { dataUrl: null, reason: 'no-element' }
  try {
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return { dataUrl: null, reason: 'too-small' }
    const boxW = Math.ceil(rect.width)
    const boxH = Math.ceil(rect.height)
    const scale = Math.min(1, 480 / Math.max(boxW, boxH))
    const w = Math.max(1, Math.round(boxW * scale))
    const h = Math.max(1, Math.round(boxH * scale))

    const clone = el.cloneNode(true) as HTMLElement
    const cs = getComputedStyle(el)
    // Inline computed background so the shot isn't transparent white-on-white.
    // MUST be `background-color`, never the `background` SHORTHAND: the
    // shorthand resets background-image to none, and being inline it beats the
    // inlined stylesheet -- which silently destroys every gradient and
    // background-image (measured: a red->blue gradient rendered 99% white).
    // Only set it at all when there is no background-image to preserve.
    const hasBgImage = cs.backgroundImage && cs.backgroundImage !== 'none'
    clone.setAttribute(
      'style',
      `${clone.getAttribute('style') || ''};width:${boxW}px;height:${boxH}px;${
        hasBgImage ? '' : `background-color:${cs.backgroundColor || '#fff'};`
      }box-sizing:border-box;`,
    )
    const { imagesOmitted } = normaliseClone(el, clone)
    const wrap = document.createElement('div')
    wrap.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
    // system-ui fallback matters: @font-face webfonts cannot load inside an
    // SVG-as-image, so without this the SVG default (serif) shows through and
    // the shot reads as the wrong app.
    wrap.style.cssText = `width:${boxW}px;height:${boxH}px;overflow:hidden;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;`
    wrap.appendChild(clone)

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${boxW} ${boxH}">
  <foreignObject width="${boxW}" height="${boxH}">
    <style xmlns="http://www.w3.org/1999/xhtml">${inlinedStyleSheetText()}</style>
    ${new XMLSerializer().serializeToString(wrap)}
  </foreignObject>
</svg>`
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    const img = new Image()
    return await new Promise<ShotResult>((resolve) => {
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) return resolve({ dataUrl: null, reason: 'no-ctx' })
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, w, h)
          ctx.drawImage(img, 0, 0)
          // A pure-white result means the clone laid out off-canvas or the
          // element genuinely has no visible content. Either way the reviewer
          // must not be shown a blank rectangle captioned "initial state".
          let distinct = 0
          try {
            const { data } = ctx.getImageData(0, 0, w, h)
            const seen = new Set<number>()
            for (let i = 0; i < data.length && seen.size < 4; i += 4) {
              seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
            }
            distinct = seen.size
          } catch {}
          // A single-colour render is only "blank" if that colour is the white
          // we pre-filled. A solid swatch, a divider or a 1px rule is
          // legitimately uniform, and rejecting it would lose a shot that v1
          // would have shown.
          if (distinct <= 1) {
            let isWhite = true
            try {
              const px = ctx.getImageData(0, 0, 1, 1).data
              isWhite = px[0] > 246 && px[1] > 246 && px[2] > 246
            } catch {}
            if (isWhite) {
              return resolve({
                dataUrl: null,
                reason: 'blank-render (element produced no visible pixels)',
              })
            }
          }
          resolve({
            dataUrl: canvas.toDataURL('image/png'),
            note: imagesOmitted ? `${imagesOmitted} image${imagesOmitted === 1 ? '' : 's'} omitted` : undefined,
          })
        } catch (err: any) {
          resolve({ dataUrl: null, reason: `taint:${err?.name || 'Error'}: ${err?.message || err}` })
        }
      }
      img.onerror = () => resolve({ dataUrl: null, reason: 'img-error (SVG failed to parse or load)' })
      img.src = url
    })
  } catch (err: any) {
    return { dataUrl: null, reason: `exception:${err?.message || err}` }
  }
}

type AnnElement = {
  selector?: string
  boundingBox?: { x: number; y: number; width: number; height: number }
  isFixed?: boolean
  // Agentation DOES send these on the live /annotate POST (the head guard
  // enriches the body). It does NOT send boundingBox -- see resolveAnnotatedElement.
  outerHTML?: string
  elementText?: string
}

/**
 * Agentation's own DOM must never be mistaken for app content. The annotation
 * PINS are the dangerous ones: a leftover 22px pin sits at z-index 99998 on top
 * of the app, so it wins hit-tests and appears in markerEls. Same regex the head
 * guard uses (apps/main/public/agentation-send-guard.js).
 */
const AGENTATION_CHROME =
  /popup___|toolbar___|marker___|markers?Layer___|fixedMarkersLayer___|markerTooltip___|markerNote___|markerQuote___|hoverHighlight|hoverTooltip|controlsContent___|agentation/i
function isAgentationChrome(el: Element | null): boolean {
  try {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const cn: any = (n as HTMLElement).className
      const c = typeof cn === 'string' ? cn : cn?.baseVal || ''
      if (AGENTATION_CHROME.test(c) || (n.id && /agentation/i.test(n.id))) return true
      // SPB's own drawer is styled inline, so it has no class name for the
      // regex to match. Without this, clicking a row in the drawer records the
      // row BUTTON as the last-clicked element and the next capture shoots the
      // button instead of the annotated component.
      if (n.hasAttribute?.('data-agentation-spb-drawer')) return true
      if (n.hasAttribute?.('data-annotation-marker')) return true
    }
  } catch {}
  return false
}

/**
 * The element the user last clicked in the page, excluding agentation's own UI.
 *
 * This exists because the live /annotate POST does NOT carry a boundingBox --
 * agentation@3.0.2 sends {comment, element, elementPath, elementText,
 * siblingIndex, siblingCount, domChain, outerHTML} and nothing else. bbox is
 * only ever present on records seeded from localStorage. Without this tracker
 * every LIVE annotation silently fell back to capturing the whole page.
 */
let _lastClickedEl: Element | null = null
if (typeof document !== 'undefined') {
  document.addEventListener(
    'click',
    (ev) => {
      const t = ev.target as Element | null
      if (!t || !(t as any).tagName || isAgentationChrome(t)) return
      _lastClickedEl = t
    },
    true,
  )
}

/* isMeaningful() lived here upstream — a helper for picking a capture subject that
 * nothing in this file calls. Dropped rather than carried, because this repo's
 * tsconfig has noUnusedLocals on. Everything else in this file is verbatim. */

/**
 * Resolve the element the user actually annotated.
 *
 * Why this is not just querySelector: agentation POSTs /annotate BEFORE the
 * marker div renders, so markerEls is empty for the current annotation at
 * drain time. And `selector` is built as `elementPath || cssClasses || element`
 * -- so it is often a human label ('button "Continue"', which THROWS) or a
 * space-joined class list, neither of which is a valid CSS selector.
 *
 * The reliable signal is the boundingBox agentation already records: hit-test
 * its centre and pick the node in the stack whose own rect matches. Falls back
 * through selector to the whole artboard, which is a mediocre shot but not no
 * shot.
 */
function resolveAnnotatedElement(
  markers: HTMLElement[] | undefined,
  ann: AnnElement | undefined,
  opts?: { ignoreLastClick?: boolean },
): { el: Element | null; how: string } {
  // 1. The element the user actually clicked. Only path that works for LIVE
  //    annotations, because the POST body has no bbox.
  //
  //    It must be VALIDATED, not trusted: the last click is not necessarily the
  //    annotated element (agentation tolerates a stray click while a comment is
  //    pending), and a clicked element can since have been hidden. An unvalidated
  //    tracker confidently screenshots the wrong component.
  if (!opts?.ignoreLastClick && _lastClickedEl && document.contains(_lastClickedEl)) {
    const r = _lastClickedEl.getBoundingClientRect()
    const visible = r.width >= 2 && r.height >= 2
    // Cross-check against what the record itself says the target was. These
    // fields DO arrive on the live POST (the head guard adds them).
    //
    //    Every AVAILABLE signal must agree. Defaulting an absent signal to
    //    "agrees" and OR-ing them makes the whole check vacuous the moment one
    //    field is missing -- which is the normal case.
    const wantText = (ann?.elementText || '').replace(/\s+/g, ' ').trim()
    const gotText = (_lastClickedEl.textContent || '').replace(/\s+/g, ' ').trim()
    const signals: boolean[] = []
    if (wantText && gotText) {
      signals.push(
        gotText.includes(wantText.slice(0, 40)) || wantText.includes(gotText.slice(0, 40)),
      )
    }
    if (ann?.outerHTML) {
      signals.push(_lastClickedEl.outerHTML.slice(0, 60) === ann.outerHTML.slice(0, 60))
    }
    if (ann?.boundingBox?.width) {
      signals.push(
        Math.abs(r.width - ann.boundingBox.width) <= 2 &&
          Math.abs(r.height - ann.boundingBox.height) <= 2,
      )
    }
    if (visible && !signals.includes(false)) {
      return { el: _lastClickedEl, how: 'clicked' }
    }
  }

  // 2. Marker pins are NOT the annotated element -- they are agentation's
  //    numbered glyphs, and pendingMarkers is off by one, so markers[0] is the
  //    PREVIOUS annotation's pin. Only accept a marker that is not chrome.
  const marker = markers?.[0]
  if (marker && document.contains(marker) && !isAgentationChrome(marker)) {
    return { el: marker, how: 'marker' }
  }

  // 3. bbox hit-test. Present on records seeded from localStorage.
  const bb = ann?.boundingBox
  if (bb && bb.width > 1 && bb.height > 1) {
    const cx = bb.x + bb.width / 2
    const cy = (ann?.isFixed ? bb.y : bb.y - window.scrollY) + bb.height / 2
    if (cx >= 0 && cy >= 0 && cx <= window.innerWidth && cy <= window.innerHeight) {
      try {
        const matches = document
          .elementsFromPoint(cx, cy)
          .filter((cand) => {
            const r = cand.getBoundingClientRect()
            return Math.abs(r.width - bb.width) <= 2 && Math.abs(r.height - bb.height) <= 2
          })
        // A full-bleed `absolute inset-0` overlay has the SAME rect as the card
        // it covers and paints on top, so it wins a first-match. Taking the
        // first candidate that merely LOOKS meaningful is not enough either: a
        // scrim (`bg-black/25`) or a gradient overlay has a background, and a
        // stretched anchor has sr-only text, so all three still beat the card.
        // Score instead of first-match, and let the record's own elementText
        // break the tie when we have it.
        const wantText = (ann?.elementText || '').replace(/\s+/g, ' ').trim()
        const score = (el: Element): number => {
          if (isAgentationChrome(el)) return -1
          const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
          let n = 0
          if (wantText && text && (text.includes(wantText.slice(0, 40)) || wantText.includes(text.slice(0, 40)))) n += 100
          // visible text is the strongest signal a human annotated this node
          if (text.length > 2) n += 10 + Math.min(10, Math.floor(text.length / 20))
          if (el.querySelector('img,svg,canvas,video,input,button')) n += 5
          if (el.childElementCount > 0) n += 1
          return n
        }
        const ranked = matches
          .map((el) => ({ el, n: score(el) }))
          .filter((c) => c.n >= 0)
          .sort((a, b) => b.n - a.n)
        const best = ranked[0]
        if (best && best.n > 0) {
          // Two candidates tied on substance = we genuinely cannot tell.
          const tied = ranked.filter((c) => c.n === best.n).length > 1
          return { el: best.el, how: tied ? 'bbox-ambiguous' : 'bbox' }
        }
        if (matches[0]) return { el: matches[0], how: 'bbox-ambiguous' }
      } catch {}
    }
  }

  // 4. outerHTML is one of the few fields the live POST actually carries.
  if (ann?.outerHTML) {
    const head = ann.outerHTML.slice(0, 120)
    try {
      const tag = /^<([a-z0-9-]+)/i.exec(head)?.[1]
      if (tag) {
        for (const cand of Array.from(document.getElementsByTagName(tag))) {
          if (!isAgentationChrome(cand) && cand.outerHTML.slice(0, 120) === head) {
            return { el: cand, how: 'outerHTML' }
          }
        }
      }
    } catch {}
  }

  // 5. selector -- frequently a human label or class list, so it throws.
  if (ann?.selector) {
    try {
      const hit = document.querySelector(ann.selector)
      if (hit && !isAgentationChrome(hit)) return { el: hit, how: 'selector' }
    } catch {}
  }

  // 6. Whole page. Honest about it, so the UI can say so rather than passing a
  //    page thumbnail off as a shot of the annotated component.
  return {
    el: document.querySelector('[data-v3artboard-root]') || document.querySelector('main'),
    how: 'page-fallback',
  }
}

/**
 * Where an annotation was made, as artboard coordinates.
 *
 * The record's pageUrl already carries them -- agentation sends the full URL
 * including the v3artboard hash (`#m=<mode>&s=<state>&p=<platform>&v=<view>`),
 * so no new capture is needed to navigate back to the exact screen.
 */
type ScreenCoords = { mode?: string; state?: string; platform?: string; view?: string }

const COORD_KEYS: Record<string, keyof ScreenCoords> = {
  m: 'mode',
  s: 'state',
  p: 'platform',
  v: 'view',
}

function parseScreen(pageUrl: string): ScreenCoords | null {
  try {
    const hash = new URL(pageUrl, window.location.href).hash.replace(/^#/, '')
    if (!hash) return null
    const out: ScreenCoords = {}
    let any = false
    for (const pair of hash.split('&')) {
      const [k, v] = pair.split('=')
      const key = COORD_KEYS[k]
      if (key && v) {
        out[key] = decodeURIComponent(v)
        any = true
      }
    }
    return any ? out : null
  } catch {
    return null
  }
}

/** Same document? Then we can navigate by hash and keep the panel mounted. */
function isSameDocument(pageUrl: string): boolean {
  try {
    const u = new URL(pageUrl, window.location.href)
    return u.pathname === window.location.pathname
  } catch {
    return false
  }
}

function isAlreadyThere(pageUrl: string): boolean {
  try {
    return new URL(pageUrl, window.location.href).hash === window.location.hash
  } catch {
    return false
  }
}

/**
 * Navigate the artboard to where the annotation was made.
 *
 * V3Artboard listens for `hashchange` and syncs, so setting the hash moves the
 * artboard in place -- the drawer stays open and the records survive. A full
 * navigation is only needed when the annotation was made on a different route.
 */
function goToScreen(pageUrl: string) {
  try {
    const u = new URL(pageUrl, window.location.href)
    if (isSameDocument(pageUrl)) window.location.hash = u.hash
    else window.location.href = u.href
  } catch {}
}

function timeAgo(ms: number): string {
  const diff = Math.max(0, Date.now() - ms) / 1000
  if (diff < 60) return `${Math.round(diff)}s ago`
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return `${Math.round(diff / 86400)}d ago`
}

/* The classic two-pane body and the `?spbui=` layout toggle were retired
 * 2026-08-13. The assistant layout is now the only one, so there is no mode to
 * read, persist, or flip -- and the test contract (`data-spb-active-id`,
 * `data-spb-shot-how`, `data-spb-shot-error`, the shot's alt text, rows that
 * select on click) belongs to that single body rather than being a treaty
 * between two. Prior shape: git history for SpbUiMode.
 */

/* ── Model ────────────────────────────────────────────────────────────────
 * The picked model is sent as `ccModel` on the /annotate POST. server.v4
 * reads `body.ccModel` first, falls back to a `cc: <model>` comment prefix,
 * then to AGENTATION_DEFAULT_MODEL -- and passes it straight through as
 * `--model` on the spawned child. So this control does not decorate a
 * preference, it selects the process that actually runs.
 *
 * Ids are the CLI's own, not display names: sending a label like "Opus 5"
 * spawns a child that dies on an unknown --model. The label is presentation
 * only and never leaves the UI.
 */
export type SpbModel = 'claude-sonnet-5' | 'claude-opus-5'
const SPB_MODELS: { id: SpbModel; label: string }[] = [
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-opus-5', label: 'Opus 5' },
]
const SPB_MODEL_KEY = '__spb_model__'

function isSpbModel(v: unknown): v is SpbModel {
  return SPB_MODELS.some((m) => m.id === v)
}

function readModel(): SpbModel {
  if (typeof window === 'undefined') return 'claude-sonnet-5'
  try {
    const q = new URLSearchParams(window.location.search).get('spbmodel')
    if (isSpbModel(q)) return q
    const stored = localStorage.getItem(SPB_MODEL_KEY)
    if (isSpbModel(stored)) return stored
  } catch {}
  return 'claude-sonnet-5'
}

function writeModel(m: SpbModel) {
  try {
    localStorage.setItem(SPB_MODEL_KEY, m)
  } catch {}
}

/**
 * The picker is ON by default -- promoted 2026-08-13, after the composer
 * placement was reviewed. `?spbmodel=0` is the escape hatch, same shape as
 * `?spb=0` for the panel itself.
 *
 * It shipped opt-in first on purpose: there is no file-level sandbox here (every
 * dev server on this machine is rooted at the same tree, so `:5175` and `:5173`
 * serve this same component), so the flag was the only isolation available while
 * it was being built. That job is done.
 *
 * Opting out is not cosmetic: no control renders AND no `ccModel` goes on the
 * POST, so the bridge falls back to AGENTATION_DEFAULT_MODEL exactly as it did
 * before the picker existed.
 */
function modelPickerEnabled(): boolean {
  if (typeof window === 'undefined') return false
  if (!SPB_NEXT) return false
  const flag = (window as any).__SPB_MODEL_PICKER__
  if (flag === true) return true
  if (flag === false) return false
  try {
    const q = new URLSearchParams(window.location.search).get('spbmodel')
    if (q === '0' || q === 'off' || q === 'false') return false
  } catch {}
  return true
}

type BodyProps = {
  records: SpbRecord[]
  active: SpbRecord | null
  activeId: string | null
  setActiveId: (id: string) => void
  draft: string
  setDraft: (v: string) => void
  onFollowUp: (rec: SpbRecord, msg: string) => Promise<void>
  sending: boolean
  queued: string[]
  turnShots: string[]
  agentShots: { dataUrl: string; caption: string }[]
  model: SpbModel
  pickModel: (m: SpbModel) => void
  modelPickerOn: boolean
}

/* ── Markdown ─────────────────────────────────────────────────────────────
 * Agents reply in markdown. Rendered as plain text it arrives as literal `##`,
 * `**bold**`, backticks and ` ``` ` fences -- which is what "the text formatting
 * is very hard to read" actually was.
 *
 * Hand-rolled rather than react-markdown ON PURPOSE: that package lives in
 * apps/main's node_modules, not packages/ui's, and pnpm's strict isolation means
 * this file cannot resolve it. Declaring it here would need an install against a
 * registry that is currently 401. This covers the subset agents actually emit;
 * anything unrecognised falls through as plain text rather than disappearing.
 *
 * Builds React ELEMENTS, never an HTML string. Agent output is untrusted enough
 * that dangerouslySetInnerHTML would be the wrong tool for cosmetics.
 */
const MD_INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_|\[[^\]]+\]\([^)]+\))/g

const CODE_STYLE: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.88em',
  background: '#f1f5f9',
  padding: '1px 5px',
  borderRadius: 4,
}

function renderInline(text: string, kb: string): React.ReactNode[] {
  return text.split(MD_INLINE).map((p, i) => {
    if (!p) return null
    const k = `${kb}-${i}`
    if (p.length > 2 && p.startsWith('`') && p.endsWith('`')) {
      return <code key={k} style={CODE_STYLE}>{p.slice(1, -1)}</code>
    }
    if (p.length > 4 && p.startsWith('**') && p.endsWith('**')) {
      return <strong key={k} style={{ fontWeight: 600 }}>{p.slice(2, -2)}</strong>
    }
    if (p.length > 2 && ((p.startsWith('*') && p.endsWith('*')) || (p.startsWith('_') && p.endsWith('_')))) {
      return <em key={k}>{p.slice(1, -1)}</em>
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p)
    if (link) {
      return (
        <a key={k} href={link[2]} target="_blank" rel="noreferrer" style={{ color: '#4f46e5' }}>
          {link[1]}
        </a>
      )
    }
    return <span key={k}>{p}</span>
  })
}

const MarkdownText: React.FC<{ text: string }> = ({ text }) => {
  const lines = String(text || '').split('\n')
  const blocks: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // fenced code — consumed first so its contents are never parsed as markdown
    if (/^\s*```/.test(line)) {
      const body: string[] = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) { body.push(lines[i]); i++ }
      i++ // closing fence
      blocks.push(
        <pre
          key={`b${key++}`}
          style={{
            margin: 0,
            padding: '10px 12px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            overflowX: 'auto',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12.5,
            lineHeight: 1.55,
            color: '#0f172a',
          }}
        >
          {body.join('\n')}
        </pre>,
      )
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      const depth = heading[1].length
      blocks.push(
        <div
          key={`b${key++}`}
          style={{
            fontWeight: 600,
            fontSize: depth <= 2 ? 15 : 14,
            lineHeight: 1.4,
            color: '#0f172a',
            marginTop: blocks.length ? 4 : 0,
          }}
        >
          {renderInline(heading[2], `h${key}`)}
        </div>,
      )
      i++
      continue
    }

    // list run (bulleted or numbered) — grouped so spacing is per-list, not per-item
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const items: { marker: string; text: string }[] = []
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        const m = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(lines[i])!
        items.push({ marker: /^\d/.test(m[1]) ? m[1] : '•', text: m[2] })
        i++
      }
      blocks.push(
        <div key={`b${key++}`} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {items.map((it, n) => (
            <div key={n} style={{ display: 'flex', gap: 8, lineHeight: 1.6 }}>
              <span style={{ color: '#94a3b8', flexShrink: 0, minWidth: 12 }}>{it.marker}</span>
              <span>{renderInline(it.text, `l${key}-${n}`)}</span>
            </div>
          ))}
        </div>,
      )
      continue
    }

    if (!line.trim()) { i++; continue }

    // paragraph: consecutive non-blank lines that start no other block
    const para: string[] = []
    while (
      i < lines.length && lines[i].trim() &&
      !/^\s*```/.test(lines[i]) && !/^#{1,6}\s/.test(lines[i]) && !/^\s*([-*+]|\d+\.)\s+/.test(lines[i])
    ) { para.push(lines[i]); i++ }
    blocks.push(
      <div key={`b${key++}`} style={{ lineHeight: 1.62 }}>
        {renderInline(para.join(' '), `p${key}`)}
      </div>,
    )
  }

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{blocks}</div>
}

/** Shot + caveats. */
const ShotBlock: React.FC<{ rec: SpbRecord; maxHeight: number; rounded?: number }> = ({
  rec,
  maxHeight,
  rounded = 8,
}) =>
  rec.shotDataUrl ? (
    <img
      src={rec.shotDataUrl}
      alt="Annotation target at capture time"
      style={{
        width: '100%',
        maxHeight,
        objectFit: 'contain',
        borderRadius: rounded,
        border: '1px solid #e2e8f0',
        background: '#fff',
      }}
    />
  ) : (
    <div
      data-spb-shot-error={rec.shotError || 'pending'}
      style={{
        padding: 20,
        textAlign: 'center',
        fontSize: 11,
        color: rec.shotError ? '#b91c1c' : '#94a3b8',
        border: `1px dashed ${rec.shotError ? '#fca5a5' : '#cbd5e1'}`,
        borderRadius: rounded,
        fontFamily: rec.shotError ? 'ui-monospace,Menlo,monospace' : 'inherit',
        wordBreak: 'break-word',
      }}
    >
      {rec.shotError ? `Capture failed — ${rec.shotError}` : 'Capturing…'}
    </div>
  )

/** Status -> dot colour. A map, so a new status is a data edit (C4). */
const STATUS_DOT: Record<string, string> = {
  done: '#10b981',
  error: '#ef4444',
  cancelled: '#ef4444',
  working: '#3b82f6',
  queued: '#3b82f6',
  gate: '#f59e0b',
}

const CAVEAT: Record<string, string> = {
  'page-fallback': 'target not found — showing whole page',
  'bbox-ambiguous': 'ambiguous target',
}

/**
 * ASSISTANT layout — the ChatGPT / Grok idiom, over the same records.
 *
 * The capture becomes an ATTACHMENT on your own message rather than owning a
 * fixed region, which is why the shot can be large without costing anything
 * when you scroll past it. The rail leads with the thumbnail because these
 * threads are about screens, not text -- you recognise the capture before you
 * finish reading the label.
 */
const AssistantBody: React.FC<BodyProps> = ({
  records,
  active,
  activeId,
  setActiveId,
  draft,
  setDraft,
  onFollowUp,
  sending,
  queued,
  turnShots,
  agentShots,
  model,
  pickModel,
  modelPickerOn,
}) => {
  const send = () => {
    // Deliberately NOT gated on `sending`. A turn already in flight queues this
    // one behind it rather than refusing it -- refusing was the "why can't I
    // type in the input field" complaint. Draft clears immediately because the
    // message is accepted at this point, even if it has not dispatched yet.
    if (!active || !draft.trim() || active.savedOnly) return
    if (!SPB_NEXT && sending) return
    void onFollowUp(active, draft.trim())
    setDraft('')
  }
  return (
    <div style={{ display: 'flex', minHeight: 0, flex: 1 }}>
      {/* rail */}
      <div
        style={{
          width: 250,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid #e2e8f0',
          background: '#f8fafc',
        }}
      >
        <div style={{ padding: '10px 10px 4px', fontSize: 10, fontWeight: 600, letterSpacing: 0.4, color: '#94a3b8', textTransform: 'uppercase' }}>
          {records.length} annotation{records.length === 1 ? '' : 's'}
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '0 8px 10px' }}>
          {records.map((r) => {
            const on = r.id === activeId
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setActiveId(r.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: 6,
                  marginBottom: 6,
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  background: on ? '#e2e8f0' : 'transparent',
                }}
              >
                <span style={{ position: 'relative', display: 'block' }}>
                  {r.shotDataUrl ? (
                    <img
                      src={r.shotDataUrl}
                      alt=""
                      style={{
                        display: 'block',
                        width: '100%',
                        height: 116,
                        objectFit: 'cover',
                        objectPosition: 'top',
                        borderRadius: 7,
                        border: '1px solid #cbd5e1',
                        background: '#fff',
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        display: 'block',
                        height: 116,
                        borderRadius: 7,
                        border: '1px dashed #cbd5e1',
                        background: '#fff',
                      }}
                    />
                  )}
                  <span
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      boxShadow: '0 0 0 2px #fff',
                      background: STATUS_DOT[r.status || ''] || '#f59e0b',
                    }}
                  />
                </span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 5 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 500, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.label}
                  </span>
                  <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{timeAgo(r.createdAt)}</span>
                </span>
                <span style={{ display: 'block', fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.comment || '(no comment)'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* thread */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#fff' }}>
        {active && (
          <div
            data-spb-active-id={active.id}
            style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '9px 14px',
                borderBottom: '1px solid #f1f5f9',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {active.label}
              </div>
              {(() => {
                const coords = parseScreen(active.pageUrl)
                if (!coords || isAlreadyThere(active.pageUrl)) return null
                const where = [coords.mode, coords.state, coords.platform].filter(Boolean).join(' · ')
                return (
                  <button
                    type="button"
                    data-spb-goto="true"
                    title={active.pageUrl}
                    onClick={() => goToScreen(active.pageUrl)}
                    style={{
                      display: 'flex',
                      gap: 6,
                      alignItems: 'center',
                      border: '1px solid #e2e8f0',
                      background: '#fff',
                      color: '#475569',
                      borderRadius: 999,
                      padding: '3px 9px',
                      fontSize: 11,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      flexShrink: 0,
                    }}
                  >
                    Go to screen
                    <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 10, opacity: 0.7 }}>{where}</span>
                  </button>
                )
              })()}
            </div>

            <div data-spb-thread="true" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '18px 14px' }}>
              <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* your message, with the capture attached to it */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ maxWidth: '82%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <div data-spb-shot-how={active.shotHow || ''} style={{ width: 300 }}>
                      <ShotBlock rec={active} maxHeight={190} rounded={12} />
                      {(() => {
                        // Every honesty signal the classic layout shows must
                        // appear here too, or switching layout quietly drops a
                        // caveat -- which is worse than not having the layout.
                        const notes = [
                          active.shotRecaptured ? 'current state (re-captured)' : '',
                          CAVEAT[active.shotHow || ''],
                          active.shotNote,
                        ].filter(Boolean)
                        if (!notes.length) return null
                        return (
                          <div style={{ marginTop: 4, fontSize: 10, color: '#b45309', textAlign: 'right' }}>
                            {notes.join(' · ')}
                          </div>
                        )
                      })()}
                    </div>
                    <div style={{ background: '#f1f5f9', borderRadius: 16, borderBottomRightRadius: 5, padding: '9px 14px', fontSize: 14, lineHeight: 1.55, color: '#0f172a' }}>
                      {active.comment || '(no comment)'}
                    </div>
                  </div>
                </div>

                {active.activity && (
                  <div style={{ display: 'flex' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #e2e8f0', borderRadius: 999, padding: '3px 10px', fontSize: 11, color: '#64748b' }}>
                      <span style={{ color: '#94a3b8' }}>▸</span>
                      <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 10 }}>{active.activity}</span>
                    </span>
                  </div>
                )}

                {/* The conversation, IN ORDER. It used to render agent turns
                  * only, which was survivable when the record's `comment` was
                  * rewritten to the latest message -- the newest question showed
                  * up as the annotation. Now that `comment` stays the original
                  * annotation, follow-up questions have to render here or they
                  * would vanish and the replies would look unprompted.
                  * The first human turn is skipped: it IS the annotation, shown
                  * above with the shot. */}
                {(() => {
                  // Skip the first human turn only when it IS the annotation --
                  // i.e. it matches the record's comment. Skipping it blindly
                  // swallowed the message whenever the chat was empty (a record
                  // seeded from storage), because the first FOLLOW-UP then
                  // becomes chat[0] and got mistaken for the annotation.
                  let firstHumanSeen = false
                  const annotationText = (active.comment || '').trim()
                  return active.chat.map((m, i) => {
                    if (m.role === 'human' && !firstHumanSeen) {
                      firstHumanSeen = true
                      if (String(m.content || '').trim() === annotationText) return null
                    }
                    if (!m.content) return null
                    if (m.role === 'human') {
                      return (
                        <div key={i} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <div
                            data-spb-followup-msg="true"
                            style={{
                              maxWidth: '82%',
                              background: '#f1f5f9',
                              borderRadius: 16,
                              borderBottomRightRadius: 5,
                              padding: '9px 14px',
                              fontSize: 14,
                              lineHeight: 1.55,
                              color: '#0f172a',
                            }}
                          >
                            {m.content}
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div key={i} data-spb-agent-msg="true" style={{ fontSize: 14, color: '#0f172a' }}>
                        {SPB_NEXT
                          ? <MarkdownText text={m.content} />
                          : <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>}
                      </div>
                    )
                  })
                })()}

                {/* Screenshots the AGENT posted while working. Left-aligned, on
                  * the agent's side, so it is never confused with the state you
                  * attached. This is the agent showing its work, not asserting it. */}
                {SPB_NEXT && agentShots.map((s, i) => (
                  <div key={`as${i}`} style={{ maxWidth: 340 }}>
                    <img
                      data-spb-agent-shot={i + 1}
                      src={s.dataUrl}
                      alt={s.caption || `Posted by the agent (${i + 1})`}
                      style={{
                        width: '100%',
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        display: 'block',
                      }}
                    />
                    <div style={{ marginTop: 3, fontSize: 10, color: '#64748b' }}>
                      {s.caption ? `${s.caption} · from the agent` : 'posted by the agent'}
                    </div>
                  </div>
                ))}

                {/* Attachments for follow-up turns: current state at the moment
                  * each one was sent, sitting ALONGSIDE the original shot rather
                  * than replacing it. Labelled with the turn so a reviewer can
                  * tell which message it belongs to. */}
                {SPB_NEXT && turnShots.map((src, i) => (
                  <div key={`ts${i}`} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ maxWidth: 300 }}>
                      <img
                        data-spb-turn-shot={i + 1}
                        src={src}
                        alt={`Attached with follow-up ${i + 1}`}
                        style={{
                          width: '100%',
                          borderRadius: 8,
                          border: '1px solid #e2e8f0',
                          display: 'block',
                        }}
                      />
                      <div style={{ marginTop: 3, fontSize: 10, color: '#94a3b8', textAlign: 'right' }}>
                        attached · follow-up {i + 1}
                      </div>
                    </div>
                  </div>
                ))}

                {active.chat.length === 0 && !active.activity && !queued.length && (
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>
                    {active.savedOnly ? 'Saved without dispatching.' : 'Waiting for the agent…'}
                  </div>
                )}

                {/* Queued-but-not-yet-dispatched messages. Rendered from the queue
                  * rather than the chat store on purpose: they have not been sent,
                  * so persisting them would put them in the next turn's
                  * chatHistory as though the agent had already seen them. Shown
                  * dimmed and dashed so "accepted" is not mistaken for "answered". */}
                {queued.map((q, i) => (
                  <div key={`q${i}`} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div
                      data-spb-queued="true"
                      style={{
                        background: '#f8fafc',
                        border: '1px dashed #cbd5e1',
                        borderRadius: 16,
                        borderBottomRightRadius: 5,
                        padding: '9px 14px',
                        fontSize: 14,
                        lineHeight: 1.55,
                        color: '#64748b',
                        maxWidth: '85%',
                      }}
                    >
                      {q}
                      <span style={{ display: 'block', marginTop: 4, fontSize: 10, color: '#94a3b8' }}>
                        queued
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 56px, not 12px: agentation's own toolbar is position:fixed in the
              * bottom-right at 44px tall with a z-index ONE ABOVE this drawer, so
              * it paints over anything here. With send now on the composer's
              * footer row that collision would sit right on the send button. */}
            <div style={{ padding: '0 14px 56px' }}>
              {/* Claude-style composer: the input is the whole box, and the
                * controls sit on a footer row INSIDE it -- model bottom-left,
                * send bottom-right. Putting the model here rather than in the
                * drawer header is what makes it read as "settings for this
                * message" instead of "settings for the panel". */}
              <div
                style={{
                  maxWidth: 560,
                  margin: '0 auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  border: '1px solid #cbd5e1',
                  borderRadius: 16,
                  padding: '8px 10px',
                  background: '#fff',
                }}
              >
                <textarea
                  data-spb-composer="true"
                  /* Auto-grow to a cap, then scroll. rows={1} alone left a
                   * one-line window over multi-line text, so a normal-length
                   * annotation was clipped mid-sentence as you typed it. */
                  ref={(el) => {
                    if (!el) return
                    el.style.height = 'auto'
                    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
                  }}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      send()
                    }
                  }}
                  placeholder="Continue this annotation… (Enter to send)"
                  rows={1}
                  /* Only savedOnly disables it. It must stay typable while a
                   * turn streams -- that block was the reported defect. */
                  disabled={(!SPB_NEXT && sending) || !!active.savedOnly}
                  style={{
                    border: 'none',
                    outline: 'none',
                    resize: 'none',
                    fontSize: 14,
                    fontFamily: 'inherit',
                    color: '#0f172a',
                    background: 'transparent',
                    padding: '3px 2px',
                    maxHeight: 132,
                    overflowY: 'auto',
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Not rendered at all when off, rather than hidden: an element
                    * that is present but invisible still answers a DOM query,
                    * which is the difference between "off" and "looks off". */}
                  {modelPickerOn && (
                    <span style={{ position: 'relative', display: 'inline-flex' }}>
                      <select
                        data-spb-model={model}
                        title="Model the bridge spawns for this message"
                        value={model}
                        onChange={(e) => pickModel(e.target.value as SpbModel)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: '#64748b',
                          borderRadius: 6,
                          padding: '2px 16px 2px 4px',
                          fontSize: 12,
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                          appearance: 'none',
                        }}
                      >
                        {SPB_MODELS.map((m) => (
                          <option key={m.id} value={m.id} style={{ color: '#0f172a', background: '#fff' }}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      <span
                        aria-hidden
                        style={{
                          position: 'absolute',
                          right: 4,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          fontSize: 8,
                          color: '#94a3b8',
                          pointerEvents: 'none',
                        }}
                      >
                        ▼
                      </span>
                    </span>
                  )}
                  <span style={{ flex: 1 }} />
                  <button
                    type="button"
                    data-spb-send="true"
                    onClick={send}
                    disabled={(!SPB_NEXT && sending) || !draft.trim() || !!active.savedOnly}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      border: 'none',
                      background: draft.trim() ? '#0f172a' : '#cbd5e1',
                      color: '#fff',
                      cursor: draft.trim() ? 'pointer' : 'default',
                      flexShrink: 0,
                      fontSize: 13,
                    }}
                  >
                    ↑
                  </button>
                </div>
              </div>
              <div style={{ maxWidth: 560, margin: '5px auto 0', textAlign: 'center', fontSize: 10, color: '#94a3b8' }}>
                {queued.length
                  ? `${queued.length} queued · sends when the current reply finishes`
                  : sending
                    ? 'Streaming… you can keep typing, the next message queues'
                    : 'Same /annotate bridge · Enter to send, ⇧Enter for a new line'}
              </div>
            </div>
          </div>
        )}
        {!active && (
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: '#94a3b8', fontSize: 13 }}>
            Annotate something to start a thread.
          </div>
        )}
      </div>
    </div>
  )
}

function SidePanelBridgeDrawer({
  records,
  activeId,
  setActiveId,
  onClose,
  onFollowUp,
  sending,
  queued,
  turnShots,
  agentShots,
}: {
  records: SpbRecord[]
  activeId: string | null
  setActiveId: (id: string) => void
  onClose: () => void
  onFollowUp: (rec: SpbRecord, msg: string, model?: SpbModel) => Promise<void>
  sending: boolean
  queued: string[]
  turnShots: string[]
  agentShots: { dataUrl: string; caption: string }[]
}) {
  const activeRaw = records.find((r) => r.id === activeId) || null
  // Always re-read chat from localStorage when viewing so panel matches popup store
  const active = useMemo(() => {
    if (!activeRaw) return null
    const chat = activeRaw.element ? loadChatForElement(activeRaw.element) : activeRaw.chat
    return { ...activeRaw, chat: chat.length ? chat : activeRaw.chat }
  }, [activeRaw, records])
  const [draft, setDraft] = useState('')
  useEffect(() => {
    setDraft('')
  }, [activeId])

  // Model state stays here, not in the body: the drawer owns what gets sent, and
  // binds it into onFollowUp so the body renders the control without knowing the
  // wire format.
  const [model, setModel] = useState<SpbModel>(readModel)
  const [modelPickerOn] = useState(modelPickerEnabled)
  const pickModel = (next: SpbModel) => {
    setModel(next)
    writeModel(next)
  }
  // With the picker off, no model is bound in at all -- the POST carries no
  // ccModel and the bridge default wins, exactly as before this control existed.
  const followUpWithModel = useCallback(
    (rec: SpbRecord, msg: string) => onFollowUp(rec, msg, modelPickerOn ? model : undefined),
    [onFollowUp, model, modelPickerOn],
  )

  // The "Go to screen" affordance is derived from location.hash, so the drawer
  // has to re-render when the hash moves -- otherwise the button survives the
  // navigation and offers to take you where you already are.
  const [, bumpHash] = useState(0)
  useEffect(() => {
    const onHash = () => bumpHash((n) => n + 1)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return createPortal(
    <div
      data-agentation-spb-drawer="true"
      /* Declares this drawer as agentation chrome so handleClick early-returns on it. */
      data-feedback-toolbar="true"
      /**
       * Agentation's feedback mode installs document-level CAPTURE-phase
       * pointer/click handlers to pick the element you are annotating. Once
       * feedback mode has been used, those handlers swallowed clicks inside
       * this drawer too, so selecting a row silently stopped working: activeId
       * never changed and the panel was stuck on annotation #1 forever — the
       * exact thing the panel exists to do.
       *
       * `data-feedback-toolbar` above IS the fix: agentation's handleClick
       * early-returns on its own chrome. Rows used to carry a duplicate
       * `onPointerDown` to dodge the swallowed click path; that workaround is
       * gone now that click survives. Note what is NOT the fix: stopping
       * propagation at this root. React delegates from the container, so a
       * capture-phase stopPropagation here kills every handler inside the
       * drawer, row buttons included.
       */
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        height: '100vh',
        width: active ? 720 : 360,
        maxWidth: '100vw',
        background: '#fff',
        borderLeft: '1px solid #e2e8f0',
        boxShadow: '-12px 0 40px rgba(15,23,42,0.12)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 2147483646,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#0f172a',
        transition: 'width 0.2s ease',
      }}
    >
      {/* Plain surface, not a coloured band. The purple gradient read as a
        * status banner -- and the one banner in this app that MEANS something is
        * the sandbox strip, so a decorative one competing with it is worse than
        * plain. No bottom border either: per the project rules, dividers are for
        * list rows, and white space carries header separation. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: SPB_NEXT ? '14px 14px 10px' : '10px 12px',
          background: SPB_NEXT ? '#fff' : 'linear-gradient(90deg,#4f46e5,#7c3aed)',
          color: SPB_NEXT ? '#0f172a' : '#fff',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <strong style={{ fontSize: 13, fontWeight: 600 }}>{SPB_NEXT ? 'Annotations' : 'Side panel bridge'}</strong>
          <span style={{ fontSize: 10, color: '#94a3b8' }}>
            screenshot + chat · same /annotate · ?spb=0 for the old drawer
          </span>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#64748b',
            borderRadius: 6,
            width: 28,
            height: 28,
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          ×
        </button>
      </div>

      <AssistantBody
        records={records}
        active={active}
        activeId={activeId}
        setActiveId={setActiveId}
        draft={draft}
        setDraft={setDraft}
        onFollowUp={followUpWithModel}
        sending={sending}
        queued={queued}
        turnShots={turnShots}
        agentShots={agentShots}
        model={model}
        pickModel={pickModel}
        modelPickerOn={modelPickerOn}
      />
    </div>,
    document.body,
  )
}

/**
 * Seed from agentation's own persisted annotations for this pathname, so the
 * drawer is not empty on a cold load. Without this SPB only ever showed
 * annotations made in the current session -- a reload wiped the list, and
 * "open SPB after existing annotations" did not actually work.
 *
 * Seeded rows carry no shot (nothing is persisted by design); they capture on
 * demand when selected -- see the focus-time capture in SidePanelBridgeApp.
 */
function seedRecords(): SpbRecord[] {
  try {
    return readPersistedRecords().map((r) => {
      const element = String(r.label || '')
      const meta = loadMeta(element)
      return {
        // Keep agentation's own annotation id. Keying by threadId collides when
        // the same element is annotated twice (the normal case): both rows get
        // the same key, React warns, and clicking the second row shows the
        // first one's comment, chat and screenshot.
        id: r.id,
        threadId: meta.threadId,
        label: element || String(r.comment || '').slice(0, 60) || '(annotation)',
        comment: String(r.comment || ''),
        element,
        pageUrl: r.pageUrl || (typeof window !== 'undefined' ? window.location.href : ''),
        createdAt: r.createdAt,
        // Absence of a threadId is the only honest save-only signal. Hardcoding
        // true permanently disabled follow-up on every row older than this
        // page session, including ones that WERE dispatched.
        savedOnly: !meta.threadId,
        shotDataUrl: null,
        ann: r.elements?.[0],
        chat: element ? loadChatForElement(element) : [],
        sessionUuid: meta.sessionUuid,
      } as SpbRecord
    })
  } catch {
    return []
  }
}

/**
 * Subscribe to a thread SPB did NOT start, and stream the agent's reply into
 * the shared chat store.
 *
 * Without this the panel can only ever show chat for conversations it started
 * itself: `__cc_thread_store__` is written only by persistChat, which only ran
 * in the follow-up path. An annotation sent from the agentation TOOLBAR -- the
 * normal way you use this -- dispatched fine, the agent replied fine, and the
 * panel showed "No chat yet for this marker" forever. V2_2's own subscription
 * emits status/activity events but never the reply text.
 */
/**
 * Learn the threadId of an annotation sent from the toolbar.
 *
 * Nothing on the client reads the /annotate RESPONSE: V2_2 clones the REQUEST
 * body (which has no threadId on a first send) and agentation itself keeps the
 * response to open its own stream. So SPB never knew which thread its newest
 * record belonged to, and could not subscribe for the reply.
 *
 * Wrap fetch once, observe the response, and re-emit the id.
 */
let _annotateWatchInstalled = false
function installAnnotateResponseWatch() {
  if (_annotateWatchInstalled || typeof window === 'undefined') return
  _annotateWatchInstalled = true
  const prior = window.fetch.bind(window)
  window.fetch = async (input: any, init?: any) => {
    const res = await prior(input, init)
    try {
      const url = typeof input === 'string' ? input : input?.url || ''
      const method = (init?.method || input?.method || 'GET').toUpperCase()
      if (method === 'POST' && /\/annotate\b/.test(url)) {
        res
          .clone()
          .json()
          .then((j: any) => {
            const threadId = j?.threadId || j?.thread_id
            if (threadId) {
              window.dispatchEvent(
                new CustomEvent('spb-thread-id', { detail: { threadId, bridge: url.split('/annotate')[0] } }),
              )
            }
          })
          .catch(() => {})
      }
    } catch {}
    return res
  }
}

const _subscribed = new Set<string>()
function subscribeReply(
  threadId: string,
  element: string,
  humanMsg: string,
  onUpdate: (chat: ChatMsg[], phase: string) => void,
) {
  if (!threadId || _subscribed.has(threadId)) return
  _subscribed.add(threadId)
  let buf = ''
  let es: EventSource
  try {
    es = new EventSource(`${BRIDGE}/stream/${threadId}?live=1`)
  } catch {
    _subscribed.delete(threadId)
    return
  }
  const build = (agent: string): ChatMsg[] => [
    { role: 'human', content: humanMsg },
    { role: 'agent', content: agent },
  ]
  es.addEventListener('delta', (ev) => {
    try {
      const t = String(JSON.parse((ev as MessageEvent).data).text || '')
      // cumulative-vs-incremental: the server sends both shapes
      if (!t) return
      else if (!buf || t.startsWith(buf)) buf = t
      else if (buf.endsWith(t)) return
      else buf += t
    } catch {
      return
    }
    const chat = build(buf || '…')
    persistChat(element, chat)
    onUpdate(chat, 'working')
  })
  // Agent-posted screenshots. Re-broadcast as a window event rather than a new
  // callback: two separate SSE subscriptions need this, and the chat store is
  // keyed by element, so the element is the only routing key either one has.
  es.addEventListener('shot', (ev) => {
    try {
      const d = JSON.parse((ev as MessageEvent).data || '{}')
      if (!d.dataUrl) return
      window.dispatchEvent(new CustomEvent('spb-agent-shot', {
        detail: { element, dataUrl: d.dataUrl, caption: d.caption || '' },
      }))
    } catch {}
  })
  es.addEventListener('status', (ev) => {
    let data: any = {}
    try {
      data = JSON.parse((ev as MessageEvent).data || '{}')
    } catch {}
    const ph = data.phase || ''
    if (data.sessionId) saveMeta(element, { threadId, sessionUuid: data.sessionId })
    if (ph === 'done' || ph === 'error' || ph === 'cancelled') {
      const chat = build(buf || `(${ph})`)
      persistChat(element, chat)
      onUpdate(chat, ph)
      es.close()
    }
  })
  // Bounded: a hung thread must not hold an EventSource for the session.
  setTimeout(() => {
    try {
      es.close()
    } catch {}
  }, 1_260_000)
}

function useSpbRecords(): [SpbRecord[], React.Dispatch<React.SetStateAction<SpbRecord[]>>] {
  const [records, setRecords] = useState<SpbRecord[]>(seedRecords)

  useEffect(() => {
    const onRecord = (e: Event) => {
      const detail = (e as CustomEvent).detail || {}
      const element = String(detail.label || detail.element || '')
      const id = String(detail.id || detail.threadId || `spb_${Date.now()}`)
      const threadId = detail.threadId ? String(detail.threadId) : undefined
      const meta = element ? loadMeta(element) : {}
      const chat = element ? loadChatForElement(element) : []
      const rec: SpbRecord = {
        id,
        threadId: threadId || meta.threadId,
        sessionUuid: meta.sessionUuid,
        label: element || String(detail.comment || '').slice(0, 60) || '(annotation)',
        comment: String(detail.comment || ''),
        element,
        pageUrl: String(detail.pageUrl || window.location.href),
        createdAt: Number(detail.createdAt || Date.now()),
        status: detail.status || (detail.savedOnly ? undefined : 'queued'),
        activity: detail.activity,
        chat,
        savedOnly: !!detail.savedOnly,
        shotDataUrl: null,
        shotPending: true,
        ann: detail.elements?.[0],
      }
      setRecords((prev) => [rec, ...prev.filter((p) => p.id !== rec.id)])

      // Stream the agent's reply for annotations sent from the TOOLBAR. SPB
      // only ever subscribed for follow-ups it sent itself, so the primary
      // path showed "No chat yet" even after the agent had answered.
      const tid = rec.threadId
      if (tid && !rec.savedOnly && element) {
        subscribeReply(tid, element, rec.comment, (chat, phase) => {
          setRecords((prev) =>
            prev.map((p) =>
              p.id === id || p.threadId === tid
                ? {
                    ...p,
                    chat,
                    status: phase === 'working' ? 'working' : phase,
                    activity: phase === 'working' ? 'streaming…' : undefined,
                  }
                : p,
            ),
          )
        })
      }

      // Capture shot of the annotated element async. Always writes back --
      // a failure reason is more useful than a silently blank pane.
      void (async () => {
        const { el, how } = resolveAnnotatedElement(detail.markerEls, detail.elements?.[0])
        const { dataUrl, reason, note } = await captureElementShot(el)
        setRecords((prev) =>
          prev.map((p) =>
            p.id === id
              ? { ...p, shotDataUrl: dataUrl, shotError: reason, shotNote: note, shotHow: how, shotPending: false }
              : p,
          ),
        )
      })()
    }

    const onStatus = (e: Event) => {
      const { id, status, activity } = (e as CustomEvent).detail || {}
      if (!id) return
      setRecords((prev) =>
        prev.map((p) => {
          if (p.id !== id && p.threadId !== id) return p
          const next = { ...p }
          if (status) next.status = status
          if (activity === null) next.activity = undefined
          else if (typeof activity === 'string') next.activity = activity
          // refresh chat from store
          if (p.element) next.chat = loadChatForElement(p.element)
          return next
        }),
      )
    }

    const onActivity = (e: Event) => {
      const { id, activity } = (e as CustomEvent).detail || {}
      if (!id || !activity) return
      setRecords((prev) =>
        prev.map((p) =>
          p.id === id || p.threadId === id ? { ...p, activity, status: p.status || 'working' } : p,
        ),
      )
    }

    const onCcThread = () => {
      setRecords((prev) =>
        prev.map((p) => (p.element ? { ...p, chat: loadChatForElement(p.element) } : p)),
      )
    }

    // Late-arriving threadId from the /annotate response (toolbar path).
    const onThreadId = (e: Event) => {
      const { threadId } = (e as CustomEvent).detail || {}
      if (!threadId) return
      setRecords((prev) => {
        // newest dispatched record that does not yet know its thread
        const idx = prev.findIndex((p) => !p.threadId && !p.savedOnly)
        if (idx < 0) return prev
        const target = prev[idx]
        const next = prev.slice()
        next[idx] = { ...target, threadId }
        if (target.element) {
          subscribeReply(threadId, target.element, target.comment, (chat, phase) => {
            setRecords((cur) =>
              cur.map((p) =>
                p.id === target.id || p.threadId === threadId
                  ? {
                      ...p,
                      chat,
                      status: phase === 'working' ? 'working' : phase,
                      activity: phase === 'working' ? 'streaming…' : undefined,
                    }
                  : p,
              ),
            )
          })
        }
        return next
      })
    }

    installAnnotateResponseWatch()
    window.addEventListener('spb-thread-id', onThreadId as EventListener)
    window.addEventListener('agentation-annotation-record', onRecord as EventListener)
    window.addEventListener('agentation-annotation-status', onStatus as EventListener)
    window.addEventListener('agentation-annotation-activity', onActivity as EventListener)
    window.addEventListener('cc-thread', onCcThread)
    return () => {
      window.removeEventListener('spb-thread-id', onThreadId as EventListener)
      window.removeEventListener('agentation-annotation-record', onRecord as EventListener)
      window.removeEventListener('agentation-annotation-status', onStatus as EventListener)
      window.removeEventListener('agentation-annotation-activity', onActivity as EventListener)
      window.removeEventListener('cc-thread', onCcThread)
    }
  }, [])

  return [records, setRecords]
}

function SidePanelBridgeApp() {
  const [records, setRecords] = useSpbRecords()
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  /**
   * Per-thread FIFO queue.
   *
   * You must be able to fire off a second thought without waiting for the first
   * reply. But a thread is ONE claude session, resumed by `sessionUuid` -- two
   * turns in flight against it would race the same session, so "just allow
   * concurrent sends" corrupts the conversation rather than speeding it up.
   * Queueing is what makes send-while-streaming safe rather than merely allowed.
   *
   * Keyed by record id, so different annotations still run in parallel; only
   * turns WITHIN one thread serialise.
   *
   * The queue lives in a ref because the drain loop reads it after awaits, where
   * a state snapshot would be stale. `queuedView` mirrors it for rendering --
   * one writer (`syncQueuedView`) keeps them from drifting.
   */
  const queuesRef = useRef<Map<string, { msg: string; model?: SpbModel }[]>>(new Map())
  const runningRef = useRef<Set<string>>(new Set())
  const [queuedView, setQueuedView] = useState<Record<string, string[]>>({})
  const [inFlightIds, setInFlightIds] = useState<string[]>([])

  const syncQueuedView = useCallback(() => {
    const next: Record<string, string[]> = {}
    queuesRef.current.forEach((v, k) => {
      if (v.length) next[k] = v.map((x) => x.msg)
    })
    setQueuedView(next)
  }, [])

  /**
   * Per-turn attachments: a fresh capture of the annotated element taken at the
   * moment a follow-up is sent.
   *
   * Deliberately NOT written onto `rec.shotDataUrl` -- overwriting the record's
   * shot on every turn is precisely the "new messages replace the earlier
   * screenshot" defect. These accumulate alongside it instead.
   *
   * In React state only, never localStorage: a PNG per turn would blow the
   * quota and take agentation's own unguarded setItem calls down with it.
   */
  const [turnShots, setTurnShots] = useState<Record<string, string[]>>({})

  /**
   * Screenshots the AGENT posted mid-task via POST /shot. Keyed by element, the
   * same key the chat store uses, because that is the only routing key the SSE
   * subscriptions share. In memory only, for the same quota reason as the rest.
   */
  const [agentShots, setAgentShots] = useState<Record<string, { dataUrl: string; caption: string }[]>>({})
  useEffect(() => {
    const onShot = (e: Event) => {
      const d = (e as CustomEvent).detail || {}
      if (!d.element || !d.dataUrl) return
      setAgentShots((prev) => ({
        ...prev,
        [d.element]: [...(prev[d.element] || []), { dataUrl: d.dataUrl, caption: d.caption || '' }],
      }))
    }
    window.addEventListener('spb-agent-shot', onShot as EventListener)
    return () => window.removeEventListener('spb-agent-shot', onShot as EventListener)
  }, [])

  // Keep V2_2 mounted underneath for toolbar/list button + annotate intercept —
  // we only replace the drawer UX via our own button + drawer.
  // Actually V2_2 has its own drawer. We inject our own list button and hide V2 drawer.
  // Simpler: mount V2_2 for annotate pipeline, open OUR drawer from a second button.

  useEffect(() => {
    if (activeId === null && records.length) setActiveId(records[0].id)
  }, [records, activeId])

  // Focus-time capture. Seeded/historical records were never captured at
  // annotate time (they predate this session), so capture on first view
  // instead of persisting shots -- which would mean a localStorage quota
  // budget, an eviction policy, and a QuotaExceededError that can take
  // agentation's own un-guarded setItem calls down with it. Re-capturing
  // shows CURRENT state, which is labelled as such in the detail pane.
  useEffect(() => {
    if (!open || !activeId) return
    const rec = records.find((r) => r.id === activeId)
    // shotPending is the load-bearing guard. shotDataUrl/shotError are not
    // enough: a LIVE record's record-time capture is async, so at the moment
    // this effect runs neither field is set yet, and the fallback re-capture
    // (ignoreLastClick, so it resolves to the whole page) finishes ~40-80ms
    // later and OVERWRITES the correct 'clicked' capture. Measured as two
    // toDataURL calls per annotation: 300x120 then 480x300.
    if (!rec || rec.shotPending || rec.shotDataUrl || rec.shotError) return
    let cancelled = false
    void (async () => {
      // A historical record has no live click behind it -- resolve from its
      // stored geometry only, or we would capture whatever the user last
      // touched in THIS session.
      const { el, how } = resolveAnnotatedElement(undefined, rec.ann, { ignoreLastClick: true })
      const { dataUrl, reason, note } = await captureElementShot(el)
      if (cancelled) return
      setRecords((prev) =>
        prev.map((p) =>
          p.id === rec.id
            ? {
                ...p,
                shotDataUrl: dataUrl,
                shotError: reason,
                shotNote: note,
                shotHow: how,
                shotRecaptured: true,
              }
            : p,
        ),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [open, activeId, records, setRecords])

  // Own the toolbar's existing Annotations control instead of adding a second
  // button beside it.
  //
  // Two things were wrong with the injected "SPB" pill. It was REDUNDANT --
  // the toolbar already has an Annotations button that means the same thing,
  // and this panel IS the annotations surface. And it was INERT: agentation
  // sets `pointer-events: none` on the outer `toolbar___` wrapper (so the
  // fixed layer does not swallow page clicks) and re-enables it on the inner
  // container, so a pill appended to the outer wrapper rendered but never
  // received a click -- elementFromPoint at its own centre returned the page
  // behind it.
  //
  // Binding in the CAPTURE phase on the button itself stops the event before
  // it bubbles back to React's root listener, so the stock V2_2 drawer does
  // not also open. Scoped to this one button on purpose: capture-stopping at a
  // container root kills every handler inside it, React's included.
  useEffect(() => {
    const FLAG = 'spbBound'
    const onCapture = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      setOpen((v) => !v)
    }
    const bound: HTMLElement[] = []
    const bind = () => {
      const btn = document.querySelector<HTMLElement>('button[title^="Annotations"]')
      if (!btn || btn.dataset[FLAG]) return
      btn.dataset[FLAG] = '1'
      btn.addEventListener('click', onCapture, true)
      bound.push(btn)
    }
    bind()
    const mo = new MutationObserver(bind)
    mo.observe(document.body, { childList: true, subtree: true })
    return () => {
      mo.disconnect()
      for (const b of bound) {
        b.removeEventListener('click', onCapture, true)
        delete b.dataset[FLAG]
      }
      document.getElementById('__agentation_spb_btn__')?.remove()
    }
  }, [])

  const followUp = useCallback(async (rec: SpbRecord, msg: string, model?: SpbModel) => {
    if (!rec.element) return
    setInFlightIds((prev) => [...prev, rec.id])
    try {
      const el = rec.element
      const meta = loadMeta(el)
      const prior = loadChatForElement(el).filter((m) => m.content && m.content !== '…')
      const chatHistory = prior.slice(-16).map((m) => ({
        role: m.role === 'agent' ? 'agent' : 'human',
        content: String(m.content).slice(0, 1500),
      }))
      const nextChat: ChatMsg[] = [
        ...prior,
        { role: 'human', content: msg },
        { role: 'agent', content: '…' },
      ]
      persistChat(el, nextChat)
      setRecords((prev) =>
        prev.map((p) =>
          p.id === rec.id
            // `comment` is the record's IDENTITY -- the annotation you made, and
            // what the list row is labelled with. Overwriting it per turn made a
            // three-message thread claim it had always been about the last thing
            // you typed. The conversation lives in `chat`; the annotation does
            // not change because you replied to it.
            ? { ...p, chat: nextChat, status: 'queued', ...(SPB_NEXT ? {} : { comment: msg }) }
            : p,
        ),
      )

      // Attach current state for this turn. Best-effort: a failed capture must
      // never block the send, so this is fire-and-forget into state only.
      try {
        const { el: node } = resolveAnnotatedElement(undefined, rec.ann, { ignoreLastClick: true })
        const { dataUrl } = await captureElementShot(node)
        if (dataUrl) {
          setTurnShots((prev) => ({ ...prev, [rec.id]: [...(prev[rec.id] || []), dataUrl] }))
        }
      } catch {}

      const body: any = {
        comment: msg,
        pageUrl: rec.pageUrl || window.location.href,
        url: rec.pageUrl || window.location.href,
        annotations: [{ comment: msg, element: el, elementPath: el }],
        chatHistory,
      }
      if (meta.threadId || rec.threadId) body.threadId = meta.threadId || rec.threadId
      if (meta.sessionUuid || rec.sessionUuid) body.sessionUuid = meta.sessionUuid || rec.sessionUuid
      // Marks this POST as another TURN on an existing record, not a new
      // annotation. V2_2 patches fetch and mints a record for every /annotate
      // POST it sees; without this flag a follow-up is indistinguishable from a
      // fresh annotation and lands as a duplicate row in the list.
      //
      // UNCONDITIONAL on purpose. Gating it on `body.threadId` looked right and
      // was wrong: a record seeded from localStorage, or one whose first
      // response has not landed yet, has no threadId — so the FIRST follow-up
      // slipped through and still minted a duplicate. `followUp` is only ever
      // reached from the composer of an existing record, so the flag is always
      // true by construction.
      if (SPB_NEXT) body.spbFollowUp = true
      // server.v4 reads body.ccModel ahead of the cc: prefix and its own default,
      // then hands it to the child as --model.
      if (model) body.ccModel = model

      const res = await fetch(`${BRIDGE}/annotate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!j?.threadId) throw new Error('no threadId')
      // The POST echoes the model it queued. Logged so a mismatch between the
      // picker and the spawned child is visible without reading the bridge log.
      console.info('[spb] sent model=%s · bridge queued=%s', model || '(default)', j.model)
      saveMeta(el, {
        threadId: j.threadId,
        sessionUuid: j.sessionUuid || meta.sessionUuid,
      })
      setRecords((prev) =>
        prev.map((p) =>
          p.id === rec.id
            ? {
                ...p,
                threadId: j.threadId,
                sessionUuid: j.sessionUuid || p.sessionUuid,
                status: j.resumed ? 'working' : 'queued',
              }
            : p,
        ),
      )

      // Stream SSE into chat store (same as popup)
      let buf = ''
      await new Promise<void>((resolve) => {
        const es = new EventSource(`${BRIDGE}/stream/${j.threadId}?live=1`)
        const done = () => {
          es.close()
          resolve()
        }
        es.addEventListener('delta', (ev) => {
          try {
            const t = String(JSON.parse((ev as MessageEvent).data).text || '')
            // Prefer cumulative replace if server re-sends full text; else append
            // incremental token (stream_event text_delta).
            if (!t) {
              /* keep buf */
            } else if (!buf || t.startsWith(buf)) buf = t
            else if (buf.endsWith(t)) {
              /* duplicate tail — ignore */
            } else buf += t
          } catch {}
          const chat: ChatMsg[] = [
            ...prior,
            { role: 'human', content: msg },
            { role: 'agent', content: buf || '…' },
          ]
          persistChat(el, chat)
          setRecords((prev) =>
            prev.map((p) =>
              p.id === rec.id ? { ...p, chat, status: 'working', activity: 'streaming…' } : p,
            ),
          )
        })
        es.addEventListener('shot', (ev) => {
          try {
            const d = JSON.parse((ev as MessageEvent).data || '{}')
            if (!d.dataUrl) return
            window.dispatchEvent(new CustomEvent('spb-agent-shot', {
              detail: { element: el, dataUrl: d.dataUrl, caption: d.caption || '' },
            }))
          } catch {}
        })
        es.addEventListener('status', (ev) => {
          let data: any = {}
          try {
            data = JSON.parse((ev as MessageEvent).data || '{}')
          } catch {}
          const ph = data.phase || ''
          if (data.sessionId) saveMeta(el, { threadId: j.threadId, sessionUuid: data.sessionId })
          if (ph === 'done' || ph === 'error' || ph === 'cancelled') {
            const chat: ChatMsg[] = [
              ...prior,
              { role: 'human', content: msg },
              { role: 'agent', content: buf || `(${ph})` },
            ]
            persistChat(el, chat)
            setRecords((prev) =>
              prev.map((p) =>
                p.id === rec.id
                  ? { ...p, chat, status: ph === 'done' ? 'done' : ph, activity: undefined }
                  : p,
              ),
            )
            done()
          }
        })
        es.onerror = () => {
          /* keep open until done */
        }
        setTimeout(done, 180000)
      })
    } finally {
      setInFlightIds((prev) => {
        const i = prev.indexOf(rec.id)
        if (i < 0) return prev
        const next = [...prev]
        next.splice(i, 1)
        return next
      })
    }
  }, [setRecords])

  /**
   * Drain one thread's queue, strictly in order. Re-reads the ref each pass
   * because messages can be appended while an earlier turn is still awaiting.
   */
  const drainQueue = useCallback(
    async (rec: SpbRecord) => {
      if (runningRef.current.has(rec.id)) return
      runningRef.current.add(rec.id)
      try {
        for (;;) {
          const q = queuesRef.current.get(rec.id)
          const next = q?.shift()
          syncQueuedView()
          if (!next) break
          // A failed turn must not strand the rest of the queue.
          try {
            await followUp(rec, next.msg, next.model)
          } catch {}
        }
      } finally {
        runningRef.current.delete(rec.id)
        syncQueuedView()
      }
    },
    [followUp, syncQueuedView],
  )

  /** What the composer calls. Always accepts; never blocks on an in-flight turn. */
  const enqueueFollowUp = useCallback(
    async (rec: SpbRecord, msg: string, model?: SpbModel) => {
      if (!SPB_NEXT) { await followUp(rec, msg, model); return }
      const q = queuesRef.current.get(rec.id) || []
      q.push({ msg, model })
      queuesRef.current.set(rec.id, q)
      syncQueuedView()
      void drainQueue(rec)
    },
    [drainQueue, syncQueuedView, followUp],
  )

  return (
    <>
      {/* Annotate pipeline + original toolbar list still available */}
      <AgentationDevtoolsV2_2 />
      {open && (
        <SidePanelBridgeDrawer
          records={records}
          activeId={activeId}
          setActiveId={setActiveId}
          onClose={() => setOpen(false)}
          onFollowUp={enqueueFollowUp}
          sending={!!activeId && inFlightIds.includes(activeId)}
          queued={(activeId && queuedView[activeId]) || []}
          turnShots={(activeId && turnShots[activeId]) || []}
          agentShots={agentShots[records.find((r) => r.id === activeId)?.element || ''] || []}
        />
      )}
      {/* Badge so thrash knows SPB is live. Not on /clouds: that route is a
          full-bleed sky demo and the pill reads as part of the scene. */}
      {!(window.location.pathname.startsWith('/clouds') || window.location.hash.startsWith('#/clouds')) && (
      <div
        data-agentation-spb-badge="true"
        style={{
          position: 'fixed',
          bottom: 56,
          right: 16,
          zIndex: 2147483645,
          /* Neutral, not indigo. Colour in this app is reserved for the sandbox
           * banner; a bright "which surface am I on" pill competes with it. */
          background: 'rgba(15,23,42,0.72)',
          color: '#fff',
          fontSize: 10,
          fontWeight: 600,
          padding: '4px 8px',
          borderRadius: 999,
          pointerEvents: 'none',
          fontFamily: 'system-ui,sans-serif',
        }}
      >
        SPB on · ?spb=0 to opt out
      </div>
      )}
    </>
  )
}

export function AgentationSidePanelBridge() {
  if (!import.meta.env.DEV) return null
  // Seeded from the flag rather than `false`, or the default-on case mounts
  // V2_2 for one paint and then tears it down — a remount of the whole
  // annotate pipeline on every page load.
  const [on, setOn] = useState(spbEnabled)
  useEffect(() => {
    // thrash inject may set the flag (either way) after first paint
    const t = window.setInterval(() => setOn(spbEnabled()), 500)
    return () => window.clearInterval(t)
  }, [])
  if (!on) return <AgentationDevtoolsV2_2 />
  return <SidePanelBridgeApp />
}
