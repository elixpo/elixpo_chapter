#was written to process the entire database and add tags to each existing documents to add up to the markdown formatting.
#and match with the current status

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
cred = credentials.Certificate("./elixpoai-firebase-adminsdk-poswc-728c25f591.json")
firebase_admin.initialize_app(cred)

db = firestore.client()

# References
image_ref = db.collection("ImageGen")
server_ref = db.collection("server")

async def generate_keywords(prompt, num_keywords=10):
    # Extract keywords using KeyBERT
    keywords = kw_model.extract_keywords(prompt, keyphrase_ngram_range=(1, 1), stop_words='english', top_n=num_keywords)
    
    # Extract keywords from tuples and return as a list of one-word hashtags
    return [f"#{keyword[0]}" for keyword in keywords]

async def process_documents():
    last_doc_name = None
    try:
        # Fetch all documents in the ImageGen collection
        docs = image_ref.stream()

        tasks = []
        for doc in docs:
            # Get document reference and data
            doc_ref = doc.reference
            doc_data = doc.to_dict()
            
            # Fetch the prompt to generate new hashtags
            prompt = doc_data.get("prompt")
            tasks.append(update_document(doc_ref, prompt))
                
            last_doc_name = doc.id

        # Await all tasks to ensure asynchronous execution
        await asyncio.gather(*tasks)

    except Exception as e:
        print(f"Error processing document {last_doc_name}: {e}")

async def update_document(doc_ref, prompt):
    try:
        # Generate exactly 10 new one-word hashtags
        new_tags = await generate_keywords(prompt, num_keywords=10)
        
        # Update the document by overwriting the 'hashtags' field with new hashtags
        doc_ref.update({"hq": True})
        print(f"Document {doc_ref.id} updated with new hashtags: {new_tags}")

    except Exception as e:
        print(f"Error updating document {doc_ref.id}: {e}")

# Run the main function
if __name__ == "__main__":
    asyncio.run(process_documents())
