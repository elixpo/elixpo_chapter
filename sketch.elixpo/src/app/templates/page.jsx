'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArtPanel, HeroObjects, PageHero, Section, SiteShell, artTone } from '@/components/site/Site'

function TemplateCard({ template, index = 0 }) {
  return (
    <Link href={`/templates/${template.slug}`} className="lx-card group flex flex-col">
      <div className="relative aspect-[16/9] overflow-hidden border-b border-line bg-paper">
        {template.coverDataUrl ? (
          <img src={template.coverDataUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
        ) : (
          <ArtPanel tone={artTone(index)} label="Template" icon="bx bx-palette" className="!absolute inset-0 !h-full" />
        )}
        <div className="absolute bottom-3 right-3 z-[4] rounded-full bg-ink px-2.5 py-1 font-mono text-[10px] text-white">
          {template.forks + template.clones} uses
        </div>
      </div>
      <div className="lx-card-body flex-1">
        <h2 className="truncate text-2xl font-semibold tracking-[-0.04em] text-ink">{template.title}</h2>
        <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-text-muted">{template.description || 'A public LixSketch workspace template.'}</p>
        <div className="mb-5 mt-4 flex flex-wrap gap-1.5">
          {template.tags.slice(0, 4).map((tag) => <span key={tag} className="lx-pill">{tag}</span>)}
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-line pt-4 text-xs text-muted">
          <span className="flex min-w-0 items-center gap-2">
            {template.publisher.avatar ? <img src={template.publisher.avatar} alt="" className="h-6 w-6 rounded-full" /> : <i className="bx bx-user-circle text-xl" />}
            <span className="truncate">{template.publisher.name}</span>
          </span>
          <span className="flex items-center gap-1"><i className="bx bx-show" />{template.views}</span>
        </div>
      </div>
    </Link>
  )
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/templates?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Could not load templates')
        setTemplates(body.templates || [])
        setError('')
      } catch (reason) {
        if (reason.name !== 'AbortError') setError(reason.message)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, query ? 180 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query])

  const popularTags = useMemo(() => {
    const counts = new Map()
    templates.forEach((template) => template.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)))
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag]) => tag)
  }, [templates])

  return (
    <SiteShell>
      <PageHero
        eyebrow="Community templates"
        title={<>Start from a workspace that <em>already works.</em></>}
        lead="Explore public canvases and documents, then fork with attribution or clone an independent encrypted copy into your account."
        objects={<HeroObjects blob="FORK" disc={['CLONE', 'E2E']} card={['TEMPLATE', 'CANVAS + DOCS']} />}
      >
        <div className="mt-8 max-w-2xl rounded-full border border-line bg-white p-1.5 focus-within:border-ink">
          <label className="flex items-center gap-3 px-4">
            <i className="bx bx-search text-xl text-muted" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search templates, tags, or use cases" className="w-full bg-transparent py-2.5 text-sm text-ink outline-none placeholder:text-muted" autoFocus />
          </label>
        </div>
        {popularTags.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{popularTags.map((tag) => <button key={tag} onClick={() => setQuery(tag)} className="lx-pill cursor-pointer hover:border-ink hover:text-ink">{tag}</button>)}</div>}
      </PageHero>
      <Section id="results" eyebrow={query ? `Results for “${query}”` : 'Published workspaces'} title={query ? 'Matching templates.' : <>Browse the <em>library.</em></>} size="sm">
        {error && <div className="mb-8 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {loading ? (
          <div className="flex justify-center py-16"><i className="bx bx-loader-alt animate-spin text-3xl text-lx-blue" /></div>
        ) : templates.length ? (
          <div className="lx-grid-3">{templates.map((template, index) => <TemplateCard key={template.id} template={template} index={index} />)}</div>
        ) : (
          <div className="rounded-[1.4rem] border border-dashed border-line bg-white p-14 text-center"><i className="bx bx-layer text-4xl text-lx-blue" /><h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">No public templates yet</h2><p className="mt-2 text-sm text-muted">Publish a workspace from Save & Export to make the first one.</p></div>
        )}
      </Section>
    </SiteShell>
  )
}
