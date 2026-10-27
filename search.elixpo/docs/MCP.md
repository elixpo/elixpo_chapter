# OreoLook MCP Server

OreoLook exposes its research pipeline through a stateless Model Context Protocol server at:

```text
https://search.elixpo.com/mcp
```

The transport is Streamable HTTP. The server uses the official Python MCP SDK, answers the `2025-11-25` protocol without server-side sessions, and is compatible with newer SDK clients that negotiate or fall back to that protocol.

## Authentication

Every protocol request requires a bearer token. Health is public.

```http
Authorization: Bearer YOUR_OREOLOOK_KEY
```

The server reads `MCP_API_KEY`, falling back to `API_KEY`. Never put either key in a query string.

## Endpoints

| Endpoint | Authentication | Purpose |
| --- | --- | --- |
| `POST /mcp` | Bearer | MCP initialize, discovery, and tool calls |
| `GET /mcp` | Bearer | Optional Streamable HTTP server stream for compatible clients |
| `DELETE /mcp` | Bearer | Protocol-compatible session termination; calls are stateless |
| `GET /mcp/health` | Public | Readiness and tool inventory |

## Tools

### `search_web`

Structured live-web discovery with stable result objects. Results can include title,
URL, author, publication date, ranked highlights, and provider metadata.

| Argument | Type | Default | Limit |
| --- | --- | --- | --- |
| `query` | string | required | 4,000 characters |
| `num_results` | integer | `5` | 1-10 |
| `freshness` | string/null | `null` | `any`, `day`, `week`, `month`, `year` |
| `include_domains` | string[]/null | `null` | 10 domains |
| `exclude_domains` | string[]/null | `null` | 10 domains |
| `include_highlights` | boolean | `true` | - |

### `fetch_pages`

Fetch up to eight public HTTPS pages as clean structured content. Initial URLs,
redirect targets, DNS results, ports, response types, and response sizes are bounded.
Failures are returned per page so one blocked URL does not discard successful pages.

| Argument | Type | Default | Limit |
| --- | --- | --- | --- |
| `urls` | string[] | required | 1-8 public HTTPS URLs |
| `max_characters` | integer | `8000` | 200-20,000 per page |
| `max_concurrency` | integer | `4` | 1-4 |
| `browser_fallback` | boolean | `false` | guarded JS rendering after normal extraction fails |

### `research_web`

Focused live-web research. OreoLook searches, reads the strongest pages, synthesizes the answer, and returns citations.

| Argument | Type | Default | Limit |
| --- | --- | --- | --- |
| `query` | string | required | 4,000 characters |
| `max_sources` | integer | `4` | 1–4 |
| `include_pdf` | boolean | `false` | — |
| `title` | string/null | `null` | PDF title |

### `deep_research`

Bounded multi-angle research. Independent research threads run concurrently and are combined into a detailed cited result.

| Argument | Type | Default | Limit |
| --- | --- | --- | --- |
| `query` | string | required | 4,000 characters |
| `max_sources` | integer | `8` | 2–8 |
| `include_pdf` | boolean | `false` | — |
| `title` | string/null | `null` | PDF title |

### `export_research_pdf`

Exports already-completed Markdown without launching new research. The returned URL serves a PDF for the configured content-retention period, seven days by default.

| Argument | Type | Default | Limit |
| --- | --- | --- | --- |
| `content` | string | required | 80,000 characters |
| `title` | string/null | `null` | 160 characters |

## Client example

```python
import asyncio
import os

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client


async def main():
    headers = {"Authorization": f"Bearer {os.environ['MCP_API_KEY']}"}
    async with streamablehttp_client(
        "https://search.elixpo.com/mcp", headers=headers
    ) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(
                "research_web",
                {"query": "What changed in the MCP specification recently?"},
            )
            print(result.structuredContent)


asyncio.run(main())
```

## Operational limits

The defaults are configurable through environment variables:

| Variable | Default |
| --- | --- |
| `MCP_MAX_CONCURRENCY` | `4` per replica |
| `MCP_RESEARCH_TIMEOUT_SECONDS` | `90` |
| `MCP_DEEP_RESEARCH_TIMEOUT_SECONDS` | `240` |
| `MCP_QUERY_MAX_CHARS` | `4000` |
| `MCP_RESULT_MAX_CHARS` | `60000` |
| `MCP_PDF_MAX_CHARS` | `80000` |
| `MCP_ALLOWED_HOSTS` | production and local OreoLook hosts |
| `MCP_ALLOWED_ORIGINS` | `https://search.elixpo.com` |

Requests do not create conversation sessions, response chains, or durable user memories. Internal caches may still reuse public research results according to the service cache policy.

Research results include both the backwards-compatible `sources` URL list and
normalized `citations` and `evidence` arrays. Citation objects carry a stable ID,
title, canonical URL, author, publication/access timestamps, bounded excerpt,
the surrounding answer claim, and confidence.

## Pollinations integration

The direct endpoint is the first deployment stage. Official Pollinations registration additionally requires an upstream service binding, an `oreolook` entry in `shared/registry/mcp.ts`, explicit billing mode, proxy tests, and documentation. Once registered, hosted agents will use:

```text
https://gen.pollinations.ai/mcp/oreolook
```

Raw search and fetch are intentionally not exposed here because the official Exa MCP already provides them. OreoLook contributes the research orchestration, synthesis, citations, and export layer.
