"""Predefined configurations for common use cases.

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

from memory_system.config import MemoryConfig, HeuristicConfig, HybridConfig


class ConfigPresets:
    """Predefined configurations for common use cases."""
    
    CHATBOT = MemoryConfig(
        mode="hybrid",
        stm_max_length=100,
        embedding_model="all-MiniLM-L6-v2",  # Fast, lightweight embeddings
        heuristic_config=HeuristicConfig(
            importance_rules={
                "base_score": 5,
                "keyword_bonus": {
                    "keywords": ["remember", "always", "never", "important", "prefer"],
                    "bonus": 3
                },
                "question_bonus": 2,
                "length_bonus": {"threshold": 500, "bonus": 2},
                "code_bonus": 2,
                "url_bonus": 1,
            }
        ),
        hybrid_config=HybridConfig(
            ai_threshold_importance=8,
            ai_probability=0.05,
        )
    )
    
    CHATBOT_ENHANCED = MemoryConfig(
        mode="hybrid",
        stm_max_length=100,
        embedding_model="BAAI/bge-m3",  # Enhanced quality embeddings
        heuristic_config=HeuristicConfig(
            importance_rules={
                "base_score": 5,
                "keyword_bonus": {
                    "keywords": ["remember", "always", "never", "important", "prefer"],
                    "bonus": 3
                },
                "question_bonus": 2,
                "length_bonus": {"threshold": 500, "bonus": 2},
                "code_bonus": 2,
                "url_bonus": 1,
            }
        ),
        hybrid_config=HybridConfig(
            ai_threshold_importance=8,
            ai_probability=0.05,
        )
    )
    
    CODING_AGENT = MemoryConfig(
        mode="heuristic",  # Fast, no API costs
        stm_max_length=200,  # More context for code
        embedding_model="jinaai/jina-embeddings-v2-base-code",  # Code-optimized embeddings
        heuristic_config=HeuristicConfig(
            summary_method="sample",
            fact_extraction_method="patterns",
            custom_patterns=[
                r"def \w+\(",  # Function definitions
                r"class \w+:",  # Class definitions
                r"import \w+",  # Imports
                r"file: [\w/\.]+",  # File references
            ],
            importance_rules={
                "base_score": 5,
                "code_bonus": 3,
                "length_bonus": {"threshold": 300, "bonus": 2},
                "keyword_bonus": {"keywords": ["important", "remember", "critical"], "bonus": 2},
                "question_bonus": 1,
                "url_bonus": 1,
            }
        )
    )
    
    CODING_AGENT_ENHANCED = MemoryConfig(
        mode="hybrid",  # Hybrid mode with AI for important code discussions
        stm_max_length=200,
        embedding_model="jinaai/jina-embeddings-v2-base-code",  # Code-optimized embeddings
        ai_adapter_name="openai",
        ai_adapter_config={"model": "gpt-4o-mini"},
        heuristic_config=HeuristicConfig(
            summary_method="sample",
            fact_extraction_method="patterns",
            custom_patterns=[
                r"def \w+\(",
                r"class \w+:",
                r"import \w+",
                r"file: [\w/\.]+",
            ],
            importance_rules={
                "base_score": 5,
                "code_bonus": 3,
                "length_bonus": {"threshold": 300, "bonus": 2},
                "keyword_bonus": {"keywords": ["important", "remember", "critical", "bug", "fix"], "bonus": 3},
                "question_bonus": 2,
                "url_bonus": 1,
            }
        ),
        hybrid_config=HybridConfig(
            ai_threshold_importance=7,
            ai_probability=0.1,
        )
    )
    
    ASSISTANT = MemoryConfig(
        mode="ai",
        ai_adapter_name="openai",
        ai_adapter_config={"model": "gpt-4o-mini"},
        stm_max_length=150,
        embedding_model="BAAI/bge-m3",  # Enhanced embeddings for better task understanding
        heuristic_config=HeuristicConfig(
            importance_rules={
                "base_score": 5,
                "keyword_bonus": {
                    "keywords": ["task", "todo", "remind", "schedule", "deadline"],
                    "bonus": 3
                },
                "length_bonus": {"threshold": 500, "bonus": 2},
                "question_bonus": 1,
                "code_bonus": 2,
                "url_bonus": 1,
            }
        )
    )
    
    OFFLINE = MemoryConfig(
        mode="heuristic",
        ltm_enabled=True,
        heuristic_config=HeuristicConfig(
            summary_method="keybert",
            fact_extraction_method="keywords",
        )
    )
    
    @classmethod
    def get(cls, name: str) -> MemoryConfig:
        """Get preset by name.
        
        Args:
            name: Name of the preset
            
        Available presets:
            - chatbot: Hybrid mode with lightweight embeddings
            - chatbot-enhanced: Hybrid mode with enhanced quality embeddings
            - coding-agent: Heuristic mode with code-optimized embeddings
            - coding-agent-enhanced: Hybrid mode with code-optimized embeddings
            - assistant: AI mode with enhanced embeddings
            - offline: Heuristic mode with lightweight embeddings
            
        Returns:
            MemoryConfig instance for the preset
            
        Raises:
            ValueError: If preset name is not recognized
        """
        presets = {
            "chatbot": cls.CHATBOT,
            "chatbot-enhanced": cls.CHATBOT_ENHANCED,
            "coding-agent": cls.CODING_AGENT,
            "coding-agent-enhanced": cls.CODING_AGENT_ENHANCED,
            "assistant": cls.ASSISTANT,
            "offline": cls.OFFLINE,
        }
        
        if name not in presets:
            raise ValueError(
                f"Unknown preset: {name}. Available: {list(presets.keys())}"
            )
        
        return presets[name]
    
    @classmethod
    def list_presets(cls) -> dict[str, str]:
        """List all available presets with descriptions.
        
        Returns:
            Dictionary mapping preset names to descriptions
        """
        return {
            "chatbot": "Hybrid mode with lightweight embeddings (fast)",
            "chatbot-enhanced": "Hybrid mode with enhanced quality embeddings (better accuracy)",
            "coding-agent": "Heuristic mode with code-optimized embeddings (fast, offline)",
            "coding-agent-enhanced": "Hybrid mode with code-optimized embeddings (AI + code focus)",
            "assistant": "AI mode with enhanced embeddings (high quality)",
            "offline": "Heuristic mode with lightweight embeddings (completely offline)",
        }
