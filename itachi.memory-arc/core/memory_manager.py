"""Main memory manager for short-term and long-term memory."""

import asyncio
import logging
import os
from collections import defaultdict, deque
from typing import Any

from memory_system.core.models import MemoryEntry
from memory_system.core.vector_memory import VectorMemoryManager
from memory_system.adapters.ai_adapter import AIAdapter
from memory_system.utils.persistence import save_to_json, load_from_json
from memory_system.config import (
    DEFAULT_STM_MAX_LENGTH,
    DEFAULT_STORAGE_PATH,
    MemoryConfig,
)
from memory_system.core.processors import MemoryProcessor

logger = logging.getLogger(__name__)


class MemoryManager:
    """
    Main memory manager handling both short-term (STM) and long-term (LTM) memory.
    
    STM stores recent conversation history in memory (deque).
    LTM stores summarized conversations in a vector database for semantic search.
    
    When STM reaches capacity, it automatically triggers LTM processing
    (if an AI adapter is provided).
    """
    
    def __init__(
        self,
        context_id: str,
        config: MemoryConfig | None = None,
        # Backward compatibility parameters
        storage_path: str | None = None,
        max_stm_length: int | None = None,
        ai_adapter: AIAdapter | None = None,
        vector_memory: VectorMemoryManager | None = None,
    ):
        """
        Initialize the memory manager.
        
        Args:
            context_id: Unique identifier for this conversation context
            config: MemoryConfig instance for configurable processing (recommended)
            storage_path: (Legacy) Base path for storing memory files
            max_stm_length: (Legacy) Maximum number of messages in STM before triggering LTM
            ai_adapter: (Legacy) Optional AI adapter for summarization
            vector_memory: Optional vector memory manager (creates one if not provided)
        """
        self.context_id = context_id
        
        # Handle backward compatibility: create config from legacy parameters if needed
        if config is None:
            # Determine mode based on legacy ai_adapter parameter
            mode = "ai" if ai_adapter is not None else "heuristic"
            
            config = MemoryConfig(
                mode=mode,
                storage_path=storage_path or DEFAULT_STORAGE_PATH,
                stm_max_length=max_stm_length or DEFAULT_STM_MAX_LENGTH,
            )
            
            logger.debug(
                f"Created default MemoryConfig with mode='{mode}' from legacy parameters"
            )
        
        self.config = config
        self.storage_path = config.storage_path
        self.max_stm_length = config.stm_max_length
        
        # For backward compatibility, keep ai_adapter reference
        self.ai_adapter = ai_adapter
        
        # Initialize vector memory manager
        if config.ltm_enabled:
            if vector_memory is None:
                self.vector_memory = VectorMemoryManager(
                    storage_path=config.vector_db_path,
                    embedding_model=config.embedding_model,
                )
            else:
                self.vector_memory = vector_memory
        else:
            self.vector_memory = None
        
        # Initialize processor based on configuration
        self.processor = self._create_processor(ai_adapter)
        
        # STM: thread_id -> deque of MemoryEntry
        self.stm: dict[str, deque[MemoryEntry]] = defaultdict(
            lambda: deque(maxlen=self.max_stm_length)
        )
        
        # Memory file path
        self.memory_file = os.path.join(
            storage_path,
            "contexts",
            context_id,
            "memory.json"
        )
        
        # Load existing memory
        self.load()
    
    def _create_processor(self, legacy_adapter: AIAdapter | None) -> MemoryProcessor:
        """
        Create appropriate processor based on configuration.
        
        This factory method instantiates the correct processor type based on
        the configured mode (ai, heuristic, hybrid, or disabled).
        
        Args:
            legacy_adapter: Optional AI adapter from legacy initialization
            
        Returns:
            MemoryProcessor instance configured for the selected mode
            
        Raises:
            ValueError: If configuration is invalid or required parameters are missing
        """
        from memory_system.core.processors import (
            AIProcessor,
            HeuristicProcessor,
            HybridProcessor,
            DisabledProcessor,
        )
        from memory_system.adapters.registry import AdapterRegistry
        
        mode = self.config.mode
        
        if mode == "disabled":
            logger.info("Memory processing disabled - LTM processing will be skipped")
            return DisabledProcessor()
        
        elif mode == "heuristic":
            logger.info("Using heuristic processor for memory processing")
            return HeuristicProcessor(self.config.heuristic_config)
        
        elif mode == "ai":
            # Determine which adapter to use
            adapter = None
            
            # Priority 1: Use legacy adapter if provided (backward compatibility)
            if legacy_adapter is not None:
                adapter = legacy_adapter
                logger.info(
                    f"Using legacy AI adapter: {type(adapter).__name__}"
                )
            
            # Priority 2: Create adapter from config
            elif self.config.ai_adapter_name:
                try:
                    adapter = AdapterRegistry.get(
                        self.config.ai_adapter_name,
                        self.config.ai_adapter_config
                    )
                    logger.info(
                        f"Created AI adapter from config: {self.config.ai_adapter_name}"
                    )
                except Exception as e:
                    raise ValueError(
                        f"Failed to create AI adapter '{self.config.ai_adapter_name}': {e}"
                    ) from e
            else:
                raise ValueError(
                    "AI mode requires either 'ai_adapter' parameter or "
                    "'ai_adapter_name' in configuration"
                )
            
            return AIProcessor(adapter, self.config)
        
        elif mode == "hybrid":
            # Create heuristic processor
            heuristic = HeuristicProcessor(self.config.heuristic_config)
            
            # Determine which adapter to use for AI processor
            adapter = None
            
            # Priority 1: Use legacy adapter if provided (backward compatibility)
            if legacy_adapter is not None:
                adapter = legacy_adapter
                logger.info(
                    f"Using legacy AI adapter for hybrid mode: {type(adapter).__name__}"
                )
            
            # Priority 2: Create adapter from config
            elif self.config.ai_adapter_name:
                try:
                    adapter = AdapterRegistry.get(
                        self.config.ai_adapter_name,
                        self.config.ai_adapter_config
                    )
                    logger.info(
                        f"Created AI adapter for hybrid mode from config: "
                        f"{self.config.ai_adapter_name}"
                    )
                except Exception as e:
                    raise ValueError(
                        f"Failed to create AI adapter '{self.config.ai_adapter_name}': {e}"
                    ) from e
            else:
                raise ValueError(
                    "Hybrid mode requires either 'ai_adapter' parameter or "
                    "'ai_adapter_name' in configuration"
                )
            
            # Create AI processor
            ai = AIProcessor(adapter, self.config)
            
            logger.info("Using hybrid processor (AI + heuristic) for memory processing")
            return HybridProcessor(ai, heuristic, self.config.hybrid_config)
        
        else:
            raise ValueError(
                f"Unknown processing mode: {mode}. "
                f"Must be one of: ai, heuristic, hybrid, disabled"
            )
    
    def load(self) -> None:
        """Load STM from disk."""
        try:
            data = load_from_json(self.memory_file)
            if data is None:
                logger.debug(f"No existing memory file for context: {self.context_id}")
                return
            
            loaded_stm = data.get("stm", {})
            for thread_id, messages in loaded_stm.items():
                # Reconstruct MemoryEntry objects from dicts
                entries = []
                for msg in messages:
                    try:
                        entries.append(MemoryEntry(**msg))
                    except Exception as e:
                        logger.warning(f"Failed to load memory entry: {e}")
                        continue
                
                self.stm[thread_id] = deque(entries, maxlen=self.max_stm_length)
            
            logger.info(f"Loaded memory for context: {self.context_id}")
        except Exception as e:
            logger.error(f"Failed to load memory for {self.context_id}: {e}")
    
    async def save(self) -> None:
        """Persist STM to disk."""
        try:
            # Convert MemoryEntry objects to dictionaries
            serializable_stm = {
                thread_id: [entry.to_dict() for entry in messages]
                for thread_id, messages in self.stm.items()
            }
            
            data = {"stm": serializable_stm}
            
            # Save asynchronously
            def _blocking_save():
                return save_to_json(data, self.memory_file)
            
            success = await asyncio.to_thread(_blocking_save)
            if success:
                logger.debug(f"Saved memory for context: {self.context_id}")
        except Exception as e:
            logger.error(f"Failed to save memory for {self.context_id}: {e}")
    
    async def add_message(
        self,
        entry: MemoryEntry,
        thread_id: str | None = None,
    ) -> None:
        """
        Add a message to short-term memory.
        
        Args:
            entry: The memory entry to add
            thread_id: Optional sub-context identifier (defaults to "default")
        """
        if thread_id is None:
            thread_id = "default"
        
        # Add to STM
        self.stm[thread_id].append(entry)
        
        # Save to disk
        await self.save()
        
        # Check if STM is full and trigger LTM processing
        if len(self.stm[thread_id]) >= self.max_stm_length:
            await self._process_stm_for_ltm(thread_id)
    
    async def get_context(
        self,
        current_prompt: str,
        thread_id: str | None = None,
        include_ltm: bool = True,
    ) -> list[dict[str, Any]]:
        """
        Get conversation context for AI model.
        
        Combines relevant long-term memories with recent short-term memory.
        
        Args:
            current_prompt: The current user prompt (for LTM search)
            thread_id: Optional sub-context identifier (defaults to "default")
            include_ltm: Whether to include long-term memories
            
        Returns:
            List of formatted messages for LLM consumption (OpenAI format)
        """
        if thread_id is None:
            thread_id = "default"
        
        result = []
        
        # Add relevant LTM if available
        if include_ltm and self.vector_memory is not None:
            try:
                relevant_memories = await self.vector_memory.search_memories(
                    query_text=current_prompt,
                    context_id=self.context_id,
                )
                
                for memory in relevant_memories:
                    result.append({
                        "role": "system",
                        "content": f"Relevant Long Term Memory: {memory['summary']}"
                    })
            except Exception as e:
                logger.error(f"Failed to retrieve LTM: {e}")
        
        # Add STM messages
        stm_entries = list(self.stm.get(thread_id, []))
        for entry in stm_entries:
            result.append(entry.to_llm_format())
        
        return result
    
    async def reset(self, thread_id: str | None = None) -> bool:
        """
        Clear memory for this context or specific thread.
        
        Args:
            thread_id: If provided, only clear this thread. Otherwise clear all.
            
        Returns:
            True if memory was cleared, False if nothing to clear
        """
        stm_existed = False
        ltm_existed = False
        
        if thread_id is None:
            # Clear all STM
            stm_existed = len(self.stm) > 0
            self.stm.clear()
            
            # Clear all LTM
            if self.vector_memory is not None:
                ltm_existed = await self.vector_memory.reset(self.context_id)
        else:
            # Clear specific thread STM
            if thread_id in self.stm and len(self.stm[thread_id]) > 0:
                stm_existed = True
                del self.stm[thread_id]
        
        if stm_existed:
            await self.save()
        
        if stm_existed or ltm_existed:
            logger.info(
                f"Reset memory for context '{self.context_id}'"
                + (f", thread '{thread_id}'" if thread_id else "")
            )
            return True
        
        return False
    
    async def _process_stm_for_ltm(self, thread_id: str) -> None:
        """
        Process full STM and create LTM summaries.
        
        This is called automatically when STM reaches capacity.
        Uses the configured processor (AI, heuristic, or hybrid) for processing.
        
        Args:
            thread_id: The thread whose STM should be processed
        """
        # Skip if mode is disabled or vector memory not available
        if self.config.mode == "disabled" or self.vector_memory is None:
            logger.debug(
                f"Skipping LTM processing (mode={self.config.mode}, "
                f"vector_memory={'available' if self.vector_memory else 'unavailable'})"
            )
            return
        
        stm_snapshot = list(self.stm.get(thread_id, []))
        if len(stm_snapshot) < self.max_stm_length:
            return
        
        logger.info(
            f"Processing full STM for LTM in context '{self.context_id}', "
            f"thread '{thread_id}' using {self.config.mode} mode"
        )
        
        # Format snapshot for processing
        formatted_messages = []
        for entry in stm_snapshot:
            if entry.role in ["user", "assistant"] and entry.content:
                msg_dict = {
                    "role": entry.role,
                    "content": entry.content,
                }
                # Add metadata if available
                if entry.metadata:
                    msg_dict.update(entry.metadata)
                formatted_messages.append(msg_dict)
        
        if not formatted_messages:
            logger.debug("No conversational content to summarize")
            return
        
        try:
            # Run summarization and fact extraction concurrently using processor
            gist_task = self.processor.summarize(formatted_messages)
            facts_task = self.processor.extract_facts(formatted_messages)
            
            gist_summary, extracted_facts = await asyncio.gather(
                gist_task,
                facts_task,
                return_exceptions=True,
            )
            
            # Handle gist summary
            if isinstance(gist_summary, Exception):
                logger.error(f"Summarization failed: {gist_summary}")
                gist_summary = None
            
            if gist_summary:
                # Score importance using processor
                importance_score = await self.processor.score_importance(gist_summary)
                # Add to LTM
                await self.vector_memory.add_memory(
                    summary_text=gist_summary,
                    context_id=self.context_id,
                    importance_score=importance_score,
                )
            
            # Handle extracted facts
            if isinstance(extracted_facts, Exception):
                logger.error(f"Fact extraction failed: {extracted_facts}")
                extracted_facts = []
            
            if extracted_facts:
                for fact in extracted_facts:
                    # Convert fact dict to searchable string
                    fact_string = str(fact)
                    if isinstance(fact, dict):
                        # Try to create a more readable string
                        fact_string = " ".join(str(v) for v in fact.values())
                    
                    # Score and add to LTM using processor
                    importance_score = await self.processor.score_importance(fact_string)
                    await self.vector_memory.add_memory(
                        summary_text=fact_string,
                        context_id=self.context_id,
                        importance_score=importance_score,
                    )
                
                logger.info(
                    f"Added {len(extracted_facts)} facts and 1 gist summary to LTM"
                )
        
        except Exception as e:
            logger.error(f"Failed to process STM for LTM: {e}")
    
    def get_metrics(self) -> dict[str, Any]:
        """
        Get processing metrics from the processor.
        
        Returns processing statistics including:
        - API call counts (for AI mode)
        - Success/error rates
        - Processing times
        - Hybrid mode decisions (for hybrid mode)
        
        Returns:
            Dictionary containing processing metrics and statistics
            
        Example:
            >>> memory = MemoryManager(context_id="user_123", config=config)
            >>> # ... use memory system ...
            >>> metrics = memory.get_metrics()
            >>> print(f"AI calls: {metrics['ai_calls']}")
            >>> print(f"Processing time: {metrics['processing_time']}")
        """
        if self.processor is None:
            return {
                "error": "No processor initialized",
                "mode": self.config.mode,
            }
        
        metrics = self.processor.get_metrics()
        
        # Add configuration context to metrics
        metrics["mode"] = self.config.mode
        metrics["context_id"] = self.context_id
        
        return metrics
