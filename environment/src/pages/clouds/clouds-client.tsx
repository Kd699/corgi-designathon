// The lazy-load seam for /clouds. The scene is three.js + R3F + the takram
// geospatial stack — none of it should land in the concept-board bundle,
// and the shaders / 3D noise textures should only ever load on this route.

import { lazy, Suspense } from "react";

const CloudsScene = lazy(() => import("./clouds-scene"));

export default function CloudsClient() {
  // No loading state: hold black until the scene module lands, then jump
  // straight in.
  return (
    <Suspense fallback={<div className="h-[100dvh] w-full bg-black" />}>
      <CloudsScene />
    </Suspense>
  );
}
