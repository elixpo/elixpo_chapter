"""Anthropic adapter for Claude AI integration."""

import os
import json
from typing import Any
from anthropic import AsyncAnthropic
from .ai_adapter import AIAdapter


class AnthropicAdapter(AIAdapter):
    """
    Adapter for Anthropic Claude API integration.
    
    Supports Claude models for memory processing.
    """
    
    def __init__(
        self,
        api_key: str | None = None,
        model: str = "claude-3-5-haiku-20241022",
        temperature: float = 0.7,
        max_tokens: int = 500,
        **kwargs
    ):
        """
        Initialize Anthropic adapter.
        
        Args:
            api_key: Anthropic API key (defaults to ANTHROPIC_API_KEY env var)
            model: Model name (default: claude-3-5-haiku-20241022)
            temperature: Sampling temperature (default: 0.7)
            max_tokens: Maximum tokens in response (default: 500)
        """
        self.client = AsyncAnthropic(api_key=api_key or os.getenv("ANTHROPIC_API_KEY"))
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
    
    async def summarize_conversation(
        self,
        messages: list[dict[str, Any]],
    ) -> str | None:
        """
        Generate a concise summary using Claude.
        
        Args:
            messages: List of conversation messages
            
        Returns:
            Summary string or None if failed
        """
        if not messages:
            return None
        
        conversation_text = self._format_messages(messages)
        
        try:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                temperature=self.temperature,
                system=(
                    "You are a memory summarization assistant. "
                    "Create a concise, high-level summary of the conversation "
                    "that captures the main topics, key information, and overall context. "
                    "Focus on what would be useful to remember later."
                ),
                messages=[
                    {
                        "role": "user",
                        "content": f"Summarize this conversation:\n\n{conversation_text}"
                    }
                ]
            )
            
            # Extract text from response
            if response.content and len(response.content) > 0:
                return response.content[0].text
            
            return None
        
        except Exception as e:
            print(f"Anthropic summarization error: {e}")
            return None
    
    async def extract_facts(
        self,
        messages: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """
        Extract key facts using Claude.
        
        Args:
            messages: List of conversation messages
            
        Returns:
            List of fact dictionaries
        """
        if not messages:
            return []
        
        conversation_text = self._format_messages(messages)
        
        try:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                temperature=0.3,  # Lower temperature for more consistent extraction
                system=(
                    "You are a fact extraction assistant. "
                    "Extract specific, memorable facts from the conversation. "
                    "Focus on user preferences, personal information, important events, "
                    "and other details worth remembering. "
                    "Return facts as a JSON array of objects with 'fact' and 'context' fields."
                ),
                messages=[
                    {
                        "role": "user",
                        "content": f"Extract facts from this conversation:\n\n{conversation_text}"
                    }
                ]
            )
            
            # Extract text from response
            if not response.content or len(response.content) == 0:
                return []
            
            content = response.content[0].text
            
            # Try to parse JSON from the response
            # Claude might wrap JSON in markdown code blocks
            if "```json" in content:
                # Extract JSON from code block
                start = content.find("```json") + 7
                end = content.find("```", start)
                content = content[start:end].strip()
            elif "```" in content:
                # Extract from generic code block
                start = content.find("```") + 3
                end = content.find("```", start)
                content = content[start:end].strip()
            
            result = json.loads(content)
            
            # Handle different response formats
            if isinstance(result, dict):
                if "facts" in result:
                    facts = result["facts"]
                elif "items" in result:
                    facts = result["items"]
                else:
                    facts = [result]
            elif isinstance(result, list):
                facts = result
            else:
                return []
            
            # Ensure each fact has required fields
            formatted_facts = []
            for fact in facts:
                if isinstance(fact, dict):
                    formatted_facts.append(fact)
                elif isinstance(fact, str):
                    formatted_facts.append({"fact": fact, "context": ""})
            
            return formatted_facts
        
        except Exception as e:
            print(f"Anthropic fact extraction error: {e}")
            return []
    
    async def score_importance(
        self,
        summary: str,
    ) -> int:
        """
        Score importance using Claude.
        
        Args:
            summary: Memory summary to score
            
        Returns:
            Importance score (1-10)
        """
        if not summary:
            return 5
        
        try:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=10,
                temperature=0.3,
                system=(
                    "You are an importance scoring assistant. "
                    "Rate the importance of memory summaries on a scale of 1-10:\n"
                    "1-3: Casual conversation, small talk, low importance\n"
                    "4-6: Normal conversation, moderate importance\n"
                    "7-8: Important information, preferences, significant events\n"
                    "9-10: Critical information, major life events, core preferences\n\n"
                    "Respond with ONLY a single number between 1 and 10."
                ),
                messages=[
                    {
                        "role": "user",
                        "content": f"Rate the importance of this memory:\n\n{summary}"
                    }
                ]
            )
            
            # Extract text from response
            if not response.content or len(response.content) == 0:
                return 5
            
            content = response.content[0].text.strip()
            
            # Extract number from response
            score = int(content)
            
            # Clamp to valid range
            return max(1, min(10, score))
        
        except Exception as e:
            print(f"Anthropic importance scoring error: {e}")
            return 5
    
    def _format_messages(self, messages: list[dict[str, Any]]) -> str:
        """
        Format messages into a readable conversation string.
        
        Args:
            messages: List of message dictionaries
            
        Returns:
            Formatted conversation text
        """
        formatted = []
        for msg in messages:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            author_name = msg.get("author_name", "")
            
            if role == "user" and author_name:
                formatted.append(f"{author_name}: {content}")
            elif role == "user":
                formatted.append(f"User: {content}")
            elif role == "assistant":
                formatted.append(f"Assistant: {content}")
            else:
                formatted.append(f"{role}: {content}")
        
        return "\n".join(formatted)
