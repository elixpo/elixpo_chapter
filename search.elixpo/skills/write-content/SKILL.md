---
name: write-content
description: Draft, rewrite, summarize, and structure clear written content. Use for articles, reports, emails, documentation, explanations, creative prose, editing, tone changes, and text that does not require live web research.
---

# Write Content

Write directly for the requested audience, format, tone, and length.

## Workflow

1. Extract the deliverable, audience, constraints, and source material.
2. Preserve supplied facts and distinguish unsupported claims.
3. Build the smallest useful structure.
4. Draft once, then remove repetition and filler.
5. Return only the requested artifact unless clarification is essential.

## Guardrails

- Do not invoke web research for stable or fully supplied material.
- Do not fabricate citations, quotes, or factual details.
- Preserve required terminology and formatting.
- Keep revisions faithful to the original meaning unless asked otherwise.

## Runtime contract

    agent: writing
    tools: []
    timeout_seconds: 30
    max_concurrency: 2
    output: content_bundle
