from topicScraper import fetch_trending_topics, send_topic_to_api
from podCastCreator import get_latest_info, generate_podcast_script
from storyTeller import generate_podcast_audio
from podCastImage import generate_podcast_thumbnail, generate_podcast_banner
def main():
    print("✅ Starting Podcast Generation Workflow...")
    topics = fetch_trending_topics()
    if topics:
        result = send_topic_to_api(topics)
        print("✅ Selected topic recieved, Proper scripted podcast will be  now generated!")
    else:
        print("Failed to fetch trending topics.")
    if result:
        info = get_latest_info(result.get('choices', [{}])[0].get('message', {}).get('content', 'No content returned.'))
        podcast_script = generate_podcast_script(info, result.get('choices', [{}])[0].get('message', {}).get('content', 'No content returned.'))
        print("✅ Podcast script generated successfully.") 
    else:
        print("No valid topic received from API.")
        return
    if podcast_script:
        print("Generated Podcast Script:", podcast_script)
        generate_podcast_audio(podcast_script)
        print("✅ Podcast audio generated successfully.")
    else: 
        print("Failed to generate podcast script.")
    
    if topics:
        print("Generating podcast thumbnail + the banner")
        generate_podcast_thumbnail(topics)
        generate_podcast_banner(topics)
        print("✅ Podcast images generated successfully.")

if __name__ == "__main__":
    main()