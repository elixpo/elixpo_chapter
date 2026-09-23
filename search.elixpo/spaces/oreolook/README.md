---
title: OreoLook — AI Search & Deep Research
emoji: 🔎
colorFrom: red
colorTo: gray
sdk: gradio
sdk_version: 6.27.0
python_version: "3.12"
app_file: app.py
fullWidth: true
header: mini
pinned: true
license: mit
short_description: Live AI search, cited research, and PDF reports.
thumbnail: https://search.elixpo.com/og-image.png
startup_duration_timeout: 30m
tags:
  - ai-search
  - web-search
  - deep-research
  - research-agent
  - retrieval-augmented-generation
  - citations
  - pdf-generation
  - openai-compatible
  - mcp
  - gradio
  - pollinations
  - arxiv:2609.05463
datasets:
  - p-research/oreolook-research-evals
---

<div align="center">
  <img src="https://search.elixpo.com/favicon.png" width="88" alt="OreoLook logo">
  <h1>OreoLook</h1>
  <p><strong>Search the live web. Verify the claims. Keep the receipts.</strong></p>
  <p>An open-source AI search and deep-research agent powered by Pollinations.</p>

  [![Open Space](https://img.shields.io/badge/Launch-OreoLook-c15f3c?style=for-the-badge)](https://huggingface.co/spaces/Elixpo/OreoLook)
  [![Website](https://img.shields.io/badge/Website-search.elixpo.com-37322d?style=for-the-badge)](https://search.elixpo.com)
  [![Paper](https://img.shields.io/badge/arXiv-2609.05463-b31b1b?style=for-the-badge)](https://arxiv.org/abs/2609.05463)
  [![Evaluations](https://img.shields.io/badge/Dataset-research%20evals-ff9d00?style=for-the-badge)](https://huggingface.co/datasets/p-research/oreolook-research-evals)
</div>

---

OreoLook turns a question into current, traceable research. It searches fresh
sources, reads the useful pages, separates its research trail from the final
answer, preserves follow-up context, and can package the result as a polished
PDF report.

## What you can do

| Capability | What it gives you |
|---|---|
| **Automatic depth** | Fast answers for simple questions; multi-angle research when needed |
| **Live citations** | Clickable sources beside the answer—not buried in prose |
| **PDF reports** | Downloadable research artifacts for sharing and review |
| **Follow-up memory** | Continue the investigation in the same browser session |
| **Inline research trail** | Follow each research step inside the live answer without losing chat context |
| **Focused composer** | One request runs at a time; use `Ctrl + Enter` to send from the keyboard |

### Prompts worth trying

- `What changed in AI today? Cite the original sources.`
- `Compare PostgreSQL, MySQL, and MongoDB for a high-traffic application.`
- `Research this week's climate-tech funding and explain the strongest signals.`
- `Create a PDF briefing on the latest space-technology news.`

## Built differently

```text
Your question
    ↓
OreoLook decision + research pipeline
    ↓
Live search → source reading → evidence synthesis
    ↓
Streaming answer + citations + optional PDF
```

The public Space is a lightweight interface to the registered Pollinations
model `Circuit-Overtime/OreoLook`. Calls use the OpenAI-compatible endpoint at
`https://gen.pollinations.ai/v1`; Pollinations delegates each run to OreoLook
with a short-lived internal `ag_` token.

## User-funded access with Pollinations

The Space uses **Connect User Wallets / BYOP**. Select **Connect with
Pollinations**, approve access in the new tab, and enter the displayed device
code. The public `OREOLOOK_APP_KEY` (`pk_…`) identifies this application; it is
never used as a bearer token.

After approval, Pollinations issues a user-scoped `sk_` token. OreoLook keeps it
only in that visitor's Gradio session state and uses it for their requests. The
Space has no shared server-key fallback, so public traffic cannot consume the
maintainer's balance. Disconnecting clears the local session credential;
authorized keys can also be revoked from the Pollinations dashboard.

Configure one public Space variable:

```bash
hf spaces variables add Elixpo/OreoLook OREOLOOK_APP_KEY="pk_your_app_key"
```

No OAuth client secret, `POLLINATIONS_API_KEY`, signing secret, or `ag_` token
belongs in the Space settings.

## Research paper

OreoLook accompanies **“A Three-Layer Caching Architecture for Low-Latency LLM
Web Search on Commodity CPU Hardware”** by Ayushman Bhattacharya and Nihal Gazi
(2026).

- [Read the paper on arXiv](https://arxiv.org/abs/2609.05463)
- [Discuss it on Hugging Face Papers](https://huggingface.co/papers/2609.05463)
- [Explore the open-source implementation](https://github.com/pollinations/search.elixpo)

```bibtex
@article{bhattacharya2026three,
  title   = {A Three-Layer Caching Architecture for Low-Latency LLM Web Search on Commodity CPU Hardware},
  author  = {Bhattacharya, Ayushman and Gazi, Nihal},
  journal = {arXiv preprint arXiv:2609.05463},
  year    = {2026}
}
```

## OpenAI-compatible API

OreoLook can also be called through Pollinations using the familiar Chat
Completions shape:

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Circuit-Overtime/OreoLook",
    "stream": true,
    "messages": [{"role": "user", "content": "Research the latest MCP developments."}]
  }'
```

For native search tooling, citations, content retrieval, and deep research,
connect to the [OreoLook MCP server](https://search.elixpo.com/docs).

## Develop and verify

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
export OREOLOOK_APP_KEY="pk_your_app_key"
python app.py
```

The Space is an API proxy and does not perform model inference locally. Its
ZeroGPU contract exists only to make the public Gradio demo available on a free
personal Hugging Face account; actual research runs on OreoLook's hosted stack.

---

<div align="center">
  Built by <a href="https://github.com/pollinations">Pollinations</a> ·
  <a href="https://search.elixpo.com">Website</a> ·
  <a href="https://github.com/pollinations/search.elixpo">Source</a> ·
  <a href="https://arxiv.org/abs/2609.05463">Paper</a>
</div>
