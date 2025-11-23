from planning import generate_plan
from searcher import mainQueryPlan, subQueryPlan
from responseGenerator import generate_intermediate_response
from getYoutubeDetails import get_youtube_metadata, get_youtube_transcript
from utility import fetch_url_content_parallel
from getTimeZone import get_local_time
import json
import os
import asyncio

def format_sse(event: str, data: str) -> str:
    lines = data.splitlines()
    data_str = ''.join(f"data: {line}\n" for line in lines)
    return f"event: {event}\n{data_str}\n\n"

async def process_planning_and_stream(planning):


   
