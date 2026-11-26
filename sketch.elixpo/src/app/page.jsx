'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { PAID_PLANS_ENABLED } from '@/lib/featureFlags'
import useAuth from '@/hooks/useAuth'
import {
  clearRememberedCanvasId,
  createCanvasSessionId,
  getRememberedCanvasId,
  hasLocalSavedWorkspace,
  hasStoredCanvasKey,
} from '@/utils/canvasSession'
import {
  ArtPanel,
  HeroObjects,
  IconBlob,
  PageHero,
  Section,
  SiteShell,
  StandardBand,
  artTone,
} from '@/components/site/Site'

// ── Rough.js hand-drawn shapes for the canvas preview ─────────────────────────
function RoughCanvas({ className }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let mounted = true

    async function draw() {
      const rough = (await import('roughjs')).default
      if (!mounted || !canvas) return

      const ctx = canvas.getContext('2d')
      const dpr = window.devicePixelRatio || 1
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
      ctx.scale(dpr, dpr)

      const rc = rough.canvas(canvas)
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      const ink = '#142018'
      const blue = '#3a65c7'
      const orange = '#e76043'

      rc.rectangle(w * 0.18, h * 0.18, 150, 86, { stroke: ink, strokeWidth: 1.5, roughness: 1.8, fill: '#f1c64f', fillStyle: 'hachure', hachureGap: 7 })
      rc.circle(w * 0.62, h * 0.3, 96, { stroke: blue, strokeWidth: 1.6, roughness: 1.8 })
      rc.line(w * 0.18 + 150, h * 0.18 + 43, w * 0.62 - 50, h * 0.3, { stroke: ink, strokeWidth: 1.4, roughness: 1.6 })
      rc.ellipse(w * 0.78, h * 0.74, 150, 70, { stroke: orange, strokeWidth: 1.4, roughness: 2 })
      rc.rectangle(w * 0.36, h * 0.6, 120, 70, { stroke: ink, strokeWidth: 1.2, roughness: 2.2 })
      rc.line(w * 0.36 + 120, h * 0.6 + 35, w * 0.78 - 75, h * 0.74, { stroke: blue, strokeWidth: 1.2, roughness: 1.6 })
      rc.linearPath([
        [w * 0.1, h * 0.82],
        [w * 0.2, h * 0.72],
        [w * 0.26, h * 0.86],
      ], { stroke: ink, strokeWidth: 1.2, roughness: 2 })
    }

    draw()
    return () => { mounted = false }
  }, [])

  return <canvas ref={canvasRef} className={className} />
}

function ToolbarPreview() {
  const tools = [
    { icon: 'bx-pointer', label: 'Select' },
    { icon: 'bx-move', label: 'Pan' },
    { icon: 'bx-rectangle', label: 'Rectangle' },
    { icon: 'bx-circle', label: 'Circle' },
    { icon: 'bx-minus', label: 'Line' },
    { icon: 'bx-right-top-arrow-circle', label: 'Arrow' },
    { icon: 'bx-pencil', label: 'Draw' },
    { icon: 'bx-text', label: 'Text' },
    { icon: 'bx-code-block', label: 'Code' },
    { icon: 'bx-image', label: 'Image' },
  ]

  return (
    <div className="flex w-fit flex-col gap-1 rounded-2xl border border-line bg-white p-1.5 shadow-[0_18px_48px_rgba(20,32,24,.1)]">
      {tools.map((tool, i) => (
        <div
          key={tool.label}
          className={`flex h-9 w-9 items-center justify-center rounded-xl ${i === 2 ? 'bg-ink text-white' : 'text-muted'}`}
          title={tool.label}
        >
          <i className={`bx ${tool.icon} text-lg`} />
        </div>
      ))}
    </div>
  )
}

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
}

const features = [
  { icon: 'bx bx-pen', title: 'Hand-Drawn Aesthetic', description: 'RoughJS-powered shapes give everything a natural, sketchy feel. Perfect for early-stage thinking.' },
  { icon: 'bx bx-expand', title: 'Infinite Canvas', description: 'Pan, zoom, and draw without limits. From 0.4x to 30x zoom with smooth controls.' },
  { icon: 'bx bx-code-block', title: 'Code Blocks', description: 'Drop syntax-highlighted code blocks right on the canvas with language detection.' },
  { icon: 'bx bx-link-alt', title: 'Smart Arrows', description: 'Arrows auto-attach to shapes and follow them when moved. Connect ideas effortlessly.' },
  { icon: 'bx bx-lock-alt', title: 'E2E Encrypted Sharing', description: 'Share your canvas with a link. The encryption key stays in the URL fragment, never hits the server.' },
  { icon: 'bx bx-brain', title: 'AI Diagram Generation', description: 'Describe what you want in plain text or LixScript. The AI builds the diagram for you.' },
  { icon: 'bx bx-export', title: 'Export Anywhere', description: 'Export your work as PNG or SVG. Clean output, ready for docs, decks, or READMEs.' },
  { icon: 'bx bx-command', title: 'Command Palette', description: 'Keyboard-first workflow. Hit Cmd+K to search tools, actions, and shortcuts.' },
  { icon: 'bx bx-group', title: 'Real-time Collaboration', description: 'Work together on the same canvas in real time. See cursors, edits, and changes live.' },
]

const tools = [
  { icon: 'bx-rectangle', name: 'Rectangles' },
  { icon: 'bx-circle', name: 'Circles' },
  { icon: 'bx-right-top-arrow-circle', name: 'Arrows' },
  { icon: 'bx-minus', name: 'Lines' },
  { icon: 'bx-pencil', name: 'Freehand' },
  { icon: 'bx-text', name: 'Text' },
  { icon: 'bx-code-block', name: 'Code' },
  { icon: 'bx-image', name: 'Images' },
]


// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LandingPage() {
  // Process auth callback params (auth_token, auth_user) from OAuth redirect
  useAuth()

  const [newSessionId, setNewSessionId] = useState('')
  const [checkingSavedCanvas, setCheckingSavedCanvas] = useState(true)
  useEffect(() => {
    // The auth callback owns navigation when sign-in started from a canvas.
    if (window.__lixAuthRedirecting) return

    let cancelled = false
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)

    const showLandingPage = () => {
      if (cancelled) return
      setNewSessionId(createCanvasSessionId())
      setCheckingSavedCanvas(false)
    }

    // An explicit logo click is a request to see the landing page. Normal
    // visits still resume the last restorable canvas below.
    if (new URLSearchParams(window.location.search).has('noredirect')) {
      clearTimeout(timeout)
      showLandingPage()
      return () => {
        cancelled = true
        controller.abort()
      }
    }

    const restoreRememberedCanvas = async () => {
      const rememberedCanvasId = getRememberedCanvasId()
      if (!rememberedCanvasId) {
        clearRememberedCanvasId()
        showLandingPage()
        return
      }

      if (hasLocalSavedWorkspace(rememberedCanvasId)) {
        window.location.replace(`/c/${encodeURIComponent(rememberedCanvasId)}`)
        return
      }

      // A cloud-saved canvas can outlive its local scene buffer. Resume it
      // only when this browser still has the E2E key required to decrypt it.
      try {
        const response = await fetch(`/api/scenes/load?sessionId=${encodeURIComponent(rememberedCanvasId)}&touch=0`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const savedWorkspace = response.ok ? await response.json() : null
        if (savedWorkspace?.encryptedData && hasStoredCanvasKey(rememberedCanvasId)) {
          window.location.replace(`/c/${encodeURIComponent(rememberedCanvasId)}`)
          return
        }
        if (savedWorkspace?.missing || (savedWorkspace?.encryptedData && !hasStoredCanvasKey(rememberedCanvasId))) {
          clearRememberedCanvasId(rememberedCanvasId)
        }
      } catch {
        // Keep the pointer on transient network failure so a later visit can retry.
      }

      showLandingPage()
    }

    restoreRememberedCanvas()
    return () => {
      cancelled = true
      clearTimeout(timeout)
      controller.abort()
    }
  }, [])

  if (checkingSavedCanvas) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper text-ink">
        <i className="bx bx-loader-alt animate-spin text-2xl text-lx-blue" aria-label="Checking saved canvas" />
      </div>
    )
  }

  const newCanvasHref = newSessionId ? `/c/${newSessionId}?new=1&preserveLocal=1` : '#'
  const disabled = !newSessionId ? { 'aria-disabled': true } : {}

  return (
    <SiteShell>
      <PageHero
        compact={false}
        eyebrow="Open source · No account required"
        title={<>Sketch your ideas. <em>Ship them faster.</em></>}
        lead="An open-source WYSIWYG canvas for diagrams, wireframes, and docs. Hand-drawn aesthetic. Infinite canvas. Zero friction."
        actions={(
          <>
            <Link href={newCanvasHref} className="lx-btn lx-btn-primary" {...disabled}>
              <i className="bx bx-palette" />
              Start Drawing
            </Link>
            <Link href="/docs" className="lx-btn">
              <i className="bx bx-book-open" />
              LixScript Docs
            </Link>
          </>
        )}
        objects={<HeroObjects blob="LIX" disc={['ENGINE', 'SVG']} card={['DOCS', 'BLOCK EDITOR']} />}
        note={{ value: '5,000+', label: 'icons in the built-in library', detail: 'Free and open source' }}
      >
        {/* Powered-by chip — credits the lixeditor package shipped on npm */}
        <a
          href="https://www.npmjs.com/package/@elixpo/lixeditor"
          target="_blank"
          rel="noopener noreferrer"
          className="lx-pill mt-6 normal-case tracking-normal transition-colors hover:border-ink"
        >
          <i className="bx bx-package text-sm text-lx-blue" />
          <span>Doc editor powered by</span>
          <b>@elixpo/lixeditor</b>
          <span>on npm ↗</span>
        </a>
      </PageHero>

      {/* Canvas preview + features */}
      <Section
        id="features"
        eyebrow="Features"
        title={<>Everything you need to <em>think visually.</em></>}
        lead="A canvas that feels like a whiteboard but works like a design tool."
      >
        <motion.div {...reveal} transition={{ duration: 0.6 }} className="lx-card mb-4">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-[#e76043]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#f0ad16]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#0b623c]" />
            <span className="lx-meta ml-2">LixSketch &mdash; Untitled Canvas</span>
          </div>
          <div className="relative h-80 bg-paper md:h-[26rem]" style={{ backgroundImage: 'radial-gradient(circle, rgba(20,32,24,.14) 1px, transparent 1.4px)', backgroundSize: '22px 22px' }}>
            <RoughCanvas className="absolute inset-0 h-full w-full" />
            <div className="absolute left-3 top-3">
              <ToolbarPreview />
            </div>
          </div>
        </motion.div>

        <div className="lx-grid-3">
          {features.map((feature, i) => (
            <motion.article
              key={feature.title}
              {...reveal}
              transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}
              className="lx-card lx-card-hover"
            >
              <div className="lx-card-body min-h-[260px]">
                <IconBlob tone={artTone(i)} icon={feature.icon} size={56} className="mb-6" />
                <small>{String(i + 1).padStart(2, '0')} / Feature</small>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            </motion.article>
          ))}
        </div>
      </Section>

      {/* NPM Package & VS Code Extension */}
      <Section
        id="anywhere"
        tone="deep"
        eyebrow="Engine and editor"
        title={<>Use it <em>anywhere.</em></>}
        lead="Embed the engine in your app or draw diagrams right inside VS Code."
      >
        <div className="lx-grid-2">
          <Link href="/resources/npm-package" className="lx-card">
            <ArtPanel tone="mint" label="01 · npm" icon="bx bxl-nodejs" />
            <div className="lx-card-body">
              <small>@elixpo/lixsketch</small>
              <h3>NPM Package</h3>
              <p>Mount a full infinite canvas on any SVG element. Works with React, Vue, Svelte, or plain HTML.</p>
              <code className="mt-6 block overflow-x-auto rounded-xl border border-line bg-paper px-4 py-3 font-mono text-sm text-lx-green">npm install @elixpo/lixsketch</code>
              <b className="lx-card-foot mt-6">Read the package guide →</b>
            </div>
          </Link>
          <Link href="/resources/vscode-extension" className="lx-card">
            <ArtPanel tone="blue" label="02 · VS Code" icon="bx bxl-visual-studio" />
            <div className="lx-card-body">
              <small>LixSketch for VS Code</small>
              <h3>VS Code Extension</h3>
              <p>Draw diagrams inside your editor. Full canvas tab, LixScript syntax highlighting, and live preview.</p>
              <code className="mt-6 block overflow-x-auto whitespace-nowrap rounded-xl border border-line bg-paper px-4 py-3 font-mono text-sm text-lx-blue">https://marketplace.visualstudio.com/items?itemName=elixpo.lixsketch</code>
              <b className="lx-card-foot mt-6">Read the extension guide →</b>
            </div>
          </Link>
        </div>
      </Section>

      {/* Tools */}
      <Section
        id="tools"
        eyebrow="Tools"
        title="Tools that get out of your way."
        lead="Every shape, line, and text block is one click away. No menus to dig through."
      >
        <div className="lx-grid-4">
          {tools.map((tool, i) => (
            <motion.div
              key={tool.name}
              {...reveal}
              transition={{ duration: 0.4, delay: (i % 4) * 0.06 }}
              className="lx-card flex items-center justify-between gap-3 p-5"
            >
              <span className="text-lg font-semibold tracking-tight">{tool.name}</span>
              <IconBlob tone={artTone(i)} icon={`bx ${tool.icon}`} size={44} round />
            </motion.div>
          ))}
        </div>
      </Section>

      <FeaturedTemplates />

      {/* InkFlow v1 Showcase */}
      <Section
        id="inkflow"
        tone="wash"
        eyebrow="Our v1 product"
        title={<>Where it all <em>started.</em></>}
        lead="InkFlow was our first take at a canvas — the foundation that led to LixSketch. Check out the original."
        size="sm"
      >
        <div className="lx-card grid md:grid-cols-[1.1fr_.9fr]">
          <ArtPanel tone="lilac" label="v1 · inkflowa.vercel.app" icon="bx bx-pen" className="h-full min-h-[240px]" />
          <div className="lx-card-body justify-center">
            <small>Previous release</small>
            <h3>InkFlow</h3>
            <p>Where it all started. InkFlow was our first take at a canvas — the foundation that led to LixSketch.</p>
            <div className="lx-actions">
              <a href="https://inkflowa.vercel.app" target="_blank" rel="noopener noreferrer" className="lx-btn">
                <i className="bx bx-link-external" />
                Visit InkFlow
              </a>
            </div>
          </div>
        </div>
      </Section>

      {/* CTA */}
      <StandardBand
        id="start"
        eyebrow="Start now"
        title="Ready to sketch?"
        lead="No sign-up. No paywall. Just open the canvas and start creating."
        items={[
          { title: 'No account', body: 'Open the canvas as a guest and start drawing immediately.' },
          { title: 'Encrypted sharing', body: 'Share links keep the decryption key in the URL fragment, never on the server.' },
          { title: 'Open source', body: 'The engine ships on npm and the whole app lives on GitHub.' },
          { title: 'Export anywhere', body: 'PNG and SVG output, ready for docs, decks, or READMEs.' },
        ]}
      >
        <div className="lx-actions mt-12">
          <Link href={newCanvasHref} className="lx-btn lx-btn-primary" {...disabled}>
            <i className="bx bx-palette" />
            Launch Canvas
          </Link>
          {PAID_PLANS_ENABLED && <Link href="/pricing" className="lx-btn">See pricing</Link>}
        </div>
      </StandardBand>
    </SiteShell>
  )
}

function FeaturedTemplates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/templates?limit=3')
      .then((res) => res.json())
      .then((data) => {
        setTemplates(data.templates || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading || !templates.length) return null

  return (
    <Section
      id="templates"
      tone="warm"
      eyebrow="Templates"
      title={<>Recommended <em>templates.</em></>}
      lead="Start with one of these public workspaces published by the LixSketch community."
    >
      <div className="lx-grid-3">
        {templates.map((template, i) => (
          <Link key={template.id} href={`/templates/${template.slug}`} className="lx-card flex flex-col">
            {template.coverDataUrl ? (
              <div className="flex aspect-[16/9] items-center justify-center overflow-hidden border-b border-line bg-paper">
                <img src={template.coverDataUrl} alt="" className="h-full w-full object-contain" />
              </div>
            ) : (
              <ArtPanel tone={artTone(i)} label={`0${i + 1}`} icon="bx bx-palette" />
            )}
            <div className="lx-card-body flex-1">
              <small>By {template.publisher?.name || 'Community'} · {template.forks || 0} forks</small>
              <h3 className="truncate">{template.title}</h3>
              <p className="line-clamp-2">{template.description || 'A public LixSketch workspace template.'}</p>
              <b className="lx-card-foot mt-6">Open template →</b>
            </div>
          </Link>
        ))}
      </div>
      <Link href="/templates" className="lx-link mt-8 inline-block">Browse all templates →</Link>
    </Section>
  )
}
