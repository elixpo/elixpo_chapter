import os
import sys
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "lixsearch"))
sys.path.insert(0, str(ROOT / "package" / "lix_open_cache_pkg"))

from pipeline.config import MODEL_CACHE_DIR


class FakeModel:
    def to(self, device):
        return self

    def encode(self, *args, **kwargs):
        raise NotImplementedError


class ModelCacheTests(unittest.TestCase):
    def test_cache_environment_is_centralized(self):
        self.assertEqual(os.environ["HF_HOME"], MODEL_CACHE_DIR)
        self.assertEqual(os.environ["SENTENCE_TRANSFORMERS_HOME"], MODEL_CACHE_DIR)
        self.assertTrue(Path(MODEL_CACHE_DIR).is_absolute())

    def test_embedding_model_uses_configured_cache(self):
        from ragService import embeddingService as module

        calls = []

        def fake_sentence_transformer(model_name, **kwargs):
            calls.append((model_name, kwargs))
            return FakeModel()

        with patch.object(module, "SentenceTransformer", fake_sentence_transformer):
            service = module.EmbeddingService("test-model")

        self.assertEqual(calls[0][1]["cache_folder"], MODEL_CACHE_DIR)
        self.assertEqual(service.model.__class__, FakeModel)


if __name__ == "__main__":
    unittest.main()
