## LLM Calls Per Request Type

### 1. No Search (cache hit / simple chat)
| Step | LLM Calls |
|------|-----------|
| Tool loop iteration 1 (no tool calls → direct answer) | 1 |
| **Total** | **1** |

### 2. Standard Search Query
| Step | LLM Calls |
|------|-----------|
| Tool loop (up to 2 iterations: plan tools → execute → synthesize) | 1–2 |
| Synthesis fallback (if tool loop doesn't produce clean answer) | 0–1 |
| Image description (per image input, uses vision model) | 0–N |
| **Typical total** | **1–2** |
| **Worst case** | **3 + N images** |

### 3. Deep Search
| Step | LLM Calls |
|------|-----------|
| Tool loop iteration 1 (LLM decides to call `deep_research` tool) | 1 |
| Query decomposition (`_decompose_query_with_llm`) | 1 |
| Per sub-query (up to 5 sub-queries × 1 iterations each) | 5 |
| Final synthesis (merges all sub-results, up to 2 retries) | 1–2 |
| **Typical total (3 subs, 1 iter each)** | **~5-6** |
| **Worst case (3 subs, 2 iters + forced synth + retry)** | **~10** |

### Summary
| Mode | Typical | Worst Case |
|------|---------|------------|
| No search | 1 | 1 |
| Standard search | 2–3 | 4 + N images |
| Deep search | ~6 | ~10 |
