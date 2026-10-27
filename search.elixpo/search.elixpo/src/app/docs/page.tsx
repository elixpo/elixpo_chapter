import type { Metadata } from 'next';
import {
  Database,
  Layers,
  HardDrive,
  Cpu,
  ArrowLeft,
  Package,
  Terminal,
  GitBranch,
  Clock,
  Zap,
  Search,
  Server,
  ExternalLink,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'OreoLook Documentation — OpenAI-compatible AI Search API',
  description:
    'Build with OreoLook: OpenAI-compatible APIs, streaming web research, cited answers, Redis continuity, Qdrant memory, and lix-open-cache.',
  alternates: { canonical: '/docs' },
};

/* ── tiny helpers ─────────────────────────────────────────────────── */

function Badge({ children, color = 'indigo' }: { children: React.ReactNode; color?: string }) {
  const colors: Record<string, string> = {
    indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    rose: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  };
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${colors[color] ?? colors.indigo}`}>
      {children}
    </span>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="relative rounded-xl bg-[#ffc] border border-white/[0.06] overflow-x-auto text-[13px] leading-relaxed">
      <code className="block p-5 text-black/70 font-mono whitespace-pre">{children}</code>
    </pre>
  );
}

function SectionHeading({ id, icon: Icon, children }: { id: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <h2 id={id} className="flex items-center gap-3 text-2xl font-display font-bold text-white mt-20 mb-6 scroll-mt-24">
      <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
        <Icon size={18} className="text-indigo-400" />
      </span>
      {children}
    </h2>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-display font-semibold text-white/90 mt-10 mb-3">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] text-white/50 leading-relaxed mb-4">{children}</p>;
}

function Diagram({ children }: { children: string }) {
  return (
    <pre className="rounded-xl bg-[#0d0f17] border border-white/[0.06] p-5 text-[12px] leading-[1.7] font-mono text-white/40 overflow-x-auto mb-6">
      {children}
    </pre>
  );
}

/* ── sidebar nav items ────────────────────────────────────────────── */

const NAV = [
  { id: 'overview', label: 'Overview' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'install', label: 'Installation' },
  { id: 'quickstart', label: 'Quick Start' },
  { id: 'config', label: 'Configuration' },
  { id: 'layer-session', label: 'Session Context Window' },
  { id: 'layer-semantic', label: 'Semantic Query Cache' },
  { id: 'layer-url', label: 'URL Embedding Cache' },
  { id: 'hybrid', label: 'Hybrid Storage' },
  { id: 'huffman', label: 'Huffman Codec' },
  { id: 'coordinator', label: 'CacheCoordinator' },
  { id: 'api', label: 'Full API Reference' },
  { id: 'pypi', label: 'Publishing to PyPI' },
];

/* ── page ─────────────────────────────────────────────────────────── */

export default function DocsPage() {
  return (
    <div className="agent-theme min-h-screen">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-indigo-600/[0.05] rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 flex">
        {/* ── Sidebar ─────────────────────────────────────────── */}
        <aside className="hidden lg:block fixed top-0 left-0 w-64 h-screen border-r border-white/[0.06] bg-[#0a0c14]/80 backdrop-blur-sm overflow-y-auto custom-scrollbar">
          <div className="p-6">
            <a href="/" className="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm transition-colors mb-8">
              <ArrowLeft size={14} />
              Back to home
            </a>
            <div className="flex items-center gap-2 mb-1">
              <Database size={16} className="text-indigo-400" />
              <span className="font-display font-semibold text-white text-sm">lix_open_cache</span>
            </div>
            <span className="text-[11px] text-white/30">Multi-layer caching for conversational AI</span>

            <nav className="mt-8 flex flex-col gap-0.5">
              {NAV.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="text-[13px] text-white/40 hover:text-white/80 hover:bg-white/[0.04] px-3 py-1.5 rounded-lg transition-colors"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        {/* ── Main content ────────────────────────────────────── */}
        <main className="lg:ml-64 flex-1 max-w-4xl mx-auto px-6 md:px-12 py-12 pb-32">
          {/* Header */}
          <div className="mb-16">
            <div className="flex items-center gap-3 mb-4">
              <Badge color="indigo">v0.1.0</Badge>
              <Badge color="emerald">Python 3.10+</Badge>
              <Badge color="purple">Redis-backed</Badge>
            </div>
            <h1 className="text-4xl md:text-5xl font-display font-bold leading-tight mb-4">
              <span className="text-gradient-hero">lix_open_cache</span>{' '}
              <span className="text-white/60 text-3xl">/ lix_cache</span>
            </h1>
            <P>
              A standalone, pip-installable Python package that extracts the entire multi-layer caching
              and session management stack from lixSearch into a reusable library. Drop it into any
              conversational AI project — chatbots, search assistants, RAG pipelines — and get
              production-grade session memory, semantic caching, and compressed disk archival out of the box.
            </P>
          </div>

          {/* ── Overview ────────────────────────────────────────── */}
          <SectionHeading id="overview" icon={Layers}>Overview</SectionHeading>
          <P>
            lix_cache provides three independent Redis-backed cache layers, a Huffman-compressed disk archive,
            and a coordinator that wires them together per session. Each layer solves a different problem:
          </P>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
            {[
              { title: 'Session Context', db: 'Redis DB 2', desc: 'Rolling window of recent messages — your conversation memory.', color: 'indigo', ttl: '24h' },
              { title: 'Semantic Cache', db: 'Redis DB 0', desc: 'Skip the LLM if a near-identical query was answered recently.', color: 'blue', ttl: '5 min' },
              { title: 'URL Embeddings', db: 'Redis DB 1', desc: 'Cache embedding vectors for fetched URLs across all sessions.', color: 'emerald', ttl: '24h' },
            ].map((l) => (
              <div key={l.title} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-white">{l.title}</span>
                  <Badge color={l.color}>{l.ttl}</Badge>
                </div>
                <p className="text-xs text-white/40 leading-relaxed mb-2">{l.desc}</p>
                <span className="text-[10px] font-mono text-white/25">{l.db}</span>
              </div>
            ))}
          </div>

          <P>
            Below them sits the <strong className="text-white/80">HybridConversationCache</strong> — a two-tier
            hot/cold storage engine that keeps the last 20 messages in Redis and spills older messages to
            Huffman-compressed <code className="text-amber-300/70 bg-white/[0.04] px-1.5 py-0.5 rounded text-xs">.huff</code> files
            on disk. An LRU eviction daemon runs in the background, migrating idle sessions after a configurable timeout.
          </P>

          {/* ── Architecture ────────────────────────────────────── */}
          <SectionHeading id="architecture" icon={GitBranch}>Architecture</SectionHeading>

          <Diagram>{`
  User message arrives
  │
  ├─ ① SessionContextWindow (Redis DB 2)
  │   ├─ get_context() → last 20 messages from Redis
  │   ├─ If Redis empty → load from .huff archive → re-hydrate
  │   └─ Inject into LLM prompt as conversation history
  │
  ├─ ② SemanticCacheRedis (Redis DB 0)
  │   ├─ Compute query embedding vector
  │   ├─ cosine_similarity(cached, new) ≥ 0.90 ?
  │   │   ├─ HIT  → return cached response (skip LLM)
  │   │   └─ MISS → continue pipeline
  │   └─ After LLM: cache (embedding, response) for 5 min
  │
  ├─ ③ URLEmbeddingCache (Redis DB 1)
  │   ├─ Before embedding a URL: check Redis
  │   │   ├─ HIT  → use cached vector (~0ms vs ~200ms)
  │   │   └─ MISS → compute, cache for 24h
  │   └─ Global (shared across all sessions)
  │
  └─ HybridConversationCache (backing store)
      ├─ Hot: Redis ordered list (LPUSH/RPOP, 20-msg window)
      ├─ Cold: Huffman-compressed .huff files on disk
      ├─ Overflow: oldest messages spill hot → cold
      └─ LRU daemon: idle 2h → migrate to disk, free Redis
          `}</Diagram>

          <SubHeading>Package structure</SubHeading>
          <Code>{`lix_open_cache/
├── pyproject.toml
└── lix_open_cache/
    ├── __init__.py                # re-exports from lix_cache
    └── lix_cache/
        ├── __init__.py            # public API
        ├── config.py              # CacheConfig dataclass
        ├── redis_pool.py          # Connection-pooled Redis factory
        ├── huffman_codec.py       # Canonical Huffman encoder/decoder
        ├── conversation_archive.py # .huff disk persistence
        ├── hybrid_cache.py        # Redis hot + disk cold + LRU eviction
        ├── semantic_cache.py      # SemanticCacheRedis + URLEmbeddingCache
        ├── context_window.py      # SessionContextWindow (wraps HybridCache)
        └── coordinator.py         # CacheCoordinator (orchestrates all 3)`}</Code>

          {/* ── Installation ───────────────────────────────────── */}
          <SectionHeading id="install" icon={Package}>Installation</SectionHeading>

          <SubHeading>From PyPI (once published)</SubHeading>
          <Code>{`pip install lix-open-cache`}</Code>

          <SubHeading>From source (development)</SubHeading>
          <Code>{`git clone https://github.com/pollinations/lixsearch.git
cd lixsearch/lix_open_cache
pip install -e .`}</Code>

          <SubHeading>Dependencies</SubHeading>
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left py-2 px-3 text-white/60 font-medium">Package</th>
                  <th className="text-left py-2 px-3 text-white/60 font-medium">Version</th>
                  <th className="text-left py-2 px-3 text-white/60 font-medium">Why</th>
                </tr>
              </thead>
              <tbody className="text-white/40">
                {[
                  ['redis', '≥ 5.0', 'All three cache layers'],
                  ['numpy', '≥ 1.24', 'Embedding vectors, cosine similarity'],
                  ['loguru', '≥ 0.7', 'Structured logging'],
                  ['lz4 (optional)', '≥ 4.0', 'Alternative compression for ConversationCacheManager'],
                ].map(([pkg, ver, why]) => (
                  <tr key={pkg} className="border-b border-white/[0.03]">
                    <td className="py-2 px-3 font-mono text-xs text-indigo-400/70">{pkg}</td>
                    <td className="py-2 px-3 font-mono text-xs">{ver}</td>
                    <td className="py-2 px-3 text-xs">{why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Quick Start ────────────────────────────────────── */}
          <SectionHeading id="quickstart" icon={Zap}>Quick Start</SectionHeading>

          <SubHeading>Full 3-layer setup (CacheCoordinator)</SubHeading>
          <Code>{`from lix_open_cache import CacheConfig, CacheCoordinator

config = CacheConfig(
    redis_host="localhost",
    redis_port=6379,
    redis_key_prefix="mychat",
    archive_dir="./data/conversations",
)

# Initialize per session — creates all 3 cache layers
cache = CacheCoordinator(session_id="user-abc", config=config)

# Store messages
cache.add_message_to_context("user", "What's the weather in Tokyo?")
cache.add_message_to_context("assistant", "It's 22°C and sunny in Tokyo.")

# Retrieve context for next LLM call
history = cache.get_context_messages()
# → [{"role": "user", "content": "What's the weather...", "timestamp": ...},
#    {"role": "assistant", "content": "It's 22°C...", "timestamp": ...}]

# Check semantic cache before calling LLM
import numpy as np
query_embedding = np.random.rand(384).astype(np.float32)  # your real embedding
cached = cache.get_semantic_response("https://weather.com", query_embedding)
if cached:
    print("Cache hit! Skip LLM.")
else:
    # Call LLM, then cache the response
    response = {"answer": "22°C and sunny", "sources": ["..."]}
    cache.cache_semantic_response("https://weather.com", query_embedding, response)

# Stats
print(cache.get_stats())`}</Code>

          <SubHeading>Session memory only (no semantic cache)</SubHeading>
          <Code>{`from lix_open_cache import HybridConversationCache, CacheConfig

config = CacheConfig(redis_host="localhost", redis_port=6379)
cache = HybridConversationCache("session-123", config=config)

cache.add_message("user", "hello")
cache.add_message("assistant", "hey there!")

# Get rolling window (last 20 from Redis, rest from disk)
messages = cache.get_context()

# Smart retrieval: recent + semantically relevant from disk
context = cache.smart_context(
    query="what did we talk about yesterday?",
    query_embedding=your_embedding,  # optional
    recent_k=10,
    disk_k=5,
)
# → {"recent": [...last 10...], "relevant": [...5 from disk archive...]}`}</Code>

          <SubHeading>Disk-only (no Redis needed)</SubHeading>
          <Code>{`from lix_open_cache import ConversationArchive

archive = ConversationArchive("./data/chats", session_ttl_days=30)

archive.append_turn("sess-1", {"role": "user", "content": "hello"})
archive.append_turn("sess-1", {"role": "assistant", "content": "hi!"})

turns = archive.load_all("sess-1")       # all turns
recent = archive.load_recent("sess-1", 5) # last 5
results = archive.search_by_text("sess-1", "hello", top_k=3)

# Cleanup expired sessions (older than 30 days)
archive.cleanup_expired()`}</Code>

          <SubHeading>Just the Huffman codec</SubHeading>
          <Code>{`from lix_open_cache import HuffmanCodec
from lix_open_cache.lix_cache.huffman_codec import encode_str, decode_bytes

text = "The quick brown fox jumps over the lazy dog" * 100
compressed = encode_str(text)
restored = decode_bytes(compressed)

assert restored == text
print(f"{len(text)}B → {len(compressed)}B ({len(compressed)/len(text)*100:.0f}%)")`}</Code>

          {/* ── Configuration ──────────────────────────────────── */}
          <SectionHeading id="config" icon={Server}>Configuration</SectionHeading>
          <P>
            All tunables live in a single <code className="text-amber-300/70 bg-white/[0.04] px-1.5 py-0.5 rounded text-xs">CacheConfig</code> dataclass.
            Pass it to any class constructor. No global state, no scattered constants.
          </P>

          <Code>{`from lix_open_cache import CacheConfig

# Option 1: explicit values
config = CacheConfig(
    redis_host="redis.internal",
    redis_port=6379,
    redis_password="secret",
    redis_key_prefix="myapp",
    redis_pool_size=50,

    # Session context (Redis DB 2)
    session_redis_db=2,
    session_ttl_seconds=86400,     # 24h
    hot_window_size=20,            # messages in Redis
    session_max_tokens=None,       # no token limit

    # Semantic query cache (Redis DB 0)
    semantic_redis_db=0,
    semantic_ttl_seconds=300,      # 5 minutes
    semantic_similarity_threshold=0.90,
    semantic_max_items_per_url=50,

    # URL embedding cache (Redis DB 1)
    url_cache_redis_db=1,
    url_cache_ttl_seconds=86400,   # 24h

    # Disk archive
    archive_dir="./data/conversations",
    disk_ttl_days=14,              # purge after 14 days

    # LRU eviction
    evict_after_minutes=120,       # 2h idle → migrate to disk
)

# Option 2: from environment variables (12-factor apps)
# Reads MYAPP_REDIS_HOST, MYAPP_REDIS_PORT, MYAPP_SEMANTIC_TTL_SECONDS, etc.
config = CacheConfig.from_env("MYAPP")`}</Code>

          {/* ── Layer: Session Context ─────────────────────────── */}
          <SectionHeading id="layer-session" icon={Clock}>Layer 1 — Session Context Window</SectionHeading>
          <P>
            <strong className="text-white/80">Problem:</strong> &ldquo;What did the user say 5 messages ago?&rdquo;
            LLMs are stateless — you need to inject conversation history into every prompt.
          </P>
          <P>
            <strong className="text-white/80">How it works:</strong> SessionContextWindow wraps HybridConversationCache.
            It maintains a rolling window of the last N messages in Redis (fast reads, ~1ms) and archives
            everything older to Huffman-compressed files on disk. The window size, TTL, and eviction timing
            are all configurable via CacheConfig.
          </P>
          <Code>{`from lix_open_cache import SessionContextWindow, CacheConfig

config = CacheConfig(redis_host="localhost", redis_port=6379)
ctx = SessionContextWindow("session-abc", config=config)

ctx.add_message("user", "Explain quantum computing")
ctx.add_message("assistant", "Quantum computing uses qubits...")

# Rolling window for LLM prompt injection
messages = ctx.get_context()           # last 20 from Redis
full = ctx.get_full_history()          # all messages (Redis + disk)
formatted = ctx.get_formatted_context() # "User: ...\nAssistant: ..."

# Smart retrieval (recent + semantically relevant from disk)
context = ctx.smart_context("tell me more about qubits")

# Manual lifecycle
ctx.flush_to_disk()  # force migrate Redis → disk
ctx.clear()          # wipe Redis hot window
print(ctx.get_stats())`}</Code>

          <div className="p-4 rounded-xl bg-indigo-500/[0.05] border border-indigo-500/20 mb-6">
            <p className="text-xs text-indigo-300/70 leading-relaxed">
              <strong className="text-indigo-300">TTL refresh:</strong> Every time <code className="text-xs">get_context()</code> is
              called, the Redis TTL for all messages in that session is refreshed. Active sessions never expire.
              Only idle sessions get evicted by the LRU daemon.
            </p>
          </div>

          {/* ── Layer: Semantic Cache ──────────────────────────── */}
          <SectionHeading id="layer-semantic" icon={Search}>Layer 2 — Semantic Query Cache</SectionHeading>
          <P>
            <strong className="text-white/80">Problem:</strong> &ldquo;The user asked almost the same question 2 minutes ago — why call the LLM again?&rdquo;
          </P>
          <P>
            Keyed by <code className="text-amber-300/70 bg-white/[0.04] px-1.5 py-0.5 rounded text-xs">(session_id, URL, query_embedding)</code>.
            On lookup, it computes cosine similarity against all cached embeddings for that URL.
            If any exceed the threshold (default 0.90), it&apos;s a hit. This means rephrasing
            (&ldquo;weather Tokyo&rdquo; vs &ldquo;Tokyo weather forecast&rdquo;) still hits cache.
          </P>
          <Code>{`from lix_open_cache import SemanticCacheRedis, CacheConfig
import numpy as np

config = CacheConfig(
    redis_host="localhost",
    redis_port=6379,
    semantic_ttl_seconds=300,              # 5 min TTL
    semantic_similarity_threshold=0.92,    # stricter matching
)
cache = SemanticCacheRedis("session-abc", config=config)

embedding = np.random.rand(384).astype(np.float32)
response = {"answer": "Tokyo is 22°C", "sources": ["https://..."]}

# Cache a response
cache.set("https://weather.com/tokyo", embedding, response)

# Later — check for similar query
new_embedding = embedding + np.random.randn(384).astype(np.float32) * 0.01
hit = cache.get("https://weather.com/tokyo", new_embedding)
# → returns response dict if similarity ≥ 0.92, else None`}</Code>

          {/* ── Layer: URL Embedding Cache ─────────────────────── */}
          <SectionHeading id="layer-url" icon={Database}>Layer 3 — URL Embedding Cache</SectionHeading>
          <P>
            <strong className="text-white/80">Problem:</strong> Computing embeddings for fetched URL content takes ~200ms per URL.
            If two sessions fetch the same article, the embedding is computed twice.
          </P>
          <P>
            This layer is <strong className="text-white/80">global</strong> (shared across all sessions) with a 24-hour TTL.
            Stores raw float32 bytes in Redis — no JSON serialization overhead.
          </P>
          <Code>{`from lix_open_cache import URLEmbeddingCache, CacheConfig
import numpy as np

config = CacheConfig(redis_host="localhost", redis_port=6379)
cache = URLEmbeddingCache("global", config=config)

embedding = np.random.rand(384).astype(np.float32)

cache.set("https://example.com/article", embedding)
cached = cache.get("https://example.com/article")
# → np.ndarray (float32) or None

# Batch store
cache.batch_set({
    "https://a.com": emb_a,
    "https://b.com": emb_b,
})`}</Code>

          {/* ── Hybrid Storage ─────────────────────────────────── */}
          <SectionHeading id="hybrid" icon={HardDrive}>Hybrid Storage Engine</SectionHeading>
          <P>
            HybridConversationCache is the core storage engine behind SessionContextWindow.
            It manages the two-tier hot/cold architecture:
          </P>

          <Diagram>{`
  add_message("user", "hello")
  │
  ├─ LPUSH to Redis ordered list
  ├─ SETEX message payload (JSON, with TTL)
  │
  ├─ Window > 20?
  │   ├─ Yes → RPOP oldest message
  │   │        └─ Append to .huff disk archive (Huffman-compressed)
  │   └─ No  → done
  │
  └─ Update LRU activity timestamp

  ────────────────────────────────────────────

  get_context()
  │
  ├─ Redis has messages?
  │   ├─ Yes → return them, refresh all TTLs
  │   └─ No  → session was evicted
  │            ├─ Load from .huff archive
  │            ├─ Re-hydrate Redis with last 20
  │            └─ Return full history
  │
  └─ Redis unavailable?
      └─ Fallback: read everything from disk

  ────────────────────────────────────────────

  LRU Eviction Daemon (background thread)
  │
  └─ Every 60s: check _eviction_registry
      └─ If session idle > evict_after_minutes:
          ├─ Read all messages from Redis
          ├─ Append to .huff archive
          ├─ Delete from Redis
          └─ Free memory
          `}</Diagram>

          {/* ── Huffman Codec ──────────────────────────────────── */}
          <SectionHeading id="huffman" icon={Cpu}>Huffman Codec</SectionHeading>
          <P>
            The disk archive uses a custom <strong className="text-white/80">canonical Huffman codec</strong> instead
            of zlib/gzip. Conversation text has very skewed byte frequencies (spaces, &apos;e&apos;, &apos;t&apos;, common ASCII),
            so Huffman assigns shorter bit codes to frequent bytes. ~54% compression ratio on typical conversation text,
            with zero native dependencies.
          </P>

          <SubHeading>.huff file format</SubHeading>
          <Diagram>{`
  Offset  Size    Field
  ──────  ──────  ─────────────────────────────────
  0       4B      Magic: "CAv1"
  4       8B      created_at (float64 LE, UNIX ts)
  12      8B      updated_at (float64 LE, UNIX ts)
  20      4B      num_turns (uint32 LE)
  24      var     Huffman-compressed payload
                  └─ JSON array of turn objects:
                     [{"role":"user","content":"...","timestamp":1234}, ...]

  Huffman payload:
  ┌─────────────────────────────────────────┐
  │ "HCv1" magic (4B)                       │
  │ original_length (uint32 LE)             │
  │ num_symbols (uint16 LE)                 │
  │ symbol_table: [byte, bitlength] × N     │
  │ padding_bits (uint32 LE)                │
  │ compressed bitstream                     │
  └─────────────────────────────────────────┘
          `}</Diagram>

          {/* ── CacheCoordinator ───────────────────────────────── */}
          <SectionHeading id="coordinator" icon={Layers}>CacheCoordinator</SectionHeading>
          <P>
            The top-level orchestrator. One constructor call initializes all three Redis layers and the
            hybrid storage engine. Use this when you want the full stack.
          </P>
          <Code>{`from lix_open_cache import CacheCoordinator, CacheConfig

config = CacheConfig.from_env("MYAPP")
cache = CacheCoordinator(session_id="user-abc", config=config)

# Context window (Layer 1)
cache.add_message_to_context("user", "hello")
msgs = cache.get_context_messages()
text = cache.get_formatted_context(max_lines=30)

# Semantic cache (Layer 2)
hit = cache.get_semantic_response(url, query_embedding)
cache.cache_semantic_response(url, query_embedding, response)

# URL embeddings (Layer 3)
emb = cache.get_url_embedding("https://example.com")
cache.cache_url_embedding("https://example.com", embedding)
cache.batch_cache_url_embeddings({"url1": emb1, "url2": emb2})

# Lifecycle
cache.clear_session_cache()  # wipe semantic + context
cache.clear_context()        # wipe context only
stats = cache.get_stats()    # full stats from all 3 layers`}</Code>

          {/* ── API Reference ──────────────────────────────────── */}
          <SectionHeading id="api" icon={Terminal}>Full API Reference</SectionHeading>

          {[
            {
              cls: 'CacheConfig',
              desc: 'Dataclass holding all configuration. Pass to any class constructor.',
              methods: [
                ['CacheConfig(**kwargs)', 'Create config with explicit values'],
                ['CacheConfig.from_env(prefix)', 'Load from env vars: {PREFIX}_REDIS_HOST, etc.'],
              ],
            },
            {
              cls: 'CacheCoordinator',
              desc: 'Top-level orchestrator — initializes all 3 layers.',
              methods: [
                ['__init__(session_id, config?)', 'Create coordinator for a session'],
                ['add_message_to_context(role, content, metadata?)', 'Add message to session window'],
                ['get_context_messages()', 'Get rolling window messages'],
                ['get_formatted_context(max_lines?)', 'Get as formatted string'],
                ['get_semantic_response(url, query_embedding)', 'Check semantic cache'],
                ['cache_semantic_response(url, query_embedding, response)', 'Store in semantic cache'],
                ['get_url_embedding(url)', 'Get cached URL embedding'],
                ['cache_url_embedding(url, embedding)', 'Cache URL embedding'],
                ['batch_cache_url_embeddings(dict)', 'Batch cache URL embeddings'],
                ['clear_session_cache()', 'Clear semantic + context'],
                ['clear_context()', 'Clear context window only'],
                ['get_stats()', 'Stats from all 3 layers'],
              ],
            },
            {
              cls: 'SessionContextWindow',
              desc: 'Conversation memory — wraps HybridConversationCache.',
              methods: [
                ['__init__(session_id, config?, **kwargs)', 'Create context window'],
                ['add_message(role, content, metadata?)', 'Add a message'],
                ['get_context()', 'Get hot window messages'],
                ['get_full_history()', 'All messages (Redis + disk)'],
                ['smart_context(query, embedding?, recent_k?, disk_k?)', 'Recent + relevant from disk'],
                ['get_formatted_context(max_lines?)', 'As formatted string'],
                ['flush_to_disk()', 'Force migrate Redis → disk'],
                ['clear()', 'Wipe Redis hot window'],
                ['get_stats()', 'Session statistics'],
              ],
            },
            {
              cls: 'HybridConversationCache',
              desc: 'Two-tier hot/cold storage engine.',
              methods: [
                ['__init__(session_id, config?, **kwargs)', 'Create hybrid cache'],
                ['add_message(role, content, metadata?, embedding?)', 'Add message (auto-evicts overflow)'],
                ['get_context()', 'Hot window (auto re-hydrates from disk)'],
                ['get_full()', 'Merge hot + cold, persist new messages'],
                ['smart_context(query, embedding?, recent_k?, disk_k?)', 'Recent + relevant'],
                ['flush_to_disk()', 'Migrate Redis → disk'],
                ['clear()', 'Clear Redis keys'],
                ['delete_session()', 'Delete from Redis + disk'],
                ['get_stats()', 'Hot count, disk turns, sizes'],
              ],
            },
            {
              cls: 'ConversationArchive',
              desc: 'Huffman-compressed disk persistence. No Redis required.',
              methods: [
                ['__init__(archive_dir, session_ttl_days?)', 'Create archive'],
                ['append_turn(session_id, turn)', 'Append single turn'],
                ['append_turns(session_id, turns)', 'Batch append'],
                ['load_all(session_id)', 'Load all turns'],
                ['load_recent(session_id, n)', 'Load last N turns'],
                ['search_by_text(session_id, query, top_k?)', 'Text overlap search'],
                ['search_by_embedding(session_id, embedding, top_k?)', 'Cosine similarity search'],
                ['delete_session(session_id)', 'Delete archive file'],
                ['session_exists(session_id)', 'Check if .huff file exists'],
                ['get_metadata(session_id)', 'Read header without decompressing'],
                ['cleanup_expired()', 'Purge sessions older than TTL'],
                ['list_sessions()', 'List all archived sessions'],
              ],
            },
            {
              cls: 'SemanticCacheRedis',
              desc: 'Per-session semantic query cache.',
              methods: [
                ['__init__(session_id, config?, **kwargs)', 'Create semantic cache'],
                ['get(url, query_embedding)', 'Check for cached response'],
                ['set(url, query_embedding, response)', 'Cache a response'],
                ['clear_session()', 'Delete all entries for this session'],
                ['get_stats()', 'Cache statistics'],
              ],
            },
            {
              cls: 'URLEmbeddingCache',
              desc: 'Global URL embedding cache.',
              methods: [
                ['__init__(session_id, config?, **kwargs)', 'Create embedding cache'],
                ['get(url)', 'Get cached embedding (np.ndarray or None)'],
                ['set(url, embedding)', 'Cache an embedding'],
                ['batch_set(url_embeddings)', 'Batch cache'],
                ['get_stats()', 'Cache statistics'],
              ],
            },
            {
              cls: 'HuffmanCodec',
              desc: 'Pure-Python canonical Huffman encoder/decoder.',
              methods: [
                ['HuffmanCodec.encode(data: bytes)', 'Compress bytes → bytes'],
                ['HuffmanCodec.decode(data: bytes)', 'Decompress bytes → bytes'],
                ['encode_str(text: str)', 'Compress string → bytes'],
                ['decode_bytes(data: bytes)', 'Decompress bytes → string'],
              ],
            },
          ].map((cls) => (
            <div key={cls.cls} className="mb-8">
              <h4 className="text-base font-display font-semibold text-white mb-1">
                <code className="text-indigo-400">{cls.cls}</code>
              </h4>
              <p className="text-xs text-white/40 mb-3">{cls.desc}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] border-collapse">
                  <tbody>
                    {cls.methods.map(([method, desc]) => (
                      <tr key={method} className="border-b border-white/[0.03]">
                        <td className="py-1.5 px-2 font-mono text-xs text-amber-300/60 whitespace-nowrap">{method}</td>
                        <td className="py-1.5 px-2 text-white/40">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* ── PyPI ───────────────────────────────────────────── */}
          <SectionHeading id="pypi" icon={ExternalLink}>Publishing to PyPI</SectionHeading>

          <SubHeading>1. Prepare</SubHeading>
          <Code>{`cd lix_open_cache

# Ensure pyproject.toml has the right metadata
# name, version, description, author, license, URLs, etc.

# Install build tools
pip install build twine`}</Code>

          <SubHeading>2. Build</SubHeading>
          <Code>{`python -m build

# Creates:
#   dist/lix_open_cache-0.1.0.tar.gz      (sdist)
#   dist/lix_open_cache-0.1.0-py3-none-any.whl  (wheel)`}</Code>

          <SubHeading>3. Test on TestPyPI first</SubHeading>
          <Code>{`# Upload to test index
twine upload --repository testpypi dist/*

# Test install from test index
pip install --index-url https://test.pypi.org/simple/ lix-open-cache

# Verify
python -c "from lix_open_cache import CacheConfig; print('OK')"`}</Code>

          <SubHeading>4. Publish to production PyPI</SubHeading>
          <Code>{`# Upload to real PyPI
twine upload dist/*

# You'll need a PyPI API token:
#   1. Create account at https://pypi.org
#   2. Go to Account Settings → API tokens
#   3. Create token scoped to "lix-open-cache" project
#   4. Use __token__ as username, the token as password

# Or use a .pypirc file:
cat > ~/.pypirc << 'EOF'
[pypi]
username = __token__
password = pypi-AgEIcH...your-token-here
EOF

twine upload dist/*`}</Code>

          <SubHeading>5. Automate with GitHub Actions</SubHeading>
          <Code>{`# .github/workflows/publish.yml
name: Publish to PyPI
on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: pip install build twine
      - run: cd lix_open_cache && python -m build
      - run: cd lix_open_cache && twine upload dist/*
        env:
          TWINE_USERNAME: __token__
          TWINE_PASSWORD: \${{ secrets.PYPI_TOKEN }}`}</Code>

          <SubHeading>6. Version bumps</SubHeading>
          <Code>{`# Edit lix_open_cache/pyproject.toml → version = "0.2.0"
# Then rebuild and upload:
cd lix_open_cache
python -m build
twine upload dist/*`}</Code>

          {/* ── Footer ────────────────────────────────────────── */}
          <div className="mt-24 pt-8 border-t border-white/[0.06]">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <img src="/favicon.png" alt="lixSearch" className="w-5 h-5 opacity-40" />
                <span className="text-sm text-white/30">
                  Built by <span className="text-white/50">Ayushman Bhattacharya &amp; Nihal Gazi</span> with{' '}
                  <a href="https://pollinations.ai" target="_blank" rel="noopener noreferrer" className="pollinations-shimmer hover:opacity-80 transition-opacity">Pollinations.ai</a>
                </span>
              </div>
              <div className="flex items-center gap-6">
                <a href="/" className="text-sm text-white/30 hover:text-white/60 transition-colors">Home</a>
                <a href="https://pollinations.ai" target="_blank" rel="noopener noreferrer" className="text-sm text-white/30 hover:text-white/60 transition-colors">Pollinations</a>
                <a href="https://github.com/pollinations/lixsearch" target="_blank" rel="noopener noreferrer" className="text-sm text-white/30 hover:text-white/60 transition-colors">GitHub</a>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
