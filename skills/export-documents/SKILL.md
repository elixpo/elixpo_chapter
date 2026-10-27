---
name: export-documents
description: Prepare and export lixSearch answers as polished PDF documents. Use only when a user explicitly asks to create, save, download, or export content as a PDF.
---

# Export Documents

Export completed content without repeating research.

## Workflow

1. Accept the canonical finalized Markdown and an optional title. If research is requested in the same turn, wait until sources are fetched and the final synthesis is complete. Never substitute raw research-thread output or status summaries for that synthesis. For a referential follow-up such as "make that a PDF", export the last substantive grounded assistant answer verbatim; do not regenerate or broaden it.
2. Ensure content is non-empty and remove internal task messages.
3. Reject tool syntax, draft preambles, future-work promises, and documents that do not satisfy an explicit requested count or range.
4. Choose a concise subject-based PDF title. Derive the filename as a lowercase hyphenated slug of that title; never derive either from conversational filler, clarification field labels, or the internal resolved-request envelope.
5. Preserve headings, lists, links, citations, and code blocks.
6. Call `export_to_pdf` exactly once. Never call it once per source or once per reasoning turn.
7. Return the download URL unchanged.

## Guardrails

- Depend on synthesis when content is not finalized.
- Never export search snippets, memory excerpts, placeholders, source-count status messages, prior PDF confirmations, errors, or a draft that has not passed synthesis.
- In a continuation, preserve the earlier answer and its citations. Do not replace it with generic background knowledge.
- A successful export must return its stable download URL; after success, stop exporting.
- Do not invent citations or expand source content.
- Do not export without explicit user intent.
- Never export a clarification question or any task whose required fields remain unresolved. Pending clarification is a hard runtime block, not a suggestion.
- Preserve the text response if export fails.

## Runtime contract

    agent: document
    tools: [export_to_pdf]
    timeout_seconds: 20
    max_concurrency: 1
    depends_on: [synthesize-answer]
    output: document_bundle
