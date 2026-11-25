'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getBlogPost, blogPosts } from '@/content/blog'
import MarkdownRenderer from '@/components/blog/MarkdownRenderer'
import { ArtPanel, SiteShell } from '@/components/site/Site'

// Raw markdown imports
// NOTE: dynamic import by slug isn't possible because Turbopack /
// webpack need static specifiers to bundle the content. Each new post
// gets a static import line + a contentMap entry below — keep them in
// sync with src/content/blog/index.js.
import enginePackageLaunch from '@/content/blog/engine-package-launch.md'
import e2eEncryption from '@/content/blog/e2e-encryption.md'
import websocketCollaboration from '@/content/blog/websocket-collaboration.md'
import lixscriptDsl from '@/content/blog/lixscript-dsl.md'
import roughjsCanvas from '@/content/blog/roughjs-canvas.md'
import imagePipeline from '@/content/blog/image-pipeline.md'
import lixeditorIntegration from '@/content/blog/lixeditor-integration.md'

const contentMap = {
  'engine-package-launch': enginePackageLaunch,
  'e2e-encryption': e2eEncryption,
  'websocket-collaboration': websocketCollaboration,
  'lixscript-dsl': lixscriptDsl,
  'roughjs-canvas': roughjsCanvas,
  'image-pipeline': imagePipeline,
  'lixeditor-integration': lixeditorIntegration,
}

export default function BlogPostPage() {
  const { slug } = useParams()
  const post = getBlogPost(slug)
  const content = contentMap[slug]

  if (!post || !content) {
    return (
      <SiteShell>
        <div className="lx-page lx-page-narrow py-24 text-center">
          <p className="lx-eyebrow">Blog</p>
          <h1 className="lx-title">Post Not Found</h1>
          <p className="lx-lead mx-auto">This blog post doesn't exist.</p>
          <Link href="/docs" className="lx-btn mt-8">Back to Docs</Link>
        </div>
      </SiteShell>
    )
  }

  const currentIndex = blogPosts.findIndex(p => p.slug === slug)
  const prevPost = currentIndex > 0 ? blogPosts[currentIndex - 1] : null
  const nextPost = currentIndex < blogPosts.length - 1 ? blogPosts[currentIndex + 1] : null

  return (
    <SiteShell>
      <div className="lx-page">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/docs" className="lx-back">
            <i className="bx bx-arrow-back" />
            Back to Docs
          </Link>
          <nav className="lx-crumbs m-0" aria-label="Breadcrumb">
            <Link href="/?noredirect=1">LixSketch</Link>
            <span aria-hidden="true">/</span>
            <Link href="/docs">Docs</Link>
            <span aria-hidden="true">/</span>
            <span className="text-ink">Blog</span>
          </nav>
        </div>

        <header className="lx-page-head">
          <div>
            <p className="lx-eyebrow">
              Blog · {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
            <h1 className="lx-title">{post.title}</h1>
            <p className="lx-lead">{post.description}</p>
          </div>
          <aside className="lx-card">
            <ArtPanel tone="lilac" label="LixSketch blog" icon={post.icon} small />
            <div className="lx-card-body gap-3">
              <small>Topics</small>
              <div className="lx-tags">
                {post.tags.map((tag) => <span key={tag} className="lx-pill">{tag}</span>)}
              </div>
            </div>
          </aside>
        </header>

        <article className="lx-prose mx-auto max-w-3xl pt-12">
          <MarkdownRenderer content={content} canvasStyle />
        </article>

        <nav className="mx-auto mt-16 grid max-w-3xl grid-cols-1 gap-4 border-t border-line pt-8 sm:grid-cols-2" aria-label="More posts">
          {prevPost ? (
            <Link href={`/docs/blog/${prevPost.slug}`} className="lx-card p-5">
              <p className="lx-meta mb-2">← Previous</p>
              <p className="text-lg font-semibold leading-snug tracking-[-0.03em]">{prevPost.title}</p>
            </Link>
          ) : <div />}
          {nextPost ? (
            <Link href={`/docs/blog/${nextPost.slug}`} className="lx-card p-5 text-right">
              <p className="lx-meta mb-2">Next →</p>
              <p className="text-lg font-semibold leading-snug tracking-[-0.03em]">{nextPost.title}</p>
            </Link>
          ) : <div />}
        </nav>
      </div>
    </SiteShell>
  )
}
