"""Regression coverage for Qdrant-backed retrieval startup."""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase, mock

PROJECT_ROOT = Path(__file__).resolve().parents[1]
LIXSEARCH_ROOT = PROJECT_ROOT / "lixsearch"
if str(LIXSEARCH_ROOT) not in sys.path:
    sys.path.insert(0, str(LIXSEARCH_ROOT))

from ragService import retrievalSystem as retrieval_module


class RetrievalStartupTests(TestCase):
    def tearDown(self) -> None:
        retrieval_module.RetrievalSystem._instance = None

    def test_qdrant_store_does_not_require_device_attribute(self) -> None:
        embedding_service = SimpleNamespace(device="ipc-remote")
        vector_store = SimpleNamespace()
        semantic_cache = SimpleNamespace()

        with (
            mock.patch.object(
                retrieval_module.EmbeddingServiceClient,
                "get_instance",
                return_value=embedding_service,
            ),
            mock.patch.object(retrieval_module, "VectorStore", return_value=vector_store),
            mock.patch.object(retrieval_module, "SemanticCache", return_value=semantic_cache),
        ):
            retrieval = retrieval_module.RetrievalSystem()

        self.assertIs(retrieval.embedding_service, embedding_service)
        self.assertIs(retrieval.vector_store, vector_store)
        self.assertIs(retrieval.semantic_cache, semantic_cache)


if __name__ == "__main__":
    import unittest

    unittest.main()
