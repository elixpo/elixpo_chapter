import type { ReactNode } from "react";

/* Lumi the panda, for one friendly moment per route.
 *
 *   <LumiTip>   Lumi peeking up from the bottom edge of a section, with a
 *               speech bubble holding a short, true tip for the page.
 *   <LumiNote>  Lumi beside a message, for empty, loading and 404 states.
 *   <LumiWave>  the footer easter egg: press her and she waves (CSS only).
 *
 * The images are decorative (alt=""): the tip is the content. */

export type Pose = "wave" | "read" | "pet" | "badge";

const POSES: Record<Pose, { src: string; w: number; h: number }> = {
  wave:  { src: "/lumi/wave.webp", w: 124, h: 173 },
  read:  { src: "/lumi/read.webp", w: 224, h: 256 },
  pet:   { src: "/lumi/pet.webp",  w: 230, h: 240 },
  badge: { src: "/lumi-badge.webp", w: 374, h: 384 },
};

function Img({ pose, className }: { pose: Pose; className: string }) {
  const p = POSES[pose];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={p.src} alt="" width={p.w} height={p.h} loading="lazy" decoding="async"
         className={`${className} [image-rendering:pixelated]`} />
  );
}

function Bubble({ children, tail = "left" }: { children: ReactNode; tail?: "left" | "right" }) {
  return (
    <div className={`lumi-bubble lumi-bubble-${tail} relative max-w-sm rounded-card border border-border bg-card px-4 py-3`}>
      <p className="label text-accent">Lumi says</p>
      <p className="mt-1 text-sm leading-relaxed text-text">{children}</p>
    </div>
  );
}

/** Put it last in a Section: Lumi peeks up from the section's bottom edge.
 *  `align="right"` mirrors it. */
export function LumiTip({ children, pose = "wave", align = "left" }: { children: ReactNode; pose?: Pose; align?: "left" | "right" }) {
  return (
    <aside
      aria-label="A tip from Lumi"
      className={`lumi-peek -mb-16 mt-12 flex items-end gap-3 overflow-hidden sm:-mb-20 lg:-mb-24 ${align === "right" ? "flex-row-reverse" : ""}`}
    >
      <Img pose={pose} className="h-28 w-auto shrink-0 translate-y-5 sm:h-32" />
      <div className="mb-10 min-w-0">
        <Bubble tail={align === "right" ? "right" : "left"}>{children}</Bubble>
      </div>
    </aside>
  );
}

/** Lumi beside a message, for empty, loading and error states. */
export function LumiNote({ children, pose = "pet", className = "" }: { children: ReactNode; pose?: Pose; className?: string }) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <Img pose={pose} className="h-20 w-auto shrink-0" />
      <div className="min-w-0 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

/** Footer easter egg: press Lumi (or focus her with the keyboard) and she
 *  waves and says hello. CSS only; she stands still for reduced motion. */
export function LumiWave() {
  return (
    <button type="button" className="lumi-wave group relative inline-flex items-end gap-2 rounded-inner text-left" aria-label="Say hello to Lumi">
      <Img pose="wave" className="lumi-wave-img h-14 w-auto" />
      <span className="lumi-hello rounded-pill border border-border bg-card px-3 py-1 text-xs font-semibold text-text opacity-0 transition-opacity group-focus:opacity-100 group-active:opacity-100">
        Hi! I&apos;m Lumi.
      </span>
    </button>
  );
}
