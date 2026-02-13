"""
RAG Engine - Retrieval Augmented Generation using local knowledge graphs and session context.

Augments LLM prompts with:
- Local KG entities and relationships
- Relevant document excerpts
- Top-ranked context from fetched sources
"""

from typing import Dict, List, Optional, Tuple
from loguru import logger
from session_manager import SessionManager, SessionData
import json


class RAGEngine:
    """RAG implementation using session knowledge graphs"""
    
    def __init__(self, session_manager: SessionManager, top_k_entities: int = 15, top_k_relationships: int = 10):
        """
        Initialize RAG Engine
        
        Args:
            session_manager: SessionManager instance
            top_k_entities: Number of top entities to include in context
            top_k_relationships: Number of relationships to include
        """
        self.session_manager = session_manager
        self.top_k_entities = top_k_entities
        self.top_k_relationships = top_k_relationships
        logger.info("[RAGEngine] Initialized with top_k entities={}, relationships={}".format(
            top_k_entities, top_k_relationships
        ))
    
    def build_rag_context(self, session_id: str) -> Dict:
        """
        Build comprehensive RAG context from session's knowledge graph
        
        Args:
            session_id: Session ID
            
        Returns:
            Dictionary with structured RAG context
        """
        session = self.session_manager.get_session(session_id)
        if not session:
            logger.warning(f"[RAGEngine] Session {session_id} not found")
            return {"error": "Session not found"}
        
        kg = session.get_local_kg()
        
        # Get top entities
        kg.calculate_importance()
        top_entities = kg.get_top_entities(self.top_k_entities)
        
        # Get relationships involving top entities
        top_entity_names = {entity for entity, _ in top_entities}
        relevant_relationships = [
            (s, r, o) for s, r, o in kg.relationships
            if s in top_entity_names or o in top_entity_names
        ][:self.top_k_relationships]
        
        # Extract entity contexts
        entity_contexts = {}
        for entity, score in top_entities:
            contexts = []
            if entity in kg.entities:
                entity_ctxs = kg.entities[entity].get("contexts", [])
                contexts = entity_ctxs[:3]  # Top 3 contexts
            entity_contexts[entity] = contexts
        
        rag_context = {
            "session_id": session_id,
            "query": session.query,
            "source_count": len(session.fetched_urls),
            "sources": session.fetched_urls,
            
            "top_entities": [
                {
                    "entity": entity,
                    "relevance_score": float(score),
                    "entity_type": kg.entities.get(entity, {}).get("type", "UNKNOWN"),
                    "mention_count": kg.entities.get(entity, {}).get("count", 0),
                    "contexts": entity_contexts.get(entity, [])
                }
                for entity, score in top_entities
            ],
            
            "relationships": [
                {"subject": s, "relation": r, "object": o}
                for s, r, o in relevant_relationships
            ],
            
            "statistics": {
                "total_entities": len(kg.entities),
                "total_relationships": len(kg.relationships),
                "documents_processed": len(session.processed_content),
            }
        }
        
        return rag_context
    
    def build_rag_prompt_enhancement(self, session_id: str) -> str:
        """
        Build a natural language RAG enhancement for system prompts
        
        Args:
            session_id: Session ID
            
        Returns:
            Formatted string to append to system prompt
        """
        context = self.build_rag_context(session_id)
        
        if "error" in context:
            return ""
        
        parts = [
            "\n---\nKNOWLEDGE GRAPH CONTEXT (from retrieved documents):\n",
            f"Based on analysis of {context['source_count']} sources:\n"
        ]
        
        # Add entities
        if context['top_entities']:
            parts.append("\nKey Entities:")
            for ent in context['top_entities'][:10]:
                parts.append(f"  • {ent['entity']} (type: {ent['entity_type']}, mentioned {ent['mention_count']}x)")
        
        # Add relationships
        if context['relationships']:
            parts.append("\nKey Relationships:")
            for rel in context['relationships'][:8]:
                parts.append(f"  • {rel['subject']} → {rel['relation']} → {rel['object']}")
        
        # Add statistics
        parts.append(f"\nContext Statistics:")
        parts.append(f"  • Unique entities: {context['statistics']['total_entities']}")
        parts.append(f"  • Relationships: {context['statistics']['total_relationships']}")
        
        parts.append("\nUse this knowledge graph context to ground your response in the retrieved information.")
        parts.append("---\n")
        
        return "\n".join(parts)
    
    def extract_entity_evidence(self, session_id: str, entity: str) -> Dict:
        """
        Extract evidence for a specific entity from the session's content
        
        Args:
            session_id: Session ID
            entity: Entity name to search for
            
        Returns:
            Dictionary with evidence details
        """
        session = self.session_manager.get_session(session_id)
        if not session:
            return {"error": "Session not found"}
        
        kg = session.get_local_kg()
        entity_lower = entity.lower().strip()
        
        if entity_lower not in kg.entities:
            return {"error": f"Entity '{entity}' not found in knowledge graph"}
        
        entity_data = kg.entities[entity_lower]
        relationships = [
            (s, r, o) for s, r, o in kg.relationships
            if s == entity_lower or o == entity_lower
        ]
        
        return {
            "entity": entity_data.get("original", entity),
            "type": entity_data.get("type", "UNKNOWN"),
            "mention_count": entity_data.get("count", 0),
            "context_statements": entity_data.get("contexts", []),
            "relationships": [
                {"subject": s, "relation": r, "object": o}
                for s, r, o in relationships
            ],
            "sources": [
                src for src in session.fetched_urls
                if src in session.processed_content
            ]
        }
    
    def query_knowledge_graph(self, session_id: str, query: str, top_k: int = 5) -> List[Dict]:
        """
        Query the knowledge graph for relevant information
        
        Args:
            session_id: Session ID
            query: Query string
            top_k: Number of results to return
            
        Returns:
            List of relevant items
        """
        session = self.session_manager.get_session(session_id)
        if not session:
            return []
        
        kg = session.get_local_kg()
        kg.calculate_importance()
        
        # Simple keyword matching on entities
        query_terms = set(query.lower().split())
        results = []
        
        for entity_key, entity_data in kg.entities.items():
            entity_words = set(entity_key.split())
            overlap = query_terms & entity_words
            
            if overlap:
                score = len(overlap) / len(query_terms)
                results.append({
                    "entity": entity_data.get("original", entity_key),
                    "type": entity_data.get("type", "UNKNOWN"),
                    "relevance_score": score * kg.importance_scores.get(entity_key, 0.5),
                    "mentions": entity_data.get("count", 0),
                    "sample_context": entity_data.get("contexts", [""])[0]
                })
        
        # Sort by relevance
        results.sort(key=lambda x: x['relevance_score'], reverse=True)
        return results[:top_k]
    
    def build_document_summary(self, session_id: str) -> str:
        """
        Build a summary of all processed documents with key facts
        
        Args:
            session_id: Session ID
            
        Returns:
            Summary string
        """
        session = self.session_manager.get_session(session_id)
        if not session:
            return ""
        
        parts = [
            f"## Document Summary for Query: {session.query}\n",
            f"**Documents Processed:** {len(session.processed_content)}\n",
            f"**Unique Entities Identified:** {len(session.local_kg.entities)}\n",
            f"**Relationships Found:** {len(session.local_kg.relationships)}\n",
        ]
        
        # Add sources
        if session.fetched_urls:
            parts.append("\n**Sources:**")
            for i, url in enumerate(session.fetched_urls[:10], 1):
                parts.append(f"{i}. {url}")
        
        # Add top entities
        kg = session.get_local_kg()
        kg.calculate_importance()
        top_entities = kg.get_top_entities(10)
        
        if top_entities:
            parts.append("\n**Key Entities:**")
            for entity, score in top_entities:
                entity_type = kg.entities.get(entity, {}).get("type", "UNKNOWN")
                parts.append(f"  - {entity} ({entity_type}) - Importance: {score:.2f}")
        
        return "\n".join(parts)
    
    def validate_context_freshness(self, session_id: str) -> bool:
        """Check if context needs refresh"""
        session = self.session_manager.get_session(session_id)
        if not session:
            return False
        
        # If no cache or cache is old, suggest refresh
        return session.rag_context_cache is not None
    
    def get_summary_stats(self, session_id: str) -> Dict:
        """Get RAG engine statistics for a session"""
        session = self.session_manager.get_session(session_id)
        if not session:
            return {}
        
        kg = session.get_local_kg()
        
        return {
            "session_id": session_id,
            "documents_fetched": len(session.fetched_urls),
            "entities_extracted": len(kg.entities),
            "relationships_discovered": len(kg.relationships),
            "web_searches_performed": len(session.web_search_urls),
            "youtube_videos_found": len(session.youtube_urls),
            "tools_used": len(session.tool_calls_made),
            "errors_encountered": len(session.errors),
        }


# Global RAG engine instance
_rag_engine: Optional['RAGEngine'] = None


def initialize_rag_engine(session_manager: SessionManager) -> RAGEngine:
    """Initialize the global RAG engine"""
    global _rag_engine
    _rag_engine = RAGEngine(session_manager)
    logger.info("[RAGEngine] Global RAG engine initialized")
    return _rag_engine


def get_rag_engine() -> Optional[RAGEngine]:
    """Get the global RAG engine"""
    global _rag_engine
    return _rag_engine
