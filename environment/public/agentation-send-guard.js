// agentation-send-guard.js -- tab-agnostic Send resilience for the agentation toolbar.
//
// Loaded as a classic <script> in index.html <head>, so it runs on EVERY page load
// (any route, any tab) BEFORE the app bundle, and -- crucially -- it is NOT a hot
// module, so a Vite HMR storm can never detach it (that was the failure mode where
// the toolbar's own Send handler got torn down and annotations vanished silently).
//
// What it does: watches for the popup Send/Add click. If the toolbar's own
// /annotate POST does not fire within a short window (its handler is dead), this
// guard snapshots the annotation -- full context via the same React-fiber walk the
// Copy button uses -- and dispatches it to the bridge itself + mirrors it to the
// inbox. A broken Send degrades to "dispatched by the guard", never "lost".
//
// It sets window.__agentationSendGuard so the in-bundle devtools fallback defers to
// it (no double-dispatch). Self-contained: its own fetch-patch observes /annotate,
// so it needs nothing from the app bundle and works even against stale devtools code.
(function () {
  if (typeof window === 'undefined' || window.__agentationSendGuard) return
  window.__agentationSendGuard = true

  var BRIDGE = (typeof window !== 'undefined' && window.__AGENTATION_BRIDGE__) || 'http://localhost:4747'
  var lastAnnotateAt = 0

  // -- Clicked-target capture (2026-07-28) ----------------------------------
  // The rich fiber context below only ever shipped on the FALLBACK path (guard
  // dispatches because native Send died). When the toolbar's own Send works --
  // the normal case -- the package posts element + comment and nothing else, so
  // the agent gets one line like "<Lab> <Shell> span" and cannot tell WHICH of
  // three sibling <li> bullets was clicked. Verified 2026-07-28: 0 of 38 turn
  // logs carried an [agentation full output] block.
  //
  // Fix: remember the DOM node the user actually clicked (capture phase, before
  // agentation's own handler), and enrich EVERY /annotate POST with its text,
  // its position among same-tag siblings, and its markup. Text content is the
  // field that disambiguates siblings; nothing else in the payload can.
  var LAST_TARGET = null

  // Agentation's own DOM must never be mistaken for app content. This is wider
  // than popup/toolbar: the ANNOTATION PINS are the dangerous ones. The marker
  // layer is `pointer-events: none` but every pin inside it is `pointer-events:
  // auto` at z-index 99998, so a 22px pin left over from an earlier annotation
  // sits ON TOP of the app and swallows the next click in that spot. The user
  // aims at a phone frame, hits the pin, and the annotation describes a devtools
  // glyph instead of their component (observed 2026-07-28). Match the marker /
  // highlight / tooltip modules too, or the capture below records the pin.
  var AGENTATION_CHROME = /popup___|toolbar___|marker___|markers?Layer___|fixedMarkersLayer___|markerTooltip___|markerNote___|markerQuote___|hoverHighlight|hoverTooltip|controlsContent___|agentation/i
  function isAgentationChrome(el) {
    try {
      for (var n = el; n; n = n.parentElement) {
        var c = typeof n.className === 'string' ? n.className : (n.className && n.className.baseVal) || ''
        if (AGENTATION_CHROME.test(c) || (n.id && /agentation/i.test(n.id))) return true
      }
    } catch (e) {}
    return false
  }

  function describeTarget(el) {
    try {
      var text = (el.textContent || '').replace(/\s+/g, ' ').trim()
      var parent = el.parentElement
      var sibs = parent ? Array.prototype.filter.call(parent.children, function (c) { return c.tagName === el.tagName }) : []
      var idx = sibs.indexOf(el)
      var chain = []
      for (var n = el; n && chain.length < 5; n = n.parentElement) {
        var cls = typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\s+/).slice(0, 3).join('.') : ''
        chain.unshift(n.tagName.toLowerCase() + cls)
      }
      return {
        elementText: text.slice(0, 400),
        elementTag: el.tagName.toLowerCase(),
        siblingIndex: idx >= 0 ? idx + 1 : null,
        siblingCount: sibs.length || null,
        siblingTexts: sibs.slice(0, 8).map(function (s) { return (s.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) }),
        ariaLabel: el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title') || ''),
        domChain: chain.join(' > '),
        outerHTML: (el.outerHTML || '').slice(0, 600),
      }
    } catch (e) { return null }
  }

  document.addEventListener('click', function (ev) {
    try {
      var t = ev.target
      if (!t || !t.tagName || isAgentationChrome(t)) return
      LAST_TARGET = describeTarget(t)
    } catch (e) {}
  }, true)

  // Patch fetch early: record every real /annotate POST so the capture listener
  // can suppress itself when the native Send worked. Learn the bridge base too.
  // ALSO enrich the outgoing body with the clicked-target descriptor + the
  // fiber-derived context, so the normal Send path is as detailed as the guard's.
  var origFetch = window.fetch.bind(window)
  window.fetch = function (input, init) {
    try {
      var url = typeof input === 'string' ? input : input && input.url ? input.url : ''
      var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase()
      if (method === 'POST' && /\/annotate(\?|$)/.test(url)) {
        lastAnnotateAt = Date.now()
        var b = url.split('/annotate')[0]
        if (b) BRIDGE = b
        if (LAST_TARGET && init && typeof init.body === 'string') {
          try {
            var body = JSON.parse(init.body)
            if (!body.target) {
              body.target = LAST_TARGET
              if (Array.isArray(body.annotations) && body.annotations[0]) {
                var a = body.annotations[0]
                a.elementText = LAST_TARGET.elementText
                a.siblingIndex = LAST_TARGET.siblingIndex
                a.siblingCount = LAST_TARGET.siblingCount
                a.domChain = LAST_TARGET.domChain
                a.outerHTML = LAST_TARGET.outerHTML
              }
              init = Object.assign({}, init, { body: JSON.stringify(body) })
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
    return origFetch(input, init)
  }

  // Compact copy of the devtools' fiber walk: pull the composing annotation's rich
  // context (element / path / styles) off the popup's React fiber.
  function pendingAnno(popup) {
    try {
      var key = Object.keys(popup).find(function (k) { return k.indexOf('__reactFiber$') === 0 })
      if (!key) return null
      var f = popup[key]
      var depth = 0
      while (f && depth < 40) {
        var h = f.memoizedState
        var i = 0
        while (h && i < 100) {
          var v = h.memoizedState
          if (
            v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof HTMLElement) &&
            'element' in v && ('elementPath' in v || 'boundingBox' in v || 'computedStyles' in v)
          ) return v
          h = h.next; i++
        }
        f = f.return; depth++
      }
    } catch (e) {}
    return null
  }

  function str(v) {
    if (v == null || v === '') return ''
    if (typeof v === 'string') return v.trim()
    if (Array.isArray(v)) return v.map(function (x) { return typeof x === 'object' ? (x && x.name) || JSON.stringify(x) : String(x) }).join('\n')
    if (typeof v === 'object') return JSON.stringify(v, null, 2)
    return String(v)
  }

  document.addEventListener('click', function (ev) {
    try {
      var t = ev.target
      var submit = t && t.closest && t.closest('[class*="submit__"]')
      if (!submit) return
      var popup = submit.closest('[class*="popup___"]')
      if (!popup) return
      var ta = popup.querySelector('[class*="textarea__"]')
      var comment = ((ta && ta.value) || '').trim()
      if (!comment) return
      var pa = pendingAnno(popup) || {}
      var output = [
        str(pa.reactComponents) && 'React components:\n' + str(pa.reactComponents),
        str(pa.sourceFile) && 'Source: ' + str(pa.sourceFile),
        str(pa.computedStyles) && 'Computed styles:\n' + str(pa.computedStyles),
        str(pa.nearbyText) && 'Nearby text: ' + str(pa.nearbyText),
      ].filter(Boolean).join('\n\n')
      var snap = {
        comment: comment,
        pageUrl: window.location.href,
        element: pa.element || '',
        elementPath: pa.elementPath || pa.fullPath || str(pa.cssClasses) || '',
        cssClasses: str(pa.cssClasses),
        boundingBox: pa.boundingBox,
        output: output,
        at: Date.now(),
      }
      window.setTimeout(function () {
        if (lastAnnotateAt >= snap.at) return // native Send fired -> suppress (no double)
        var tid = 'guard_' + snap.at + '_' + Math.random().toString(36).slice(2, 6)
        var opts = function (b) { return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) } }
        try {
          origFetch(BRIDGE + '/annotate', opts({
            pageUrl: snap.pageUrl, comment: snap.comment, threadId: tid,
            annotations: [Object.assign({ comment: snap.comment, element: snap.element, elementPath: snap.elementPath, cssClasses: snap.cssClasses, boundingBox: snap.boundingBox }, LAST_TARGET || {})],
            output: snap.output, target: LAST_TARGET || undefined, source: 'head-guard',
          })).catch(function () {})
        } catch (e) {}
        try {
          origFetch(BRIDGE + '/save', opts({
            url: snap.pageUrl, element: snap.element, comment: snap.comment,
            savedOnly: false, threadId: tid, source: 'head-guard',
          })).catch(function () {})
        } catch (e) {}
        try { console.warn('[agentation-send-guard] native Send did not fire -- dispatched via head guard:', snap.comment.slice(0, 60)) } catch (e) {}
      }, 800)
    } catch (e) {}
  }, true) // capture phase
})()
