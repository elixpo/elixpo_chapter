
import time 
import hashlib
def generatePodcastID(podcast_name):
    timestamp = str(int(time.time()))
    raw_id = f"{timestamp}_{podcast_name}"
    podcast_id = hashlib.sha256(raw_id.encode('utf-8')).hexdigest()
    return podcast_id