from image_prompt import generate_image_query
from image_scraping import scrape_all_images
from image_similarity import load_image_from_url, findSimilarity
import asyncio


# python
async def main(imageURL):
    prompt_result = generate_image_query(imageURL)
    prompt = prompt_result['choices'][0]['message']['content'].strip()
    print(f"Generated prompt: {prompt}")

    scraped_images = []
    scraped_sources = []
    similar_images = []
    
    # Await the coroutine directly
    all_image_results = await scrape_all_images(prompt, max_images=10, engine="google")
    for engine, images in all_image_results.items():
        print(f"\n--- {engine.upper()} RESULTS ---")
        for i, img in enumerate(images):
            print(f"{i+1}. Image URL: {img['image_url']}\n   Source Page: {img['source_page']}\n")
            scraped_images.append(img['image_url'])
            scraped_sources.append(img['source_page'])

    # Step 3: Compare similarity and collect moderately or closely similar images
    original_image_tensor = load_image_from_url(imageURL)
    for img in scraped_images:
        try:
            candidate_tensor = load_image_from_url(img['image_url'])
            similarity = findSimilarity(original_image_tensor, candidate_tensor)
            if similarity >= 0.6:
                similar_images.append(img['image_url'])
        except Exception as e:
            continue

    return similar_images, scraped_sources

if __name__ == "__main__":
    imageURL = "https://www.shutterstock.com/image-photo/ballerina-young-graceful-woman-ballet-600nw-2536595533.jpg"
    results = asyncio.run(main(imageURL))
    print("Moderately or closely similar image URLs:")
    for url, sources in results:
        print(url, sources)