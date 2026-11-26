import Link from "next/link";
import { Eyebrow } from "@/components/ui";
import { LumiNote } from "@/components/Lumi";

/* 404: plain and cheap to render (some misrouted bots will hammer it). */

export default function NotFound() {
  return (
    <div className="container-page flex min-h-[70vh] flex-col justify-center py-20">
      <Eyebrow className="mb-6">404 · not found</Eyebrow>
      <h1 className="h-display max-w-3xl">Off <em>the map.</em></h1>
      <p className="lede mt-6 max-w-prose-site">
        The route you tapped doesn&apos;t exist on this build of the site.
        Maybe it&apos;s an IR-Quest beacon hidden in a different timeline —
        or maybe a typo. Head back home and we&apos;ll forget this ever
        happened.
      </p>
      <LumiNote pose="read" className="mt-10">
        <p className="label text-accent">Lumi says</p>
        <p className="mt-1 text-text">I looked everywhere, even under the battery holder. This page isn&apos;t here.</p>
      </LumiNote>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/" className="btn-primary">Back home</Link>
        <Link href="/apps/" className="btn-ghost">Browse apps</Link>
        <a href="https://github.com/elixpo/falera/issues/new" target="_blank" rel="noreferrer" className="btn-ghost">
          Report a broken link ↗
        </a>
      </div>
    </div>
  );
}
