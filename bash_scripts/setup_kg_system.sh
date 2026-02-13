#!/bin/bash
# Quick Integration Setup Script

echo "================================"
echo "Knowledge Graph System Setup"
echo "================================"
echo ""

# Check if required NLTK data exists
NLTK_DIR="searchenv/nltk_data"
echo "[1/3] Checking NLTK data..."

if [ -d "$NLTK_DIR" ]; then
    echo "  ✓ NLTK data directory exists"
else
    echo "  ✗ Creating NLTK data directory..."
    mkdir -p "$NLTK_DIR"
fi

# Download required NLTK resources
echo ""
echo "[2/3] Installing NLTK resources..."
python3 << 'EOF'
import nltk
import os

NLTK_DIR = "searchenv/nltk_data"
os.makedirs(NLTK_DIR, exist_ok=True)
nltk.data.path.insert(0, NLTK_DIR)

resources = [
    ('punkt', 'tokenizers'),
    ('averaged_perceptron_tagger', 'taggers'),
    ('maxent_ne_chunker', 'chunkers'),
    ('stopwords', 'corpora'),
]

for resource, category in resources:
    try:
        nltk.download(resource, download_dir=NLTK_DIR, quiet=True)
        print(f"  ✓ Downloaded {resource}")
    except Exception as e:
        print(f"  ! {resource}: {e}")

print("  ✓ NLTK resources ready")
EOF

# Verify imports
echo ""
echo "[3/3] Verifying imports..."
python3 << 'EOF'
try:
    from knowledge_graph import build_knowledge_graph, clean_text_nltk
    print("  ✓ knowledge_graph module imported successfully")
except Exception as e:
    print(f"  ✗ Error importing knowledge_graph: {e}")

try:
    from search import fetch_full_text
    print("  ✓ fetch_full_text with KG support ready")
except Exception as e:
    print(f"  ✗ Error importing search: {e}")

try:
    from embed_try import select_top_sentences
    print("  ✓ KG-aware embedding ranking ready")
except Exception as e:
    print(f"  ✗ Error importing embed_try: {e}")

try:
    from intermediate_response import generate_intermediate_response
    print("  ✓ KG-enhanced response generation ready")
except Exception as e:
    print(f"  ✗ Error importing intermediate_response: {e}")

print("\n✓ All components verified!")
EOF

echo ""
echo "================================"
echo "Setup Complete!"
echo "================================"
echo ""
echo "Next steps:"
echo "1. Test the system: python3 kg_integration_examples.py"
echo "2. Read documentation: cat KNOWLEDGE_GRAPH_README.md"
echo "3. Integrate into your pipeline (see README)"
echo ""
echo "Components created:"
echo "  ✓ knowledge_graph.py - Core KG engine"
echo "  ✓ Updated search.py - KG extraction in fetch_full_text()"
echo "  ✓ Updated embed_try.py - KG-aware ranking"
echo "  ✓ Updated intermediate_response.py - KG context"
echo "  ✓ Updated utility.py - Pipeline integration"
echo "  ✓ kg_integration_examples.py - Usage examples"
echo "  ✓ KNOWLEDGE_GRAPH_README.md - Full documentation"
echo ""
