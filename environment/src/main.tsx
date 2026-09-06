import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import DailyOpenLab from './pages/DailyOpenLab';
import Shell, { SHELL_TABS } from './pages/Shell';
import CloudsPage from './pages/clouds/page';
import WidgetsPage from './pages/widgets/page';
import MoodsPage from './pages/moods/page';
import { AgentationSidePanelBridge } from './dev/agentation-side-panel-bridge';
import './index.css';

/* Hash routing, because two surfaces do not justify a router.
 *
 * The concept lab is the landing page: that is the thing being reviewed, and it owns the
 * hash itself (#m=…&s=…&p=…&v=… selects a mode/state/platform/view), so a link someone
 * pastes into Slack opens on the exact frame they meant. `#/app` is the escape hatch to
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
  // The two paradigms share a shell; each tab owns its hash (#/day, #/intervention).
  const tab = SHELL_TABS.find((t) => loc.hash.startsWith(t.hash));
  if (tab) return <Shell tabId={tab.id} />;
  return loc.hash.startsWith('#/app') ? <App /> : <DailyOpenLab />;
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
