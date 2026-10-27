---
name: research-web
description: Find, fetch, and verify current web information for lixSearch. Use for live facts, news, prices, comparisons, source-backed questions, URL reading, local-time lookups, and complex investigations requiring multiple subtopics.
---

# Research Web

Search efficiently and return compact evidence with source URLs.

## Workflow

1. Use `web_search` with the narrowest useful query and depth.
2. For latest, current, today, or news requests, include the current date or recency in the query and treat search snippets only as leads.
3. Resolve relative calendar phrases against the subject location. When a request combines a place with `today`, `tomorrow`, `next N days`, `this week`, or a similar relative range, call `get_local_time` for that place before or alongside search. Use its local date—not server UTC—as the range anchor.
4. Interpret `next N days` as local today through local today + N - 1 days unless the user explicitly says to start tomorrow or gives another start date. Put the resolved dates into the search query and evidence contract.
5. Deduplicate and rank URLs before fetching. Reject app directories, ad pages, scraped profiles, undated pages, and off-topic results.
6. Run independent `fetch_full_text` calls concurrently. A current-information answer requires fetched evidence from at least two credible sources when available.
7. Prefer primary and authoritative sources, then reputable reporting. Capture publication dates for news.
8. Record claims with supporting URLs; never invent missing evidence.
9. Preserve requested coverage. For a bounded range such as N days, gather evidence for every item in the range; do not treat a start/end date or one representative item as complete coverage.
10. Use `deep_research` only when the request requires a genuinely multi-part investigation.
11. Use `get_local_time` for direct time questions and to anchor location-dependent relative dates; do not call it for absolute dates or requests with no location-dependent calendar meaning.

## Performance rules

- Start fetching as search results arrive.
- Default to `standard`; use `quick` for lookups and `thorough` only when necessary.
- Stop after sufficient high-quality evidence is collected.
- Never use semantic memory or an older cached answer as evidence for a freshness-sensitive claim.
- Reuse request-level cached work.
- Return evidence to synthesis instead of writing a second full answer.

## Runtime contract

    agent: research
    tools: [web_search, fetch_full_text, get_local_time, deep_research]
    timeout_seconds: 20
    depends_on: [optimize-search-runtime]
    max_concurrency: 6
    output: evidence_bundle
