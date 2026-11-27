"use client";

import { createElement, useEffect, useRef, useState } from "react";

/* Interactive 3D view of the badge PCB, from the KiCad GLB export
   (public/models/falera-badge.glb, Draco-compressed). Uses Google's
   <model-viewer> web component, imported only in the browser: the page
   loads this file with next/dynamic and ssr: false.

   Falls back to the flat KiCad renders when WebGL is missing or the
   model fails to load. With prefers-reduced-motion the board does not
   auto-rotate. The parent reserves the height, so nothing shifts while
   the model loads. */

const MODEL = "/models/falera-badge.glb";
const POSTER = "/pcb_front.jpg";

const FALLBACK = [
  { src: "/pcb_front.jpg", alt: "Front of the Falera badge PCB (KiCad render)", label: "Front" },
  { src: "/pcb_back.jpg",  alt: "Back of the Falera badge PCB (KiCad render)",  label: "Back" },
];

type Status = "loading" | "ready" | "fallback";

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function BoardFallback() {
  return (
    <div className="grid h-full grid-cols-2 gap-3 p-3 sm:gap-4 sm:p-4">
      {FALLBACK.map((img) => (
        <figure key={img.src} className="flex min-h-0 flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img.src}
            alt={img.alt}
            className="min-h-0 w-auto flex-1 object-contain"
            width={808} height={1218}
            loading="lazy"
            decoding="async"
          />
          <figcaption className="pt-2 font-mono text-xs uppercase tracking-[0.14em] text-muted">
            {img.label}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export default function BoardViewer() {
  const ref = useRef<HTMLElement | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [progress, setProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [elementReady, setElementReady] = useState(false);
  const [narrow, setNarrow] = useState(false);

  // Feature checks and the web component itself, browser only.
  useEffect(() => {
    if (!hasWebGL()) {
      setStatus("fallback");
      return;
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    // A portrait phone frame needs the camera further out to fit the board.
    setNarrow(window.matchMedia("(max-width: 639px)").matches);

    let cancelled = false;
    // Decode Draco from this site (scripts/copy-draco.mjs), not a CDN.
    // model-viewer reads this global when it first loads.
    const w = window as unknown as { ModelViewerElement?: Record<string, unknown> };
    w.ModelViewerElement = { ...(w.ModelViewerElement ?? {}), dracoDecoderLocation: "/draco/" };
    import("@google/model-viewer")
      .then(() => { if (!cancelled) setElementReady(true); })
      .catch(() => { if (!cancelled) setStatus("fallback"); });

    return () => {
      cancelled = true;
      mq.removeEventListener("change", onChange);
    };
  }, []);

  // Events from <model-viewer>.
  useEffect(() => {
    const el = ref.current;
    if (!elementReady || !el) return;
    const onLoad = () => setStatus("ready");
    const onError = () => setStatus("fallback");
    const onProgress = (e: Event) => {
      const p = (e as CustomEvent<{ totalProgress: number }>).detail?.totalProgress;
      if (typeof p === "number") setProgress(p);
    };
    // Stop the slow turn for good once someone grabs the board.
    const onCamera = (e: Event) => {
      const src = (e as CustomEvent<{ source: string }>).detail?.source;
      if (src === "user-interaction") el.removeAttribute("auto-rotate");
    };
    el.addEventListener("load", onLoad);
    el.addEventListener("error", onError);
    el.addEventListener("progress", onProgress);
    el.addEventListener("camera-change", onCamera);
    // A stuck load (decoder blocked, network gone) also falls back.
    const timer = window.setTimeout(() => {
      setStatus((s) => (s === "loading" ? "fallback" : s));
    }, 30000);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener("load", onLoad);
      el.removeEventListener("error", onError);
      el.removeEventListener("progress", onProgress);
      el.removeEventListener("camera-change", onCamera);
    };
  }, [elementReady]);

  if (status === "fallback") return <BoardFallback />;

  return (
    <div className="relative h-full w-full">
      {elementReady &&
        createElement("model-viewer", {
          ref,
          src: MODEL,
          alt: "3D model of the Falera badge: black PCB with the 2.8 inch display module, a printed name card and the lanyard. Drag to turn it, scroll or pinch to zoom.",
          "camera-controls": "",
          "touch-action": "pan-y",
          "interaction-prompt": "none",
          "disable-pan": "",
          ...(reducedMotion ? {} : { "auto-rotate": "", "auto-rotate-delay": "0", "rotation-per-second": "14deg" }),
          "camera-orbit": `-25deg 55deg ${narrow ? "0.36m" : "0.26m"}`,
          // Turn about the badge's own centre (board x 84 mm, y 96.8 mm in
          // the GLB's KiCad coordinates), not the middle of the bounding box,
          // which the lanyard straps stretch towards the top.
          "camera-target": "0.084m 0.0017m 0.0968m",
          "min-camera-orbit": "auto auto 0.12m",
          "max-camera-orbit": "auto auto 0.6m",
          "field-of-view": "30deg",
          "environment-image": "neutral",
          "tone-mapping": "neutral",
          exposure: 1.15,
          "shadow-intensity": "0.7",
          "shadow-softness": "0.9",
          loading: "eager",
          reveal: "auto",
          style: {
            width: "100%",
            height: "100%",
            backgroundColor: "transparent",
            "--poster-color": "transparent",
            "--progress-bar-color": "transparent",
          },
        })}

      {status === "loading" && (
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4"
          role="status"
          aria-live="polite"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={POSTER}
            alt=""
            className="h-3/5 w-auto animate-pulse object-contain opacity-30"
            width={808} height={1218}
            decoding="async"
          />
          <div className="h-1 w-40 overflow-hidden rounded-full bg-border">
            <div
              className="h-full bg-text transition-[width] duration-200"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
            Loading the 3D board…
          </span>
        </div>
      )}

      {status === "ready" && (
        <p className="pointer-events-none absolute bottom-3 left-0 right-0 text-center text-xs text-muted">
          Drag to turn · scroll or pinch to zoom
        </p>
      )}
    </div>
  );
}
