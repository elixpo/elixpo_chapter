import Link from "next/link";
import type { AppEntry } from "@/data/apps";

/* One app in a catalogue grid: the badge's pixel-art icon, the name, the
 * category and the one-line blurb. A server component: the whole card is
 * a link to /apps/<slug>/, and it ships no JavaScript. */

export function AppIcon({ app, size = "md" }: { app: AppEntry; size?: "sm" | "md" | "lg" }) {
  const box = { sm: "h-10 w-10 p-1.5", md: "h-14 w-14 p-2", lg: "h-28 w-28 p-4" }[size];
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-inner border border-border bg-card-sub ${box}`}>
      {app.pngIcon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={app.pngIcon}
          alt=""
          width={64}
          height={64}
          className="h-full w-full object-contain [image-rendering:pixelated]"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="font-display text-lg text-primary" aria-hidden="true">{app.name[0]}</span>
      )}
    </span>
  );
}

export default function AppCard({ app }: { app: AppEntry; index?: number }) {
  return (
    <Link
      href={`/apps/${app.urlSlug}/`}
      className="card-link group flex h-full items-start gap-4 p-5"
    >
      <AppIcon app={app} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-base font-bold text-text group-hover:text-primary">{app.name}</span>
          <span className="label shrink-0">{app.category}</span>
        </span>
        <span className="mt-1.5 block text-sm leading-relaxed text-text-dim">{app.blurb}</span>
      </span>
    </Link>
  );
}
