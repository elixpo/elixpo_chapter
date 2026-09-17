---
pretty_name: OreoLook Research Evaluations
license: cc-by-4.0
language:
  - en
task_categories:
  - question-answering
  - text-classification
tags:
  - benchmark
  - evaluation
  - ai-search
  - web-search
  - research-agent
  - citations
  - retrieval-augmented-generation
  - arxiv:2609.05463
configs:
  - config_name: evaluations
    data_files:
      - split: test
        path: data/evaluations.jsonl
  - config_name: cache_pairs
    data_files:
      - split: test
        path: data/cache_pairs.jsonl
  - config_name: benchmark_results
    data_files:
      - split: historical_snapshot
        path: data/benchmark_results.jsonl
---

# OreoLook Research Evaluations

A small, inspectable evaluation suite for current-information search agents. It
covers routing, clarification, conversational continuity, citation discipline,
freshness, PDF artifacts, protocol safety, and semantic-cache equivalence.

This repository accompanies:

- [OreoLook live Space](https://huggingface.co/spaces/Elixpo/OreoLook)
- [OreoLook source](https://github.com/pollinations/search.elixpo)
- [Architecture paper](https://arxiv.org/abs/2609.05463)
- [Project website](https://search.elixpo.com)

## Contents

| Configuration | Rows | Purpose |
|---|---:|---|
| `evaluations` | 24 | Synthetic user turns and expected agent behavior |
| `cache_pairs` | 12 | Paraphrase-equivalence and cache-isolation judgments |
| `benchmark_results` | 3 | Paper-reported historical production measurements |

All prompts are synthetic. This release contains no production conversations,
fetched page bodies, user identifiers, credentials, access tokens, or private
session data.

## Evaluation schema

Each `evaluations` row provides a conversation, expected route and context
mode, freshness/citation/artifact requirements, and observable acceptance
criteria. The criteria intentionally evaluate behavior rather than exact
wording so that model and provider changes do not invalidate the suite.

Routes use four labels:

- `direct`: answer without live retrieval.
- `tools`: perform a bounded live lookup or artifact operation.
- `deep_research`: investigate several evidence-bearing aspects.
- `clarify`: request information that is necessary to execute safely.

## Measurement provenance

`benchmark_results` records the historical production snapshot reported in the
paper. It is not a rerun on Hugging Face infrastructure. In particular, the
89.3% value is an aggregate Redis keyspace hit rate across internal operations,
not a query-level semantic-cache hit rate and not an estimate of avoided model
inference.

## Suggested use

1. Run an agent on each conversation in `evaluations`.
2. Record its route, tool trace, final answer, citations, and artifacts.
3. Score the observable criteria with deterministic checks plus human review.
4. Use `cache_pairs` to test whether semantic caching reuses only equivalent
   requests inside the permitted scope.
5. Keep generated outputs separate from this immutable input release.

The suite is a release gate, not a claim of universal search quality. It is
English-only, intentionally compact, and does not replace adversarial,
multilingual, domain-expert, or large-scale human evaluation.

## Reproducibility

Validate the package using only Python's standard library:

```bash
python scripts/validate.py
```

The source repository also contains executable CPU-only memory and latency
gates under `lixsearch/memoryEval`.

## Versioning

This is version `1.0.0`. Static examples and reported measurements are kept
stable within a major version. Future generated results should state the agent
revision, model/provider, execution time, region, and evaluator revision.

## Citation

```bibtex
@article{bhattacharya2026threelayer,
  title={A Three-Layer Caching Architecture for Low-Latency LLM Web Search on Commodity CPU Hardware},
  author={Bhattacharya, Ayushman and Gazi, Nihal},
  journal={arXiv preprint arXiv:2609.05463},
  year={2026},
  url={https://arxiv.org/abs/2609.05463}
}
```

## License

The dataset is released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
