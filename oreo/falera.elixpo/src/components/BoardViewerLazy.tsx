"use client";

import dynamic from "next/dynamic";

// <model-viewer> touches window and WebGL, so it only ever loads in the
// browser; the static export ships this loading state in its place. The
// parent reserves the height, so nothing shifts when the model arrives.
const BoardViewerLazy = dynamic(() => import("@/components/BoardViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center font-mono text-xs uppercase tracking-[0.14em] text-muted">
      Loading the 3D board…
    </div>
  ),
});

export default BoardViewerLazy;
