'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArtPanel, HeroObjects, PageHero, Section, SiteShell, StandardBand } from '@/components/site/Site'

const plans = [
  {
    name: 'Guest',
    eyebrow: 'Try it instantly',
    description: 'Open the canvas without an account and keep one lightweight workspace.',
    monthly: 0,
    annual: 0,
    annualTotal: 0,
    cta: 'Draw as guest',
    href: '/',
    features: [
      '1 encrypted workspace',
      '2 MB of images per workspace',
      'Local-first canvas recovery',
      'Canvas, docs, and split view',
      'Solo live room · 1 person',
      'PNG and SVG export',
    ],
  },
  {
    name: 'Free',
    eyebrow: 'For personal projects',
    description: 'Sign in for more project space and small-group collaboration at no cost.',
    monthly: 0,
    annual: 0,
    annualTotal: 0,
    cta: 'Sign in free',
    href: '/',
    features: [
      '2 encrypted cloud workspaces',
      '5 MB of images per workspace',
      'Real-time collaboration · 3 people',
      'Canvas, docs, and split view',
      'PNG and SVG export',
      'End-to-end encrypted sync',
      'AI image generation · free with Pollinations',
    ],
  },
  {
    name: 'Pro',
    eyebrow: 'Best value for active work',
    description: 'Turn LixSketch into a daily workspace with room for every active project.',
    monthly: 249,
    annual: 199,
    annualTotal: 2388,
    cta: 'Request Pro access',
    href: 'mailto:ayushman@myceli.ai?subject=LixSketch%20Pro%20early%20access',
    badge: 'Most popular',
    features: [
      'Everything in Free',
      '10 workspaces · 5× more than Free',
      '10 MB of images per workspace',
      'Real-time collaboration · 5 people',
      'High-resolution PDF export',
      'Personal usage dashboard',
      'Priority email support',
    ],
  },
]

const comparison = [
  { feature: 'Canvas, docs, and split view', values: ['Included', 'Included', 'Included'] },
  { feature: 'End-to-end encrypted sync', values: ['Included', 'Included', 'Included'] },
  { feature: 'Cloud workspaces', values: ['1', '2', '10'] },
  { feature: 'Images per workspace', values: ['2 MB', '5 MB', '10 MB'] },
  { feature: 'Live room participants', values: ['1', '3', '5'] },
  { feature: 'PNG and SVG export', values: ['Included', 'Included', 'Included'] },
  { feature: 'PDF export', values: ['—', '—', 'Included'] },
  { feature: 'AI image generation', values: ['—', 'Free with Pollinations', 'Free with Pollinations'] },
]

const faqs = [
  {
    question: 'Is Pro available today?',
    answer: 'Guest and Free are available now. Pro is in early access while billing is rolled out. Requesting access does not charge you or change your current plan.',
  },
  {
    question: 'Are taxes included?',
    answer: 'Prices are shown in Indian rupees and exclude applicable GST. Your final invoice will show taxes before payment.',
  },
  {
    question: 'Can I use LixSketch without paying?',
    answer: 'Yes. Free includes two encrypted cloud workspaces, canvas and docs, PNG and SVG export, and real-time collaboration for up to three people.',
  },
  {
    question: 'Is the AI connector included?',
    answer: 'Yes. Free and Pro include AI image generation with Flux and Klein at no extra LixSketch charge after you connect Pollinations. Each generation uses your personal Pollen balance; LixSketch does not provide or resell Pollen credits.',
  },
]

function Price({ plan, annual }) {
  if (plan.monthly === 0) {
    return (
      <div className="flex min-h-16 items-end gap-2">
        <span className="text-5xl font-semibold tracking-[-0.06em] text-ink">₹0</span>
        <span className="mb-2 text-sm text-muted">forever</span>
      </div>
    )
  }

  const price = annual ? plan.annual : plan.monthly
  return (
    <div className="min-h-16">
      <div className="flex items-end gap-1.5">
        <span className="text-5xl font-semibold tabular-nums tracking-[-0.06em] text-ink">₹{price}</span>
        <span className="mb-2 text-sm text-muted">/ {plan.unit ? `${plan.unit} / ` : ''}month</span>
      </div>
      <p className="lx-meta mt-1 min-h-4">
        {annual ? `₹${plan.annualTotal.toLocaleString('en-IN')}${plan.unit ? ` / ${plan.unit}` : ''} billed yearly` : 'Billed monthly'}
      </p>
    </div>
  )
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(true)

  return (
    <SiteShell>
      <PageHero
        eyebrow="Simple pricing for India"
        title={<>Make space for <em>every idea.</em></>}
        lead="Try the full creative toolkit without an account. Sign in free for collaboration, then upgrade when active projects need more room."
        objects={<HeroObjects blob="₹0" disc={['GUEST', 'FREE']} card={['PRO', 'EARLY ACCESS']} />}
      >
        <div className="mt-8 inline-flex rounded-full border border-line bg-white p-1" role="group" aria-label="Billing period">
          <button
            type="button"
            onClick={() => setAnnual(false)}
            aria-pressed={!annual}
            className={`cursor-pointer rounded-full px-4 py-2 text-xs font-bold transition-colors ${!annual ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setAnnual(true)}
            aria-pressed={annual}
            className={`cursor-pointer rounded-full px-4 py-2 text-xs font-bold transition-colors ${annual ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
          >
            Yearly <span className={annual ? 'text-[#9fc0ff]' : 'text-lx-blue'}>· save 20%</span>
          </button>
        </div>
      </PageHero>

      <Section
        id="plans"
        eyebrow="Plans"
        title={<>Three plans. <em>One canvas.</em></>}
        lead="Pro is currently offered as early access. Displayed prices exclude applicable GST. Requesting access does not initiate a charge."
      >
        <div className="lx-grid-3">
          {plans.map((plan, index) => (
            <motion.article
              key={plan.name}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.08 * index }}
              className={`lx-card flex flex-col ${plan.badge ? 'border-ink shadow-[0_24px_60px_rgba(20,32,24,.12)]' : ''}`}
            >
              <ArtPanel tone={['stone', 'mint', 'yellow'][index]} label={plan.eyebrow} mark={plan.name.slice(0, 1)} small>
                {plan.badge && (
                  <em className="absolute right-4 top-4 z-[3] rounded-full bg-ink px-2.5 py-1 font-mono text-[10px] not-italic uppercase tracking-wider text-white">
                    {plan.badge}
                  </em>
                )}
              </ArtPanel>
              <div className="lx-card-body flex-1">
                <small>{String(index + 1).padStart(2, '0')} / {plan.eyebrow}</small>
                <h3>{plan.name}</h3>
                <p className="min-h-12">{plan.description}</p>
                <div className="mt-7"><Price plan={plan} annual={annual} /></div>

                <Link
                  href={plan.href}
                  className={`lx-btn mt-7 w-full ${plan.badge ? 'lx-btn-primary' : ''}`}
                >
                  {plan.cta}
                  <i className={`bx ${plan.monthly === 0 ? 'bx-right-arrow-alt' : 'bx-envelope'}`} aria-hidden="true" />
                </Link>

                <ul className="mt-6 space-y-3.5 border-t border-line pt-6 text-sm text-muted">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-3">
                      <i className="bx bx-check mt-0.5 text-base text-lx-green" aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.article>
          ))}
        </div>
      </Section>

      <Section
        id="compare"
        tone="deep"
        eyebrow="Compare plans"
        title="The essentials, side by side."
        lead="AI image generation is free with Pollinations on Free and Pro."
      >
        <div className="overflow-x-auto rounded-[1.4rem] border border-line bg-white">
          <table className="w-full min-w-[680px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-ink">
                <th className="lx-meta w-[40%] px-6 py-4 font-normal">Feature</th>
                {plans.map((plan) => <th key={plan.name} className="px-5 py-4 text-base font-semibold">{plan.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => (
                <tr key={row.feature} className="border-b border-line last:border-0">
                  <th className="px-6 py-4 font-normal text-muted">{row.feature}</th>
                  {row.values.map((value, index) => (
                    <td key={`${row.feature}-${plans[index].name}`} className="px-5 py-4 text-ink">
                      {value === 'Included' ? (
                        <span className="inline-flex items-center gap-1.5"><i className="bx bx-check text-lx-green" />{value}</span>
                      ) : value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="faq" eyebrow="Questions" title={<>Clear before <em>you choose.</em></>}>
        <div className="lx-index">
          {faqs.map((faq, index) => (
            <div key={faq.question}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h3>{faq.question}</h3>
                <p>{faq.answer}</p>
              </div>
              <b aria-hidden="true" />
            </div>
          ))}
        </div>
      </Section>

      <StandardBand
        eyebrow="Get started"
        title="Your first workspace is a click away."
        lead="No card required. Draw, write, collaborate, and decide whether you need more later."
      >
        <div className="lx-actions">
          <Link href="/" className="lx-btn lx-btn-primary">
            Start with Free
            <i className="bx bx-right-arrow-alt" aria-hidden="true" />
          </Link>
        </div>
      </StandardBand>
    </SiteShell>
  )
}
