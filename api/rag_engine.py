from typing import Dict, List, Optional, Tuple
from loguru import logger
from session_manager import SessionManager, SessionData
import json


class RAGEngine:
    
    def __init__(self, session_manager: SessionManager, top_k_entities: int = 15, top_k_relationships: int = 10):
        self.session_manager = session_manager
        self.top_k_entities = top_k_entities
        self.top_k_relationships = top_k_relationships
        logger.info("[RAGEngine] Initialized with top_k entities={}, relationships={}".format(
            top_k_entities, top_k_relationships
        ))
    
    def build_rag_context(self, session_id: str) -> Dict:
        session = self.session_manager.get_session(session_id)
        if not session:
            logger.warning(f"[RAGEngine] Session {session_id} not found")
            return {"error": "Session not found"}
        
        kg = session.get_local_kg()
        
        kg.calculate_importance()
        top_entities = kg.get_top_entities(self.top_k_entities)
        
        top_entity_names = {entity for entity, _ in top_entities}
        relevant_relationships = [
            (s, r, o) for s, r, o in kg.relationships
            if s in top_entity_names or o in top_entity_names
        ][:self.top_k_relationships]
        
        entity_contexts = {}
        for entity, score in top_entities:
            contexts = []
            if entity in kg.entities:
                entity_ctxs = kg.entities[entity].get("contexts", [])
                contexts = entity_ctxs[:3]
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
        context = self.build_rag_context(session_id)
        
        if "error" in context:
            # Fallback: provide at least the query and source count
            session = self.session_manager.get_session(session_id)
            if session:
                return f"\n---\nKNOWLEDGE GRAPH CONTEXT (from retrieved documents):\n\nQuery: {session.query}\nDocuments processed: {len(session.fetched_urls)}\n\nNote: Knowledge graph extraction is processing. Using direct content from sources.\n---\n"
            return ""
        
        parts = [
            "\n---\nKNOWLEDGE GRAPH CONTEXT (from retrieved documents):\n",
            f"Based on analysis of {context['source_count']} sources:\n"
        ]
        
        if context['top_entities']:
            parts.append("\nKey Entities:")
            for ent in context['top_entities'][:10]:
                parts.append(f"  • {ent['entity']} (type: {ent['entity_type']}, mentioned {ent['mention_count']}x)")
        else:
            # Fallback message if no entities extracted
            parts.append("\nKey Entities: Information extracted from retrieved sources")
        
        if context['relationships']:
            parts.append("\nKey Relationships:")
            for rel in context['relationships'][:8]:
                parts.append(f"  • {rel['subject']} → {rel['relation']} → {rel['object']}")
        
        parts.append(f"\nContext Statistics:")
        parts.append(f"  • Unique entities: {context['statistics']['total_entities']}")
        parts.append(f"  • Relationships: {context['statistics']['total_relationships']}")
        
        parts.append("\nUse this knowledge graph context to ground your response in the retrieved information.")
        parts.append("---\n")
        
        return "\n".join(parts)
    
    def extract_entity_evidence(self, session_id: str, entity: str) -> Dict:
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
        session = self.session_manager.get_session(session_id)
        if not session:
            return []
        
        kg = session.get_local_kg()
        kg.calculate_importance()
        
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
        
        results.sort(key=lambda x: x['relevance_score'], reverse=True)
        return results[:top_k]
    
    def build_document_summary(self, session_id: str) -> str:
        session = self.session_manager.get_session(session_id)
        if not session:
            return ""
        
        parts = [
            f"## Document Summary for Query: {session.query}\n",
            f"**Documents Processed:** {len(session.processed_content)}\n",
            f"**Unique Entities Identified:** {len(session.local_kg.entities)}\n",
            f"**Relationships Found:** {len(session.local_kg.relationships)}\n",
        ]
        
        if session.fetched_urls:
            parts.append("\n**Sources:**")
            for i, url in enumerate(session.fetched_urls[:10], 1):
                parts.append(f"{i}. {url}")
        
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
        session = self.session_manager.get_session(session_id)
        if not session:
            return False
        
        return session.rag_context_cache is not None
    
    def get_summary_stats(self, session_id: str) -> Dict:
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


_rag_engine: Optional['RAGEngine'] = None


def initialize_rag_engine(session_manager: SessionManager) -> RAGEngine:
    global _rag_engine
    _rag_engine = RAGEngine(session_manager)
    logger.info("[RAGEngine] Global RAG engine initialized")
    return _rag_engine


def get_rag_engine() -> Optional[RAGEngine]:
    global _rag_engine
    return _rag_engine
