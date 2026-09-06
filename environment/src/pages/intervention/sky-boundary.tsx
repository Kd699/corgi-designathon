/* The sky is allowed to fail; the protocol is not.
 *
 * WispsCanvas is a WebGL surface, and on a machine that cannot give it a context three
 * throws during render — which, unguarded, unmounts the entire page and leaves someone
 * mid-CBT-step looking at a white screen. The weather is the best part of this surface but
 * it is not the load-bearing part: the steps, the transcript and the emoji are all DOM, and
 * they should survive a driver that will not cooperate.
 *
 * So the sky falls back to a flat wash and says so, quietly, rather than taking the room
 * with it. (Discovered the honest way: headless Chromium has no WebGL, and the first
 * verification run screenshotted nothing at all.)
 */
import { Component, type ReactNode } from 'react';

export default class SkyBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
