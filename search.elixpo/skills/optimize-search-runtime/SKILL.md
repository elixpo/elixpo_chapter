---
name: optimize-search-runtime
description: Select and execute the smallest sufficient OreoLook search plan. Use whenever a request may need current web evidence, source fetching, or deep research and runtime cost, latency, context size, tool count, and output depth must remain bounded.
---

# Optimize Search Runtime

Choose depth from meaning and required evidence, never keyword matching.

## Plan

1. Use `quick` for one live fact or a narrow lookup: at most 1 search, 2 fetched sources, and 350 answer tokens.
2. Use `standard` for one subject requiring verification or comparison: at most 2 searches, 4 fetched sources, and 700 answer tokens.
3. Use `deep` only for a genuinely multi-part investigation: at most 4 subqueries, 2 iterations per subquery, 4 fetched sources per subquery, and 1,800 final tokens.
4. Reuse cached evidence and conversation summaries before requesting new work.
5. Stop as soon as the evidence supports the answer. Never spend remaining budget merely because it exists.

## Context

- Include only history needed to resolve references or maintain continuity.
- Prefer the durable summary over raw older turns.
- Keep ordinary injected history within 3,000 tokens and deep history within 6,000 tokens.
- Keep retrieved semantic context within 4,000 characters and the five most relevant memories.

## Output

- Answer first and cite only sources actually used.
- Avoid repeating tool evidence or narrating internal work.
- Match response length to the request; a quick lookup should remain quick.

## Runtime contract

    agent: policy
    tools: []
    timeout_seconds: 1
    max_concurrency: 1
    output: bounded_search_policy
