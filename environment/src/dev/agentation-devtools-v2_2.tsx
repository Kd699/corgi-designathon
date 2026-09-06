import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Agentation } from 'agentation'

// AgentationDevtoolsV2_2 -- fork of AgentationDevtoolsV2 (this folder).
// Adds Prev/Counter/Next controls at the TOP of the native popup so the user
// can step between recorded annotations without dismissing the popup. Same
// MutationObserver injection pattern Copy/Save use. Rollback = revert the
// import in apps/main/src/main.tsx.
//
// Original v2 comment below.
//
// AgentationDevtoolsV2 -- fork of AgentationDevtools (in this same folder).
//
// Adds an "Annotations" list affordance to the real Agentation toolbar:
//   - Listens for every POST /annotate the popup fires.
//   - Builds a local history (in-memory; survives until page reload).
//   - Injects a list icon into the real toolbar via
//     [data-agentation-toolbar="true"] selectors; clicking opens a right-drawer.
//   - Drawer shows each recorded annotation with a detail pane;
//     clicking a row switches the detail.
//
// What it does NOT do (yet, by design):
//   - Persist across reloads (localStorage). Add when the loop is stable.
//   - Reuse V1's inline-Copy-preview-in-popup feature. That lives in V1
//     (agentation-devtools.tsx); V1 stays mounted as the alternative on the
//     other branch. Swap by branch.
//
// Selectors (stable, see reference_agentation_toolbar_dom.md):
//   [data-agentation-toolbar="true"]
//   [class*="controlsContent__"]
//   [class*="buttonWrapper__"]
//   [class*="controlButton__"]
//   [class*="buttonTooltip__"]
//   [class*="divider__"]

type AnnotationRecord = {
  id: string
  threadId?: string
  label: string
  comment: string
  formattedPrompt: string
  elements: {
    selector: string
    size?: string
    boundingBox?: { x: number; y: number; width: number; height: number }
    isFixed?: boolean
    outerHTML?: string
    elementText?: string
  }[]
  // Snapshot of marker DOM nodes captured at /annotate POST time -- used to
  // re-open the real agentation popup on row click. Markers may be cleared
  // if "Clear on copy/send" is on; that's fine, we fall back to selector
  // scrollIntoView + outline pulse.
  markerEls: HTMLElement[]
  pageUrl: string
  createdAt: number
  // True for records produced by the popup "Save" button (no AI dispatch).
  // SideDrawer can badge these differently from /annotate-routed records.
  savedOnly?: boolean
  // Live dispatch status, driven by the bridge SSE /stream/<threadId>.
  // 'queued' before the child spawns, 'working' while Claude runs, 'gate'
  // during the post-edit typecheck, then a terminal done/error/cancelled.
  // Undefined for save-only records (never dispatched). This is what turns
  // a silent multi-minute turn into a visible "working… -> done" signal.
  status?: 'queued' | 'working' | 'gate' | 'done' | 'error' | 'cancelled'
  // Latest human-readable tool/process line from the bridge SSE (`tool`,
  // `thinking`, …). Shown under the row while status is working/gate so a
  // long grep/read turn does not look frozen. Cleared on terminal status.
  activity?: string
}

// Map a bridge SSE `status`/`build-gate` phase to our coarse record status.
function phaseToStatus(
  event: string,
  phase: string,
): AnnotationRecord['status'] | null {
  if (event === 'build-gate') {
    if (phase === 'checking' || phase === 'fail') return 'gate'
    return null // 'pass' is non-terminal; the result event flips us to done
  }
  // event === 'status'
  switch (phase) {
    case 'spawning':
    case 'thinking':
      return 'working'
    case 'done':
      return 'done'
    case 'error':
      return 'error'
    case 'cancelled':
      return 'cancelled'
    default:
      return null
  }
}

/** Compact tool line for the side drawer (keep short — drawer is narrow). */
function formatToolActivity(name: string, input: any): string {
  const n = (name || 'tool').replace(/^mcp__/, '')
  const i = input && typeof input === 'object' ? input : {}
  const path =
    i.target_file || i.file_path || i.path || i.pattern || i.glob || i.command || i.query || ''
  const shortPath =
    typeof path === 'string'
      ? path.length > 48
        ? '…' + path.slice(-46)
        : path
      : ''
  // Friendly aliases (Claude + Grok tool names)
  const alias: Record<string, string> = {
    read_file: 'read',
    Read: 'read',
    grep: 'grep',
    Grep: 'grep',
    run_terminal_command: 'bash',
    Bash: 'bash',
    search_replace: 'edit',
    Edit: 'edit',
    Write: 'write',
    write: 'write',
    list_dir: 'ls',
    Glob: 'glob',
    web_search: 'web',
  }
  const label = alias[n] || n
  if (label === 'bash' && shortPath) {
    const cmd = String(path).replace(/\s+/g, ' ').slice(0, 52)
    return `bash · ${cmd}${String(path).length > 52 ? '…' : ''}`
  }
  if (label === 'grep' && (i.pattern || shortPath)) {
    return `grep · ${String(i.pattern || shortPath).slice(0, 40)}`
  }
  return shortPath ? `${label} · ${shortPath}` : label
}

// Subscribe to the bridge's per-thread SSE stream and republish coarse status
// transitions as `agentation-annotation-status` window events keyed by record
// id (== threadId). Also republishes live tool/process lines as
// `agentation-annotation-activity` so the drawer can show "grep · foo" while
// the turn is in flight. History is replayed on connect. Closes on terminal
// phase. Best-effort: failures swallowed so the toolbar never breaks.
function subscribeToThread(threadId: string, bridgeBase: string) {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return
  let es: EventSource | null = null
  try {
    es = new EventSource(`${bridgeBase}/stream/${threadId}?live=1`)
  } catch {
    return
  }
  const emit = (status: AnnotationRecord['status'], activity?: string | null) => {
    window.dispatchEvent(
      new CustomEvent('agentation-annotation-status', {
        detail: {
          id: threadId,
          status,
          // null clears activity on terminal; undefined leaves it alone
          ...(activity !== undefined ? { activity } : {}),
        },
      }),
    )
    if (status === 'done' || status === 'error' || status === 'cancelled') {
      try { es?.close() } catch {}
    }
  }
  const emitActivity = (activity: string) => {
    window.dispatchEvent(
      new CustomEvent('agentation-annotation-activity', {
        detail: { id: threadId, activity },
      }),
    )
  }
  const onNamed = (eventName: string) => (e: MessageEvent) => {
    let data: any = {}
    try { data = JSON.parse(e.data || '{}') } catch {}
    const phase = data.phase || ''
    if (eventName === 'status' && phase === 'thinking' && data.model) {
      emitActivity(`model · ${data.model}`)
    }
    if (eventName === 'build-gate') {
      if (phase === 'checking') emitActivity('typecheck · running')
      else if (phase === 'fail') emitActivity('typecheck · fail → fix turn')
      else if (phase === 'pass') emitActivity('typecheck · pass')
    }
    const next = phaseToStatus(eventName, phase)
    if (next) {
      // Terminal statuses clear the activity line
      emit(next, next === 'done' || next === 'error' || next === 'cancelled' ? null : undefined)
    }
  }
  const onTool = (e: MessageEvent) => {
    let data: any = {}
    try { data = JSON.parse(e.data || '{}') } catch {}
    const line = formatToolActivity(data.name || 'tool', data.input)
    emitActivity(line)
    // Ensure we're at least in working if a tool fires before status
    emit('working')
  }
  const onToolResult = (e: MessageEvent) => {
    let data: any = {}
    try { data = JSON.parse(e.data || '{}') } catch {}
    const snippet =
      typeof data.content === 'string'
        ? data.content.replace(/\s+/g, ' ').trim().slice(0, 56)
        : ''
    emitActivity(snippet ? `result · ${snippet}${data.content?.length > 56 ? '…' : ''}` : 'result · ok')
  }
  const onThinking = (e: MessageEvent) => {
    let data: any = {}
    try { data = JSON.parse(e.data || '{}') } catch {}
    const t = typeof data.text === 'string' ? data.text.replace(/\s+/g, ' ').trim() : ''
    if (t.length >= 12) emitActivity(`thinking · ${t.slice(0, 48)}${t.length > 48 ? '…' : ''}`)
  }
  es.addEventListener('status', onNamed('status') as EventListener)
  es.addEventListener('build-gate', onNamed('build-gate') as EventListener)
  es.addEventListener('tool', onTool as EventListener)
  es.addEventListener('tool_result', onToolResult as EventListener)
  es.addEventListener('thinking', onThinking as EventListener)
  es.onerror = () => { /* keep the connection; bridge restarts replay history */ }
}

class AgentationErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(err: Error) {
    console.warn('[AgentationV2] Error boundary caught:', err.message)
  }
  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

function formatScaffoldedPrompt(body: any, pageUrl: string): string {
  const annotations = Array.isArray(body.annotations) ? body.annotations : []
  const rawComment =
    body.comment ||
    annotations.map((a: any) => a?.comment || '').filter(Boolean).join('\n---\n') ||
    ''
  const ccPrefix = /^cc:\s*([^\n]+)\n([\s\S]*)$/.exec(rawComment)
  const parsedPrompt = ccPrefix ? ccPrefix[2].trim() : rawComment.trim()
  const elementLines = annotations
    .map(
      (a: any) =>
        `- ${a.element || '?'} @ ${a.elementPath || a.cssClasses || '?'}${
          a.boundingBox
            ? ` (${Math.round(a.boundingBox.width)}x${Math.round(a.boundingBox.height)})`
            : ''
        }`,
    )
    .join('\n')
  const fullOutput = typeof body.output === 'string' ? body.output.trim() : ''
  const sections: (string | null)[] = [
    'You are running as /agentation-cc -- the user clicked an element in their running dev app and routed the comment through the agentation-bridge. Act on the user comment using the page + annotation context below.',
    pageUrl ? `Page: ${pageUrl}` : null,
    elementLines ? `Annotation:\n${elementLines}` : null,
    fullOutput
      ? `[agentation full output -- React tree, selectors, computed styles]\n${fullOutput}`
      : null,
    `User: ${parsedPrompt || '(no comment provided)'}`,
  ]
  return sections.filter(Boolean).join('\n\n')
}

// Pending-marker tracker.
//
// Markers persist in [class*="markersLayer__"] / [class*="fixedMarkersLayer__"]
// across multiple /annotate POSTs (unless the user clears them). So snapshotting
// "all markers at POST time" would associate the same marker with every record.
//
// Instead: observe marker additions globally and accumulate them in
// `pendingMarkers`. When /annotate POSTs, drain into the record's markerEls.
// That guarantees each record owns exactly the markers placed since the last
// Send, which is exactly the agentation semantic.
let pendingMarkers: HTMLElement[] = []
let markerObserver: MutationObserver | null = null
function ensureMarkerObserver() {
  if (markerObserver || typeof window === 'undefined') return
  markerObserver = new MutationObserver((records) => {
    for (const r of records) {
      for (const node of Array.from(r.addedNodes)) {
        if (!(node instanceof HTMLElement)) continue
        if (node.hasAttribute('data-annotation-marker')) {
          pendingMarkers.push(node)
          continue
        }
        node
          .querySelectorAll('[data-annotation-marker]')
          .forEach((m) => pendingMarkers.push(m as HTMLElement))
      }
    }
  })
  markerObserver.observe(document.body, { childList: true, subtree: true })
}

// One-shot flag set by the popup Save button right before it clicks the
// native Add (submit) button. The fetch patcher reads it on the next
// /annotate POST, dispatches the record event, and short-circuits the
// network call so agentation's native collapse-to-marker still runs but
// the bridge never dispatches to Claude.
let nextSubmitIsSaveOnly = false

// One-time injection of the pulse keyframe used by the in-flight status dot.
function ensurePulseKeyframes() {
  if (typeof document === 'undefined') return
  if (document.getElementById('__agentation_pulse_kf__')) return
  const style = document.createElement('style')
  style.id = '__agentation_pulse_kf__'
  style.textContent =
    '@keyframes agentation-pulse{0%,100%{opacity:1}50%{opacity:0.35}}'
  document.head.appendChild(style)
}

// Shared between the fetch interceptor and the Send-capture fallback (below).
// capturedBridgeBase: where to POST (learned from the intercepted /annotate URL,
//   defaults to the local bridge). lastAnnotateAt: timestamp of the last real
//   /annotate POST the interceptor saw -- the fallback uses it to suppress itself
//   when the package's own Send fired normally (no double-dispatch).
let capturedBridgeBase = (typeof window !== 'undefined' && (window as any).__AGENTATION_BRIDGE__) || 'http://localhost:4747'
let lastAnnotateAt = 0

let fetchPatched = false
function installFetchPatch() {
  ensureMarkerObserver()
  ensurePulseKeyframes()
  if (fetchPatched || typeof window === 'undefined') return
  fetchPatched = true
  const orig = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url
      const method = (
        init?.method ||
        (input instanceof Request ? input.method : 'GET') ||
        'GET'
      ).toUpperCase()
      if (method === 'POST' && /\/annotate(\?|$)/.test(url)) {
        // Snapshot the save-only flag at the moment the POST is intercepted.
        // Reset module-level state immediately so a follow-up POST in the
        // same tick can't accidentally inherit it.
        const isSaveOnly = nextSubmitIsSaveOnly
        nextSubmitIsSaveOnly = false
        // Record that a real /annotate POST fired, so the Send-capture fallback
        // knows the normal path worked and suppresses its own dispatch.
        lastAnnotateAt = Date.now()
        capturedBridgeBase = url.split('/annotate')[0] || capturedBridgeBase

        let rawBody: any = init?.body
        if (rawBody == null && input instanceof Request) {
          rawBody = await input.clone().text()
        }
        let text: string | null = null
        if (typeof rawBody === 'string') text = rawBody
        else if (rawBody instanceof Blob) text = await rawBody.text()
        if (text) {
          try {
            const body = JSON.parse(text)
            const pageUrl = body.pageUrl || window.location.href
            const formatted = formatScaffoldedPrompt(body, pageUrl)
            const annList = Array.isArray(body.annotations) ? body.annotations : []
            const firstComment = (body.comment || annList[0]?.comment || '').trim()
            const label = firstComment.split('\n')[0].slice(0, 60) || '(no comment)'
            // Drain pending markers observed since the last /annotate POST --
            // these are exactly the ones the user placed for this Send.
            const markerEls = pendingMarkers.slice()
            pendingMarkers = []
            const record: AnnotationRecord = {
              id:
                body.threadId ||
                `an_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              threadId: body.threadId,
              label,
              comment: firstComment,
              formattedPrompt: formatted,
              elements: annList.map((a: any) => ({
                selector: a.elementPath || a.cssClasses || a.element || '?',
                size: a.boundingBox
                  ? `${Math.round(a.boundingBox.width)}x${Math.round(a.boundingBox.height)}`
                  : undefined,
                // Forwarded so consumers can hit-test the real annotated node.
                // `selector` above is often a human label or a class list, so
                // it is not reliably a valid CSS selector.
                // NOTE: boundingBox is present on records SEEDED from
                // localStorage but NOT on the live POST -- agentation@3.0.2
                // sends only comment/element/elementPath and the head guard
                // adds elementText/siblingIndex/siblingCount/domChain/outerHTML.
                // Consumers must not rely on bbox for live annotations.
                boundingBox: a.boundingBox,
                isFixed: !!a.isFixed,
                outerHTML: a.outerHTML,
                elementText: a.elementText,
              })),
              markerEls,
              pageUrl,
              createdAt: Date.now(),
              savedOnly: isSaveOnly,
              // Dispatched submits start as 'queued' and get live-updated via
              // the SSE subscription below; save-only ones never dispatch.
              status: isSaveOnly ? undefined : 'queued',
            }
            // A follow-up is another TURN on a thread that already has a record,
            // not a new annotation. This interceptor cannot tell the two apart --
            // both are POST /annotate -- so SPB flags its own follow-ups and we
            // skip minting a record for them. Without this the list grows a
            // duplicate row per reply, each with its own (usually whole-page)
            // shot, which reads as the earlier annotations being replaced.
            // Everything else below still runs: the inbox mirror keeps the full
            // history, and SPB drives its own SSE subscription for the turn.
            if (!body.spbFollowUp) {
              window.dispatchEvent(
                new CustomEvent('agentation-annotation-record', { detail: record }),
              )
            }
            // Live-track the dispatch so the side drawer shows working -> done
            // instead of leaving a silent multi-minute turn looking ignored.
            if (!isSaveOnly && record.threadId) {
              try { subscribeToThread(record.threadId, url.split('/annotate')[0]) } catch {}
            }
            // Mirror to the canonical inbox file via the bridge.
            // Fire-and-forget; failures don't block the popup UX.
            try {
              const bridgeBase = url.split('/annotate')[0]
              orig(`${bridgeBase}/save`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  url: pageUrl,
                  element: annList[0]?.element || annList[0]?.elementPath || '',
                  comment: firstComment,
                  savedOnly: isSaveOnly,
                  threadId: body.threadId || null,
                }),
              }).catch(() => {})
            } catch {}
          } catch {}
        }
        // Save-only path: skip the bridge POST entirely, regardless of
        // whether record-building succeeded. agentation only needs a 2xx
        // response to do its native collapse-to-marker; the bridge
        // spawning Claude is what we want to suppress.
        if (isSaveOnly) {
          return new Response('{"ok":true,"savedOnly":true}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }
    } catch {}
    return orig(input, init)
  }
}

// -- Send-capture fallback (v2.2 resilience) --------------------------------
// The agentation toolbar's own "Add"/Send handler occasionally stops firing its
// fetch -- e.g. after an HMR storm detaches its click binding, or if the
// package's own capture throws. When that happens the annotation is silently
// lost: no /annotate POST, no inbox record. This capture-phase listener
// snapshots the annotation the instant the native submit button is clicked
// (independent of the package's handler), and if no real /annotate POST fires
// within a short window, dispatches it ourselves AND mirrors it to the inbox --
// so a broken Send degrades to "dispatched by the fallback" instead of "lost".
// It reuses the same fiber-walk the Copy button uses, so the fallback payload is
// full-fidelity (element + path + styles + full URL), not a bare comment.
type SendSnapshot = {
  comment: string
  pageUrl: string
  element: string
  elementPath: string
  cssClasses: string
  boundingBox: any
  output: string
  at: number
}

function paToStr(v: any): string {
  if (v == null || v === '') return ''
  if (typeof v === 'string') return v.trim()
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? x?.name || JSON.stringify(x) : String(x))).join('\n')
  if (typeof v === 'object') return JSON.stringify(v, null, 2)
  return String(v)
}

function snapshotPopupSend(popup: HTMLElement): SendSnapshot | null {
  const comment =
    (popup.querySelector('[class*="textarea__"]') as HTMLTextAreaElement | null)?.value?.trim() || ''
  if (!comment) return null
  const pa: any = findPendingAnnotationViaFiber(popup) || {}
  const output = [
    paToStr(pa.reactComponents) && `React components:\n${paToStr(pa.reactComponents)}`,
    paToStr(pa.sourceFile) && `Source: ${paToStr(pa.sourceFile)}`,
    paToStr(pa.computedStyles) && `Computed styles:\n${paToStr(pa.computedStyles)}`,
    paToStr(pa.nearbyText) && `Nearby text: ${paToStr(pa.nearbyText)}`,
  ]
    .filter(Boolean)
    .join('\n\n')
  return {
    comment,
    pageUrl: window.location.href,
    element: pa.element || '',
    elementPath: pa.elementPath || pa.fullPath || paToStr(pa.cssClasses) || '',
    cssClasses: paToStr(pa.cssClasses),
    boundingBox: pa.boundingBox || undefined,
    output,
    at: Date.now(),
  }
}

function dispatchSendFallback(snap: SendSnapshot) {
  const base = capturedBridgeBase
  const threadId = `fallback_${snap.at}_${Math.random().toString(36).slice(2, 6)}`
  const opts = (b: any) => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(b),
  })
  // Dispatch (spawns the agent) with full-fidelity context...
  try {
    window.fetch(
      `${base}/annotate`,
      opts({
        pageUrl: snap.pageUrl,
        comment: snap.comment,
        threadId,
        annotations: [
          {
            comment: snap.comment,
            element: snap.element,
            elementPath: snap.elementPath,
            cssClasses: snap.cssClasses,
            boundingBox: snap.boundingBox,
          },
        ],
        output: snap.output,
        source: 'capture-fallback',
      }),
    ).catch(() => {})
  } catch {}
  // ...and mirror to the durable inbox so it is never lost.
  try {
    window.fetch(
      `${base}/save`,
      opts({
        url: snap.pageUrl,
        element: snap.element,
        comment: snap.comment,
        savedOnly: false,
        threadId,
        source: 'capture-fallback',
      }),
    ).catch(() => {})
  } catch {}
  try {
    console.warn('[agentation] Send did not fire natively -- dispatched via capture fallback:', snap.comment.slice(0, 60))
  } catch {}
}

let sendCaptureInstalled = false
function installSendCapture() {
  if (sendCaptureInstalled || typeof document === 'undefined') return
  // Defer to the static head guard (public/agentation-send-guard.js) when present:
  // it does the same job but is tab-agnostic and HMR-immune. Running both would
  // double-dispatch a rescued Send. This in-bundle copy is the fallback-for-the-
  // fallback -- it only engages in a tab whose index.html predates the head guard.
  if ((window as any).__agentationSendGuard) return
  sendCaptureInstalled = true
  document.addEventListener(
    'click',
    (ev) => {
      try {
        const target = ev.target as HTMLElement | null
        const submit = target?.closest?.('[class*="submit__"]') as HTMLElement | null
        if (!submit) return
        if (nextSubmitIsSaveOnly) return // save-only submits never dispatch, by design
        const popup = submit.closest('[class*="popup___"]') as HTMLElement | null
        if (!popup) return
        const snap = snapshotPopupSend(popup)
        if (!snap) return
        // Suppress the fallback iff the package's own /annotate POST fires within
        // the window (the normal, healthy case). Otherwise the package's Send
        // silently no-op'd -- dispatch + inbox-mirror it ourselves.
        const at = snap.at
        window.setTimeout(() => {
          if (lastAnnotateAt >= at) return
          dispatchSendFallback(snap)
        }, 800)
      } catch {}
    },
    true, // capture phase: runs before the package's own bubble-phase handler
  )
}

// Row-click handler: try to re-open the real agentation popup for this
// record. Preference order:
//   1. Click a stored marker element (still in DOM) -- agentation handles
//      the click and opens its popup natively.
//   2. Fallback: scroll the originally-clicked element into view and pulse
//      a temporary outline so the user can re-place the annotation.
function clickMarker(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  const center = {
    clientX: r.left + r.width / 2,
    clientY: r.top + r.height / 2,
  }
  const opts = {
    bubbles: true,
    cancelable: true,
    view: window,
    button: 0,
    ...center,
  } as MouseEventInit
  el.dispatchEvent(new MouseEvent('mousedown', opts))
  el.dispatchEvent(new MouseEvent('mouseup', opts))
  el.dispatchEvent(new MouseEvent('click', opts))
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function focusAnnotation(record: AnnotationRecord): 'marker' | 'fallback' | 'none' {
  for (const el of record.markerEls) {
    if (document.contains(el)) {
      clickMarker(el)
      return 'marker'
    }
  }
  // Seeded (from localStorage) -- no live markerEls. agentation renders
  // markers in the order they're stored in localStorage; use seedIndex to
  // pick the right one.
  const seed = (record as any).seedIndex as number | undefined
  if (typeof seed === 'number') {
    const all = Array.from(document.querySelectorAll('[data-annotation-marker="true"]')) as HTMLElement[]
    // Filter to placement markers (not section/ghost variants) by climbing
    // closest [class*="placement"] or by element shape -- simplest: index
    // directly since placement markers dominate the list.
    if (all[seed]) {
      clickMarker(all[seed])
      return 'marker'
    }
  }
  const sel = record.elements[0]?.selector
  if (sel) {
    try {
      const target = document.querySelector(sel) as HTMLElement | null
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        const prev = target.style.outline
        const prevOffset = target.style.outlineOffset
        target.style.outline = '2px solid #3b82f6'
        target.style.outlineOffset = '2px'
        setTimeout(() => {
          target.style.outline = prev
          target.style.outlineOffset = prevOffset
        }, 1500)
        return 'fallback'
      }
    } catch {}
  }
  return 'none'
}

// Build a record from a persisted agentation annotation (localStorage).
// agentation stores under key `feedback-annotations-${location.pathname}`.
// Each item has id/x/y/comment/element/elementPath/timestamp/... We
// resurrect enough of AnnotationRecord shape for nav-row + SideDrawer to
// render and to call focusAnnotation. seedIndex points the resolver at the
// i-th [data-annotation-marker] in the DOM (markers render in array order).
function seededRecordFromStored(stored: any, seedIndex: number): AnnotationRecord & { seedIndex: number } {
  return {
    id: String(stored.id ?? `seed_${seedIndex}_${Date.now()}`),
    label: String(stored.element ?? '(no label)'),
    comment: String(stored.comment ?? ''),
    formattedPrompt: '',
    elements: [{
      selector: String(stored.elementPath ?? stored.cssClasses ?? '?'),
      size: stored.boundingBox
        ? `${Math.round(stored.boundingBox.width)}x${Math.round(stored.boundingBox.height)}`
        : undefined,
      // Needed for focus-time re-capture: a seeded record has no live
      // markerEls, so the persisted bbox is the only reliable way back to
      // the annotated node.
      boundingBox: stored.boundingBox,
      isFixed: !!stored.isFixed,
    }],
    markerEls: [], // resolved at focus-time via seedIndex
    pageUrl: typeof window !== 'undefined' ? window.location.href : '',
    createdAt: Number(stored.timestamp ?? Date.now()),
    savedOnly: true,
    seedIndex,
  } as AnnotationRecord & { seedIndex: number }
}

export function readPersistedRecords(): Array<AnnotationRecord & { seedIndex: number }> {
  if (typeof window === 'undefined') return []
  try {
    const key = `feedback-annotations-${window.location.pathname}`
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.map((a, i) => seededRecordFromStored(a, i))
  } catch {
    return []
  }
}

function useAnnotationHistory(): AnnotationRecord[] {
  const [records, setRecords] = useState<AnnotationRecord[]>(() => readPersistedRecords())
  useEffect(() => {
    installFetchPatch()
    installSendCapture()
    const handler = (e: Event) => {
      const r = (e as CustomEvent<AnnotationRecord>).detail
      setRecords((prev) => {
        // Replace seeded record with same id if it now has a real markerEls
        // (i.e., a fresh /annotate fired for an existing seeded annotation).
        const existing = prev.findIndex((p) => p.id === r.id)
        if (existing >= 0) {
          const next = prev.slice()
          next[existing] = r
          return next
        }
        return [r, ...prev]
      })
    }
    window.addEventListener('agentation-annotation-record', handler)
    // Live dispatch-status updates from the bridge SSE (see subscribeToThread).
    const statusHandler = (e: Event) => {
      const { id, status, activity } = (e as CustomEvent<{
        id: string
        status: AnnotationRecord['status']
        activity?: string | null
      }>).detail
      setRecords((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p
          const next: AnnotationRecord = { ...p, status }
          if (activity === null) next.activity = undefined
          else if (typeof activity === 'string') next.activity = activity
          return next
        }),
      )
    }
    window.addEventListener('agentation-annotation-status', statusHandler)
    // Live tool/process lines (grep, read, edit…) while status stays "working".
    const activityHandler = (e: Event) => {
      const { id, activity } = (e as CustomEvent<{ id: string; activity: string }>).detail
      if (!activity) return
      setRecords((prev) =>
        prev.map((p) => (p.id === id ? { ...p, activity, status: p.status || 'working' } : p)),
      )
    }
    window.addEventListener('agentation-annotation-activity', activityHandler)
    // Re-seed if agentation rewrites the localStorage (Send/Delete/Clear),
    // including the SAME tab (so listen to a custom poll AND 'storage').
    const reseed = () => setRecords((prev) => {
      const persisted = readPersistedRecords()
      const persistedIds = new Set(persisted.map((p) => p.id))
      // Carry the in-session live status + activity across reseeds --
      // readPersistedRecords has neither field.
      const liveById = new Map(prev.map((p) => [p.id, { status: p.status, activity: p.activity }]))
      const merged = persisted.map((p) => {
        const live = liveById.get(p.id)
        return live ? { ...p, status: live.status, activity: live.activity } : p
      })
      // Keep any prev records that aren't in localStorage (in-session fresh
      // ones from /annotate that haven't been persisted yet).
      const survivors = prev.filter((p) => !persistedIds.has(p.id))
      return [...survivors, ...merged]
    })
    window.addEventListener('storage', reseed)
    const id = window.setInterval(reseed, 1000)
    return () => {
      window.removeEventListener('agentation-annotation-record', handler)
      window.removeEventListener('agentation-annotation-status', statusHandler)
      window.removeEventListener('agentation-annotation-activity', activityHandler)
      window.removeEventListener('storage', reseed)
      window.clearInterval(id)
    }
  }, [])
  return records
}

function useInjectListButton({
  open,
  count,
  onToggle,
}: {
  open: boolean
  count: number
  onToggle: () => void
}) {
  useEffect(() => {
    const INJECT_ID = '__agentation_v2_list_btn__'
    let cancelled = false

    const tryInject = (attempt = 0) => {
      if (cancelled) return
      if (document.getElementById(INJECT_ID)) return
      const toolbar = document.querySelector(
        '[data-agentation-toolbar="true"]',
      ) as HTMLElement | null
      const controls = toolbar?.querySelector(
        '[class*="controlsContent__"]',
      ) as HTMLElement | null
      const sampleWrapper = controls?.querySelector(
        '[class*="buttonWrapper__"]',
      ) as HTMLElement | null
      const sampleBtn = sampleWrapper?.querySelector(
        '[class*="controlButton__"]',
      ) as HTMLElement | null
      const sampleTip = sampleWrapper?.querySelector(
        '[class*="buttonTooltip__"]',
      ) as HTMLElement | null
      const dividers = controls?.querySelectorAll('[class*="divider__"]')
      if (!controls || !sampleWrapper || !sampleBtn || !sampleTip) {
        if (attempt < 12) setTimeout(() => tryInject(attempt + 1), 250)
        return
      }
      const wrapper = document.createElement('div')
      wrapper.id = INJECT_ID
      wrapper.className = sampleWrapper.className
      const btn = document.createElement('button')
      btn.className = sampleBtn.className
      btn.type = 'button'
      btn.title = `Annotations (${count})`
      btn.dataset.active = open ? 'true' : 'false'
      btn.style.position = 'relative'
      btn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3.5" y="4.5" width="17" height="4" rx="1" stroke="currentColor" stroke-width="1.5"/>
          <rect x="3.5" y="10.5" width="17" height="4" rx="1" stroke="currentColor" stroke-width="1.5"/>
          <rect x="3.5" y="16.5" width="11" height="4" rx="1" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        ${count > 0 ? `<span style="position:absolute;top:-2px;right:-2px;min-width:14px;height:14px;padding:0 4px;border-radius:7px;background:#3b82f6;color:#fff;font-size:9px;font-weight:600;display:flex;align-items:center;justify-content:center;line-height:1">${count}</span>` : ''}
      `
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle()
      })
      const tip = document.createElement('span')
      tip.className = sampleTip.className
      tip.textContent = 'Annotations'
      wrapper.appendChild(btn)
      wrapper.appendChild(tip)
      const lastDivider = dividers && dividers.length ? dividers[dividers.length - 1] : null
      if (lastDivider) controls.insertBefore(wrapper, lastDivider)
      else controls.appendChild(wrapper)
    }

    tryInject()

    return () => {
      cancelled = true
      document.getElementById(INJECT_ID)?.remove()
    }
  }, [open, count, onToggle])
}

const dotStyle = (
  c: 'amber' | 'blue' | 'green' | 'slate' | 'red',
): React.CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  background:
    c === 'amber' ? '#f59e0b'
      : c === 'blue' ? '#3b82f6'
      : c === 'green' ? '#10b981'
      : c === 'red' ? '#ef4444'
      : '#94a3b8',
  flexShrink: 0,
})

// Coarse dispatch status -> dot colour + short label for the side-drawer row.
// Returns null for records with no live status (e.g. save-only) so the row
// falls back to its legacy blue/amber threadId dot.
function statusView(
  r: AnnotationRecord,
): { color: 'amber' | 'blue' | 'green' | 'red' | 'slate'; label: string } | null {
  switch (r.status) {
    case 'queued': return { color: 'amber', label: 'queued' }
    case 'working': return { color: 'blue', label: 'working…' }
    case 'gate': return { color: 'blue', label: 'type-check' }
    case 'done': return { color: 'green', label: 'done' }
    case 'error': return { color: 'red', label: 'error' }
    case 'cancelled': return { color: 'slate', label: 'cancelled' }
    default: return null
  }
}

// -- Native-popup Copy button injection --------------------------------------
// Inject a Copy button INTO the native agentation popup's actions row.
// Walks the React fiber up from the popup DOM to find agentation's parent
// component state, reads `pendingAnnotation`, formats the rich output the
// bridge would receive on Send (element, elementPath, reactComponents,
// sourceFile, computedStyles, etc).

const POPUP_COPY_BTN_ID = '__agentation_cc_copy__'

// React fiber traversal: find the closest ancestor function-component fiber
// whose hooks state contains a `pendingAnnotation` shape.
function findPendingAnnotationViaFiber(popupEl: HTMLElement): any | null {
  const fiberKey = Object.keys(popupEl).find((k) => k.startsWith('__reactFiber$'))
  if (!fiberKey) return null
  let fiber: any = (popupEl as any)[fiberKey]
  let depth = 0
  while (fiber && depth < 40) {
    // function components hold useState values in memoizedState linked list
    let hook = fiber.memoizedState
    let hookIdx = 0
    while (hook && hookIdx < 100) {
      const v = hook.memoizedState
      if (
        v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        !(v instanceof HTMLElement) &&
        'element' in v &&
        ('elementPath' in v || 'boundingBox' in v || 'computedStyles' in v)
      ) {
        return v
      }
      hook = hook.next
      hookIdx++
    }
    fiber = fiber.return
    depth++
  }
  return null
}

function formatPendingAnnotation(pa: any, popup: HTMLElement, pageUrl: string): string {
  const commentValue =
    (popup.querySelector('[class*="textarea__"]') as HTMLTextAreaElement | null)?.value?.trim() ||
    ''

  const element = pa.element || '(unknown element)'
  const elementPath = pa.elementPath || pa.fullPath || ''
  const bb = pa.boundingBox
    ? `${Math.round(pa.boundingBox.width)}x${Math.round(pa.boundingBox.height)}`
    : null

  // Agentation v3.0.2 stores these as STRINGS already-formatted, not objects.
  const stringify = (v: any): string | null => {
    if (v == null || v === '') return null
    if (typeof v === 'string') return v.trim() || null
    if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? x.name || JSON.stringify(x) : String(x))).join('\n')
    if (typeof v === 'object') return JSON.stringify(v, null, 2)
    return String(v)
  }

  const reactComponents = stringify(pa.reactComponents)
  const sourceFile = stringify(pa.sourceFile)
  const computedStyles = stringify(pa.computedStyles)
  const nearbyText = stringify(pa.nearbyText)
  const nearbyElements = stringify(pa.nearbyElements)
  const cssClasses = stringify(pa.cssClasses)
  const fullPath = stringify(pa.fullPath)
  const accessibility = stringify(pa.accessibility)
  const selectedText = pa.selectedText || ''

  const sections: (string | null)[] = [
    'You are running as /agentation-cc -- the user clicked an element in their dev app. Act on the comment using the rich element context below.',
    `Page: ${pageUrl}`,
    `Element: ${element}${bb ? ` (${bb})` : ''}`,
    elementPath ? `Element path: ${elementPath}` : null,
    fullPath ? `Full path: ${fullPath}` : null,
    cssClasses ? `CSS classes: ${cssClasses}` : null,
    sourceFile ? `Source: ${sourceFile}` : null,
    reactComponents ? `React components:\n${reactComponents}` : null,
    computedStyles ? `Computed styles:\n${computedStyles}` : null,
    accessibility ? `Accessibility: ${accessibility}` : null,
    selectedText ? `Selected text: "${selectedText}"` : null,
    nearbyText ? `Nearby text: ${nearbyText}` : null,
    nearbyElements ? `Nearby elements:\n${nearbyElements}` : null,
    // Copy is normally pressed with an EMPTY textarea -- the user grabs the
    // element context first, pastes it into CC, and types the real instruction
    // around the paste. The old placeholder ("no comment yet") sat at the end of
    // the block and read as an assertion that no instruction exists, so the agent
    // treated the user's actual sentence as garbled and asked them to repeat it
    // (observed 2026-07-28). Point at the surrounding message instead.
    commentValue
      ? `User: ${commentValue}`
      : `NO COMMENT WAS TYPED IN THE POPUP. Everything above is CONTEXT ONLY -- it is not the instruction and it is not a prompt for you to answer. The user's actual instruction is in the chat message that accompanies this block, usually on the line(s) immediately BEFORE or AFTER it. Read it there and act on it. Do NOT reply that the instruction is missing or garbled.`,
  ]
  return sections.filter(Boolean).join('\n\n')
}

function buildContextForCopy(popup: HTMLElement): string {
  const pageUrl = window.location.href
  const pa = findPendingAnnotationViaFiber(popup)
  if (pa) {
    return formatPendingAnnotation(pa, popup, pageUrl)
  }
  // Fallback: popup DOM scrape if fiber walk fails (agentation refactor / version skew)
  const elementText =
    popup.querySelector('[class*="element__"]')?.textContent?.trim() || '(unknown element)'
  const selectedText =
    popup.querySelector('[class*="quote__"]')?.textContent?.trim() || ''
  const commentValue =
    (popup.querySelector('[class*="textarea__"]') as HTMLTextAreaElement | null)?.value?.trim() ||
    ''
  return [
    'You are running as /agentation-cc.',
    `Page: ${pageUrl}`,
    `Element: ${elementText}`,
    selectedText ? `Selected text: "${selectedText}"` : null,
    commentValue
      ? `User: ${commentValue}`
      : `NO COMMENT WAS TYPED IN THE POPUP. The above is CONTEXT ONLY -- the user's instruction is in the surrounding chat message, before or after this block. Act on that; do not report it missing.`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

function injectCopyButtonIntoPopup(popup: HTMLElement): boolean {
  const actions = popup.querySelector('[class*="actions__"]') as HTMLDivElement | null
  if (!actions) return false
  if (actions.querySelector(`#${POPUP_COPY_BTN_ID}`)) return true
  const cancelBtn = actions.querySelector('[class*="cancel__"]') as HTMLButtonElement | null
  if (!cancelBtn) return false
  const btn = document.createElement('button')
  btn.id = POPUP_COPY_BTN_ID
  btn.type = 'button'
  btn.className = cancelBtn.className
  btn.textContent = 'Copy'
  btn.title = 'Copy rich component context to clipboard (for CC terminal)'
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const context = buildContextForCopy(popup)
    navigator.clipboard.writeText(context).then(() => {
      btn.textContent = 'Copied'
      setTimeout(() => {
        btn.textContent = 'Copy'
      }, 1200)
    })
  })
  actions.insertBefore(btn, actions.firstChild)
  return true
}

// -- Save-only button injection (no AI dispatch) ----------------------------
// Mirrors Copy: same DOM-injection pattern, but on click it (a) builds the
// same AnnotationRecord shape the fetch-patcher emits, (b) dispatches it
// with savedOnly:true so SideDrawer captures it, (c) clicks the popup's
// Cancel button to dismiss. The /annotate POST never fires, so the bridge
// never dispatches to the AI.

const POPUP_SAVE_BTN_ID = '__agentation_cc_save__'

function injectSaveButtonIntoPopup(popup: HTMLElement): boolean {
  const actions = popup.querySelector('[class*="actions__"]') as HTMLDivElement | null
  if (!actions) return false
  if (actions.querySelector(`#${POPUP_SAVE_BTN_ID}`)) return true
  const cancelBtn = actions.querySelector('[class*="cancel__"]') as HTMLButtonElement | null
  const submitBtn = actions.querySelector('[class*="submit__"]') as HTMLButtonElement | null
  if (!cancelBtn || !submitBtn) return false
  const btn = document.createElement('button')
  btn.id = POPUP_SAVE_BTN_ID
  btn.type = 'button'
  btn.className = cancelBtn.className
  btn.textContent = 'Save'
  btn.title = 'Save annotation as a marker (no AI dispatch)'
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    // Flag the next /annotate POST as save-only, then trigger the native
    // Add submit. agentation handles popup-close + marker-collapse itself;
    // the fetch patcher swallows the bridge POST and dispatches the record
    // event with savedOnly:true.
    nextSubmitIsSaveOnly = true
    submitBtn.click()
  })
  // Place Save next to Copy at the leading edge of the actions row.
  const copyBtn = actions.querySelector(`#${POPUP_COPY_BTN_ID}`)
  if (copyBtn && copyBtn.nextSibling) {
    actions.insertBefore(btn, copyBtn.nextSibling)
  } else {
    actions.insertBefore(btn, actions.firstChild)
  }
  return true
}

// -- Prev/Next nav row injection (v2.2) ------------------------------------
// Injects a header-strip with Prev '<', counter 'i/N', Next '>' at the top of
// the popup. Records are read from window.__agentation_records (synced by the
// AgentationDevtoolsV2_2 component on every render). "Current" record matched
// by popup element text against record.label; on no match, treat as index 0.

const POPUP_NAV_ROW_ID = '__agentation_cc_nav__'

// The injected Copy/Save buttons inherit the native cancel button's
// className for visual parity, which means `[class*="cancel___"]` matches
// all three. Disambiguate by text ("Close"/"Cancel") and by being the
// LAST .cancel___ in the actions row (native cancel sits trailing-edge).
function findNativeCancel(popup: HTMLElement): HTMLButtonElement | null {
  const actions = popup.querySelector('[class*="actions___"]') as HTMLElement | null
  if (!actions) return null
  const candidates = Array.from(
    actions.querySelectorAll('[class*="cancel___"]'),
  ) as HTMLButtonElement[]
  const byText = candidates.find((b) => /^(Close|Cancel)$/.test((b.textContent || '').trim()))
  return byText ?? candidates[candidates.length - 1] ?? null
}

function injectNavRowIntoPopup(popup: HTMLElement): boolean {
  if (popup.querySelector(`#${POPUP_NAV_ROW_ID}`)) {
    // Re-render counters/disabled state in case records changed
    renderNavRowState(popup)
    return true
  }
  const header = popup.querySelector('[class*="header___"]') as HTMLElement | null
  if (!header) return false
  const row = document.createElement('div')
  row.id = POPUP_NAV_ROW_ID
  row.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 0 6px;margin-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.08);font-size:11px;'
  const mkBtn = (label: string, dir: -1 | 1) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.dataset.dir = String(dir)
    b.textContent = label
    b.style.cssText =
      'background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;border-radius:6px;padding:2px 10px;font-size:12px;cursor:pointer;line-height:1.4;'
    b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation()
      const { records, idx } = getNavState(popup)
      if (records.length === 0) return
      const next = idx + dir
      if (next < 0 || next >= records.length) return
      const target = records[next]
      // agentation's handleCancel triggers a 150ms exit animation before
      // dismissing the popup. Firing the next marker click during that
      // window leaves agentation's "active annotation" stale, so the new
      // popup renders with the *previous* annotation's content. Wait long
      // enough for the cancel transition to fully resolve before
      // re-triggering popup open on the target marker.
      findNativeCancel(popup)?.click()
      setTimeout(() => focusAnnotation(target), 220)
    })
    return b
  }
  const prev = mkBtn('<  Prev', -1)
  prev.dataset.role = 'prev'
  const next = mkBtn('Next  >', 1)
  next.dataset.role = 'next'
  const counter = document.createElement('span')
  counter.dataset.role = 'counter'
  counter.style.cssText = 'color:rgba(255,255,255,0.7);font-variant-numeric:tabular-nums;'
  row.append(prev, counter, next)
  header.parentElement?.insertBefore(row, header)
  renderNavRowState(popup)
  return true
}

function getNavState(popup: HTMLElement): { records: any[]; idx: number } {
  const w = typeof window !== 'undefined' ? (window as any) : null
  const records: any[] = w?.__agentation_records || []
  const elText =
    popup.querySelector('[class*="element___"]')?.textContent?.trim() || ''
  // Records get stored newest-first via the dispatch handler. Reverse for nav
  // so Prev/Next read chronologically (oldest first feels right for review).
  const ordered = [...records].reverse()
  // Resolve current popup -> record by exact label match (agentation puts the
  // same string in the popup element span AND in stored.element/r.label).
  // Fall back to a substring match if the popup is a slightly different
  // shape from when the annotation was saved.
  let idx = ordered.findIndex((r) => r?.label && r.label === elText)
  if (idx < 0) {
    idx = ordered.findIndex(
      (r) => r?.label && elText && (
        elText.includes(String(r.label)) || String(r.label).includes(elText)
      ),
    )
  }
  return { records: ordered, idx: idx < 0 ? 0 : idx }
}

// Guarded writes: only mutate when value actually changes. Without this the
// MutationObserver re-fires injectNavRowIntoPopup, which calls renderNavRowState
// again, which mutates again -> infinite render loop. Caught in v2.2 cycle 2.
function setIfDiff(el: HTMLElement | null, prop: 'textContent', val: string): void
function setIfDiff(el: HTMLElement | null, prop: 'opacity' | 'cursor', val: string): void
function setIfDiff(el: HTMLElement | null, prop: string, val: string) {
  if (!el) return
  if (prop === 'textContent') {
    if (el.textContent !== val) el.textContent = val
  } else {
    const s = (el as HTMLElement).style as any
    if (s[prop] !== val) s[prop] = val
  }
}

function renderNavRowState(popup: HTMLElement) {
  const row = popup.querySelector(`#${POPUP_NAV_ROW_ID}`) as HTMLElement | null
  if (!row) return
  const { records, idx } = getNavState(popup)
  const prev = row.querySelector('[data-role="prev"]') as HTMLButtonElement | null
  const next = row.querySelector('[data-role="next"]') as HTMLButtonElement | null
  const counter = row.querySelector('[data-role="counter"]') as HTMLElement | null
  setIfDiff(counter, 'textContent', records.length === 0 ? '0 / 0' : `${idx + 1} / ${records.length}`)
  if (prev) {
    const disabled = records.length === 0 || idx <= 0
    if (prev.disabled !== disabled) prev.disabled = disabled
    setIfDiff(prev, 'opacity', disabled ? '0.4' : '1')
    setIfDiff(prev, 'cursor', disabled ? 'not-allowed' : 'pointer')
  }
  if (next) {
    const disabled = records.length === 0 || idx >= records.length - 1
    if (next.disabled !== disabled) next.disabled = disabled
    setIfDiff(next, 'opacity', disabled ? '0.4' : '1')
    setIfDiff(next, 'cursor', disabled ? 'not-allowed' : 'pointer')
  }
}

let popupObserverStarted = false
function startPopupCopyObserver() {
  if (popupObserverStarted || typeof window === 'undefined') return
  popupObserverStarted = true
  const tryInjectAll = () => {
    document.querySelectorAll('[class*="popup___"]').forEach((p) => {
      injectCopyButtonIntoPopup(p as HTMLElement)
      injectSaveButtonIntoPopup(p as HTMLElement)
      // injectNavRowIntoPopup intentionally NOT called from the observer.
      // Instead, the AgentationDevtoolsV2_2 component calls it imperatively
      // on every records-state change (see useEffect below). The observer
      // re-firing on our own DOM mutations was a v2.2-cycle-2 hang root cause.
    })
  }
  tryInjectAll()
  new MutationObserver(tryInjectAll).observe(document.body, {
    childList: true,
    subtree: true,
  })
}

function timeAgo(ms: number): string {
  const diff = Math.max(0, Date.now() - ms) / 1000
  if (diff < 60) return `${Math.round(diff)}s ago`
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return `${Math.round(diff / 86400)}d ago`
}

function SideDrawer({
  records,
  active,
  setActive,
  onClose,
}: {
  records: AnnotationRecord[]
  active: string | null
  setActive: (id: string) => void
  onClose: () => void
}) {
  const activeRecord = records.find((r) => r.id === active) || null
  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        height: '100vh',
        width: 340,
        background: 'white',
        borderLeft: '1px solid #e2e8f0',
        boxShadow: '-10px 0 30px rgba(15,23,42,0.08)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 2147483646,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#0f172a',
      }}
      data-agentation-v2-drawer="true"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={dotStyle('blue')} />
          <strong style={{ fontSize: 13 }}>Annotations</strong>
          <span style={{ fontSize: 11, color: '#64748b' }}>{records.length}</span>
        </div>
        <button
          onClick={onClose}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            color: '#64748b',
          }}
        >
          ×
        </button>
      </div>
      <div style={{ borderTop: '1px solid #e2e8f0' }} />
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 10px' }}>
        {records.length === 0 ? (
          <div
            style={{
              padding: '32px 8px',
              textAlign: 'center',
              color: '#64748b',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            No annotations yet. Click any element with the Agentation tool to
            create one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {records.map((r) => {
              const isActive = r.id === active
              return (
                <button
                  key={r.id}
                  onClick={() => {
                    setActive(r.id)
                    focusAnnotation(r)
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: isActive ? '#a5b4fc' : '#e2e8f0',
                    background: isActive ? '#eef2ff' : 'white',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 2,
                    }}
                  >
                    {(() => {
                      const sv = statusView(r)
                      const pulsing = r.status === 'working' || r.status === 'gate' || r.status === 'queued'
                      return (
                        <span
                          style={{
                            ...dotStyle(sv ? sv.color : r.threadId ? 'blue' : 'amber'),
                            ...(pulsing ? { animation: 'agentation-pulse 1.1s ease-in-out infinite' } : {}),
                          }}
                        />
                      )
                    })()}
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        flex: 1,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {r.label}
                    </span>
                    {statusView(r) && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: 0.3,
                          padding: '1px 5px',
                          borderRadius: 4,
                          color: statusView(r)!.color === 'green' ? '#047857'
                            : statusView(r)!.color === 'red' ? '#b91c1c'
                            : statusView(r)!.color === 'slate' ? '#475569' : '#1d4ed8',
                          background: statusView(r)!.color === 'green' ? '#d1fae5'
                            : statusView(r)!.color === 'red' ? '#fee2e2'
                            : statusView(r)!.color === 'slate' ? '#e2e8f0' : '#dbeafe',
                        }}
                      >
                        {statusView(r)!.label}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>
                      {timeAgo(r.createdAt)}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      fontFamily: 'ui-monospace, Menlo, monospace',
                      color: '#475569',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {r.elements[0]?.selector || r.pageUrl}
                  </div>
                  {r.activity && (r.status === 'working' || r.status === 'gate' || r.status === 'queued') && (
                    <div
                      title={r.activity}
                      style={{
                        marginTop: 3,
                        fontSize: 10,
                        fontFamily: 'ui-monospace, Menlo, monospace',
                        color: '#1d4ed8',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {r.activity}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
      {activeRecord && (
        <div style={{ borderTop: '1px solid #e2e8f0', padding: '10px 12px' }}>
          <div
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              color: '#94a3b8',
              marginBottom: 6,
            }}
          >
            Selected
          </div>
          <div
            style={{
              fontFamily: 'ui-monospace, Menlo, monospace',
              fontSize: 11,
              color: '#4338ca',
              marginBottom: 6,
              wordBreak: 'break-all',
            }}
          >
            {activeRecord.elements.map((el, i) => (
              <div key={i}>
                {el.selector}
                {el.size ? ` (${el.size})` : ''}
              </div>
            ))}
          </div>
          {activeRecord.comment && (
            <div
              style={{
                fontSize: 12,
                color: '#1e293b',
                lineHeight: 1.5,
                marginBottom: 8,
                whiteSpace: 'pre-wrap',
              }}
            >
              {activeRecord.comment}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() =>
                navigator.clipboard.writeText(activeRecord.formattedPrompt)
              }
              style={{
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 4,
                border: 'none',
                background: '#3b82f6',
                color: 'white',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Copy prompt
            </button>
            <a
              href={activeRecord.pageUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 4,
                background: 'white',
                color: '#475569',
                border: '1px solid #cbd5e1',
                cursor: 'pointer',
                textDecoration: 'none',
                fontFamily: 'inherit',
              }}
            >
              Open page
            </a>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}

export function AgentationDevtoolsV2_2() {
  if (!import.meta.env.DEV) return null
  const records = useAnnotationHistory()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    if (active === null && records.length > 0) setActive(records[0].id)
  }, [active, records])
  useEffect(() => {
    startPopupCopyObserver()
  }, [])
  // Sync records to module/window scope so the popup nav-row injector
  // (DOM-side, outside React) can read them on demand. Also inject the nav
  // row + refresh its counters here -- driving from React state (instead of
  // the MutationObserver) breaks the popup-observer-mutation feedback loop.
  useEffect(() => {
    ;(window as any).__agentation_records = records
    document.querySelectorAll('[class*="popup___"]').forEach((p) => {
      injectNavRowIntoPopup(p as HTMLElement)
      renderNavRowState(p as HTMLElement)
    })
  }, [records])
  // Initial-mount: if a popup is already open (no records yet) inject too.
  useEffect(() => {
    const id = window.setInterval(() => {
      document.querySelectorAll('[class*="popup___"]').forEach((p) => {
        injectNavRowIntoPopup(p as HTMLElement)
      })
    }, 250)
    return () => window.clearInterval(id)
  }, [])
  useInjectListButton({
    open,
    count: records.length,
    onToggle: () => setOpen((v) => !v),
  })
  return (
    <AgentationErrorBoundary>
      <Agentation />
      {open && (
        <SideDrawer
          records={records}
          active={active}
          setActive={setActive}
          onClose={() => setOpen(false)}
        />
      )}
    </AgentationErrorBoundary>
  )
}
