import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import DailyOpenLab from './pages/DailyOpenLab';
import Shell, { tabForHash } from './pages/Shell';
import InterventionPage from './pages/intervention/InterventionPage';
import CloudsPage from './pages/clouds/page';
import WidgetsPage from './pages/widgets/page';
import MoodsPage from './pages/moods/page';
import { AgentationSidePanelBridge } from './dev/agentation-side-panel-bridge';
import './index.css';

/* Hash routing, because a handful of surfaces do not justify a router.
 *
 * The landing page is the two-tab shell (Intervention / Logging) — that is the thing being
 * shipped. The concept board still owns every #m=… hash (mode/state/platform/view), so a
 * frame link someone pasted into Slack opens exactly where it did; `#/board` is not needed,
 * any #m= link is the board. `#/app` is the escape hatch to
 * the bare environment — the same components, no board around them. `/clouds` (and
 * `#/clouds`) is the sky brought over from next-personal.
 *
 * `#/day` and `#/intervention` are the two paradigms and they share a shell: the dayboard —
 * talk about your day, Grok composes the widgets — and the intervention, where a CBT
 * protocol answers you while you are still speaking. Each tab keeps its own hash, so the
 * `#/day` links already in circulation land exactly where they used to. */
function isClouds(path: string, hash: string) {
  return path === '/clouds' || path.startsWith('/clouds/') || hash.startsWith('#/clouds');
}

/* /widgets — the voice session's WHOOP cards on their own page. */
function isWidgets(path: string, hash: string) {
  return path === '/widgets' || path.startsWith('/widgets/') || hash.startsWith('#/widgets');
}

/* /moods — the motif mascot reference sheet: shape, mood, skies. */
function isMoods(path: string, hash: string) {
  return path === '/moods' || path.startsWith('/moods/') || hash.startsWith('#/moods');
}

function Root() {
  const [loc, setLoc] = useState(() => ({ path: window.location.pathname, hash: window.location.hash }));
  useEffect(() => {
    const on = () => setLoc({ path: window.location.pathname, hash: window.location.hash });
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    return () => {
      window.removeEventListener('hashchange', on);
      window.removeEventListener('popstate', on);
    };
  }, []);
  if (isClouds(loc.path, loc.hash)) return <CloudsPage />;
  if (isWidgets(loc.path, loc.hash)) return <WidgetsPage />;
  if (isMoods(loc.path, loc.hash)) return <MoodsPage />;
  // The concept board owns the #m=… hashes; everything else that isn't a named route is the
  // two-tab shell, which is also the landing page.
  if (loc.hash.startsWith('#m=')) return <DailyOpenLab />;
  if (loc.hash.startsWith('#/app')) return <App />;
  if (loc.hash.startsWith('#/cbt')) return <InterventionPage />;
  const tab = tabForHash(loc.hash);
  if (tab) return <Shell tabId={tab.id} />;
  return <DailyOpenLab />;
}

/* AgentationSidePanelBridge is the review surface: drop a comment on any element and it
 * goes to the bridge on :4747, which runs one `claude -p` against this checkout and streams
 * the reply back into the popup. It renders nothing until you open it, and the board works
 * fine with the bridge down — annotations just queue instead of being acted on.
 * Opt out entirely with ?spb=0. */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
    <AgentationSidePanelBridge />
  </StrictMode>,
);
