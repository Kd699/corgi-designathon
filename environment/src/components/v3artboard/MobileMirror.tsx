/**
 * MobileMirror — renders captured Perkbox mobile HTML/CSS inside a sandboxed
 * <iframe srcdoc>. The iframe's own ~358px viewport governs media queries, so
 * mobile @media rules fire correctly (without this, captured `@media (min-width)`
 * rules clobber the mobile reflow when rendered in the parent's wide viewport).
 *
 * Also forwards mouse events from the iframe to the parent's `useDevMode` store
 * so `?dev=1` overlays light up on mobile too. Event coordinates are translated
 * from the iframe's local frame to the parent document so DevOverlays render
 * in the right place.
 */
import React, { useEffect, useMemo, useRef } from 'react'
import { useDevMode } from '@/lib/devMode'
import { extractSelection, rectOf, shouldIgnore } from '@/components/dev-mode/extractMeta'
import { wireAriaTabs } from './wireAriaTabs'

interface Props {
  slug: string
  html: string
  css: string
}

export const MobileMirror: React.FC<Props> = ({ slug, html, css }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const devMode = useDevMode((s) => s.devMode)
  const setHover = useDevMode((s) => s.setHover)
  const setSelected = useDevMode((s) => s.setSelected)

  const srcdoc = useMemo(
    () =>
      `<!doctype html><html><head><meta charset="utf-8"/>` +
      `<meta name="viewport" content="width=device-width,initial-scale=1"/>` +
      `<style>html,body{margin:0;padding:0;background:#f4f5f7}` +
      css +
      `</style></head><body class="pb-${slug}-mirror">` +
      html +
      `</body></html>`,
    [slug, html, css],
  )

  // Tab interactivity (works regardless of dev mode)
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    let teardown: (() => void) | undefined
    const wireTabs = () => {
      const doc = iframe.contentDocument
      if (!doc) return
      teardown = wireAriaTabs(doc)
    }
    if (iframe.contentDocument?.readyState === 'complete') {
      wireTabs()
    } else {
      iframe.addEventListener('load', wireTabs)
    }
    return () => {
      iframe.removeEventListener('load', wireTabs)
      teardown?.()
    }
  }, [srcdoc])

  useEffect(() => {
    if (!devMode) return
    const iframe = iframeRef.current
    if (!iframe) return

    let docCleanup: (() => void) | undefined
    let loadCleanup: (() => void) | undefined

    const wire = () => {
      const doc = iframe.contentDocument
      if (!doc) return
      const onMove = (e: MouseEvent) => {
        const t = e.target as HTMLElement | null
        if (!t || shouldIgnore(t)) return setHover(null)
        const r = rectOf(t)
        const off = iframe.getBoundingClientRect()
        setHover({ top: r.top + off.top, left: r.left + off.left, width: r.width, height: r.height })
      }
      const onClick = (e: MouseEvent) => {
        const t = e.target as HTMLElement | null
        if (!t || shouldIgnore(t)) return
        e.preventDefault()
        e.stopPropagation()
        const sel = extractSelection(t)
        const off = iframe.getBoundingClientRect()
        sel.rect = {
          top: sel.rect.top + off.top,
          left: sel.rect.left + off.left,
          width: sel.rect.width,
          height: sel.rect.height,
        }
        setSelected(sel)
      }
      doc.addEventListener('mousemove', onMove, true)
      doc.addEventListener('click', onClick, true)
      docCleanup = () => {
        doc.removeEventListener('mousemove', onMove, true)
        doc.removeEventListener('click', onClick, true)
      }
    }

    // Wire now if iframe is ready, AND on every subsequent load (e.g. when
    // srcdoc changes and the iframe reloads with a new contentDocument).
    const onLoad = () => {
      docCleanup?.()
      wire()
    }
    iframe.addEventListener('load', onLoad)
    loadCleanup = () => iframe.removeEventListener('load', onLoad)
    if (iframe.contentDocument?.readyState === 'complete') wire()

    return () => {
      loadCleanup?.()
      docCleanup?.()
    }
  }, [devMode, setHover, setSelected, srcdoc])

  return (
    <iframe
      ref={iframeRef}
      title={`pb-${slug}-mobile`}
      srcDoc={srcdoc}
      style={{ border: 0, width: '100%', height: '100%' }}
    />
  )
}
