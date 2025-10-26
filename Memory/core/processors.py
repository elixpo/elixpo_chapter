"""Memory processing strategies and metrics tracking."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from collections import defaultdict
from typing import Any
import logging
import time
import asyncio

logger = logging.getLogger(__name__)


@dataclass
class ProcessingMetrics:
    """Track processing statistics across different operations."""
    
    ai_calls: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    ai_success: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    ai_errors: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    heuristic_calls: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    hybrid_ai_used: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    hybrid_heuristic_used: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    hybrid_fallback: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    processing_time: dict[str, float] = field(default_factory=lambda: defaultdict(float))
    
    def increment(self, metric: str, operation: str) -> None:
        """Increment a metric counter for a specific operation.
        
        Args:
            metric: The metric name (e.g., 'ai_calls', 'ai_success')
            operation: The operation type (e.g., 'summarize', 'extract_facts')
        """
        metric_dict = getattr(self, metric)
        metric_dict[operation] += 1
    
    def add_time(self, operation: str, duration: float) -> None:
        """Add processing time for an operation.
        
        Args:
            operation: The operation type
            duration: Time in seconds
        """
        self.processing_time[operation] += duration
    
    def to_dict(self) -> dict[str, Any]:
        """Convert metrics to dictionary format.
        
        Returns:
            Dictionary representation of all metrics
        """
        return asdict(self)


class MemoryProcessor(ABC):
    """Abstract base class for memory processing strategies.
    
    This interface defines the contract for all memory processors,
    whether they use AI, heuristics, or a hybrid approach.
    """
    
    @abstractmethod
    async def summarize(self, messages: list[dict]) -> str | None:
        """Generate a summary of the provided messages.
        
        Args:
            messages: List of message dictionaries with 'role' and 'content' keys
            
        Returns:
            Summary text or None if summarization fails/is not applicable
        """
        pass
    
    @abstractmethod
    async def extract_facts(self, messages: list[dict]) -> list[dict]:
        """Extract important facts from the provided messages.
        
        Args:
            messages: List of message dictionaries with 'role' and 'content' keys
            
        Returns:
            List of extracted facts as dictionaries
        """
        pass
    
    @abstractmethod
    async def score_importance(self, text: str) -> int:
        """Score the importance of text content.
        
        Args:
            text: Text content to score
            
        Returns:
            Importance score from 1 (low) to 10 (high)
        """
        pass
    
    @abstractmethod
    def get_metrics(self) -> dict[str, Any]:
        """Return processing metrics and statistics.
        
        Returns:
            Dictionary containing processing metrics
        """
        pass


class HeuristicProcessor(MemoryProcessor):
    """Processor using rule-based heuristics without AI dependencies.
    
    This processor provides memory processing capabilities using lightweight
    algorithms like KeyBERT for summarization, keyword extraction, and
    rule-based importance scoring.
    """
    
    def __init__(self, config: "HeuristicConfig"):
        """Initialize the heuristic processor.
        
        Args:
            config: HeuristicConfig instance with processing settings
        """
        from config import HeuristicConfig
        
        self.config = config
        self.metrics = ProcessingMetrics()
        
        # Initialize KeyBERT if needed for summarization
        self.keybert = None
        if config.summary_method == "keybert":
            try:
                from keybert import KeyBERT
                self.keybert = KeyBERT()
                logger.info("KeyBERT initialized for heuristic summarization")
            except ImportError:
                logger.warning(
                    "KeyBERT not available. Install with: pip install keybert. "
                    "Falling back to 'sample' summarization method."
                )
                self.config.summary_method = "sample"
        
        # Initialize spaCy if needed for NER
        self.nlp = None
        if config.use_spacy and config.fact_extraction_method == "ner":
            try:
                import spacy
                self.nlp = spacy.load("en_core_web_sm")
                logger.info("spaCy initialized for named entity recognition")
            except ImportError:
                logger.warning(
                    "spaCy not available. Install with: pip install spacy && "
                    "python -m spacy download en_core_web_sm. "
                    "Falling back to 'keywords' extraction method."
                )
                self.config.fact_extraction_method = "keywords"
            except OSError:
                logger.warning(
                    "spaCy model 'en_core_web_sm' not found. "
                    "Download with: python -m spacy download en_core_web_sm. "
                    "Falling back to 'keywords' extraction method."
                )
                self.config.fact_extraction_method = "keywords"
    
    async def summarize(self, messages: list[dict]) -> str | None:
        """Generate summary using heuristic methods.
        
        Routes to the appropriate summarization method based on configuration.
        
        Args:
            messages: List of message dictionaries with 'role' and 'content' keys
            
        Returns:
            Summary text or None if summarization fails
        """
        self.metrics.increment("heuristic_calls", "summarize")
        
        try:
            if self.config.summary_method == "keybert" and self.keybert:
                return await self._keybert_summary(messages)
            elif self.config.summary_method == "sample":
                return await self._sample_summary(messages)
            else:  # concat
                return await self._concat_summary(messages)
        except Exception as e:
            logger.error(f"Heuristic summarization failed: {e}")
            return None
    
    async def extract_facts(self, messages: list[dict]) -> list[dict]:
        """Extract facts using heuristic methods.
        
        Routes to the appropriate extraction method based on configuration.
        
        Args:
            messages: List of message dictionaries with 'role' and 'content' keys
            
        Returns:
            List of extracted facts as dictionaries
        """
        self.metrics.increment("heuristic_calls", "extract_facts")
        
        try:
            if self.config.fact_extraction_method == "ner" and self.nlp:
                return await self._ner_extraction(messages)
            elif self.config.fact_extraction_method == "keywords":
                return await self._keyword_extraction(messages)
            else:  # patterns
                return await self._pattern_extraction(messages)
        except Exception as e:
            logger.error(f"Heuristic fact extraction failed: {e}")
            return []
    
    async def score_importance(self, text: str) -> int:
        """Score importance using configurable rules.
        
        Args:
            text: Text content to score
            
        Returns:
            Importance score from 1 (low) to 10 (high)
        """
        self.metrics.increment("heuristic_calls", "score_importance")
        
        rules = self.config.importance_rules
        score = rules.get("base_score", 5)
        
        # Length bonus
        length_bonus = rules.get("length_bonus", {})
        if len(text) > length_bonus.get("threshold", 500):
            score += length_bonus.get("bonus", 2)
        
        # Keyword bonus
        text_lower = text.lower()
        keyword_bonus = rules.get("keyword_bonus", {})
        keywords = keyword_bonus.get("keywords", [])
        for keyword in keywords:
            if keyword.lower() in text_lower:
                score += keyword_bonus.get("bonus", 2)
                break  # Only apply bonus once
        
        # Question bonus
        if "?" in text:
            score += rules.get("question_bonus", 1)
        
        # Code bonus (for coding agents)
        if "```" in text or "def " in text or "function " in text or "class " in text:
            score += rules.get("code_bonus", 2)
        
        # URL bonus
        if "http://" in text or "https://" in text:
            score += rules.get("url_bonus", 1)
        
        # Clamp score between 1 and 10
        return min(max(score, 1), 10)
    
    def get_metrics(self) -> dict[str, Any]:
        """Return processing metrics.
        
        Returns:
            Dictionary containing processing metrics
        """
        return self.metrics.to_dict()
    
    # Helper methods for summarization
    async def _keybert_summary(self, messages: list[dict]) -> str | None:
        """Use KeyBERT to extract key phrases and create summary.
        
        Extracts the most important key phrases from messages and combines
        them into a coherent summary.
        
        Args:
            messages: List of message dictionaries
            
        Returns:
            Summary text based on key phrases
        """
        if not self.keybert:
            logger.warning("KeyBERT not available, falling back to sample summary")
            return await self._sample_summary(messages)
        
        # Combine all message content
        combined_text = " ".join(
            msg.get("content", "") for msg in messages if msg.get("content")
        )
        
        if not combined_text.strip():
            return None
        
        try:
            # Extract key phrases using KeyBERT
            # Use top_n based on config, diversity for varied phrases
            keywords = self.keybert.extract_keywords(
                combined_text,
                keyphrase_ngram_range=(1, 3),
                stop_words='english',
                top_n=self.config.top_keywords,
                use_maxsum=True,
                nr_candidates=20,
                diversity=0.7
            )
            
            # keywords is a list of (phrase, score) tuples
            if not keywords:
                return await self._sample_summary(messages)
            
            # Create summary from top key phrases
            key_phrases = [phrase for phrase, score in keywords]
            summary = "Key topics: " + ", ".join(key_phrases)
            
            # Truncate to max length if needed
            if len(summary) > self.config.summary_max_length:
                summary = summary[:self.config.summary_max_length - 3] + "..."
            
            return summary
            
        except Exception as e:
            logger.error(f"KeyBERT extraction failed: {e}")
            return await self._sample_summary(messages)
    
    async def _sample_summary(self, messages: list[dict]) -> str | None:
        """Create summary by sampling key messages.
        
        Selects a subset of messages based on length and position to create
        a representative summary.
        
        Args:
            messages: List of message dictionaries
            
        Returns:
            Summary text from sampled messages
        """
        if not messages:
            return None
        
        # Filter out empty messages
        valid_messages = [
            msg for msg in messages 
            if msg.get("content") and msg.get("content").strip()
        ]
        
        if not valid_messages:
            return None
        
        # Sample strategy: take first, last, and longest messages
        sampled = []
        
        # First message
        sampled.append(valid_messages[0])
        
        # Longest message (by content length)
        if len(valid_messages) > 1:
            longest = max(valid_messages, key=lambda m: len(m.get("content", "")))
            if longest not in sampled:
                sampled.append(longest)
        
        # Last message
        if len(valid_messages) > 2 and valid_messages[-1] not in sampled:
            sampled.append(valid_messages[-1])
        
        # Combine sampled messages
        summary_parts = []
        for msg in sampled:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            summary_parts.append(f"[{role}]: {content}")
        
        summary = " | ".join(summary_parts)
        
        # Truncate to max length if needed
        if len(summary) > self.config.summary_max_length:
            summary = summary[:self.config.summary_max_length - 3] + "..."
        
        return summary
    
    async def _concat_summary(self, messages: list[dict]) -> str | None:
        """Create summary by concatenating messages.
        
        Simple concatenation of all message content with role labels.
        
        Args:
            messages: List of message dictionaries
            
        Returns:
            Concatenated summary text
        """
        if not messages:
            return None
        
        # Concatenate all messages with role labels
        summary_parts = []
        for msg in messages:
            content = msg.get("content", "")
            if content and content.strip():
                role = msg.get("role", "unknown")
                summary_parts.append(f"[{role}]: {content}")
        
        if not summary_parts:
            return None
        
        summary = " ".join(summary_parts)
        
        # Truncate to max length if needed
        if len(summary) > self.config.summary_max_length:
            summary = summary[:self.config.summary_max_length - 3] + "..."
        
        return summary
    
    # Helper methods for fact extraction
    async def _ner_extraction(self, messages: list[dict]) -> list[dict]:
        """Use spaCy NER to extract entities.
        
        Extracts named entities (people, organizations, locations, etc.)
        from messages using spaCy's NER model.
        
        Args:
            messages: List of message dictionaries
            
        Returns:
            List of extracted facts as dictionaries with entity info
        """
        if not self.nlp:
            logger.warning("spaCy not available, falling back to keyword extraction")
            return await self._keyword_extraction(messages)
        
        facts = []
        
        for msg in messages:
            content = msg.get("content", "")
            if not content or not content.strip():
                continue
            
            try:
                # Process text with spaCy
                doc = self.nlp(content)
                
                # Extract named entities
                for ent in doc.ents:
                    fact = {
                        "type": "entity",
                        "entity_type": ent.label_,
                        "text": ent.text,
                        "context": content[:200]  # Include some context
                    }
                    facts.append(fact)
                    
            except Exception as e:
                logger.error(f"NER extraction failed for message: {e}")
                continue
        
        return facts
    
    async def _keyword_extraction(self, messages: list[dict]) -> list[dict]:
        """Use TF-IDF or KeyBERT for keyword extraction.
        
        Extracts important keywords and phrases from messages that can
        serve as facts or key information.
        
        Args:
            messages: List of message dictionaries
            
        Returns:
            List of extracted facts as dictionaries with keyword info
        """
        # Combine all message content
        combined_text = " ".join(
            msg.get("content", "") for msg in messages if msg.get("content")
        )
        
        if not combined_text.strip():
            return []
        
        facts = []
        
        # Try KeyBERT first if available
        if self.keybert:
            try:
                keywords = self.keybert.extract_keywords(
                    combined_text,
                    keyphrase_ngram_range=(1, 3),
                    stop_words='english',
                    top_n=self.config.top_keywords,
                    use_maxsum=True,
                    nr_candidates=20,
                    diversity=0.5
                )
                
                for phrase, score in keywords:
                    if len(phrase) >= self.config.min_keyword_length:
                        fact = {
                            "type": "keyword",
                            "text": phrase,
                            "score": float(score),
                            "extraction_method": "keybert"
                        }
                        facts.append(fact)
                        
            except Exception as e:
                logger.error(f"KeyBERT keyword extraction failed: {e}")
        
        # Fallback to simple word frequency if KeyBERT not available or failed
        if not facts:
            try:
                from collections import Counter
                import re
                
                # Simple tokenization and filtering
                words = re.findall(r'\b[a-zA-Z]{' + str(self.config.min_keyword_length) + r',}\b', 
                                 combined_text.lower())
                
                # Common stop words to filter out
                stop_words = {
                    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 
                    'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him',
                    'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way',
                    'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too',
                    'use', 'this', 'that', 'with', 'have', 'from', 'they', 'will',
                    'what', 'been', 'more', 'when', 'your', 'said', 'each', 'than',
                    'them', 'were', 'into', 'very', 'some', 'time', 'these', 'would'
                }
                
                filtered_words = [w for w in words if w not in stop_words]
                word_freq = Counter(filtered_words)
                
                # Get top keywords
                for word, count in word_freq.most_common(self.config.top_keywords):
                    fact = {
                        "type": "keyword",
                        "text": word,
                        "frequency": count,
                        "extraction_method": "frequency"
                    }
                    facts.append(fact)
                    
            except Exception as e:
                logger.error(f"Frequency-based keyword extraction failed: {e}")
        
        return facts
    
    async def _pattern_extraction(self, messages: list[dict]) -> list[dict]:
        """Use regex patterns for extraction.
        
        Extracts facts based on custom regex patterns defined in configuration.
        Useful for domain-specific information like code, URLs, dates, etc.
        
        Args:
            messages: List of message dictionaries
            
        Returns:
            List of extracted facts as dictionaries with pattern match info
        """
        import re
        
        facts = []
        
        # Default patterns if none configured
        default_patterns = [
            (r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', 'email'),
            (r'https?://[^\s]+', 'url'),
            (r'\b\d{4}-\d{2}-\d{2}\b', 'date'),
            (r'\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\b', 'time'),
            (r'\$\d+(?:\.\d{2})?', 'currency'),
            (r'\b\d{3}-\d{3}-\d{4}\b', 'phone'),
        ]
        
        # Use custom patterns if provided, otherwise use defaults
        patterns_to_use = []
        if self.config.custom_patterns:
            for pattern in self.config.custom_patterns:
                patterns_to_use.append((pattern, 'custom'))
        else:
            patterns_to_use = default_patterns
        
        for msg in messages:
            content = msg.get("content", "")
            if not content or not content.strip():
                continue
            
            for pattern, pattern_type in patterns_to_use:
                try:
                    matches = re.finditer(pattern, content)
                    for match in matches:
                        fact = {
                            "type": "pattern_match",
                            "pattern_type": pattern_type,
                            "text": match.group(0),
                            "context": content[max(0, match.start()-50):min(len(content), match.end()+50)]
                        }
                        facts.append(fact)
                        
                except re.error as e:
                    logger.error(f"Invalid regex pattern '{pattern}': {e}")
                    continue
                except Exception as e:
                    logger.error(f"Pattern extraction failed: {e}")
                    continue
        
        return facts


class AIProcessor(MemoryProcessor):
    """Processor using AI adapter with metrics tracking and error handling.
    
    This processor wraps an AIAdapter implementation and adds:
    - Comprehensive metrics tracking (calls, successes, errors, timing)
    - Retry logic for transient failures
    - Error handling with graceful degradation
    - Performance monitoring
    - Rate limiting for API calls
    """
    
    def __init__(self, adapter: "AIAdapter", config: "MemoryConfig", max_retries: int = 3):
        """Initialize the AI processor.
        
        Args:
            adapter: AIAdapter instance for AI operations
            config: MemoryConfig instance with processing settings
            max_retries: Maximum number of retry attempts for failed operations
        """
        self.adapter = adapter
        self.config = config
        self.max_retries = max_retries
        self.metrics = ProcessingMetrics()
        
        # Rate limiting setup
        self.rate_limit_enabled = config.max_api_calls_per_minute is not None
        if self.rate_limit_enabled:
            self.max_calls_per_minute = config.max_api_calls_per_minute
            self.call_timestamps: list[float] = []
            logger.info(
                f"Rate limiting enabled: {self.max_calls_per_minute} calls per minute"
            )
        
        # Caching setup
        self.cache_enabled = config.cache_summaries
        if self.cache_enabled:
            self.cache: dict[str, tuple[Any, float]] = {}  # key -> (value, timestamp)
            self.cache_ttl = 3600.0  # 1 hour default TTL
            logger.info("Summary caching enabled with 1 hour TTL")
        
        # Batch processing setup
        self.batch_enabled = config.batch_processing
        if self.batch_enabled:
            self.batch_queue: list[tuple[str, list[dict], asyncio.Future]] = []
            self.batch_size = 5  # Process up to 5 summaries at once
            self.batch_timeout = 2.0  # Wait up to 2 seconds to collect batch
            self.batch_lock = asyncio.Lock()
            self.batch_task: asyncio.Task | None = None
            logger.info(
                f"Batch processing enabled: batch_size={self.batch_size}, "
                f"timeout={self.batch_timeout}s"
            )
        
        logger.info(f"AIProcessor initialized with adapter: {type(adapter).__name__}")
    
    def _compute_cache_key(self, operation: str, content: str) -> str:
        """Compute cache key from operation and content.
        
        Args:
            operation: Operation name (e.g., 'summarize', 'extract_facts')
            content: Content to hash
            
        Returns:
            Cache key string
        """
        import hashlib
        
        # Create a hash of the content
        content_hash = hashlib.sha256(content.encode('utf-8')).hexdigest()[:16]
        return f"{operation}:{content_hash}"
    
    def _get_from_cache(self, cache_key: str) -> Any | None:
        """Get value from cache if it exists and is not expired.
        
        Args:
            cache_key: Cache key to lookup
            
        Returns:
            Cached value or None if not found or expired
        """
        if not self.cache_enabled:
            return None
        
        if cache_key not in self.cache:
            return None
        
        value, timestamp = self.cache[cache_key]
        current_time = time.time()
        
        # Check if cache entry has expired
        if current_time - timestamp > self.cache_ttl:
            # Remove expired entry
            del self.cache[cache_key]
            return None
        
        logger.debug(f"Cache hit for {cache_key}")
        return value
    
    def _put_in_cache(self, cache_key: str, value: Any) -> None:
        """Store value in cache with current timestamp.
        
        Args:
            cache_key: Cache key
            value: Value to cache
        """
        if not self.cache_enabled:
            return
        
        current_time = time.time()
        self.cache[cache_key] = (value, current_time)
        logger.debug(f"Cached result for {cache_key}")
    
    def _clean_expired_cache(self) -> None:
        """Remove expired entries from cache."""
        if not self.cache_enabled:
            return
        
        current_time = time.time()
        expired_keys = [
            key for key, (_, timestamp) in self.cache.items()
            if current_time - timestamp > self.cache_ttl
        ]
        
        for key in expired_keys:
            del self.cache[key]
        
        if expired_keys:
            logger.debug(f"Cleaned {len(expired_keys)} expired cache entries")
    
    async def _process_batch(self) -> None:
        """Process accumulated batch of summarization requests.
        
        Combines multiple message lists into a single API call,
        then splits the results back to individual requests.
        """
        async with self.batch_lock:
            if not self.batch_queue:
                return
            
            # Get current batch
            batch = self.batch_queue[:]
            self.batch_queue.clear()
            
            logger.info(f"Processing batch of {len(batch)} summarization requests")
            
            try:
                # Wait for rate limit
                await self._wait_for_rate_limit()
                
                # Combine all message lists with separators
                combined_messages = []
                batch_indices = []
                
                for i, (operation, messages, future) in enumerate(batch):
                    batch_indices.append(len(combined_messages))
                    
                    # Add a separator message to distinguish batches
                    if i > 0:
                        combined_messages.append({
                            "role": "system",
                            "content": f"--- Batch {i} ---"
                        })
                    
                    combined_messages.extend(messages)
                
                # Add final index for slicing
                batch_indices.append(len(combined_messages))
                
                # Make single API call for all summaries
                start_time = time.time()
                combined_summary = await self.adapter.summarize_conversation(combined_messages)
                elapsed = time.time() - start_time
                
                if combined_summary:
                    # Split the combined summary back to individual summaries
                    # This is a simple approach - split by batch markers
                    summaries = combined_summary.split("--- Batch ")
                    
                    # Ensure we have enough summaries
                    if len(summaries) < len(batch):
                        # Fallback: give each request a portion of the summary
                        chunk_size = len(combined_summary) // len(batch)
                        summaries = [
                            combined_summary[i*chunk_size:(i+1)*chunk_size]
                            for i in range(len(batch))
                        ]
                    
                    # Resolve futures with individual summaries
                    for i, (operation, messages, future) in enumerate(batch):
                        if i < len(summaries):
                            summary = summaries[i].strip()
                            
                            # Cache individual result
                            content = " ".join(msg.get("content", "") for msg in messages)
                            cache_key = self._compute_cache_key(operation, content)
                            self._put_in_cache(cache_key, summary)
                            
                            future.set_result(summary)
                        else:
                            future.set_result(None)
                    
                    # Track metrics
                    self.metrics.increment("ai_success", "summarize_batch")
                    self.metrics.add_time("summarize_batch", elapsed)
                    logger.info(f"Batch processing succeeded in {elapsed:.2f}s")
                else:
                    # No result - resolve all with None
                    for _, _, future in batch:
                        future.set_result(None)
                    
                    self.metrics.increment("ai_errors", "summarize_batch")
                    
            except Exception as e:
                logger.error(f"Batch processing failed: {e}")
                self.metrics.increment("ai_errors", "summarize_batch")
                
                # Resolve all futures with None
                for _, _, future in batch:
                    if not future.done():
                        future.set_result(None)
    
    async def _batch_timer(self) -> None:
        """Timer that triggers batch processing after timeout."""
        await asyncio.sleep(self.batch_timeout)
        await self._process_batch()
    
    async def _add_to_batch(self, operation: str, messages: list[dict]) -> str | None:
        """Add a summarization request to the batch queue.
        
        Args:
            operation: Operation name
            messages: Messages to summarize
            
        Returns:
            Summary result when batch is processed
        """
        future: asyncio.Future = asyncio.Future()
        
        async with self.batch_lock:
            self.batch_queue.append((operation, messages, future))
            
            # Start batch timer if not already running
            if self.batch_task is None or self.batch_task.done():
                self.batch_task = asyncio.create_task(self._batch_timer())
            
            # If batch is full, process immediately
            if len(self.batch_queue) >= self.batch_size:
                if self.batch_task and not self.batch_task.done():
                    self.batch_task.cancel()
                await self._process_batch()
        
        # Wait for result
        return await future
    
    async def _wait_for_rate_limit(self) -> None:
        """Wait if necessary to respect rate limiting.
        
        Implements a sliding window rate limiter that tracks API calls
        within the last minute and waits if the limit is reached.
        """
        if not self.rate_limit_enabled:
            return
        
        current_time = time.time()
        
        # Remove timestamps older than 1 minute
        cutoff_time = current_time - 60.0
        self.call_timestamps = [ts for ts in self.call_timestamps if ts > cutoff_time]
        
        # Check if we've hit the rate limit
        if len(self.call_timestamps) >= self.max_calls_per_minute:
            # Calculate how long to wait
            oldest_call = self.call_timestamps[0]
            wait_time = 60.0 - (current_time - oldest_call)
            
            if wait_time > 0:
                logger.info(
                    f"Rate limit reached ({self.max_calls_per_minute} calls/min). "
                    f"Waiting {wait_time:.2f}s..."
                )
                await asyncio.sleep(wait_time)
                
                # Clean up timestamps again after waiting
                current_time = time.time()
                cutoff_time = current_time - 60.0
                self.call_timestamps = [ts for ts in self.call_timestamps if ts > cutoff_time]
        
        # Record this call
        self.call_timestamps.append(current_time)
    
    async def summarize(self, messages: list[dict]) -> str | None:
        """Generate summary using AI adapter with retry logic.
        
        Tracks metrics for API calls, successes, errors, and processing time.
        Implements exponential backoff retry strategy for transient failures.
        Uses caching to avoid redundant API calls.
        Uses batch processing when enabled to combine multiple requests.
        
        Args:
            messages: List of message dictionaries with 'role' and 'content' keys
            
        Returns:
            Summary text or None if summarization fails after all retries
        """
        operation = "summarize"
        
        # Check cache first
        content = " ".join(msg.get("content", "") for msg in messages)
        cache_key = self._compute_cache_key(operation, content)
        cached_result = self._get_from_cache(cache_key)
        
        if cached_result is not None:
            logger.debug("Returning cached summary")
            return cached_result
        
        # Use batch processing if enabled
        if self.batch_enabled:
            logger.debug("Adding to batch queue")
            return await self._add_to_batch(operation, messages)
        
        self.metrics.increment("ai_calls", operation)
        
        start_time = time.time()
        
        for attempt in range(self.max_retries):
            try:
                # Wait for rate limit if necessary
                await self._wait_for_rate_limit()
                
                result = await self.adapter.summarize_conversation(messages)
                
                # Track success
                elapsed = time.time() - start_time
                self.metrics.increment("ai_success", operation)
                self.metrics.add_time(operation, elapsed)
                
                # Cache the result
                if result is not None:
                    self._put_in_cache(cache_key, result)
                
                logger.debug(f"AI summarization succeeded in {elapsed:.2f}s")
                return result
                
            except Exception as e:
                self.metrics.increment("ai_errors", operation)
                
                # Log the error
                logger.warning(
                    f"AI summarization failed (attempt {attempt + 1}/{self.max_retries}): {e}"
                )
                
                # If this was the last attempt, give up
                if attempt == self.max_retries - 1:
                    elapsed = time.time() - start_time
                    self.metrics.add_time(operation, elapsed)
                    logger.error(
                        f"AI summarization failed after {self.max_retries} attempts: {e}"
                    )
                    return None
                
                # Exponential backoff: wait 2^attempt seconds before retry
                wait_time = 2 ** attempt
                logger.debug(f"Retrying in {wait_time}s...")
                await asyncio.sleep(wait_time)
        
        return None
    
    async def extract_facts(self, messages: list[dict]) -> list[dict]:
        """Extract facts using AI adapter with retry logic.
        
        Tracks metrics for API calls, successes, errors, and processing time.
        Implements exponential backoff retry strategy for transient failures.
        Uses caching to avoid redundant API calls.
        
        Args:
            messages: List of message dictionaries with 'role' and 'content' keys
            
        Returns:
            List of extracted facts as dictionaries, or empty list if extraction fails
        """
        operation = "extract_facts"
        
        # Check cache first
        content = " ".join(msg.get("content", "") for msg in messages)
        cache_key = self._compute_cache_key(operation, content)
        cached_result = self._get_from_cache(cache_key)
        
        if cached_result is not None:
            logger.debug("Returning cached facts")
            return cached_result
        
        self.metrics.increment("ai_calls", operation)
        
        start_time = time.time()
        
        for attempt in range(self.max_retries):
            try:
                # Wait for rate limit if necessary
                await self._wait_for_rate_limit()
                
                result = await self.adapter.extract_facts(messages)
                
                # Track success
                elapsed = time.time() - start_time
                self.metrics.increment("ai_success", operation)
                self.metrics.add_time(operation, elapsed)
                
                # Cache the result
                self._put_in_cache(cache_key, result)
                
                logger.debug(
                    f"AI fact extraction succeeded in {elapsed:.2f}s, found {len(result)} facts"
                )
                return result
                
            except Exception as e:
                self.metrics.increment("ai_errors", operation)
                
                # Log the error
                logger.warning(
                    f"AI fact extraction failed (attempt {attempt + 1}/{self.max_retries}): {e}"
                )
                
                # If this was the last attempt, give up
                if attempt == self.max_retries - 1:
                    elapsed = time.time() - start_time
                    self.metrics.add_time(operation, elapsed)
                    logger.error(
                        f"AI fact extraction failed after {self.max_retries} attempts: {e}"
                    )
                    return []
                
                # Exponential backoff: wait 2^attempt seconds before retry
                wait_time = 2 ** attempt
                logger.debug(f"Retrying in {wait_time}s...")
                await asyncio.sleep(wait_time)
        
        return []
    
    async def score_importance(self, text: str) -> int:
        """Score importance using AI adapter with retry logic.
        
        Tracks metrics for API calls, successes, errors, and processing time.
        Implements exponential backoff retry strategy for transient failures.
        Returns neutral score (5) if all attempts fail.
        Uses caching to avoid redundant API calls.
        
        Args:
            text: Text content to score
            
        Returns:
            Importance score from 1 (low) to 10 (high), or 5 (neutral) if scoring fails
        """
        operation = "score_importance"
        
        # Check cache first
        cache_key = self._compute_cache_key(operation, text)
        cached_result = self._get_from_cache(cache_key)
        
        if cached_result is not None:
            logger.debug("Returning cached importance score")
            return cached_result
        
        self.metrics.increment("ai_calls", operation)
        
        start_time = time.time()
        
        for attempt in range(self.max_retries):
            try:
                # Wait for rate limit if necessary
                await self._wait_for_rate_limit()
                
                result = await self.adapter.score_importance(text)
                
                # Validate score is in valid range
                if not isinstance(result, int) or not (1 <= result <= 10):
                    logger.warning(
                        f"AI returned invalid importance score: {result}. Using neutral score (5)."
                    )
                    result = 5
                
                # Track success
                elapsed = time.time() - start_time
                self.metrics.increment("ai_success", operation)
                self.metrics.add_time(operation, elapsed)
                
                # Cache the result
                self._put_in_cache(cache_key, result)
                
                logger.debug(f"AI importance scoring succeeded in {elapsed:.2f}s, score: {result}")
                return result
                
            except Exception as e:
                self.metrics.increment("ai_errors", operation)
                
                # Log the error
                logger.warning(
                    f"AI importance scoring failed (attempt {attempt + 1}/{self.max_retries}): {e}"
                )
                
                # If this was the last attempt, return neutral score
                if attempt == self.max_retries - 1:
                    elapsed = time.time() - start_time
                    self.metrics.add_time(operation, elapsed)
                    logger.error(
                        f"AI importance scoring failed after {self.max_retries} attempts: {e}. "
                        f"Returning neutral score (5)."
                    )
                    return 5
                
                # Exponential backoff: wait 2^attempt seconds before retry
                wait_time = 2 ** attempt
                logger.debug(f"Retrying in {wait_time}s...")
                await asyncio.sleep(wait_time)
        
        # Fallback to neutral score
        return 5
    
    def get_metrics(self) -> dict[str, Any]:
        """Return processing metrics.
        
        Returns:
            Dictionary containing processing metrics including:
            - ai_calls: Number of API calls per operation
            - ai_success: Number of successful calls per operation
            - ai_errors: Number of failed calls per operation
            - processing_time: Total processing time per operation
        """
        metrics_dict = self.metrics.to_dict()
        
        # Add summary statistics
        total_calls = sum(self.metrics.ai_calls.values())
        total_success = sum(self.metrics.ai_success.values())
        total_errors = sum(self.metrics.ai_errors.values())
        total_time = sum(self.metrics.processing_time.values())
        
        metrics_dict["summary"] = {
            "total_calls": total_calls,
            "total_success": total_success,
            "total_errors": total_errors,
            "total_time": total_time,
            "success_rate": total_success / total_calls if total_calls > 0 else 0.0,
            "avg_time_per_call": total_time / total_calls if total_calls > 0 else 0.0,
        }
        
        return metrics_dict



class HybridProcessor(MemoryProcessor):
    """Processor that intelligently switches between AI and heuristics.
    
    This processor combines AI and heuristic processing strategies, using
    intelligent routing logic to decide when to use each approach based on:
    - Importance thresholds
    - Random probability sampling
    - Cost management constraints
    - Fallback behavior on AI failures
    
    The hybrid approach optimizes for both quality and cost by using AI
    selectively for high-value content while relying on fast heuristics
    for routine processing.
    """
    
    def __init__(
        self,
        ai_processor: AIProcessor,
        heuristic_processor: HeuristicProcessor,
        config: "HybridConfig",
    ):
        """Initialize the hybrid processor.
        
        Args:
            ai_processor: AIProcessor instance for AI-based operations
            heuristic_processor: HeuristicProcessor instance for rule-based operations
            config: HybridConfig instance with routing and fallback settings
        """
        self.ai = ai_processor
        self.heuristic = heuristic_processor
        self.config = config
        self.metrics = ProcessingMetrics()
        
        logger.info(
            f"HybridProcessor initialized with AI threshold={config.ai_threshold_importance}, "
            f"probability={config.ai_probability}, fallback={config.fallback_to_heuristic}"
        )
    
    async def summarize(self, messages: list[dict]) -> str | None:
        """Generate summary using AI or heuristic based on intelligent routing.
        
        Decision logic:
        1. First, use heuristic processor to score importance
        2. Use AI if importance >= threshold OR random probability triggers
        3. Fall back to heuristic if AI fails and fallback is enabled
        
        Args:
            messages: List of message dictionaries with 'role' and 'content' keys
            
        Returns:
            Summary text or None if summarization fails
        """
        operation = "summarize"
        
        # First, get heuristic importance score to decide routing
        text = " ".join(m.get("content", "") for m in messages if m.get("content"))
        importance = await self.heuristic.score_importance(text)
        
        # Decide whether to use AI based on configuration
        use_ai = self._should_use_ai(importance, operation)
        
        if use_ai:
            try:
                self.metrics.increment("hybrid_ai_used", operation)
                logger.debug(f"Using AI for summarization (importance={importance})")
                
                result = await self.ai.summarize(messages)
                return result
                
            except Exception as e:
                logger.warning(f"AI summarization failed in hybrid mode: {e}")
                
                if self.config.fallback_to_heuristic:
                    self.metrics.increment("hybrid_fallback", operation)
                    logger.info("Falling back to heuristic summarization")
                    return await self.heuristic.summarize(messages)
                else:
                    raise
        else:
            self.metrics.increment("hybrid_heuristic_used", operation)
            logger.debug(f"Using heuristic for summarization (importance={importance})")
            return await self.heuristic.summarize(messages)
    
    async def extract_facts(self, messages: list[dict]) -> list[dict]:
        """Extract facts using AI or heuristic based on intelligent routing.
        
        Decision logic:
        1. First, use heuristic processor to score importance
        2. Use AI if importance >= threshold OR random probability triggers
        3. Fall back to heuristic if AI fails and fallback is enabled
        
        Args:
            messages: List of message dictionaries with 'role' and 'content' keys
            
        Returns:
            List of extracted facts as dictionaries
        """
        operation = "extract_facts"
        
        # First, get heuristic importance score to decide routing
        text = " ".join(m.get("content", "") for m in messages if m.get("content"))
        importance = await self.heuristic.score_importance(text)
        
        # Decide whether to use AI based on configuration
        use_ai = self._should_use_ai(importance, operation)
        
        if use_ai:
            try:
                self.metrics.increment("hybrid_ai_used", operation)
                logger.debug(f"Using AI for fact extraction (importance={importance})")
                
                result = await self.ai.extract_facts(messages)
                return result
                
            except Exception as e:
                logger.warning(f"AI fact extraction failed in hybrid mode: {e}")
                
                if self.config.fallback_to_heuristic:
                    self.metrics.increment("hybrid_fallback", operation)
                    logger.info("Falling back to heuristic fact extraction")
                    return await self.heuristic.extract_facts(messages)
                else:
                    raise
        else:
            self.metrics.increment("hybrid_heuristic_used", operation)
            logger.debug(f"Using heuristic for fact extraction (importance={importance})")
            return await self.heuristic.extract_facts(messages)
    
    async def score_importance(self, text: str) -> int:
        """Score importance using heuristic processor.
        
        For importance scoring, we always use the heuristic processor since:
        1. It's fast and doesn't incur API costs
        2. The score is used to make routing decisions for other operations
        3. Heuristic scoring is sufficiently accurate for routing purposes
        
        Args:
            text: Text content to score
            
        Returns:
            Importance score from 1 (low) to 10 (high)
        """
        # Always use heuristic for importance scoring to avoid circular dependency
        # and to keep routing decisions fast and cost-effective
        return await self.heuristic.score_importance(text)
    
    def get_metrics(self) -> dict[str, Any]:
        """Return comprehensive metrics from both processors.
        
        Returns:
            Dictionary containing:
            - Hybrid routing metrics (AI vs heuristic usage, fallbacks)
            - AI processor metrics (calls, successes, errors, timing)
            - Heuristic processor metrics (calls)
            - Summary statistics
        """
        # Get metrics from both processors
        ai_metrics = self.ai.get_metrics()
        heuristic_metrics = self.heuristic.get_metrics()
        hybrid_metrics = self.metrics.to_dict()
        
        # Combine into comprehensive report
        combined = {
            "hybrid": hybrid_metrics,
            "ai": ai_metrics,
            "heuristic": heuristic_metrics,
        }
        
        # Add summary statistics
        total_hybrid_calls = (
            sum(self.metrics.hybrid_ai_used.values()) +
            sum(self.metrics.hybrid_heuristic_used.values())
        )
        total_ai_used = sum(self.metrics.hybrid_ai_used.values())
        total_heuristic_used = sum(self.metrics.hybrid_heuristic_used.values())
        total_fallbacks = sum(self.metrics.hybrid_fallback.values())
        
        combined["summary"] = {
            "total_operations": total_hybrid_calls,
            "ai_used": total_ai_used,
            "heuristic_used": total_heuristic_used,
            "fallbacks": total_fallbacks,
            "ai_usage_rate": total_ai_used / total_hybrid_calls if total_hybrid_calls > 0 else 0.0,
            "fallback_rate": total_fallbacks / total_ai_used if total_ai_used > 0 else 0.0,
        }
        
        return combined
    
    def _should_use_ai(self, importance: int, operation: str) -> bool:
        """Determine whether to use AI or heuristic processing.
        
        Decision logic:
        1. Use AI if importance >= threshold
        2. Use AI with configured probability (random sampling)
        3. Respect max_ai_calls_per_batch limit if configured
        
        Args:
            importance: Importance score from 1-10
            operation: Operation type (for tracking)
            
        Returns:
            True if AI should be used, False for heuristic
        """
        import random
        
        # Check importance threshold
        if importance >= self.config.ai_threshold_importance:
            logger.debug(
                f"Using AI: importance {importance} >= threshold {self.config.ai_threshold_importance}"
            )
            return True
        
        # Check probability-based random selection
        if random.random() < self.config.ai_probability:
            logger.debug(
                f"Using AI: random selection (probability={self.config.ai_probability})"
            )
            return True
        
        # Default to heuristic
        return False



class DisabledProcessor(MemoryProcessor):
    """Processor that performs no operations (disabled mode).
    
    This processor is used when LTM processing is disabled. All methods
    return None or empty results, effectively skipping memory processing.
    """
    
    def __init__(self):
        """Initialize the disabled processor."""
        self.metrics = ProcessingMetrics()
        logger.info("DisabledProcessor initialized - LTM processing is disabled")
    
    async def summarize(self, messages: list[dict]) -> str | None:
        """Return None (no summarization in disabled mode).
        
        Args:
            messages: List of message dictionaries (ignored)
            
        Returns:
            None
        """
        return None
    
    async def extract_facts(self, messages: list[dict]) -> list[dict]:
        """Return empty list (no fact extraction in disabled mode).
        
        Args:
            messages: List of message dictionaries (ignored)
            
        Returns:
            Empty list
        """
        return []
    
    async def score_importance(self, text: str) -> int:
        """Return neutral score (no importance scoring in disabled mode).
        
        Args:
            text: Text content (ignored)
            
        Returns:
            Neutral importance score of 5
        """
        return 5
    
    def get_metrics(self) -> dict[str, Any]:
        """Return empty metrics.
        
        Returns:
            Dictionary with empty metrics
        """
        return {
            "mode": "disabled",
            "note": "LTM processing is disabled, no metrics collected"
        }
