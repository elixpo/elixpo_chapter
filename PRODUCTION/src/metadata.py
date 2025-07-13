import yt_dlp


def get_youtube_metadata(url):
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'simulate': True,
        'extract_flat': True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        title = info.get('title')
        duration = info.get('duration', 0)
        duration_m, duration_s = divmod(duration, 60)
        return {
            "title": title,
            "duration": f"{duration_m}m {duration_s}s"
        }


# Example usage
if __name__ == "__main__":
    video_url = "https://youtu.be/S39b5laVmjs"
    metadata = get_youtube_metadata(video_url)
    print("📌 Title:", metadata["title"])
    print("⏱️ Duration:", metadata["duration"])
