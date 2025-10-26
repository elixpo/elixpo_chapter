"""Abstract interface for AI model integration."""

from abc import ABC, abstractmethod
from typing import Any


class AIAdapter(ABC):
    """
    Abstract base class for AI model integration.
    
    This interface allows the memory system to work with any LLM provider
    for summarization, fact extraction, and importance scoring.
    
    Applications should implement this interface to connect their preferred
    AI model (OpenAI, Anthropic, local models, etc.) to the memory system.
    """
    
    @abstractmethod
    async def summarize_conversation(
        self,
        messages: list[dict[str, Any]],
    ) -> str | None:
        """
        Generate a concise summary of a conversation.
        
        This method should create a high-level "gist" summary that captures
        the main topics, key information, and overall context of the conversation.
        
        Args:
            messages: List of message dictionaries with the following structure:
                - role: str ("user" or "assistant")
                - content: str (message text)
                - author_name: str (optional, for user messages)
                - author_id: str/int (optional, for user messages)
        
        Returns:
            A summary string, or None if summarization failed.
            
        Example:
            >>> messages = [
            ...     {"role": "user", "content": "I love pizza", "author_name": "John"},
            ...     {"role": "assistant", "content": "What's your favorite topping?"}
            ... ]
            >>> summary = await adapter.summarize_conversation(messages)
            >>> print(summary)
            "User John expressed love for pizza. Assistant asked about favorite toppings."
        """
        pass
    
    @abstractmethod
    async def extract_facts(
        self,
        messages: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """
        Extract key facts and information from a conversation.
        
        This method should identify specific, memorable facts about users,
        preferences, events, or other important details that should be
        stored separately in long-term memory.
        
        Args:
            messages: List of message dictionaries (same format as summarize_conversation)
        
        Returns:
            List of fact dictionaries. The structure is flexible and defined by
            the implementation, but should be searchable and meaningful.
            
        Example structure:
            [
                {
                    "user_name": "John",
                    "user_id": "12345",
                    "fact": "Loves pizza",
                    "context": "User expressed preference for pizza"
                },
                {
                    "user_name": "John",
                    "user_id": "12345",
                    "fact": "Favorite topping is pepperoni",
                    "context": "User stated favorite pizza topping"
                }
            ]
            
        Returns an empty list if extraction failed or no facts were found.
        """
        pass
    
    @abstractmethod
    async def score_importance(
        self,
        summary: str,
    ) -> int:
        """
        Rate the importance of a memory summary on a scale of 1-10.
        
        This score is used to prioritize which memories should be retrieved
        first during semantic search. Higher scores indicate more important
        or relevant information.
        
        Scoring guidelines:
        - 1-3: Casual conversation, small talk, low importance
        - 4-6: Normal conversation, moderate importance
        - 7-8: Important information, preferences, significant events
        - 9-10: Critical information, major life events, core preferences
        
        Args:
            summary: The memory summary text to score
        
        Returns:
            An integer score between 1 and 10 (inclusive).
            Should return 5 (neutral) if scoring fails.
            
        Example:
            >>> summary = "User revealed they are allergic to peanuts"
            >>> score = await adapter.score_importance(summary)
            >>> print(score)
            9
        """
        pass
