// /clouds — a full-viewport volumetric sky, rendered live on the WGS84
// ellipsoid by @takram/three-clouds (ray-marched clouds with beer shadow
// maps) composited through @takram/three-atmosphere's aerial perspective.
// Every interesting number — coverage, local solar time, wind, camera
// geodetics — is a DialKit panel on the right, so the sky is something you
// tune rather than something you look at. The scene itself is client-only
// (WebGL); see clouds-client.tsx for the lazy-load seam.
//
// Ported from next-personal/app/clouds. Breadcrumb and Next metadata stay
// with the site this came from; the canvas wants the whole viewport.

import CloudsClient from "./clouds-client";

export default function CloudsPage() {
  return (
    <div className="w-full">
      <CloudsClient />
    </div>
  );
}
