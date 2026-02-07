"""OpenAI adapter for AI-powered memory processing."""

import os
import json
from typing import Any
from openai import AsyncOpenAI
from .ai_adapter import AIAdapter


class OpenAIAdapter(AIAdapter):
    """
    Adapter for OpenAI API integration.
    
    Supports GPT-4, GPT-3.5, and other OpenAI models for memory processing.
    """
    
    def __init__(
        self,
        api_key: str | None = None,
        model: str = "gpt-4o-mini",
        temperature: float = 0.7,
        max_tokens: int = 500,
        **kwargs
    ):
        """
        Initialize OpenAI adapter.
        
        Args:
            api_key: OpenAI API key (defaults to OPENAI_API_KEY env var)
            model: Model name (default: gpt-4o-mini)
            temperature: Sampling temperature (default: 0.7)
            max_tokens: Maximum tokens in response (default: 500)
        """
        self.client = AsyncOpenAI(api_key=api_key or os.getenv("OPENAI_API_KEY"))
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
    
    async def summarize_conversation(
        self,
        messages: list[dict[str, Any]],
    ) -> str | None:
        """
        Generate a concise summary using OpenAI API.
        
        Args:
            messages: List of conversation messages
            
        Returns:
            Summary string or None if failed
        """
        if not messages:
            return None
        
        # Format conversation for the prompt
        conversation_text = self._format_messages(messages)
        
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a memory summarization assistant. "
                            "Create a concise, high-level summary of the conversation "
                            "that captures the main topics, key information, and overall context. "
                            "Focus on what would be useful to remember later."
                        )
                    },
                    {
                        "role": "user",
                        "content": f"Summarize this conversation:\n\n{conversation_text}"
                    }
                ],
                temperature=self.temperature,
                max_tokens=self.max_tokens,
            )
            
            return response.choices[0].message.content
        
        except Exception as e:
            print(f"OpenAI summarization error: {e}")
            return None
    
    async def extract_facts(
        self,
        messages: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """
        Extract key facts using OpenAI structured outputs.
        
        Args:
            messages: List of conversation messages
            
        Returns:
            List of fact dictionaries
        """
        if not messages:
            return []
        
        conversation_text = self._format_messages(messages)
        
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a fact extraction assistant. "
                            "Extract specific, memorable facts from the conversation. "
                            "Focus on user preferences, personal information, important events, "
                            "and other details worth remembering. "
                            "Return facts as a JSON array of objects with 'fact' and 'context' fields."
                        )
                    },
                    {
                        "role": "user",
                        "content": f"Extract facts from this conversation:\n\n{conversation_text}"
                    }
                ],
                temperature=0.3,  # Lower temperature for more consistent extraction
                max_tokens=self.max_tokens,
                response_format={"type": "json_object"}
            )
            
            content = response.choices[0].message.content
            if not content:
                return []
            
            # Parse JSON response
            result = json.loads(content)
            
            # Handle different response formats
            if isinstance(result, dict):
                if "facts" in result:
                    facts = result["facts"]
                elif "items" in result:
                    facts = result["items"]
                else:
                    # Treat the whole dict as a single fact
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
            print(f"OpenAI fact extraction error: {e}")
            return []
    
    async def score_importance(
        self,
        summary: str,
    ) -> int:
        """
        Score importance using OpenAI with prompt engineering.
        
        Args:
            summary: Memory summary to score
            
        Returns:
            Importance score (1-10)
        """
        if not summary:
            return 5
        
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an importance scoring assistant. "
                            "Rate the importance of memory summaries on a scale of 1-10:\n"
                            "1-3: Casual conversation, small talk, low importance\n"
                            "4-6: Normal conversation, moderate importance\n"
                            "7-8: Important information, preferences, significant events\n"
                            "9-10: Critical information, major life events, core preferences\n\n"
                            "Respond with ONLY a single number between 1 and 10."
                        )
                    },
                    {
                        "role": "user",
                        "content": f"Rate the importance of this memory:\n\n{summary}"
                    }
                ],
                temperature=0.3,
                max_tokens=10,
            )
            
            content = response.choices[0].message.content
            if not content:
                return 5
            
            # Extract number from response
            score = int(content.strip())
            
            # Clamp to valid range
            return max(1, min(10, score))
        
        except Exception as e:
            print(f"OpenAI importance scoring error: {e}")
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
