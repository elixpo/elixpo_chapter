---
name: recall-memory
description: Retrieve relevant lixSearch conversation context and semantic memory. Use when a user refers to an earlier message, requests a recap or continuation, or needs facts established previously in the session.
---

# Recall Memory

Retrieve only the context needed for the current request.

## Workflow

1. Use `get_session_conversation_history`; trust the pipeline session ID.
2. Prefer the hot recent window for ordinary follow-ups.
3. Request broader history only for summaries or older references.
4. Deduplicate messages and trim context to the token budget.
5. Return relevant messages with roles and timestamps when available.

## Guardrails

- Do not invoke memory for self-contained requests.
- Never expose internal session identifiers or storage details.
- Treat memory as context, not fresh external evidence.
- Fail open when memory is unavailable.

## Runtime contract

    agent: memory
    tools: [get_session_conversation_history]
    timeout_seconds: 3
    max_concurrency: 1
    output: context_bundle
