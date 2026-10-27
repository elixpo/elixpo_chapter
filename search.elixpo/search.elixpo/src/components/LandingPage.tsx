'use client';

import { Search, BookOpen, Zap, Globe, ExternalLink, Sparkles, Database, Shield, Package, Box, Terminal, Copy, Check } from 'lucide-react';
import { useState } from 'react';

const LINKS = {
  trySearch: 'https://search.elixpo.com',
  docs: '/docs',
  pollinations: 'https://pollinations.ai',
  github: 'https://github.com/Circuit-Overtime/lixSearch',
  pypiCache: 'https://pypi.org/project/lix-open-cache/',
  paper: '/paper.pdf',
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
      title="Copy"
    >
      {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} className="text-white/30" />}
    </button>
  );
}

function PackageCard({ icon: Icon, iconColor, title, description, installCmd, links }: {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  description: string;
  installCmd: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div className="group relative p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-sm hover:bg-white/[0.05] hover:border-indigo-500/20 transition-all duration-300">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-11 h-11 rounded-xl ${iconColor} flex items-center justify-center`}>
          <Icon size={22} className="text-white" />
        </div>
        <div className="flex items-center gap-2">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-md bg-white/[0.05] border border-white/[0.08] text-white/40 hover:text-white/70 hover:border-white/20 transition-all"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
      <h3 className="text-lg font-semibold text-white mb-1.5 font-display">{title}</h3>
      <p className="text-sm text-white/40 leading-relaxed mb-4">{description}</p>
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/30 border border-white/[0.06] font-mono text-sm">
        <Terminal size={14} className="text-white/20 flex-shrink-0" />
        <code className="text-indigo-300/80 flex-1 overflow-x-auto">{installCmd}</code>
        <CopyButton text={installCmd} />
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="group relative p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-sm hover:bg-white/[0.06] hover:border-indigo-500/30 transition-all duration-300 hover:-translate-y-1">
      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 group-hover:bg-indigo-500/20 transition-colors">
        <Icon size={20} className="text-indigo-400" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2 font-display">{title}</h3>
      <p className="text-sm text-white/50 leading-relaxed">{description}</p>
    </div>
  );
}

function StatBadge({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold text-white font-display">{value}</div>
      <div className="text-xs text-white/40 mt-1">{label}</div>
    </div>
  );
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'OreoLook',
  url: 'https://search.elixpo.com',
  description: 'Open-source multi-agent research system with skill-backed routing, grounded search, OpenAI-compatible APIs, buffered streaming, and Redis plus Qdrant memory.',
  applicationCategory: 'SearchApplication',
  operatingSystem: 'Any',
  author: [
    { '@type': 'Person', name: 'Ayushman Bhattacharya', url: 'https://github.com/elixpo' },
    { '@type': 'Person', name: 'Nihal Gazi', email: 'info@nihalgazi.com', affiliation: { '@type': 'Organization', name: 'Pollinations.ai', url: 'https://pollinations.ai' } },
  ],
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  featureList: [
    'Multi-source web search',
    'Deep search with query decomposition',
    'Real citations and source verification',
    'Specialized multi-agent routing',
    'Redis response-chain continuity',
    'Qdrant durable semantic memory',
    'OpenAI-compatible Chat Completions and Responses APIs',
    'Buffered Server-Sent Events streaming',
  ],
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0c14] text-white overflow-y-auto custom-scrollbar">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Subtle background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-indigo-600/[0.07] rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-blue-500/[0.05] rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10">
        {/* Nav */}
        <nav className="flex items-center justify-between px-6 md:px-12 py-5 max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <img src="/favicon.png" alt="OreoLook" className="w-8 h-8" />
            <span className="text-lg font-display font-semibold tracking-tight">OreoLook</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={LINKS.docs}
              className="text-sm text-white/50 hover:text-white/80 transition-colors px-3 py-1.5"
            >
              Docs
            </a>
            <a
              href="/paper"
              className="text-sm text-white/50 hover:text-white/80 transition-colors px-3 py-1.5"
            >
              Paper
            </a>
            <span
              className="text-sm font-medium px-4 py-2 rounded-lg bg-indigo-600/50 text-white/60 cursor-default"
              title="Currently available for internal users only"
            >
              Internal Beta
            </span>
          </div>
        </nav>

        {/* Hero */}
        <section className="px-6 md:px-12 pt-7 pb-16 max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs text-white/50 mb-8">
            <Sparkles size={12} className="text-indigo-400" />
            Open-source AI search engine
          </div>

          <h1 className="text-5xl md:text-7xl font-display font-bold leading-[1.1] mb-6">
            <span className="text-gradient-hero">Search, synthesize,</span>
            <br />
            <span className="text-white/90">understand.</span>
          </h1>

          <p className="text-lg md:text-xl text-white/40 max-w-2xl mx-auto mb-6 leading-relaxed">
            A fast multi-agent research system that routes each request to a specialized agent,
            searches live sources, and streams grounded answers with citations.
          </p>
          <p className="text-sm text-white/25 max-w-lg mx-auto mb-10">
            Currently in internal beta. Public access opening soon.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <span
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600/50 text-white/60 font-medium cursor-default"
            >
              Try OreoLook
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/10 text-white/40 font-semibold">Public access coming soon</span>
            </span>
            <a
              href={LINKS.docs}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/[0.05] border border-white/[0.1] hover:bg-white/[0.08] hover:border-white/[0.2] text-white/70 font-medium transition-all"
            >
              <BookOpen size={16} />
              API Documentation
            </a>
            <a
              href={LINKS.pollinations}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-white/40 hover:text-white/70 font-medium transition-colors"
            >
              <span className="pollinations-shimmer">Pollinations AI</span>
              <ExternalLink size={14} />
            </a>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-center gap-12 md:gap-16">
            <StatBadge value="8" label="Specialized Agents" />
            <div className="w-px h-8 bg-white/10" />
            <StatBadge value="SSE" label="Streaming" />
            <div className="w-px h-8 bg-white/10" />
            <StatBadge value="<2s" label="First Token" />
          </div>
        </section>

          {/* Packages */}
        <section className="px-6 md:px-12 py-16 max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs text-white/50 mb-4">
              <Package size={12} className="text-indigo-400" />
              Open-source packages
            </div>
            <h2 className="text-3xl md:text-4xl font-display font-bold text-white mb-3">
              Use it your way
            </h2>
            <p className="text-white/40 max-w-xl mx-auto">
              Install the Python SDK, use the caching library standalone.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
            <PackageCard
              icon={BookOpen}
              iconColor="bg-indigo-500/20 border border-indigo-500/30"
              title="Research Paper"
              description="A Three-Layer Caching Architecture for Low-Latency LLM Web Search on Commodity CPU Hardware."
              installCmd="Read the paper"
              links={[
                { label: 'PDF', href: LINKS.paper },
                { label: 'Source', href: LINKS.github + '/tree/main/docs/paper' },
              ]}
            />
            <PackageCard
              icon={Database}
              iconColor="bg-emerald-500/20 border border-emerald-500/30"
              title="lix-open-cache"
              description="Standalone 3-layer Redis caching with Huffman disk archival. Session memory, semantic dedup, and LRU eviction."
              installCmd="pip install lix-open-cache"
              links={[
                { label: 'PyPI', href: LINKS.pypiCache },
                { label: 'Paper', href: LINKS.paper },
              ]}
            />
          </div>
        </section>

        {/* Features */}
        <section className="px-6 md:px-12 py-16 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FeatureCard
              icon={Search}
              title="Multi-source search"
              description="Searches the web, academic papers, news, and more — then ranks and deduplicates results intelligently."
            />
            <FeatureCard
              icon={Zap}
              title="Fast agent routing"
              description="Routes coding, writing, web research, media, image, PDF, memory, and synthesis work to focused skill-backed agents."
            />
            <FeatureCard
              icon={Globe}
              title="Real citations"
              description="Every claim is backed by source URLs. No hallucinated references — all sources are fetched and verified."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <FeatureCard
              icon={Database}
              title="Semantic caching"
              description="Redis keeps hot response chains fast while Qdrant stores durable summaries and semantic memories."
            />
            <FeatureCard
              icon={Shield}
              title="Session memory"
              description="Continue Responses API turns with previous_response_id; hot context lives in Redis and durable memory in Qdrant."
            />
            <FeatureCard
              icon={Sparkles}
              title="OpenAI compatible"
              description="Chat Completions and Responses API support, including buffered SSE, store: false, and stateful response chains."
            />
          </div>
        </section>

      

        {/* Code snippet / API preview */}
        <section className="px-6 md:px-12 py-16 max-w-3xl mx-auto">
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
              <div className="w-3 h-3 rounded-full bg-white/[0.08]" />
              <div className="w-3 h-3 rounded-full bg-white/[0.08]" />
              <div className="w-3 h-3 rounded-full bg-white/[0.08]" />
              <span className="ml-2 text-xs text-white/30 font-mono">curl</span>
            </div>
            <pre className="p-5 text-sm font-mono text-white/60 overflow-x-auto leading-relaxed">
              <code>{`curl -N https://search.elixpo.com/v1/responses \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{"model":"web-search","input":"How does RLHF work?"}'`}</code>
            </pre>
          </div>
        </section>

        {/* Footer */}
        <footer className="px-6 md:px-12 py-10 max-w-6xl mx-auto border-t border-white/[0.06]">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/favicon.png" alt="OreoLook" className="w-5 h-5 opacity-40" />
              <span className="text-sm text-white/30">
                Built by <span className="text-white/50">Ayushman Bhattacharya &amp; Nihal Gazi</span> with{' '}
                <a href={LINKS.pollinations} target="_blank" rel="noopener noreferrer" className="pollinations-shimmer hover:opacity-80 transition-opacity">Pollinations.ai</a>
              </span>
            </div>
            <div className="flex items-center gap-6">
              <a href={LINKS.docs} className="text-sm text-white/30 hover:text-white/60 transition-colors">Docs</a>
              <a href={LINKS.trySearch} className="text-sm text-white/30 hover:text-white/60 transition-colors">App</a>
              <a href={LINKS.pollinations} target="_blank" rel="noopener noreferrer" className="text-sm text-white/30 hover:text-white/60 transition-colors">Pollinations</a>
              <a href={LINKS.pypiCache} target="_blank" rel="noopener noreferrer" className="text-sm text-white/30 hover:text-white/60 transition-colors">PyPI</a>
              <a href={LINKS.github} target="_blank" rel="noopener noreferrer" className="text-sm text-white/30 hover:text-white/60 transition-colors">GitHub</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
