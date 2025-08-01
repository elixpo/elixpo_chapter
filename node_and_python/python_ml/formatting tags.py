import firebase_admin
from firebase_admin import credentials, firestore
import spacy
import asyncio
from keybert import KeyBERT

# Load a pre-trained NLP model (spaCy model)
nlp = spacy.load('en_core_web_md')

# Initialize KeyBERT for keyword extraction
kw_model = KeyBERT('distilbert-base-nli-mean-tokens')

# Initialize Firebase Admin SDK
cred = credentials.Certificate("./elixpoai-firebase-adminsdk-poswc-66a1ef0407.json")
firebase_admin.initialize_app(cred)

db = firestore.client()

# References
image_ref = db.collection("ImageGen")

async def generate_keywords(prompt, num_keywords=10, ngram_range=(1, 1)):
    """Generate keywords using KeyBERT."""
    keywords = kw_model.extract_keywords(prompt, keyphrase_ngram_range=ngram_range, stop_words='english', top_n=num_keywords)
    return [keyword[0] for keyword, _ in keywords]  # Return the extracted keywords

async def process_documents():
    """Process each document in the ImageGen collection, detect empty tags/hashtags and update them."""
    last_doc_name = None
    try:
        # Fetch all documents in the ImageGen collection
        docs = image_ref.stream()

        tasks = []
        for doc in docs:
            # Get document reference and data
            doc_ref = doc.reference
            doc_data = doc.to_dict()

            # Fetch the prompt, tags, and hashtags from the document
            prompt = doc_data.get("prompt", "")
            tags = doc_data.get("tags", [])  # Tags is an array
            hashtags = doc_data.get("hashtags", [])  # Hashtags is an array

            # Check if tags or hashtags are empty, if so, generate keywords
            if not tags or not hashtags:
                # Generate 5 multi-word (2-3 word phrases) keywords for tags
                new_tags = await generate_keywords(prompt, num_keywords=5, ngram_range=(2, 3))
                new_hashtags = await generate_keywords(prompt, num_keywords=8, ngram_range=(1, 1))
            else:
                new_tags = tags
                new_hashtags = hashtags

            # Add task to update each document with new tags and hashtags
            tasks.append(update_document(doc_ref, new_tags, new_hashtags))
                
            last_doc_name = doc.id

        # Await all tasks to ensure asynchronous execution
        await asyncio.gather(*tasks)

    except Exception as e:
        print(f"Error processing document {last_doc_name}: {e}")

async def update_document(doc_ref, tags, hashtags):
    """Update the document by adding generated tags and hashtags."""
    try:
        # Update the document by overwriting the 'tags' and 'hashtags' fields
        doc_ref.update({
            "tags": tags,
            "hashtags": hashtags
        })
        print(f"Document {doc_ref.id} updated with tags: {tags} and hashtags: {hashtags}")

    except Exception as e:
        print(f"Error updating document {doc_ref.id}: {e}")

# Run the main function
if __name__ == "__main__":
    asyncio.run(process_documents())
