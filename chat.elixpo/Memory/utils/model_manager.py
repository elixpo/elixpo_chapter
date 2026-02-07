"""Utility for managing embedding models with on-demand downloads."""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


class EmbeddingModelManager:
    """Manages embedding model downloads and availability checks."""
    
    # Model information
    MODEL_INFO = {
        "all-MiniLM-L6-v2": {
            "size": "~80MB",
            "dimensions": 384,
            "description": "Fast, lightweight model (default)",
            "use_case": "General purpose, fast inference",
        },
        "BAAI/bge-m3": {
            "size": "~2.2GB",
            "dimensions": 1024,
            "description": "Enhanced quality embeddings",
            "use_case": "Better accuracy for general text",
        },
        "jinaai/jina-embeddings-v2-base-code": {
            "size": "~500MB",
            "dimensions": 768,
            "description": "Code-optimized embeddings",
            "use_case": "Code understanding and technical content",
        },
    }
    
    @classmethod
    def get_model_info(cls, model_name: str) -> Optional[dict]:
        """Get information about a model.
        
        Args:
            model_name: Name of the embedding model
            
        Returns:
            Dictionary with model information or None if not in registry
        """
        return cls.MODEL_INFO.get(model_name)
    
    @classmethod
    def list_models(cls) -> dict:
        """List all known embedding models with their information.
        
        Returns:
            Dictionary mapping model names to their information
        """
        return cls.MODEL_INFO.copy()
    
    @classmethod
    def check_model_downloaded(cls, model_name: str) -> bool:
        """Check if a model is already downloaded.
        
        Args:
            model_name: Name of the embedding model
            
        Returns:
            True if model is cached locally, False otherwise
        """
        try:
            from sentence_transformers import SentenceTransformer
            from pathlib import Path
            import os
            
            # Check in sentence-transformers cache
            cache_folder = Path.home() / ".cache" / "torch" / "sentence_transformers"
            model_folder = cache_folder / model_name.replace("/", "_")
            
            if model_folder.exists():
                return True
            
            # Also check HuggingFace cache
            hf_cache = Path.home() / ".cache" / "huggingface" / "hub"
            model_id = f"models--{model_name.replace('/', '--')}"
            
            if (hf_cache / model_id).exists():
                return True
            
            return False
        except Exception as e:
            logger.debug(f"Could not check model cache: {e}")
            return False
    
    @classmethod
    def download_model(cls, model_name: str) -> bool:
        """Download an embedding model.
        
        Args:
            model_name: Name of the embedding model
            
        Returns:
            True if download successful, False otherwise
        """
        try:
            from sentence_transformers import SentenceTransformer
            
            model_info = cls.get_model_info(model_name)
            if model_info:
                logger.info(f"Downloading {model_name} ({model_info['size']})...")
                logger.info(f"Use case: {model_info['use_case']}")
            else:
                logger.info(f"Downloading custom model: {model_name}")
            
            # This will download the model if not cached
            model = SentenceTransformer(model_name)
            logger.info(f"✓ Successfully downloaded {model_name}")
            return True
        except Exception as e:
            logger.error(f"✗ Failed to download {model_name}: {e}")
            return False
    
    @classmethod
    def print_model_info(cls, model_name: str) -> None:
        """Print detailed information about a model.
        
        Args:
            model_name: Name of the embedding model
        """
        info = cls.get_model_info(model_name)
        
        if not info:
            print(f"Model: {model_name} (custom model)")
            print("  No information available for this model")
            return
        
        print(f"Model: {model_name}")
        print(f"  Size: {info['size']}")
        print(f"  Dimensions: {info['dimensions']}")
        print(f"  Description: {info['description']}")
        print(f"  Use Case: {info['use_case']}")
        
        is_downloaded = cls.check_model_downloaded(model_name)
        status = "✓ Downloaded" if is_downloaded else "✗ Not downloaded"
        print(f"  Status: {status}")


def print_available_models():
    """Print all available embedding models."""
    print("\n" + "=" * 70)
    print("AVAILABLE EMBEDDING MODELS")
    print("=" * 70)
    
    manager = EmbeddingModelManager()
    
    for model_name in manager.MODEL_INFO.keys():
        print()
        manager.print_model_info(model_name)
    
    print("\n" + "=" * 70)
    print("Note: Models are downloaded automatically when first used.")
    print("You can also use any HuggingFace model by specifying its name.")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    # CLI for model management
    import sys
    
    if len(sys.argv) > 1:
        command = sys.argv[1]
        
        if command == "list":
            print_available_models()
        elif command == "info" and len(sys.argv) > 2:
            model_name = sys.argv[2]
            EmbeddingModelManager.print_model_info(model_name)
        elif command == "download" and len(sys.argv) > 2:
            model_name = sys.argv[2]
            EmbeddingModelManager.download_model(model_name)
        else:
            print("Usage:")
            print("  python -m utils.model_manager list")
            print("  python -m utils.model_manager info <model_name>")
            print("  python -m utils.model_manager download <model_name>")
    else:
        print_available_models()
