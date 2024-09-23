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
            tasks.append(update_document(doc_ref, doc_data, doc.id))  # Pass doc_data to extract the username
                
            last_doc_name = doc.id

        # Await all tasks to ensure asynchronous execution
        await asyncio.gather(*tasks)

    except Exception as e:
        print(f"Error processing document {last_doc_name}: {e}")



# Modified to accept doc_data to get the username or relevant field
async def update_document(doc_ref, doc_data,id):
    try:
        # Assuming there's a 'username' field in the document data
        genNum = doc_data.get("total_gen_number")  # Use a default value if not present
        if(genNum == 1):
            corresLinks0 = doc_data.get("Imgurl0")
            if(not corresLinks0):
                print(f"Contains {genNum} items but didn't find Imgurl0 for document {id}")
        elif(genNum == 2):
            corresLinks0 = doc_data.get("Imgurl0")
            corresLinks1 = doc_data.get("Imgurl1")
            if(not corresLinks0 and not corresLinks1):
                print(f"Contains {genNum} items but didn't find Imgurl0 or Imgurl1 for document {id}")
        elif(genNum == 3):
            corresLinks0 = doc_data.get("Imgurl0")
            corresLinks1 = doc_data.get("Imgurl1")
            corresLinks2 = doc_data.get("Imgurl2")
            if(not corresLinks0 and not corresLinks1 and not corresLinks2):
                print(f"Contains {genNum} items but didn't find Imgurl0, Imgurl1, or Imgurl2 for document {id}")
        elif(genNum == 4):
            corresLinks0 = doc_data.get("Imgurl0")
            corresLinks1 = doc_data.get("Imgurl1")
            corresLinks2 = doc_data.get("Imgurl2")
            corresLinks3 = doc_data.get("Imgurl3")
            if(not corresLinks0 and not corresLinks1 and not corresLinks2 and not corresLinks3):
                print(f"Contains {genNum} items but didn't find Imgurl0, Imgurl1, Imgurl2, or Imgurl3 for document {id}")

    except Exception as e:
        print(f"Error updating document {doc_ref.id}: {e}")




def fetchDocDetails():
    docs = image_ref.stream()
    doc_id = "ayushman_1724873452895"
    doc_ref = image_ref.document(doc_id)

    try:
        doc = doc_ref.get()
        if doc.exists:
            print(f"Document data for {doc_id}: {doc.to_dict()["ImgUrl0"]}")
            link = doc.to_dict()["ImgUrl0"]
            doc_ref.update({
                "Imgurl0" : link
            })
            doc_ref.update({
                "ImgUrl0": firestore.DELETE_FIELD
            })
        else:
            print(f"No such document with ID {doc_id}")
    except Exception as e:
        print(f"Error fetching document {doc_id}: {e}")

# Run the main function
if __name__ == "__main__":
    asyncio.run(process_documents())
