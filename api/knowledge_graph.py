import nltk
from nltk.tokenize import sent_tokenize, word_tokenize
from nltk import pos_tag
from nltk.chunk import ne_chunk
from nltk.tree import Tree
from nltk.corpus import stopwords
import os
from typing import Dict, List, Tuple, Set
import re
from collections import defaultdict
from loguru import logger

# Import NLTK setup utility to ensure all required data is available
try:
    import nltk_setup
except ImportError:
    logger.warning("[KG] NLTK setup module not found, proceeding with existing data")

NLTK_DIR = "searchenv/nltk_data"
os.makedirs(NLTK_DIR, exist_ok=True)
nltk.data.path.insert(0, NLTK_DIR)

try:
    stop_words = set(stopwords.words('english'))
except LookupError:
    logger.warning("[KG] Stopwords not available, using empty set")
    stop_words = set()


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
    
    def get_entity_context(self, entity: str, top_k: int = 3) -> str:
        entity_key = entity.lower().strip()
        if entity_key in self.entities:
            contexts = self.entities[entity_key]["contexts"][:top_k]
            return " ".join(contexts)
        return ""
    
    def to_dict(self) -> Dict:
        return {
            "entities": self.entities,
            "relationships": self.relationships,
            "importance_scores": self.importance_scores,
            "entity_graph": {k: list(v) for k, v in self.entity_graph.items()}
        }


def extract_entities_nltk(text: str) -> Tuple[List[str], List[Tuple[str, str]]]:
    try:
        sentences = sent_tokenize(text)
        all_entities = []
        all_pos_tags = []
        
        for sentence in sentences:
            tokens = word_tokenize(sentence)
            pos_tags = pos_tag(tokens)
            all_pos_tags.extend(pos_tags)
            
            try:
                ne_tree = ne_chunk(pos_tags, binary=False)
                
                for subtree in ne_tree:
                    if isinstance(subtree, Tree):
                        entity_str = " ".join([word for word, tag in subtree.leaves()])
                        entity_type = subtree.label()
                        all_entities.append((entity_str, entity_type))
            except Exception as ne_error:
                logger.debug(f"[KG] NER chunking failed for sentence: {ne_error}")
                # Continue with POS tags even if NE chunking fails
                pass
        
        return all_entities, all_pos_tags
    except Exception as e:
        logger.warning(f"[KG] NER extraction failed: {e}")
        return [], []


def extract_noun_phrases(text: str) -> List[str]:
    try:
        sentences = sent_tokenize(text)
        phrases = []
        
        for sentence in sentences:
            try:
                tokens = word_tokenize(sentence)
                pos_tags = pos_tag(tokens)
                
                current_phrase = []
                for word, tag in pos_tags:
                    if tag in ['NN', 'NNS', 'NNP', 'NNPS', 'JJ', 'JJR', 'JJS']:
                        current_phrase.append(word)
                    else:
                        if current_phrase:
                            phrases.append(" ".join(current_phrase))
                            current_phrase = []
                if current_phrase:
                    phrases.append(" ".join(current_phrase))
            except Exception as sent_error:
                logger.debug(f"[KG] Error processing sentence for noun phrases: {sent_error}")
                continue
        
        return [p for p in phrases if len(p.split()) <= 4 and p.lower() not in stop_words]
    except Exception as e:
        logger.warning(f"[KG] Noun phrase extraction failed: {e}")
        return []


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
    
    cleaned_text = clean_text_nltk(text)
    
    entities, pos_tags = extract_entities_nltk(cleaned_text)
    
    for entity, entity_type in entities:
        if len(entity.split()) <= 4:
            kg.add_entity(entity, entity_type)
    
    noun_phrases = extract_noun_phrases(cleaned_text)
    for phrase in noun_phrases[:top_entities]:
        kg.add_entity(phrase, "CONCEPT")
    
    sentences = sent_tokenize(cleaned_text)
    for sentence in sentences:
        sentence_entities = []
        
        for entity, entity_type in entities:
            if entity.lower() in sentence.lower():
                sentence_entities.append((entity.lower(), entity_type))
        
        for i, (entity1, type1) in enumerate(sentence_entities):
            for entity2, type2 in sentence_entities[i+1:]:
                relation = "related_to"
                if type1 == "PERSON" and type2 in ["ORGANIZATION", "LOCATION"]:
                    relation = "associated_with"
                elif type1 == "ORGANIZATION" and type2 == "LOCATION":
                    relation = "based_in"
                
                kg.add_relationship(entity1, relation, entity2)
    
    kg.calculate_importance()
    
    return kg


def chunk_and_graph(text: str, chunk_size: int = 500, overlap: int = 50) -> List[Dict]:
    words = text.split()
    chunks = []
    
    for i in range(0, len(words), chunk_size - overlap):
        chunk_words = words[i:i + chunk_size]
        chunk_text = " ".join(chunk_words)
        
        if len(chunk_text.strip()) > 50:
            kg = build_knowledge_graph(chunk_text)
            chunks.append({
                "text": chunk_text,
                "knowledge_graph": kg.to_dict(),
                "top_entities": kg.get_top_entities(top_k=10)
            })
    
    return chunks


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
