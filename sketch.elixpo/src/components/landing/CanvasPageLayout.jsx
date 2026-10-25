'use client'

import Link from 'next/link'
import MarkdownRenderer from '@/components/blog/MarkdownRenderer'
import { ArtPanel, SiteShell } from '@/components/site/Site'

/**
 * Reusable document page layout in the Elixpo standard UI.
 * Used by security, how-to-start, use-cases, npm-package, vscode-extension
 * and teams pages.
 *
 * Props:
 *  - title: page title
 *  - description: subtitle text
 *  - icon: boxicon class
 *  - tags: string[] for tag badges
 *  - breadcrumbs: [{ label, href? }]
 *  - backHref: back link destination
 *  - backLabel: back link text
 *  - content: raw markdown string
 *  - tone: art panel tone (optional)
 */
export default function CanvasPageLayout({
  title,
  description,
  icon,
  tags = [],
  breadcrumbs = [],
  backHref = '/',
  backLabel = 'Back to Home',
  content,
  tone = 'blue',
}) {
  return (
    <SiteShell>
      <div className="lx-page">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={backHref} className="lx-back">
            <i className="bx bx-arrow-back" />
            {backLabel}
          </Link>
          {breadcrumbs.length > 0 && (
            <nav className="lx-crumbs m-0" aria-label="Breadcrumb">
              <Link href="/?noredirect=1">LixSketch</Link>
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-2">
                  <span aria-hidden="true">/</span>
                  {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : <span className="text-ink">{crumb.label}</span>}
                </span>
              ))}
            </nav>
          )}
        </div>

        <header className="lx-page-head">
          <div>
            <p className="lx-eyebrow">{breadcrumbs[breadcrumbs.length - 1]?.label || 'LixSketch'}</p>
            <h1 className="lx-title">{title}</h1>
            <p className="lx-lead">{description}</p>
          </div>
          <aside className="lx-card">
            <ArtPanel tone={tone} label="LixSketch" icon={icon} small />
            {tags.length > 0 && (
              <div className="lx-card-body gap-3">
                <small>Topics</small>
                <div className="lx-tags">
                  {tags.map((tag) => (
                    <span key={tag} className="lx-pill">{tag}</span>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </header>

        <article className="mx-auto max-w-3xl pt-12 lx-prose">
          <MarkdownRenderer content={content} canvasStyle />
        </article>
      </div>
    </SiteShell>
  )
}
