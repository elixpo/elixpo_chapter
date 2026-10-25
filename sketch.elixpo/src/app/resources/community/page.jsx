'use client'

import Link from 'next/link'
import MarkdownRenderer from '@/components/blog/MarkdownRenderer'
import { ArtPanel, IconBlob, SiteShell, artTone } from '@/components/site/Site'
import content from '@/content/pages/community.md'

const GITHUB_URL = 'https://github.com/elixpo/sketch.elixpo'

const actions = [
  { href: GITHUB_URL, icon: 'bx bxs-star', label: 'Star on GitHub', detail: 'Follow releases and help others find the project.' },
  { href: `${GITHUB_URL}/fork`, icon: 'bx bx-git-repo-forked', label: 'Fork the Repo', detail: 'Start your own copy and send changes back.' },
  { href: `${GITHUB_URL}/issues`, icon: 'bx bx-bug', label: 'Report a Bug', detail: 'Open an issue with steps to reproduce.' },
  { href: `${GITHUB_URL}/issues/new?labels=enhancement`, icon: 'bx bx-bulb', label: 'Request a Feature', detail: 'Describe the workflow you want to support.' },
  { href: `${GITHUB_URL}/pulls`, icon: 'bx bx-git-pull-request', label: 'View Pull Requests', detail: 'Review open work and recent merges.' },
  { href: `${GITHUB_URL}/discussions`, icon: 'bx bx-chat', label: 'Join Discussions', detail: 'Ask questions and share what you built.' },
]

export default function CommunityPage() {
  return (
    <SiteShell>
      <div className="lx-page">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="lx-back">
            <i className="bx bx-arrow-back" />
            Back to Home
          </Link>
          <nav className="lx-crumbs m-0" aria-label="Breadcrumb">
            <Link href="/?noredirect=1">LixSketch</Link>
            <span aria-hidden="true">/</span>
            <Link href="/">Resources</Link>
            <span aria-hidden="true">/</span>
            <span className="text-ink">Community</span>
          </nav>
        </div>

        <header className="lx-page-head">
          <div>
            <p className="lx-eyebrow">Community</p>
            <h1 className="lx-title">Built in the open, <em>with you.</em></h1>
            <p className="lx-lead">
              LixSketch is open source and community-driven. Star, fork, contribute, or just come say hi.
            </p>
          </div>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="lx-card">
            <ArtPanel tone="mint" label="GitHub" icon="bx bxl-github" small />
            <div className="lx-card-body">
              <small>Repository</small>
              <h3 className="!text-2xl">elixpo/sketch.elixpo</h3>
              <p>Open-source WYSIWYG canvas for diagrams, wireframes, and docs</p>
              <div className="lx-tags mt-4">
                {['open-source', 'community', 'contribute'].map((tag) => <span key={tag} className="lx-pill">{tag}</span>)}
              </div>
            </div>
          </a>
        </header>

        <section className="py-12" aria-label="Get involved">
          <div className="lx-grid-3">
            {actions.map((action, index) => (
              <a key={action.label} href={action.href} target="_blank" rel="noopener noreferrer" className="lx-card flex items-start gap-4 p-5">
                <IconBlob tone={artTone(index)} icon={action.icon} />
                <span className="min-w-0">
                  <span className="block text-lg font-semibold tracking-[-0.03em]">{action.label} ↗</span>
                  <span className="mt-1 block text-sm leading-6 text-muted">{action.detail}</span>
                </span>
              </a>
            ))}
          </div>
        </section>

        <article className="lx-prose mx-auto max-w-3xl border-t border-line pt-10">
          <MarkdownRenderer content={content} canvasStyle />
        </article>
      </div>
    </SiteShell>
  )
}
