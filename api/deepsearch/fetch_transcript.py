import os
from config import BASE_CACHE_DIR
from pytubefix import AsyncYouTube
from pydub import AudioSegment
from multiprocessing.managers import BaseManager
import asyncio
import re
from urllib.parse import urlparse, parse_qs
from typing import Optional, Iterable
from utility import rerank
from responseGenerator import generate_intermediate_response

class modelManager(BaseManager): pass
modelManager.register("accessSearchAgents")
modelManager.register("ipcService")
manager = modelManager(address=("localhost", 5010), authkey=b"ipcService")
manager.connect()
search_service = manager.accessSearchAgents()
modelService = manager.ipcService()

def youtubeMetadata(url: str):
    metadata = search_service.get_youtube_metadata(url)
    return metadata

def ensure_cache_dir(video_id):
    path = os.path.join(BASE_CACHE_DIR, video_id)
    os.makedirs(path, exist_ok=True)
    return path

def get_youtube_video_id(url):
    print("[INFO] Getting Youtube video ID")
    parsed_url = urlparse(url)
    if "youtube.com" in parsed_url.netloc:
        video_id = parse_qs(parsed_url.query).get('v')
        if video_id:
            return video_id[0]
        if parsed_url.path:
            match = re.search(r'/(?:embed|v)/([^/?#&]+)', parsed_url.path)
            if match:
                return match.group(1)
    elif "youtu.be" in parsed_url.netloc:
        path = parsed_url.path.lstrip('/')
        if path:
            video_id = path.split('/')[0].split('?')[0].split('#')[0]
            video_id = video_id.split('&')[0]
            return video_id
    return None

async def download_audio(url):
    video_id = get_youtube_video_id(url)
    cache_folder = ensure_cache_dir(video_id)
    wav_path = os.path.join(cache_folder, f"{video_id}.wav")
    
    if os.path.exists(wav_path):
        return wav_path
    
    yt = AsyncYouTube(url, use_oauth=True, allow_oauth_cache=True)
    streams = await yt.streams()
    audio_streams = streams.filter(only_audio=True)
    preferred_codecs = ["opus", "aac", "mp4a.40.2", "vorbis"]
    audio_streams = [s for s in audio_streams if s.audio_codec in preferred_codecs]
    audio_stream = max(audio_streams, key=lambda s: int(s.abr.replace("kbps", "")))
    
    extension = audio_stream.mime_type.split("/")[1]
    tmp_path = os.path.join(cache_folder, f"{video_id}.{extension}")
    audio_stream.download(output_path=os.path.dirname(tmp_path), filename=os.path.basename(tmp_path))
    
    audio = AudioSegment.from_file(tmp_path, format=extension)
    audio.export(wav_path, format="wav")
    os.remove(tmp_path)
    
    return wav_path

async def extract_summary_sentences(transcription: str, num_sentences: int = 30) -> dict:
    sentences = [s.strip() for s in transcription.split('. ') if s.strip()]
    total_sentences = len(sentences)
    
    print(f"[INFO] Total sentences: {total_sentences}")
    print(f"[INFO] Target summary size: {num_sentences}")
    
    if total_sentences <= num_sentences:
        print("[INFO] Content shorter than target, returning all sentences")
        return {
            "matched_pieces": [
                {"index": i, "score": 1.0, "text": s} 
                for i, s in enumerate(sentences)
            ],
            "method": "all_content"
        }
    
    # Encode all sentences
    print("[DEBUG] Encoding all sentences...")
    data_embed, _ = modelService.encodeSemantic(sentences, [""])
    
    # Score each sentence against all others (find "hub" sentences)
    # High scoring sentences are representative of the content
    sentence_scores = []
    
    for i, sentence in enumerate(sentences):
        # Compare this sentence to all others
        single_embed, _ = modelService.encodeSemantic([sentence], [""])
        scores = modelService.cosineScore(single_embed, data_embed, k=min(10, total_sentences))
        
        # Average of top similarity scores = how central this sentence is
        if scores:
            avg_score = sum(score for _, score in scores) / len(scores)
            sentence_scores.append((i, avg_score, sentence))
        
        if (i + 1) % 10 == 0:
            print(f"[DEBUG] Scored {i + 1}/{total_sentences} sentences")
    
    # Sort by score and take top N
    sentence_scores.sort(key=lambda x: x[1], reverse=True)
    top_sentences = sentence_scores[:num_sentences]
    
    # Re-sort by original index to maintain order
    top_sentences.sort(key=lambda x: x[0])
    
    matched_pieces = [
        {"index": idx, "score": float(score), "text": text}
        for idx, score, text in top_sentences
    ]
    
    print(f"[INFO] Selected {len(matched_pieces)} sentences (score range: {top_sentences[-1][1]:.4f} - {top_sentences[0][1]:.4f})")
    
    return {
        "matched_pieces": matched_pieces,
        "method": "centroid_based"
    }

async def transcribe_audio(url, full_transcript: Optional[str] = None, query: Optional[str] = None):
    transcription = """How do you all do? We have learned before how to define a simple trait in Rust. Now we learn how to use traits as restrictions for generic functions. To start, I will show you how to use trait limits for parameters. We have two forms for this. One, which is the short form and one, which simply represents explicit generic functions with limits. So let's start with the implementation of the short form syntax. We use the same trait from the previous lesson, namely summary, which has a function called Summary. Directly below we can enter public function notify. Here we want to give an element. To do this, we use the syntax, the implement syntax. So we want to implement this trait here. Directly below we then assume that there are current messages. To do this, we use the method from Summary for this element. It is important that we define this element so that the trait summary is implemented. Otherwise it does not work. Next, we use the explicit generic syntax, which represents the long form. So let's enter public function notify. Since this is the long form, I simply add it. Here we define a generic type called t, which implements the remark Summary. The element is a reference to t. With this generic type with the restriction Summary, we can enter item and determine that it is a reference to t. Here we can then add exactly the same code cells. Both work the same. The use of multiple parameters is also quite simple. We just have to define and define element 1 and element 2, that both Summary implement. In the long form, this is possible even more practical, since we can use the same generic type for both elements. This use, it creates a structure, implements the summary. This looks like this. Here we have a structure called block attribute, which contains a title and a author. Then we implement the summary for the block attribute here. And here exactly everyone of us will be created block attribute to a compatible parameter or argument for all our notification functions. In mine, we now create two different structures, which are called post1 and the other post2. With these block attributes, we can add, update and give an attribute, or it has to be a reference to a attribute. Like zb, attribute 1. And that will work wonderfully. As you can see, the following is shown when executing. Breaking news, Rust Traits by Alice and the other functions work just as well. If we use the long form, we only have to give a reference to a structure, which the Merckmal summary implement. And for functions, we only have to give several compatible elements, like zb, attribute 1 and attribute 2. We only follow the signature here, which we have defined in our function. Next, I want to show you how you can combine multiple Merckmal limits with the help of the plus operators. Sometimes you need a guy to implement multiple Merckmal and use methods from all. With the plus operator, we can achieve this. In any case, we want to use the Merckmal, summary and display on this element. First, we have to import the Merckmal display from the standard library and set it in the name of the object. Then we can give summary plus display. This is why this element has to implement both the Merckmal, summary and the Merckmal display. Since this also requires the Merckmal, display, we can now give it out normally. If we want to do this with the help of generica, we can do it very simply by adding the plus operator to the genericum. Then everything else works as usual. To use this, we create an article and implement the Merckmal, summary for the article. In addition, we have to return to the import and use the format from the standard library. The reason for this is that we also have to implement the display trade for the article. Here we define how we want to format the display trades with the help of the display. Then we can directly create an article in mine, which is called Charlie, under standing trades. Then we can use NotifyPass in an article and export the code. This is the output we get. If we now use the generic version, we get a syntax error, since I've executed this in Python. If we execute this in Rust, we should get exactly the same output, since both approaches are practically identical."""
    
    if full_transcript:
        transcription = full_transcript
    
    # Always use centroid-based extraction (not query-based)
    result = await extract_summary_sentences(transcription, num_sentences=30)
    
    matched_pieces = result["matched_pieces"]
    information_piece = ". ".join([p["text"] for p in matched_pieces]) + "."
    
    print(f"[INFO] Final summary ({len(matched_pieces)} sentences):")
    print(information_piece)
    
    return {
        "transcription": transcription,
        "matched_pieces": matched_pieces,
        "summary_text": information_piece,
        "method": result["method"]
    }

if __name__ == "__main__":
    url = "https://www.youtube.com/watch?v=a_hdKTJGukk"
    transcript = asyncio.run(transcribe_audio(url, full_transcript=None, query=None))
    print(f"\n[RESULT] Selected {len(transcript['matched_pieces'])} sentences")
    print(f"[RESULT] Method: {transcript['method']}")
    print(f"\nSummary:\n{transcript['summary_text']}")