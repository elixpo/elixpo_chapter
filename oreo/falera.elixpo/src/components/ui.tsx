import Link from "next/link";
import type { ReactNode } from "react";

/* The site's shared components. Server components, no client JS.
 *
 *   <Section>        one band of a page: container + vertical rhythm
 *   <SectionHeader>  eyebrow (with Lumi's bow) + title + lede
 *   <PageHeader>     the same, as the page's h1, with room for actions
 *   <Card>           white card, 1px border, no shadow (link or block)
 *   <Stat>           a red number or name with a short label
 *   <Onward>         the one link at the end of a section
 *   <NextStep>       the card at the end of a page that points onward
 *   <Bow>            Lumi's bow, as an eyebrow mark or bullet
 *
 * Classes behind them (container-page, section, eyebrow, card, btn-*)
 * live in globals.css. */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const isExternal = (href: string) => /^https?:|^mailto:/.test(href);

/** A link that opens external URLs in a new tab and uses next/link inside. */
export function SmartLink({
  href, className, children, ...rest
}: { href: string; className?: string; children: ReactNode; "aria-label"?: string }) {
  if (isExternal(href)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className} {...rest}>
        {children}
      </a>
    );
  }
  return <Link href={href} className={className} {...rest}>{children}</Link>;
}

/** Lumi's bow (pitch-deck/assets/bow.svg), inline so it costs no request. */
export function Bow({ className = "h-3 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 24" className={cx("shrink-0", className)} aria-hidden="true" focusable="false">
      <path d="M18 12C12 3 3 1 2 7c-1 5-1 10 1 13 3 3 10-1 15-8z" fill="#C93A45" />
      <path d="M22 12c6-9 15-11 16-5 1 5 1 10-1 13-3 3-10-1-15-8z" fill="#C93A45" />
      <rect x="15.5" y="7" width="9" height="10" rx="3.5" fill="#A92F39" />
    </svg>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx("eyebrow flex items-center gap-2.5", className)}>
      <Bow />
      <span>{children}</span>
    </p>
  );
}

export type Tone = "plain" | "fill" | "red" | "green" | "ink";

const TONE: Record<Tone, string> = {
  plain: "",
  fill: "section-fill",
  red: "section-red",
  green: "section-green",
  ink: "section-ink",
};

/** One band of a page. `tone` picks its treatment: `fill` (light grey-green),
 *  `red` (soft red tint, for callouts), `green` (soft green, Lumi and the
 *  apps), `ink` (the dark panda band: one strong moment per page). */
export function Section({
  id, tone = "plain", fill = false, tight = false, className, children, label,
}: {
  id?: string;
  tone?: Tone;
  /** Shorthand for tone="fill". */
  fill?: boolean;
  /** Less vertical space, for a strip such as a stat row. */
  tight?: boolean;
  className?: string;
  children: ReactNode;
  /** aria-label, when the section has no visible heading. */
  label?: string;
}) {
  return (
    <section id={id} aria-label={label} className={cx("section", tight && "section-tight", TONE[fill ? "fill" : tone], className)}>
      <div className="container-page">{children}</div>
    </section>
  );
}

/** Eyebrow + title + lede. Two columns from lg when `aside` is given. */
export function SectionHeader({
  eyebrow, title, lede, as: Tag = "h2", className, children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  as?: "h1" | "h2";
  className?: string;
  /** Actions or extra content under the lede. */
  children?: ReactNode;
}) {
  return (
    <header className={cx("max-w-3xl", className)}>
      {eyebrow && <Eyebrow className="mb-5">{eyebrow}</Eyebrow>}
      <Tag className={Tag === "h1" ? "h-display" : "h-title"}>{title}</Tag>
      {lede && <div className="lede mt-5 max-w-prose-site">{lede}</div>}
      {children}
    </header>
  );
}

/** The top of every page: a section holding the h1. */
export function PageHeader({
  eyebrow, title, lede, children, aside, className, tone = "plain",
}: {
  /** A tinted header for the route's area (green for apps, red for RV565). */
  tone?: Tone;
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  /** Actions under the lede (buttons, chips). */
  children?: ReactNode;
  /** Optional right column from lg (an image or a status card). */
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("border-b border-border", TONE[tone], tone !== "plain" && "border-b-transparent", className)}>
      <div className="container-page page-top pb-12 sm:pb-16">
        <div className={aside ? "grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center lg:gap-16" : undefined}>
          <SectionHeader as="h1" eyebrow={eyebrow} title={title} lede={lede}>
            {children && <div className="mt-8 flex flex-wrap items-center gap-3">{children}</div>}
          </SectionHeader>
          {aside}
        </div>
      </div>
    </div>
  );
}

/** White card with a 1px border. With `href` the whole card is a link. */
export function Card({
  href, className, children, fill = false, "aria-label": ariaLabel,
}: {
  href?: string;
  className?: string;
  children: ReactNode;
  fill?: boolean;
  "aria-label"?: string;
}) {
  if (href) {
    return (
      <SmartLink href={href} aria-label={ariaLabel} className={cx("card-link group block min-w-0", className)}>
        {children}
      </SmartLink>
    );
  }
  return <div className={cx(fill ? "card-fill" : "card", className)}>{children}</div>;
}

/** A red value with a short label, as in the deck's number cards. */
export function Stat({
  value, label, href, className,
}: { value: ReactNode; label: ReactNode; href?: string; className?: string }) {
  const body = (
    <>
      <span className="block font-display text-[1.5rem] font-bold leading-none tracking-[-0.03em] text-accent tabular-nums sm:text-[2rem]">
        {value}
      </span>
      <span className="mt-3 block text-sm leading-snug text-text-dim">{label}</span>
    </>
  );
  if (href) {
    return (
      <SmartLink href={href} className={cx("card-link block min-w-0 p-5 sm:p-6", className)}>
        {body}
      </SmartLink>
    );
  }
  return <div className={cx("card p-5 sm:p-6", className)}>{body}</div>;
}

/** A spec or fact: grey mono key, ink value. */
export function Fact({ k, children, className }: { k: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx("card p-5", className)}>
      <p className="label">{k}</p>
      <p className="mt-2 text-[0.95rem] leading-snug text-text">{children}</p>
    </div>
  );
}

/** The one link at the end of a section. */
export function Onward({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <p className={cx("mt-10", className)}>
      <SmartLink href={href} className="link-onward">
        {children} <span aria-hidden="true">→</span>
      </SmartLink>
    </p>
  );
}

/** Bow-bulleted list (the deck's `.list`). */
export function BowList({ items, className }: { items: ReactNode[]; className?: string }) {
  return (
    <ul className={cx("space-y-3", className)}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-[0.95rem] leading-relaxed text-text-body">
          <Bow className="mt-[0.4rem] h-2.5 w-4" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** The end of a page: where to go next. */
export function NextStep({
  eyebrow = "Next", title, body, href, cta,
}: { eyebrow?: string; title: ReactNode; body: ReactNode; href: string; cta: string }) {
  return (
    <Section label="Next step" tight>
      <SmartLink
        href={href}
        className="card-link group flex flex-col gap-6 p-6 sm:p-8 md:flex-row md:items-center md:justify-between"
      >
        <div className="max-w-2xl">
          <p className="eyebrow">{eyebrow}</p>
          <p className="mt-3 font-display text-2xl leading-tight text-text sm:text-[1.75rem]">{title}</p>
          <p className="mt-2 text-text-dim">{body}</p>
        </div>
        <span className="link-onward shrink-0 group-hover:underline">
          {cta} <span aria-hidden="true">→</span>
        </span>
      </SmartLink>
    </Section>
  );
}

/** Big numbers without cards, for a band (works on any tone). */
export function NumberBand({ items, className }: { items: { value: ReactNode; label: ReactNode; href?: string }[]; className?: string }) {
  return (
    <ul className={cx("grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none", className)}>
      {items.map((it, i) => {
        const body = (
          <>
            <span className="block font-display text-[2.25rem] font-bold leading-none tracking-[-0.04em] text-accent tabular-nums sm:text-[2.75rem]">
              {it.value}
            </span>
            <span className="mt-3 block max-w-[14rem] text-sm leading-snug text-text-dim">{it.label}</span>
          </>
        );
        return (
          <li key={i} className="reveal min-w-0 border-l border-border pl-5">
            {it.href ? <SmartLink href={it.href} className="group block hover:[&>span:first-child]:underline">{body}</SmartLink> : body}
          </li>
        );
      })}
    </ul>
  );
}

/** Text beside media; `flip` puts the media on the left from lg. */
export function Split({
  media, children, flip = false, className,
}: { media: ReactNode; children: ReactNode; flip?: boolean; className?: string }) {
  return (
    <div className={cx("grid items-center gap-10 lg:grid-cols-2 lg:gap-16", className)}>
      <div className={cx("min-w-0", flip && "lg:order-2")}>{children}</div>
      <div className={cx("min-w-0", flip && "lg:order-1")}>{media}</div>
    </div>
  );
}

/** Numbered steps on a line: horizontal from md, vertical on phones. A
 *  hairline joins each number to the next. */
export function Steps({ steps, className }: { steps: { title: ReactNode; body: ReactNode }[]; className?: string }) {
  return (
    <ol className={cx("grid gap-10 md:grid-flow-col md:auto-cols-fr md:gap-6", className)}>
      {steps.map((s, i) => (
        <li
          key={i}
          className={cx(
            "reveal relative flex gap-5 md:flex-col md:gap-0",
            i < steps.length - 1 &&
              "before:absolute before:left-5 before:top-12 before:-bottom-8 before:w-px before:bg-border md:before:bottom-auto md:before:left-14 md:before:right-2 md:before:top-5 md:before:h-px md:before:w-auto",
          )}
        >
          <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-pill border border-accent font-mono text-sm font-bold text-accent">
            {String(i + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0 md:mt-6 md:pr-4">
            <h3 className="h-card">{s.title}</h3>
            <div className="mt-2 text-sm leading-relaxed text-text-dim">{s.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A full-width row in a list (docs, guides): number, title, text, arrow. */
export function ListRow({ n, href, title, body }: { n?: ReactNode; href: string; title: ReactNode; body: ReactNode }) {
  return (
    <li className="border-b border-border first:border-t">
      <SmartLink href={href} className="group flex items-baseline gap-4 py-6 sm:gap-8">
        <span className="w-8 shrink-0 font-mono text-sm font-bold text-accent">{n}</span>
        <span className="grid min-w-0 flex-1 gap-1 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-8">
          <span className="h-card group-hover:text-primary">{title}</span>
          <span className="text-sm leading-relaxed text-text-dim">{body}</span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-accent transition-transform group-hover:translate-x-1">→</span>
      </SmartLink>
    </li>
  );
}

/** A 320×240 badge screen (or a video frame) in a black PCB-coloured bezel. */
export function Screen({
  src, alt, caption, className,
}: { src: string; alt: string; caption?: ReactNode; className?: string }) {
  return (
    <figure className={cx("min-w-0", className)}>
      <div className="rounded-[1.25rem] bg-[#141414] p-3 sm:p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} width={640} height={480} loading="lazy" decoding="async"
             className="aspect-[4/3] h-auto w-full rounded-md [image-rendering:pixelated]" />
      </div>
      {caption && <figcaption className="mt-3 text-xs leading-relaxed text-muted">{caption}</figcaption>}
    </figure>
  );
}

export { cx };
