"""HuggingFace adapter for local and API-based model integration."""

import os
import json
from typing import Any, Literal
from .ai_adapter import AIAdapter


class HuggingFaceAdapter(AIAdapter):
    """
    Adapter for HuggingFace models.
    
    Supports both API-based inference and local transformers.
    """
    
    def __init__(
        self,
        model: str = "meta-llama/Llama-3.2-1B-Instruct",
        mode: Literal["api", "local"] = "api",
        api_key: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 500,
        **kwargs
    ):
        """
        Initialize HuggingFace adapter.
        
        Args:
            model: Model name or path
            mode: "api" for HuggingFace Inference API, "local" for transformers
            api_key: HuggingFace API token (defaults to HF_TOKEN env var)
            temperature: Sampling temperature (default: 0.7)
            max_tokens: Maximum tokens in response (default: 500)
        """
        self.model = model
        self.mode = mode
        self.temperature = temperature
        self.max_tokens = max_tokens
        
        if mode == "api":
            from huggingface_hub import AsyncInferenceClient
            self.client = AsyncInferenceClient(
                token=api_key or os.getenv("HF_TOKEN")
            )
        else:
            # Local mode - lazy load transformers
            self.pipeline = None
            self._init_local_model()
    
    def _init_local_model(self):
        """Initialize local transformers pipeline."""
        try:
            from transformers import pipeline
            self.pipeline = pipeline(
                "text-generation",
                model=self.model,
                device_map="auto",
            )
        except Exception as e:
            print(f"Failed to initialize local model: {e}")
            self.pipeline = None
    
    async def summarize_conversation(
        self,
        messages: list[dict[str, Any]],
    ) -> str | None:
        """
        Generate a concise summary using HuggingFace.
        
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
            if self.mode == "api":
                response = await self.client.text_generation(
                    prompt=prompt,
                    model=self.model,
                    max_new_tokens=self.max_tokens,
                    temperature=self.temperature,
                )
                return response.strip()
            else:
                if not self.pipeline:
                    return None
                
                result = self.pipeline(
                    prompt,
                    max_new_tokens=self.max_tokens,
                    temperature=self.temperature,
                    do_sample=True,
                )
                
                if result and len(result) > 0:
                    generated_text = result[0].get("generated_text", "")
                    # Remove the prompt from the response
                    if generated_text.startswith(prompt):
                        generated_text = generated_text[len(prompt):].strip()
                    return generated_text
                
                return None
        
        except Exception as e:
            print(f"HuggingFace summarization error: {e}")
            return None
    
    async def extract_facts(
        self,
        messages: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """
        Extract key facts using HuggingFace.
        
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
            if self.mode == "api":
                response = await self.client.text_generation(
                    prompt=prompt,
                    model=self.model,
                    max_new_tokens=self.max_tokens,
                    temperature=0.3,
                )
                content = response.strip()
            else:
                if not self.pipeline:
                    return []
                
                result = self.pipeline(
                    prompt,
                    max_new_tokens=self.max_tokens,
                    temperature=0.3,
                    do_sample=True,
                )
                
                if not result or len(result) == 0:
                    return []
                
                generated_text = result[0].get("generated_text", "")
                # Remove the prompt from the response
                if generated_text.startswith(prompt):
                    content = generated_text[len(prompt):].strip()
                else:
                    content = generated_text.strip()
            
            if not content:
                return []
            
            # Try to parse JSON from the response
            # Handle markdown code blocks
            if "```json" in content:
                start = content.find("```json") + 7
                end = content.find("```", start)
                content = content[start:end].strip()
            elif "```" in content:
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
            print(f"HuggingFace fact extraction error: {e}")
            return []
    
    async def score_importance(
        self,
        summary: str,
    ) -> int:
        """
        Score importance using HuggingFace.
        
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
            if self.mode == "api":
                response = await self.client.text_generation(
                    prompt=prompt,
                    model=self.model,
                    max_new_tokens=10,
                    temperature=0.3,
                )
                content = response.strip()
            else:
                if not self.pipeline:
                    return 5
                
                result = self.pipeline(
                    prompt,
                    max_new_tokens=10,
                    temperature=0.3,
                    do_sample=True,
                )
                
                if not result or len(result) == 0:
                    return 5
                
                generated_text = result[0].get("generated_text", "")
                # Remove the prompt from the response
                if generated_text.startswith(prompt):
                    content = generated_text[len(prompt):].strip()
                else:
                    content = generated_text.strip()
            
            if not content:
                return 5
            
            # Extract number from response
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
            print(f"HuggingFace importance scoring error: {e}")
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
