import Link from 'next/link';
import {
  ArrowRight, BookOpen, Bot, BrainCircuit, CheckCircle2, Code2, Database,
  ExternalLink, FileSearch, Github, Globe2, Layers3, Radio, Rocket, Search, Sparkles, Zap,
} from 'lucide-react';
import { SPACE_URL } from '@/lib/site-metadata';

const features = [
  { icon: Globe2, title: 'Searches the live web', text: 'OreoLook fans out across current sources, then reads the pages worth reading.' },
  { icon: FileSearch, title: 'Answers with receipts', text: 'Claims stay connected to clickable sources, so you can verify the answer instead of trusting a mystery box.' },
  { icon: BrainCircuit, title: 'Knows when to go deep', text: 'Quick questions stay quick. Complex investigations decompose into bounded parallel research paths.' },
  { icon: Radio, title: 'Streams as it works', text: 'OpenAI-compatible SSE delivers progress and polished answer chunks without making your terminal stare into the void.' },
  { icon: Database, title: 'Remembers efficiently', text: 'Redis keeps hot response chains close. Qdrant stores durable summaries and semantic memory.' },
  { icon: Layers3, title: 'Built from focused skills', text: 'Search, media, code, writing, memory, images, PDFs, and synthesis each get a purpose-built route.' },
];

const code = `curl -N https://gen.pollinations.ai/v1/chat/completions \\
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "Circuit-Overtime/OreoLook",
    "stream": true,
    "messages": [{"role":"user","content":"What changed in AI today?"}]
  }'`;

export default function OreoLookLanding() {
  return (
    <main className="site-shell">
      <header className="site-nav">
        <Link href="/" className="site-brand" aria-label="OreoLook home">
          <img src="/favicon.png" alt="" width="38" height="38" />
          <span><strong>OreoLook</strong><small>AI search with receipts</small></span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/" className="active"><Search size={16} /> Overview</Link>
          <Link href="/docs"><BookOpen size={16} /> Docs</Link>
          <Link href="/paper"><FileSearch size={16} /> Paper</Link>
          <a href={SPACE_URL} target="_blank" rel="noreferrer"><Rocket size={16} /> Try live</a>
        </nav>
        <div className="nav-actions">
          <a className="space-link" href={SPACE_URL} target="_blank" rel="noreferrer">
            <Rocket size={15} /> <span>Live Space</span>
          </a>
          <a className="source-link" href="https://github.com/pollinations/search.elixpo" target="_blank" rel="noreferrer">
            <Github size={15} /> <span>GitHub source</span>
          </a>
        </div>
      </header>

      <section className="hero-wrap">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles size={13} /> Open-source AI answer engine</span>
          <h1>Search the web.<br />Get the answer.<br /><em>Keep the receipts.</em></h1>
          <p>OreoLook searches live sources, reads what matters, and streams one grounded answer with citations. Fast when it can be. Thorough when it should be.</p>
          <div className="hero-actions">
            <a className="primary-action" href={SPACE_URL} target="_blank" rel="noreferrer">
              Try the live Space <ArrowRight size={17} />
            </a>
            <Link className="secondary-action" href="/docs">Read the API docs</Link>
          </div>
          <div className="trust-line">
            <span><CheckCircle2 size={14} /> OpenAI compatible</span>
            <span><CheckCircle2 size={14} /> Source grounded</span>
            <span><CheckCircle2 size={14} /> Self-hostable</span>
          </div>
        </div>

        <div className="answer-card" aria-label="Example OreoLook research flow">
          <div className="answer-head"><span className="live-dot" /> Researching now <small>QUICK SEARCH</small></div>
          <div className="query-chip"><Search size={15} /> What changed in AI today?</div>
          <div className="research-flow">
            <div><Globe2 size={17} /><span><strong>Search</strong><small>5 fresh sources</small></span></div>
            <ArrowRight size={14} />
            <div><Bot size={17} /><span><strong>Read</strong><small>3 useful pages</small></span></div>
            <ArrowRight size={14} />
            <div><Sparkles size={17} /><span><strong>Answer</strong><small>cited + streamed</small></span></div>
          </div>
          <article>
            <span className="answer-label">OREOLOOK ANSWER</span>
            <p>The useful signal, condensed into a clear answer—with every important trail still attached.</p>
            <div className="citation-row"><span>1</span><span>2</span><span>3</span><small>Sources checked</small></div>
          </article>
        </div>
      </section>

      <section className="metric-row" aria-label="OreoLook capabilities">
        <div><strong>8</strong><span>skill-backed agents</span></div>
        <div><strong>2</strong><span>OpenAI API surfaces</span></div>
        <div><strong>SSE</strong><span>buffered live streaming</span></div>
        <div><strong>Redis + Qdrant</strong><span>hot and durable memory</span></div>
      </section>

      <section className="content-section">
        <span className="eyebrow">Why OreoLook</span>
        <div className="section-heading">
          <h2>Less tab chaos.<br />More verified signal.</h2>
          <p>A search engine should do more than hand you ten blue links. OreoLook does the searching, reading, comparing, and citing—then gives you the part worth knowing.</p>
        </div>
        <div className="feature-grid">
          {features.map(({ icon: Icon, title, text }, index) => (
            <article key={title}>
              <div className={`feature-icon tone-${(index % 5) + 1}`}><Icon size={20} /></div>
              <h3>{title}</h3><p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-section">
        <div className="space-orbit"><Rocket size={28} /><span /></div>
        <div>
          <span className="eyebrow">No setup, just curiosity</span>
          <h2>Take OreoLook for a spin.</h2>
          <p>Run quick searches, launch deep research, inspect citations, continue a conversation, and download PDF reports from the official Hugging Face Space.</p>
        </div>
        <a className="primary-action" href={SPACE_URL} target="_blank" rel="noreferrer">
          Open the Space <ExternalLink size={16} />
        </a>
      </section>

      <section className="api-section">
        <div>
          <span className="eyebrow"><Code2 size={13} /> One familiar API</span>
          <h2>Drop web intelligence into the stack you already have.</h2>
          <p>Use Chat Completions for stateless history or Responses for Redis-backed continuity. Call OreoLook through Pollinations with the same tools your application already understands.</p>
          <Link href="/docs" className="text-link">Explore the integration guide <ArrowRight size={15} /></Link>
        </div>
        <div className="code-window">
          <div><span /><span /><span /><small>terminal</small></div>
          <pre><code>{code}</code></pre>
        </div>
      </section>

      <section className="open-section">
        <PackageMark />
        <div><span className="eyebrow">Open by design</span><h2>Inspect it. Fork it. Make search yours.</h2><p>OreoLook is open source, self-hostable, and powered by OreoFlow with Pollinations AI. The research architecture and three-layer cache paper are public too.</p></div>
        <div className="open-links">
          <a href={SPACE_URL} target="_blank" rel="noreferrer">Try the Hugging Face Space <ExternalLink size={14} /></a>
          <a href="https://github.com/pollinations/search.elixpo" target="_blank" rel="noreferrer">Browse the repository <ExternalLink size={14} /></a>
          <Link href="/paper">Read the research paper <ArrowRight size={14} /></Link>
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-brand"><img src="/favicon.png" alt="" width="30" height="30" /><span><strong>OreoLook</strong><small>Search smarter. Verify everything.</small></span></div>
        <p>Built by Ayushman Bhattacharya and Nihal Gazi with <a href="https://pollinations.ai">Pollinations AI</a>.</p>
        <div><a href={SPACE_URL} target="_blank" rel="noreferrer">Live Space</a><Link href="/docs">Docs</Link><Link href="/paper">Paper</Link><a href="https://github.com/pollinations/search.elixpo">GitHub</a></div>
      </footer>
    </main>
  );
}

function PackageMark() {
  return <div className="package-mark"><Zap size={26} /></div>;
}
