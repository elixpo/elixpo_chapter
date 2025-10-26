"""Data models for the memory system."""

from dataclasses import dataclass, field, asdict
from typing import Any


@dataclass
class MemoryEntry:
    """
    Represents a single message in the conversation memory.
    
    This is a generic message format compatible with OpenAI's chat format,
    supporting user messages, assistant responses, system messages, and tool calls.
    
    Attributes:
        role: The role of the message sender ("user", "assistant", "system", "tool")
        content: The text content of the message (optional for tool calls)
        tool_calls: List of tool calls made by the assistant (optional)
        name: Name of the tool (for tool role messages)
        tool_call_id: ID of the tool call being responded to (for tool role messages)
        metadata: Flexible dictionary for application-specific data (author_id, timestamps, etc.)
    """
    
    role: str
    content: str | None = None
    tool_calls: list | None = None
    name: str | None = None
    tool_call_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> dict[str, Any]:
        """Convert the entry to a dictionary, excluding None values."""
        return {k: v for k, v in asdict(self).items() if v is not None}
    
    def to_llm_format(self) -> dict[str, Any]:
        """
        Convert to LLM-compatible format (OpenAI style).
        
        Returns a dict with only the fields needed for LLM consumption,
        excluding metadata.
        """
        result = {"role": self.role}
        
        if self.content is not None:
            result["content"] = self.content
        
        if self.tool_calls is not None:
            result["tool_calls"] = self.tool_calls
        
        if self.name is not None:
            result["name"] = self.name
        
        if self.tool_call_id is not None:
            result["tool_call_id"] = self.tool_call_id
        
        return result
