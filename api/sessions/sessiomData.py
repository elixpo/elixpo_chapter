
class SessionData:
    def __init__(self, session_id: str, query: str, embedding_dim: int = None):
        if embedding_dim is None:
            embedding_dim = EMBEDDING_DIMENSION
        self.session_id = session_id
        self.query = query
        self.embedding_dim = embedding_dim
        self.created_at = datetime.now()
        self.last_activity = datetime.now()
        self.fetched_urls: List[str] = []
        self.web_search_urls: List[str] = []
        self.youtube_urls: List[str] = []
        self.processed_content: Dict[str, str] = {}
        self.content_embeddings: Dict[str, np.ndarray] = {}
        self.rag_context_cache: Optional[str] = None
        self.top_content_cache: List[Tuple[str, float]] = []
        self.images: List[str] = []
        self.videos: List[Dict] = []
        self.metadata: Dict = {}
        self.tool_calls_made: List[str] = []
        self.errors: List[str] = []
        self.conversation_history: List[Dict] = []
        self.search_context: str = ""
        
        # Initialize ChromaDB collection for session content
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        try:
            session_dir = os.path.join("./session_embeddings", session_id)
            Path(session_dir).mkdir(parents=True, exist_ok=True)
            
            chroma_settings = chromadb.config.Settings(
                anonymized_telemetry=False
            )
            self.chroma_client = chromadb.PersistentClient(
                path=session_dir,
                settings=chroma_settings
            )
            self.chroma_collection = self.chroma_client.get_or_create_collection(
                name=f"session_{session_id}",
                metadata={"hnsw:space": "cosine"}
            )
            logger.info(f"[SessionData] {session_id}: ChromaDB collection created successfully")
        except Exception as e:
            logger.warning(f"[SessionData] {session_id}: Failed to create ChromaDB collection: {e}")
            self.chroma_collection = None
        
        self.content_order: List[str] = []
        self.lock = threading.RLock()
    
    def add_fetched_url(self, url: str, content: str, embedding: Optional[np.ndarray] = None):
        with self.lock:
            self.fetched_urls.append(url)
            self.processed_content[url] = content
            if embedding is not None and self.chroma_collection:
                try:
                    if isinstance(embedding, np.ndarray):
                        emb_list = embedding.tolist() if embedding.ndim == 1 else embedding[0].tolist()
                    else:
                        emb_list = embedding
                    
                    self.content_embeddings[url] = embedding
                    self.chroma_collection.add(
                        ids=[url],
                        embeddings=[emb_list],
                        documents=[content],
                        metadatas=[{"url": url}]
                    )
                    self.content_order.append(url)
                except Exception as e:
                    logger.warning(f"[SessionData] Failed to add {url} to ChromaDB: {e}")
            elif embedding is None or not self.chroma_collection:
                # Still add to content_order for fallback access
                self.content_order.append(url)
            self.last_activity = datetime.now()
            self.rag_context_cache = None

    def get_rag_context(self, refresh: bool = False, query_embedding: Optional[np.ndarray] = None) -> str:
        with self.lock:
            if self.rag_context_cache and not refresh:
                return self.rag_context_cache

            context_parts = [
                f"Query: {self.query}",
                f"Sources fetched: {len(self.fetched_urls)}",
            ]
            
            if query_embedding is not None and self.chroma_collection and self.chroma_collection.count() > 0:
                try:
                    if isinstance(query_embedding, np.ndarray):
                        query_emb_list = query_embedding.tolist() if query_embedding.ndim == 1 else query_embedding[0].tolist()
                    else:
                        query_emb_list = query_embedding
                    
                    results = self.chroma_collection.query(
                        query_embeddings=[query_emb_list],
                        n_results=min(10, self.chroma_collection.count())
                    )
                    
                    context_parts.append("\nMost Relevant Content:")
                    if results["ids"] and len(results["ids"]) > 0:
                        for doc_id, distance, metadata in zip(results["ids"][0], results["distances"][0], results["metadatas"][0]):
                            relevance_score = 1.0 - distance
                            url = metadata.get("url", doc_id)
                            content_preview = self.processed_content.get(url, "")[:100]
                            context_parts.append(f"  - {url} (relevance: {relevance_score:.3f})")
                            context_parts.append(f"    Preview: {content_preview}...")
                except Exception as e:
                    logger.warning(f"[SessionData] ChromaDB search failed: {e}")
                    context_parts.append("\nFetched Content:")
                    for url in self.fetched_urls[-5:]:
                        context_parts.append(f"  - {url}")
            else:
                context_parts.append("\nFetched Content:")
                for url in self.fetched_urls[-5:]:
                    context_parts.append(f"  - {url}")
            
            self.rag_context_cache = "\n".join(context_parts)
            return self.rag_context_cache
    
    def get_top_content(self, k: int = 10, query_embedding: Optional[np.ndarray] = None) -> List[Tuple[str, float]]:
        with self.lock:
            if not self.chroma_collection or self.chroma_collection.count() == 0:
                return []
            
            if query_embedding is None:
                return [(url, 1.0 / (i + 1)) for i, url in enumerate(self.content_order[:k])]
            
            try:
                if isinstance(query_embedding, np.ndarray):
                    query_emb_list = query_embedding.tolist() if query_embedding.ndim == 1 else query_embedding[0].tolist()
                else:
                    query_emb_list = query_embedding
                
                results = self.chroma_collection.query(
                    query_embeddings=[query_emb_list],
                    n_results=min(k, self.chroma_collection.count())
                )
                
                results_list = []
                if results["ids"] and len(results["ids"]) > 0:
                    for doc_id, distance, metadata in zip(results["ids"][0], results["distances"][0], results["metadatas"][0]):
                        url = metadata.get("url", doc_id)
                        relevance_score = 1.0 - distance
                        results_list.append((url, relevance_score))
                
                return results_list
            except Exception as e:
                logger.warning(f"[SessionData] ChromaDB top content search failed: {e}")
                return [(url, 1.0 / (i + 1)) for i, url in enumerate(self.content_order[:k])]
    
    def log_tool_call(self, tool_name: str):
        self.tool_calls_made.append(f"{tool_name}@{datetime.now().isoformat()}")
        self.last_activity = datetime.now()
    
    def add_error(self, error: str):
        self.errors.append(f"{error}@{datetime.now().isoformat()}")
    
    def to_dict(self) -> Dict:
        with self.lock:
            chroma_size = self.chroma_collection.count() if self.chroma_collection else 0
            return {
                "session_id": self.session_id,
                "query": self.query,
                "created_at": self.created_at.isoformat(),
                "fetched_urls": self.fetched_urls,
                "web_search_urls": self.web_search_urls,
                "youtube_urls": self.youtube_urls,
                "tool_calls": self.tool_calls_made,
                "errors": self.errors,
                "top_content": self.top_content_cache,
                "chroma_collection_size": chroma_size,
                "document_count": len(self.processed_content),
                "conversation_turns": len(self.conversation_history),
            }
    
    def add_message_to_history(self, role: str, content: str, metadata: Dict = None):
        msg = {
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat()
        }
        if metadata:
            msg.update(metadata)
        self.conversation_history.append(msg)
        self.last_activity = datetime.now()
    
    def get_conversation_history(self) -> List[Dict]:
        return self.conversation_history
    
    def set_search_context(self, context: str):
        self.search_context = context
        self.last_activity = datetime.now()

