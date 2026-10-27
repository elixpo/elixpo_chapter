---
name: orchestrate-search
description: Route lixSearch requests to the smallest useful set of specialist skills and arrange independent work in parallel. Use for every request that may require web research, media processing, conversation memory, document export, deep research, or synthesis across multiple tool results.
---

# Orchestrate Search

Build a bounded execution graph. Prefer deterministic routing over an extra model call.

## Route

1. Resolve any same-session pending clarification before general routing. Validate every indispensable field; explicitly mark safely defaultable fields instead of repeatedly asking for them, and never invent user-supplied values.
2. Classify the request without executing tools.
3. Select only necessary skills: `research-web`, `handle-media`, `recall-memory`, `export-documents`, and `synthesize-answer`.
4. Run independent skills concurrently.
5. Preserve dependencies: search → fetch → synthesize → export. Export is a single terminal step after the answer is finalized.
6. Stream progress as tasks begin and results arrive.
7. Cancel optional work once sufficient evidence exists.

## Routing rules

- If a required subject, reference, scope, location, timeframe, format, or constraint is missing and different choices would materially change the result, ask one concise clarification question before calling tools.
- Do not ask for optional preferences when a safe, reversible default exists. State the assumption briefly when it matters.
- Resolve references from supplied message history or session context. If neither contains the referenced item, say what is missing and ask the user to restate or attach it; never invent the missing context.
- A clarification can continue only through the same `session_id`, a `previous_response_id`, or client-supplied message history. Treat an otherwise context-free request as standalone.
- While required fields remain unresolved, call no tools and create no artifacts. Persist the exact missing fields, source turn, and one concise question.
- Treat cancellation, task replacement, unrelated replies, partial answers, and complete answers as distinct transitions. Clear pending state only after validated completion, explicit cancellation, or explicit replacement.
- Answer stable, self-contained questions directly.
- Use web research for information likely to have changed.
- Use deep research only for genuinely multi-part investigations.
- Do not invoke media, memory, or export speculatively.
- Never recall semantic memory for a self-contained current-information request. Memory provides continuity, not fresh evidence.
- Reuse equivalent results already present in request memory.
- Never create unbounded tasks.

## Runtime contract

    agent: orchestrator
    tools: []
    timeout_seconds: 2
    max_concurrency: 1
    output: execution_graph
