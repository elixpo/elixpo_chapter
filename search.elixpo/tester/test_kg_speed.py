import time
import sys
sys.path.insert(0, '/home/ubuntu/lixSearch/api')

from knowledge_graph import build_knowledge_graph

sample_texts = [
    "Apple Inc. is an American multinational technology company headquartered in Cupertino, California. Steve Jobs founded Apple in 1976. The company designs, manufactures, and markets smartphones, personal computers, and other electronic devices. iPhone is one of the most popular products made by Apple. Tim Cook is the CEO of Apple.",
    
    "Python is a high-level programming language. Guido van Rossum created Python in 1989. Python is widely used for web development, data science, and artificial intelligence. Django and Flask are popular Python web frameworks. Python has a large community of developers.",
    
    "The weather today in New York is sunny with temperatures around 72 degrees Fahrenheit. There is a light breeze from the west. The humidity level is moderate at around 60 percent. It's a perfect day for outdoor activities. Rain is not expected today.",
]

print("=" * 60)
print("KG Building Speed Test")
print("=" * 60)

for idx, text in enumerate(sample_texts, 1):
    start = time.time()
    kg = build_knowledge_graph(text)
    elapsed = time.time() - start
    
    print(f"\nTest {idx}:")
    print(f"  Text length: {len(text)} chars")
    print(f"  Entities extracted: {len(kg.entities)}")
    print(f"  Relationships: {len(kg.relationships)}")
    print(f"  Time taken: {elapsed*1000:.2f}ms")
    print(f"  Top entities: {[e[0] for e in kg.get_top_entities(3)]}")

print("\n" + "=" * 60)
print("Test complete!")
print("=" * 60)
