

class SessionManager:
    def __init__(self):
        self.sessions: Dict[str, SessionMemory] = {}
        self.lock = threading.RLock()
    
    def create_session(self, session_id: str) -> SessionMemory:
        with self.lock:
            if session_id not in self.sessions:
                self.sessions[session_id] = SessionMemory(
                    session_id,
                    summary_threshold=SESSION_SUMMARY_THRESHOLD
                )
            return self.sessions[session_id]
    
    def get_session(self, session_id: str) -> Optional[SessionMemory]:
        with self.lock:
            return self.sessions.get(session_id)
    
    def add_turn(self, session_id: str, user_query: str, assistant_response: str, entities: List[str] = None) -> None:
        with self.lock:
            session = self.sessions.get(session_id)
            if session:
                session.add_turn(user_query, assistant_response, entities)
    
    def get_session_context(self, session_id: str) -> Dict:
        with self.lock:
            session = self.sessions.get(session_id)
            if session:
                return session.get_context()
            return {}
    
    def get_minimal_context(self, session_id: str) -> str:
        with self.lock:
            session = self.sessions.get(session_id)
            if session:
                return session.get_minimal_context()
            return ""
    
    def delete_session(self, session_id: str) -> None:
        with self.lock:
            if session_id in self.sessions:
                self.sessions[session_id].clear()
                del self.sessions[session_id]
