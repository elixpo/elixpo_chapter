from typing import Dict, List, Tuple, Set
import re
from collections import defaultdict
from loguru import logger

try:
    from nltk.tokenize import sent_tokenize, word_tokenize
    from nltk import pos_tag
    NLTK_AVAILABLE = True
except:
    NLTK_AVAILABLE = False
    logger.warning("[KG] NLTK not available, using regex-based tokenization")


class KnowledgeGraph:
    def __init__(self):
        self.entities: Dict[str, Dict] = {}
        self.relationships: List[Tuple[str, str, str]] = []
        self.entity_graph: Dict[str, Set[str]] = defaultdict(set)
        self.importance_scores: Dict[str, float] = {}
    
    def add_entity(self, entity: str, entity_type: str, context: str = ""):
        entity_key = entity.lower().strip()
        if entity_key not in self.entities:
            self.entities[entity_key] = {
                "original": entity,
                "type": entity_type,
                "count": 0,
                "contexts": []
            }
        self.entities[entity_key]["count"] += 1
        if context:
            self.entities[entity_key]["contexts"].append(context)
    
    def add_relationship(self, subject: str, relation: str, obj: str):
        subject_key = subject.lower().strip()
        obj_key = obj.lower().strip()
        
        self.relationships.append((subject_key, relation.lower(), obj_key))
        self.entity_graph[subject_key].add(obj_key)
        self.entity_graph[obj_key].add(subject_key)
        
        if subject_key not in self.entities:
            self.add_entity(subject, "UNKNOWN")
        if obj_key not in self.entities:
            self.add_entity(obj, "UNKNOWN")
    
    def calculate_importance(self):
        max_count = max([e["count"] for e in self.entities.values()], default=1)
        for entity_key, entity_data in self.entities.items():
            frequency_score = entity_data["count"] / max_count if max_count > 0 else 0
            connectivity_score = len(self.entity_graph[entity_key]) / max(len(self.entities), 1)
            self.importance_scores[entity_key] = (0.6 * frequency_score) + (0.4 * connectivity_score)
    
    def get_top_entities(self, top_k: int = 10) -> List[Tuple[str, float]]:
        self.calculate_importance()
        sorted_entities = sorted(self.importance_scores.items(), key=lambda x: x[1], reverse=True)
        return sorted_entities[:top_k]
    
    def to_dict(self) -> Dict:
        return {
            "entities": self.entities,
            "relationships": self.relationships,
            "importance_scores": self.importance_scores,
            "entity_graph": {k: list(v) for k, v in self.entity_graph.items()}
        }


def extract_entities_nltk(text: str) -> Tuple[List[str], List[Tuple[str, str]]]:
    return [], []


def extract_noun_phrases(text: str) -> List[str]:
    words = text.split()
    phrases = []
    
    i = 0
    while i < len(words):
        phrase_words = []
        while i < len(words):
            word = words[i].lower()
            word_clean = re.sub(r'[^a-z0-9]', '', word)
            
            if len(word_clean) > 2 and not word_clean.isdigit():
                phrase_words.append(words[i])
                i += 1
            else:
                break
        
        if phrase_words:
            phrase = " ".join(phrase_words)
            if 2 <= len(phrase_words) <= 3:
                phrases.append(phrase)
    
    seen = set()
    unique_phrases = []
    for p in phrases:
        p_lower = p.lower()
        if p_lower not in seen and len(p_lower) > 3:
            seen.add(p_lower)
            unique_phrases.append(p)
    
    return unique_phrases[:15]


def clean_text_nltk(text: str, aggressive: bool = False) -> str:
    text = re.sub(r'http[s]?://\S+', '', text)
    text = re.sub(r'\S+@\S+', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    
    if aggressive:
        text = re.sub(r'[^\w\s.,!?;:\'-]', '', text)
    
    text = re.sub(r'([.!?,;:])\1+', r'\1', text)
    
    return text


def build_knowledge_graph(text: str, top_entities: int = 15) -> KnowledgeGraph:
    kg = KnowledgeGraph()
    
    if not text or len(text.strip()) < 20:
        return kg
    
    text = text[:3000]
    cleaned_text = clean_text_nltk(text)
    
    noun_phrases = extract_noun_phrases(cleaned_text)
    
    for phrase in noun_phrases:
        kg.add_entity(phrase, "CONCEPT")
    
    sentences = cleaned_text.split('. ')[:12]
    
    for sentence in sentences:
        sentence_lower = sentence.lower()
        sentence_entities = []
        
        for phrase in noun_phrases:
            if phrase.lower() in sentence_lower:
                sentence_entities.append((phrase.lower(), "CONCEPT"))
        
        for i, (entity1, type1) in enumerate(sentence_entities):
            for entity2, type2 in sentence_entities[i+1:]:
                kg.add_relationship(entity1, "related_to", entity2)
    
    kg.calculate_importance()
    return kg


def chunk_and_graph(text: str, chunk_size: int = 500, overlap: int = 50) -> List[Dict]:
    if not text or len(text.strip()) < 50:
        return []
    
    words = text.split()[:1000]
    chunks = []
    
    for i in range(0, len(words), chunk_size - overlap):
        chunk_words = words[i:i + chunk_size]
        chunk_text = " ".join(chunk_words)
        
        if len(chunk_text.strip()) > 50:
            try:
                kg = build_knowledge_graph(chunk_text)
                chunks.append({
                    "text": chunk_text,
                    "knowledge_graph": kg.to_dict(),
                    "top_entities": kg.get_top_entities(top_k=5)
                })
            except:
                continue
    
    return chunks[:2]


if __name__ == "__main__":
    sample_text = """
    Apple Inc. is an American multinational technology company headquartered in Cupertino, California.
    Steve Jobs founded Apple in 1976. The company designs, manufactures, and markets smartphones, personal computers,
    and other electronic devices. iPhone is one of the most popular products made by Apple.
    Tim Cook is the CEO of Apple. Apple's headquarters are located in Cupertino, California.
    """
    
    kg = build_knowledge_graph(sample_text)
    print("Top Entities:")
    for entity, score in kg.get_top_entities(5):
        print(f"  {entity}: {score:.3f}")
    
    print("\nRelationships:")
    for subject, relation, obj in kg.relationships[:5]:
        print(f"  {subject} --{relation}--> {obj}")