/**
 * wireAriaTabs — minimal ARIA tab interactivity for captured (static) HTML
 * mirrors. The captured DOM has `<a role="tab" aria-selected aria-controls>`
 * markup but no React handlers (we only saved HTML/CSS, not JS). This wires
 * click-to-switch behavior generically for any conforming tablist in `root`.
 *
 * Behavior:
 *   - click on `[role="tab"]` → set aria-selected=true on it, false on siblings
 *     in the same tablist; show the panel referenced by aria-controls, hide
 *     its sibling panels (`hidden` attribute + `display:none` inline style).
 *   - href="#" links get preventDefault to avoid scroll-to-top.
 *   - Returns a teardown fn.
 */
export function wireAriaTabs(root: Document | HTMLElement): () => void {
  const onClick: EventListener = (e) => {
    const t = e.target as HTMLElement | null
    const tab = t?.closest('[role="tab"]') as HTMLElement | null
    if (!tab || !root.contains(tab)) return
    e.preventDefault()
    e.stopPropagation()

    // Find the tablist this tab belongs to. Walk up until we hit role=tablist
    // or fall back to the immediate parent of the tab's parent (Bootstrap nests
    // tabs as <li> in a <ul role="tablist">).
    const tablist = tab.closest('[role="tablist"]') ?? tab.parentElement?.parentElement ?? null

    if (tablist) {
      tablist.querySelectorAll('[role="tab"]').forEach((sibling) => {
        const isMe = sibling === tab
        sibling.setAttribute('aria-selected', isMe ? 'true' : 'false')
        sibling.classList.toggle('active', isMe)
      })
    } else {
      tab.setAttribute('aria-selected', 'true')
      tab.classList.add('active')
    }

    // Show/hide panels. Find the panel referenced by aria-controls; treat its
    // tabpanel siblings (sharing parent) as the panel pool.
    const panelId = tab.getAttribute('aria-controls')
    const panel = panelId ? (root as Document).getElementById?.(panelId) ?? (root as HTMLElement).querySelector?.(`#${CSS.escape(panelId)}`) : null
    if (panel) {
      const panelParent = panel.parentElement
      if (panelParent) {
        panelParent.querySelectorAll('[role="tabpanel"]').forEach((p) => {
          const isMe = p === panel
          if (isMe) {
            p.removeAttribute('hidden')
            ;(p as HTMLElement).style.display = ''
            p.setAttribute('aria-hidden', 'false')
            p.classList.add('active', 'show')
          } else {
            p.setAttribute('hidden', '')
            ;(p as HTMLElement).style.display = 'none'
            p.setAttribute('aria-hidden', 'true')
            p.classList.remove('active', 'show')
          }
        })
      }
    }
  }

  root.addEventListener('click', onClick, true)
  return () => root.removeEventListener('click', onClick, true)
}
