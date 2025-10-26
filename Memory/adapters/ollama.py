"""Ollama adapter for local AI model integration."""

import json
from typing import Any
from ollama import AsyncClient
from .ai_adapter import AIAdapter


class OllamaAdapter(AIAdapter):
    """
    Adapter for local Ollama models.
    
    Supports running models locally without external API calls.
    """
    
    def __init__(
        self,
        model: str = "llama3.2:1b",
        base_url: str = "http://localhost:11434",
        temperature: float = 0.7,
        **kwargs
    ):
        """
        Initialize Ollama adapter.
        
        Args:
            model: Model name (default: llama3.2:1b)
            base_url: Ollama server URL (default: http://localhost:11434)
            temperature: Sampling temperature (default: 0.7)
        """
        self.client = AsyncClient(host=base_url)
        self.model = model
        self.temperature = temperature
    
    async def summarize_conversation(
        self,
        messages: list[dict[str, Any]],
    ) -> str | None:
        """
        Generate a concise summary using Ollama.
        
        Args:
            messages: List of conversation messages
            
        Returns:
            Summary string or None if failed
        """
        if not messages:
            return None
        
        conversation_text = self._format_messages(messages)
        
        prompt = (
            "You are a memory summarization assistant. "
            "Create a concise, high-level summary of the conversation "
            "that captures the main topics, key information, and overall context. "
            "Focus on what would be useful to remember later.\n\n"
            f"Conversation:\n{conversation_text}\n\n"
            "Summary:"
        )
        
        try:
            response = await self.client.generate(
                model=self.model,
                prompt=prompt,
                options={
                    "temperature": self.temperature,
                    "num_predict": 500,
                }
            )
            
            return response.get("response", "").strip()
        
        except Exception as e:
            print(f"Ollama summarization error: {e}")
            return None
    
    async def extract_facts(
        self,
        messages: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """
        Extract key facts using Ollama.
        
        Args:
            messages: List of conversation messages
            
        Returns:
            List of fact dictionaries
        """
        if not messages:
            return []
        
        conversation_text = self._format_messages(messages)
        
        prompt = (
            "You are a fact extraction assistant. "
            "Extract specific, memorable facts from the conversation. "
            "Focus on user preferences, personal information, important events, "
            "and other details worth remembering. "
            "Return facts as a JSON array of objects with 'fact' and 'context' fields.\n\n"
            f"Conversation:\n{conversation_text}\n\n"
            "Facts (JSON format):"
        )
        
        try:
            response = await self.client.generate(
                model=self.model,
                prompt=prompt,
                format="json",
                options={
                    "temperature": 0.3,
                    "num_predict": 500,
                }
            )
            
            content = response.get("response", "").strip()
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
            print(f"Ollama fact extraction error: {e}")
            return []
    
    async def score_importance(
        self,
        summary: str,
    ) -> int:
        """
        Score importance using Ollama.
        
        Args:
            summary: Memory summary to score
            
        Returns:
            Importance score (1-10)
        """
        if not summary:
            return 5
        
        prompt = (
            "You are an importance scoring assistant. "
            "Rate the importance of memory summaries on a scale of 1-10:\n"
            "1-3: Casual conversation, small talk, low importance\n"
            "4-6: Normal conversation, moderate importance\n"
            "7-8: Important information, preferences, significant events\n"
            "9-10: Critical information, major life events, core preferences\n\n"
            "Respond with ONLY a single number between 1 and 10.\n\n"
            f"Memory:\n{summary}\n\n"
            "Importance score:"
        )
        
        try:
            response = await self.client.generate(
                model=self.model,
                prompt=prompt,
                options={
                    "temperature": 0.3,
                    "num_predict": 10,
                }
            )
            
            content = response.get("response", "").strip()
            if not content:
                return 5
            
            # Extract number from response
            # Handle cases where model returns extra text
            score_str = ""
            for char in content:
                if char.isdigit():
                    score_str += char
                elif score_str:
                    break
            
            if not score_str:
                return 5
            
            score = int(score_str)
            
            # Clamp to valid range
            return max(1, min(10, score))
        
        except Exception as e:
            print(f"Ollama importance scoring error: {e}")
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
