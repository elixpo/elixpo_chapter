import firebase_admin
from firebase_admin import credentials, firestore

import asyncio


# Initialize Firebase Admin SDK
cred = credentials.Certificate("./elixpoai-firebase-adminsdk-poswc-112466be27.json")
firebase_admin.initialize_app(cred)

db = firestore.client()

# References
image_ref = db.collection("ImageGen")



async def process_documents():
    print("Processing documents...")
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

            tasks.append(update_document(doc_ref))
                
            last_doc_name = doc.id

        # Await all tasks to ensure asynchronous execution
        await asyncio.gather(*tasks)

    except Exception as e:
        print(f"Error processing document {last_doc_name}: {e}")


async def update_document(doc_ref):
    try:
        # Generate exactly 10 new one-word hashtags
        # Add your hashtag generation logic here
    
        
        # Update the document by overwriting the 'hashtags' field with new hashtags
        await doc_ref.update({
            "hq": True,  # example tag
        })
        
        print(f"Document {doc_ref.id} updated with new 'hq' tag and hashtags")

    except Exception as e:
        print(f"Error updating document {doc_ref.id}: {e}")





# Run the main function
if __name__ == "__main__":
    asyncio.run(process_documents())
