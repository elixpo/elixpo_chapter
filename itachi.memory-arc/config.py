"""Configuration constants and classes for the memory system.

Copyright 2025 Itachi-1824

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

import json
import os
from dataclasses import dataclass, field, asdict
from typing import Any, Literal

# Short-Term Memory (STM) Configuration
DEFAULT_STM_MAX_LENGTH = 150
"""Maximum number of messages to keep in short-term memory before triggering LTM processing."""

# Vector Database Configuration
DEFAULT_EMBEDDING_MODEL = "all-MiniLM-L6-v2"
"""Default sentence-transformers model for generating embeddings (lightweight, fast)."""

ENHANCED_EMBEDDING_MODEL = "BAAI/bge-m3"
"""Enhanced embedding model for better quality general text embeddings."""

CODE_EMBEDDING_MODEL = "jinaai/jina-embeddings-v2-base-code"
"""Specialized embedding model optimized for code and technical content."""

DEFAULT_STORAGE_PATH = "./data"
"""Default base path for storing memory files."""

DEFAULT_VECTOR_DB_PATH = "./data/vector_db"
"""Default path for Qdrant vector database storage."""

# Embedding Model Presets
EMBEDDING_PRESETS = {
    "default": DEFAULT_EMBEDDING_MODEL,  # Fast, lightweight (384 dim)
    "enhanced": ENHANCED_EMBEDDING_MODEL,  # Better quality (1024 dim)
    "code": CODE_EMBEDDING_MODEL,  # Code-optimized (768 dim)
}
"""Available embedding model presets for different use cases."""

# Long-Term Memory (LTM) Configuration
LTM_IMPORTANCE_THRESHOLD = 8
"""Minimum importance score (1-10) for the first pass of memory search."""

LTM_SEARCH_RESULTS = 3
"""Default number of results to return from LTM search."""

# Logging Configuration
LOG_LEVEL = "INFO"
"""Default logging level for the memory system."""


@dataclass
class HeuristicConfig:
    """Configuration for heuristic processing."""
    
    # Summarization
    summary_method: Literal["sample", "concat", "keybert"] = "keybert"
    summary_max_length: int = 500
    
    # Fact extraction
    fact_extraction_method: Literal["ner", "keywords", "patterns"] = "keywords"
    use_spacy: bool = False  # Requires spacy installation
    custom_patterns: list[str] = field(default_factory=list)
    
    # Importance scoring
    importance_rules: dict[str, Any] = field(default_factory=lambda: {
        "base_score": 5,
        "length_bonus": {"threshold": 500, "bonus": 2},
        "keyword_bonus": {"keywords": ["important", "remember", "critical"], "bonus": 2},
        "question_bonus": 1,
        "code_bonus": 2,  # For coding agents
        "url_bonus": 1,
    })
    
    # Keyword extraction
    top_keywords: int = 10
    min_keyword_length: int = 3


@dataclass
class HybridConfig:
    """Configuration for hybrid mode."""
    
    # When to use AI vs heuristics
    ai_threshold_importance: int = 7  # Use AI for importance >= 7
    ai_probability: float = 0.1  # Use AI for 10% of messages randomly
    
    # Fallback behavior
    fallback_to_heuristic: bool = True
    
    # Cost management
    max_ai_calls_per_batch: int = 5
    prefer_cached: bool = True


@dataclass
class MemoryConfig:
    """Main configuration for memory system."""
    
    # Processing mode
    mode: Literal["ai", "heuristic", "hybrid", "disabled"] = "heuristic"
    
    # STM settings
    stm_max_length: int = DEFAULT_STM_MAX_LENGTH
    storage_path: str = DEFAULT_STORAGE_PATH
    
    # LTM settings
    ltm_enabled: bool = True
    vector_db_path: str = DEFAULT_VECTOR_DB_PATH
    embedding_model: str = DEFAULT_EMBEDDING_MODEL
    
    # AI adapter settings (for "ai" and "hybrid" modes)
    ai_adapter_name: str | None = None
    ai_adapter_config: dict[str, Any] = field(default_factory=dict)
    
    # Heuristic settings
    heuristic_config: HeuristicConfig = field(default_factory=lambda: HeuristicConfig())
    
    # Hybrid mode settings
    hybrid_config: HybridConfig = field(default_factory=lambda: HybridConfig())
    
    # Performance settings
    batch_processing: bool = False
    cache_summaries: bool = True
    max_api_calls_per_minute: int | None = None
    
    # Logging and metrics
    enable_metrics: bool = True
    log_level: str = LOG_LEVEL
    
    @classmethod
    def from_preset(cls, preset: str, **overrides) -> "MemoryConfig":
        """Create config from preset name.
        
        Args:
            preset: Name of the preset configuration
            **overrides: Override specific configuration values
            
        Returns:
            MemoryConfig instance with preset values and overrides applied
            
        Raises:
            ValueError: If preset name is not recognized
        """
        from presets import ConfigPresets
        
        # Get the preset configuration
        preset_config = ConfigPresets.get(preset)
        
        # Apply overrides
        if overrides:
            # Convert to dict, update, and recreate
            config_dict = asdict(preset_config)
            config_dict.update(overrides)
            
            # Handle nested configs
            if "heuristic_config" in config_dict and isinstance(config_dict["heuristic_config"], dict):
                config_dict["heuristic_config"] = HeuristicConfig(**config_dict["heuristic_config"])
            if "hybrid_config" in config_dict and isinstance(config_dict["hybrid_config"], dict):
                config_dict["hybrid_config"] = HybridConfig(**config_dict["hybrid_config"])
            
            return cls(**config_dict)
        
        return preset_config
    
    @classmethod
    def from_file(cls, path: str) -> "MemoryConfig":
        """Load config from JSON or YAML file.
        
        Args:
            path: Path to configuration file (.json or .yaml/.yml)
            
        Returns:
            MemoryConfig instance loaded from file
            
        Raises:
            FileNotFoundError: If file does not exist
            ValueError: If file format is not supported or parsing fails
        """
        if not os.path.exists(path):
            raise FileNotFoundError(f"Configuration file not found: {path}")
        
        # Determine file type
        _, ext = os.path.splitext(path)
        ext = ext.lower()
        
        try:
            with open(path, 'r', encoding='utf-8') as f:
                if ext == '.json':
                    config_dict = json.load(f)
                elif ext in ['.yaml', '.yml']:
                    try:
                        import yaml
                        config_dict = yaml.safe_load(f)
                    except ImportError:
                        raise ValueError(
                            "YAML support requires PyYAML. Install with: pip install pyyaml"
                        )
                else:
                    raise ValueError(
                        f"Unsupported file format: {ext}. Use .json, .yaml, or .yml"
                    )
        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse JSON file: {e}")
        except Exception as e:
            raise ValueError(f"Failed to load configuration file: {e}")
        
        # Convert nested dicts to dataclass instances
        if "heuristic_config" in config_dict and isinstance(config_dict["heuristic_config"], dict):
            config_dict["heuristic_config"] = HeuristicConfig(**config_dict["heuristic_config"])
        
        if "hybrid_config" in config_dict and isinstance(config_dict["hybrid_config"], dict):
            config_dict["hybrid_config"] = HybridConfig(**config_dict["hybrid_config"])
        
        return cls(**config_dict)
    
    def validate(self) -> list[str]:
        """Validate configuration and return list of errors.
        
        Returns:
            List of error messages. Empty list if configuration is valid.
        """
        errors = []
        
        # Validate mode
        valid_modes = ["ai", "heuristic", "hybrid", "disabled"]
        if self.mode not in valid_modes:
            errors.append(f"Invalid mode '{self.mode}'. Must be one of: {valid_modes}")
        
        # Validate AI mode requirements
        if self.mode == "ai":
            if not self.ai_adapter_name:
                errors.append("AI mode requires 'ai_adapter_name' to be set")
        
        # Validate hybrid mode requirements
        if self.mode == "hybrid":
            if not self.ai_adapter_name:
                errors.append("Hybrid mode requires 'ai_adapter_name' to be set")
            
            # Validate hybrid config
            if not (0 <= self.hybrid_config.ai_probability <= 1):
                errors.append(
                    f"hybrid_config.ai_probability must be between 0 and 1, got {self.hybrid_config.ai_probability}"
                )
            
            if not (1 <= self.hybrid_config.ai_threshold_importance <= 10):
                errors.append(
                    f"hybrid_config.ai_threshold_importance must be between 1 and 10, got {self.hybrid_config.ai_threshold_importance}"
                )
        
        # Validate numeric ranges
        if self.stm_max_length <= 0:
            errors.append(f"stm_max_length must be positive, got {self.stm_max_length}")
        
        if self.max_api_calls_per_minute is not None and self.max_api_calls_per_minute <= 0:
            errors.append(
                f"max_api_calls_per_minute must be positive, got {self.max_api_calls_per_minute}"
            )
        
        # Validate heuristic config
        if self.heuristic_config.summary_max_length <= 0:
            errors.append(
                f"heuristic_config.summary_max_length must be positive, got {self.heuristic_config.summary_max_length}"
            )
        
        if self.heuristic_config.top_keywords <= 0:
            errors.append(
                f"heuristic_config.top_keywords must be positive, got {self.heuristic_config.top_keywords}"
            )
        
        if self.heuristic_config.min_keyword_length <= 0:
            errors.append(
                f"heuristic_config.min_keyword_length must be positive, got {self.heuristic_config.min_keyword_length}"
            )
        
        # Validate paths (basic check - they should be strings)
        if not isinstance(self.storage_path, str) or not self.storage_path:
            errors.append("storage_path must be a non-empty string")
        
        if not isinstance(self.vector_db_path, str) or not self.vector_db_path:
            errors.append("vector_db_path must be a non-empty string")
        
        # Validate log level
        valid_log_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        if self.log_level.upper() not in valid_log_levels:
            errors.append(
                f"Invalid log_level '{self.log_level}'. Must be one of: {valid_log_levels}"
            )
        
        return errors
