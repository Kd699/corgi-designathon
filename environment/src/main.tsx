import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import DailyOpenLab from './pages/DailyOpenLab';
import { AgentationSidePanelBridge } from './dev/agentation-side-panel-bridge';
import './index.css';

/* Hash routing, because two surfaces do not justify a router.
 *
 * The concept lab is the landing page: that is the thing being reviewed, and it owns the
 * hash itself (#m=…&s=…&p=…&v=… selects a mode/state/platform/view), so a link someone
 * pastes into Slack opens on the exact frame they meant. `#/app` is the escape hatch to
 * the bare environment — the same components, no board around them. */
function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash.startsWith('#/app') ? <App /> : <DailyOpenLab />;
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
