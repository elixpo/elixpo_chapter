import firebase_admin
from firebase_admin import credentials, firestore
import random
import time
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
            tasks.append(update_document(doc_ref, doc_data))  # Pass doc_data to extract the username
                
            last_doc_name = doc.id

        # Await all tasks to ensure asynchronous execution
        await asyncio.gather(*tasks)

    except Exception as e:
        print(f"Error processing document {last_doc_name}: {e}")

# Fixed function name: generateID
def generateID(username):
    timestamp = str(int(time.time() * 1000))  # Millisecond precision timestamp

    # Concatenate the input string and the timestamp
    combined = username + timestamp

    # Shuffle the combined string
    combined_list = list(combined)
    random.shuffle(combined_list)
    shuffled_string = ''.join(combined_list)

    # Generate a unique alphanumeric ID by slicing the shuffled string
    unique_id = shuffled_string[:10]  # Adjust the length of the ID as needed

    return unique_id

# Modified to accept doc_data to get the username or relevant field
async def update_document(doc_ref, doc_data):
    try:
        # Assuming there's a 'username' field in the document data
        username = doc_data.get("user")  # Use a default value if not present
        imageId = generateID(username)

        # Update the document by overwriting the 'imgId' field with the generated ID
        doc_ref.update({
            "imgId": imageId,  # example tag
        })

        # Use asyncio.sleep for non-blocking delay
        await asyncio.sleep(2)
        
        print(f"Document {doc_ref.id} updated with new image id")

    except Exception as e:
        print(f"Error updating document {doc_ref.id}: {e}")


# Run the main function
if __name__ == "__main__":
    asyncio.run(process_documents())
