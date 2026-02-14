
class SessionMemory:
    def __init__(self, session_id: str, summary_threshold: int = 6):
        self.session_id = session_id
        self.summary_threshold = summary_threshold
        self.conversation_history: List[Dict] = []
        self.rolling_summary: str = ""
        self.entity_memory: set = set()
        self.lock = threading.RLock()
        self.turn_count = 0
    
    def add_turn(self, user_query: str, assistant_response: str, entities: List[str] = None) -> None:
        with self.lock:
            self.conversation_history.append({
                "turn": self.turn_count,
                "user": user_query,
                "assistant": assistant_response,
                "timestamp": datetime.now().isoformat()
            })
            
            if entities:
                self.entity_memory.update(entities)
            
            self.turn_count += 1
            
            if self.turn_count % self.summary_threshold == 0:
                self._compress_history()
    
    def _compress_history(self) -> None:
        if len(self.conversation_history) <= 2:
            return
        
        recent_turns = self.conversation_history[-2:]
        
        summary_parts = []
        summary_parts.append(f"Previous Discussion Summary (turns 1-{self.turn_count - 2}):")
        
        for turn in self.conversation_history[:-2]:
            summary_parts.append(f"  Q: {turn['user'][:100]}...")
            summary_parts.append(f"  A: {turn['assistant'][:100]}...")
        
        self.rolling_summary = "\n".join(summary_parts)
        
        self.conversation_history = [
            {"type": "summary", "content": self.rolling_summary},
            *recent_turns
        ]
        
        logger.debug(f"[SessionMemory] Compressed history for session {self.session_id}")
    
    def get_context(self) -> Dict:
        with self.lock:
            return {
                "summary": self.rolling_summary,
                "recent_history": self.conversation_history[-2:] if self.conversation_history else [],
                "entities": list(self.entity_memory),
                "turn_count": self.turn_count
            }
    
    def get_minimal_context(self) -> str:
        with self.lock:
            parts = []
            
            if self.rolling_summary:
                parts.append(self.rolling_summary)
            
            if self.conversation_history[-2:]:
                parts.append("Recent exchanges:")
                for turn in self.conversation_history[-2:]:
                    if "user" in turn:
                        parts.append(f"  User: {turn['user']}")
                        parts.append(f"  Assistant: {turn['assistant']}")
            
            return "\n".join(parts) if parts else ""
    
    def clear(self) -> None:
        with self.lock:
            self.conversation_history.clear()
            self.rolling_summary = ""
            self.entity_memory.clear()
            self.turn_count = 0




