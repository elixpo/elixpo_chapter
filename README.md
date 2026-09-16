<div align="center">

<h1 style="display: flex; align-items: center; justify-content: center; gap: 10px; color: #6391F8;"> <img src="./public/images/icon.png" height="48px" width="48px" alt="OreoLook icon"> OreoLook </h1>

**A curious, open-source AI search scout with real-time web research, RAG, and an OpenAI-compatible API.**
<div style="display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 10px; flex-wrap: wrap;">

[![Pollinations Attribute](https://img.shields.io/badge/Built%20with-Pollinations-8a2be2?style=for-the-badge)](https://img.shields.io/badge/Built%20with-Pollinations-8a2be2?style=for-the-badge)
</div>

<hr>
<br>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-3776AB.svg?logo=python&logoColor=white)](https://www.python.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker&logoColor=white)](https://www.docker.com/)
[![OpenAI Compatible](https://img.shields.io/badge/API-OpenAI%20Compatible-412991.svg?logo=openai&logoColor=white)](#-api-usage)
[![Redis](https://img.shields.io/badge/Redis-Cache-DC382D.svg?logo=redis&logoColor=white)](https://redis.io/)
[![Playwright](https://img.shields.io/badge/Playwright-Search%20Agents-2EAD33.svg?logo=playwright&logoColor=white)](https://playwright.dev/)
[![Cloudflare Pages](https://img.shields.io/badge/Frontend-Cloudflare%20Pages-F38020.svg?logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)

[![GitHub stars](https://img.shields.io/github/stars/pollinations/lixSearch?style=social)](https://github.com/pollinations/lixSearch/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/pollinations/lixSearch?style=social)](https://github.com/pollinations/lixSearch/network)
[![GitHub issues](https://img.shields.io/github/issues/pollinations/lixSearch)](https://github.com/pollinations/lixSearch/issues)
[![GitHub last commit](https://img.shields.io/github/last-commit/pollinations/lixSearch)](https://github.com/pollinations/lixSearch/commits/main)

<br/>

<img src="./search.elixpo/public/og-image.png" alt="OreoLook" width="100%" />

</div>

---



## ✨ What Makes OreoLook Different?

- Don't wait for search results. OreoLook remembers what you've already asked about and serves up answers instantly from its memory. Same question, instant answer.

- Unlike regular search engines, OreoLook understands what you're really asking for. It searches the web, watches YouTube videos, analyzes images, and pieces everything together into a coherent answer.

- Every answer comes with sources. Read the original articles, watch the videos, see exactly where the information came from. No fluff, no guessing.

- Ask a follow-up question and OreoLook remembers what you were just talking about. It's like chatting with someone who actually paid attention to the conversation.

---

## 🚩 Released Packages

| Package | Registry | Install / Pull | Description |
|---------|----------|---------------|-------------|
| [`lix-open-cache`](https://pypi.org/project/lix-open-cache/) | PyPI | `pip install lix-open-cache` | Standalone 3-layer Redis caching + Huffman disk archival for conversational AI |
| [`LixSearch`](https://hub.docker.com/r/elixpo/lixsearch) | Docker Hub / GHCR | `docker pull elixpo/lixsearch` OR `docker pull ghcr.io/circuit-overtime/lixsearch` | Full self-hostable search engine (API + Redis + ChromaDB + Playwright) both on Docker Hub and GitHub Container Registry |

- **lix-open-cache** — standalone caching library, works independently with just Redis. No server needed. Only depends on `redis`, `numpy`, `loguru`.
- **LixSearch Docker** — the full search engine. Run `docker compose --env-file .env.local up` and get a working API.

---


## ⚙️ How It Works

When you ask OreoLook a question, here's what happens behind the scenes:

1. **You Ask** - Type your question naturally, like you're talking to a friend
2. **We Understand** - OreoLook breaks down your question into its key parts
3. **We Search** - Multiple search agents fan out across the web, YouTube, and images simultaneously
4. **We Read** - Automatically extract the important information from articles and videos
5. **We Synthesize** - An AI reads through everything and writes a clear, concise answer
6. **You Get Results** - A beautifully formatted answer with clickable sources and relevant images

<img width="901" height="448" alt="image" src="https://github.com/user-attachments/assets/5b04bbd9-0424-479d-81ad-82e209bd0139" />

---

## 🌍 Real-World Use Cases

- Any NLP based model that has the ability to perform tools / function calling can use this 
- Completely self hosted, so you can run it on your own infrastructure and customize it to your needs on CPU
- Can surf youtube / web_images / indexed web pages to find information and synthesize it into a single answer
- Can be used as a backend for any search engine, chatbot, or assistant that needs to
  - Search the web for information
  - Find relevant videos and images
  - Synthesize information into a clear answer
  - Provide sources for all information
- Can be modified into single endpoints for specific use cases like:
  - Product search with reviews and images
  - Recipe search with videos and photos
  - News search with original sources and summaries
  - Location search with details, reviews, and photos


---

## 🛠️ How The System Design HLD

```mermaid
flowchart TD
    A["🔍 You Ask a Question"] --> B["🧠 Query Analysis & Understanding"]
    B --> C{"Cache Hit?"}
    C -- "Yes (cosine > 0.90)" --> J["⚡ Instant Cached Answer"]
    C -- "No" --> D["🔀 Tool Router"]

    D --> E["🌐 Web Search\n(Playwright Agents)"]
    D --> F["🎬 YouTube Search\n(Metadata + Transcripts)"]
    D --> G["🖼️ Image Search"]
    D --> H["📄 Page Fetch\n(Full Text Extraction)"]

    E --> I["📚 RAG Context Assembly\nChunk → Embed → Vector Search"]
    F --> I
    G --> I
    H --> I

    I --> K{"Need More Info?"}
    K -- "Yes (max 3 loops)" --> D
    K -- "No" --> L["🤖 LLM Synthesis\n(Conversation History + RAG + Sources)"]

    L --> M["📡 Stream Response\n(SSE: real-time, word by word)"]
    M --> N["Answer with Sources"]

    M -.-> O[("💾 Save to Cache\n& Session History")]

    style A fill:#4A90D9,stroke:#2C5F8A,color:#fff
    style C fill:#F5A623,stroke:#D4891A,color:#fff
    style J fill:#7ED321,stroke:#5FA318,color:#fff
    style N fill:#7ED321,stroke:#5FA318,color:#000
    style D fill:#9B59B6,stroke:#7D3C98,color:#fff
    style L fill:#E74C3C,stroke:#C0392B,color:#fff
```

**Result:** Fast, accurate answers you can trust.
<img src="./public/images/architechture.png" alt="The Searching Process Explained in Detail" width="100%" /> 

---

## 🎁 Core Capabilities

| Capability | Implementation |
|-----------|---------------|
| **Real-time streaming** | Server-Sent Events (SSE) — tokens stream as they're generated, not buffered |
| **Semantic caching** | Redis DB0 with cosine similarity (threshold 0.90) — repeat queries resolve in <15ms |
| **Multi-turn memory** | Two-tier hybrid: Redis hot window (20 msgs) + Huffman-compressed disk archive (30-day TTL) |
| **Dynamic context** | Token-budget based history injection (6000 tokens) — model gets as much context as it needs |
| **Source attribution** | Every claim links to the original URL, with full-text extraction and relevance scoring |
| **Deep search mode** | Decomposes complex queries into sub-queries, runs parallel mini-pipelines, synthesizes a unified answer |

---


## 📖 API Usage 

OreoLook is available through [Pollinations.ai](https://pollinations.ai) and can also be self-hosted.

OreoLook exposes an **OpenAI-compatible** API. Keep using `lixsearch` as the model ID for direct and Pollinations-routed requests.

### Use through Pollinations

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -d '{
    "model": "lixsearch",
    "messages": [{"role": "user", "content": "What changed in AI today?"}],
    "stream": true
  }'
```

### Basic search
```bash
curl -X POST https://search.elixpo.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "What is the best way to learn Python?"}],
    "stream": true
  }'
```

### Multi-turn conversation
```bash
curl -X POST https://search.elixpo.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "What is the best way to learn Python?"},
      {"role": "assistant", "content": "Here are the top approaches..."},
      {"role": "user", "content": "What about free resources specifically?"}
    ],
    "stream": true
  }'
```
The full conversation history is injected into the model context — no session ID management needed.

### Non-streaming (JSON response)
```bash
curl -X POST https://search.elixpo.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Latest breakthroughs in AI"}],
    "stream": false
  }'
```
Returns a standard `chat.completion` object with `usage` (prompt/completion tokens) and `choices[0].message.content`.


### Available endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | OpenAI-compatible chat completions (stream + non-stream) |
| `/v1/models` | GET | List available models |
| `/api/search` | POST/GET | Legacy search endpoint (SSE) |
| `/api/stats` | GET | Redis memory, disk archive stats, session counts |
| `/api/health` | GET | Health check |
| `/mcp` | POST/GET/DELETE | Stateless Streamable HTTP MCP: research, deep research, PDF export |
| `/docs` | GET | Interactive API documentation (Scalar UI) |

MCP setup, authentication, tools, and limits are documented in [docs/MCP.md](docs/MCP.md).
Pollinations `endpoint_agent` registration, delegated `ag_` authentication,
and the local/static-key split are documented in
[docs/AGENT_RUN_TOKENS.md](docs/AGENT_RUN_TOKENS.md).

---

<br/>

<a href="https://star-history.com/#pollinations/lixSearch&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=pollinations/lixSearch&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=pollinations/lixSearch&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=pollinations/lixSearch&type=Date" width="600" />
 </picture>
</a>

<br/>


## ❓ Why Use lixSearch?

### vs. Regular Search Engines
- Better Understanding - Grasps what you really want, not just keyword matching
- Saves Time - One coherent answer instead of browsing 10 blue links
- Context Aware - Remembers what you were just talking about
- Multimedia - Automatically finds videos, images, and articles

### vs. ChatGPT
- Real-Time Info - Connected to the web, not using outdated training data
- Verified Sources - Every fact links to where it came from
- Fresher Results - Gets today's news, not last year's knowledge
- Faster - Streamed results, not waiting for a complete response

---

## 👥 Perfect For

- Students - Research papers, homework, learning topics  
- Professionals - Market research, industry updates, competitor analysis  
- Home Improvement - DIY guides, product reviews, how-to videos  
- Travelers - Travel planning, local info, reviews  
- Researchers - Deep dives with cited sources  
- News Junkies - Latest updates with original sources  

---

Each will give you a complete, sourced answer.

<img src="./public/images/response.png" alt="Sample Results" width="100%" />

---

## Request Flow 

> This is the flow of the request that we have from the CF Reverse proxy 

```
Browser → search.elixpo.com (Cloudflare Pages, edge)
           ↓
         Next.js API route (e.g. /api/search/route.ts)
           ↓
         backendUrl("/api/search") → "http://search.elixpo.com/api/search"
           ↓
         fetch() with headers:
           X-API-Key: <API_KEY secret>           ← nginx auth on :10001
           X-Internal-Key: <INTERNAL_API_KEY>    ← app-level auth
           ↓
         Your droplet :10001 (nginx) → :9002 (app)
```

## ❔ FAQ

**How is this different from Google?**
Google gives you links. lixSearch gives you answers. We do the searching for you and synthesize a coherent response.

**Is my search history private?**  
Your privacy is important. [Link to privacy policy]

**Can I use this offline?**
lixSearch needs internet to search the web, but works faster when utilizing local cache.

**Why are my results sometimes general?**
Ask more specifically! "Vegan chocolate chip cookies" gives better results than "recipes."

---

## 🤝 Get Involved

Found a bug? Have ideas for improvement? 
[Contribute on GitHub](https://github.com/pollinations/lixSearch) | [Report Issues](https://github.com/pollinations/lixSearch/issues)

---

## 📧 Contact & Support

Questions? Feedback? Suggestions?  
- hello@elixpo.com  
- [lixSearch source](https://github.com/pollinations/lixSearch)  

---

**Happy Searching!**

> *lixSearch - Search smarter, not harder.* 
**Made with ❤️ by Elixpo**
