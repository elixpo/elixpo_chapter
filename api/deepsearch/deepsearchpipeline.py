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

async def process_planning_and_stream(planning_data: dict):
    """
    Process planning JSON by priority and stream responses progressively.
    """
    subqueries = planning_data.get("subqueries", [])
    
    # Sort by priority: high > medium > low
    priority_order = {"high": 0, "medium": 1, "low": 2}
    sorted_subqueries = sorted(
        subqueries, 
        key=lambda x: priority_order.get(x.get("priority", "low"), 999)
    )
    
    yield f"<THINK>\nStarting deep search processing for: {planning_data.get('main_query')}\nProcessing {len(sorted_subqueries)} subqueries by priority\n</THINK>\n\n"
    
    for subquery in sorted_subqueries:
        subquery_id = subquery.get("id")
        query_text = subquery.get("q")
        priority = subquery.get("priority")
        
        yield f"<THINK>\nProcessing subquery #{subquery_id} (priority: {priority}): {query_text}\n</THINK>\n\n"
        
        # Direct text response - no pipeline needed
        if subquery.get("direct_text") and not any([
            subquery.get("youtube"),
            subquery.get("document"),
            subquery.get("time")
        ]):
            yield f"**Query:** {query_text}\n\n"
            yield "Retrieving direct response...\n\n"
            continue
        
        # Time zone response
        if subquery.get("time"):
            yield f"**Query:** {query_text}\n\n"
            time_response = await execute_timezone_pipeline(subquery)
            yield f"{time_response}\n\n"
            continue
        
        # YouTube processing
        if subquery.get("youtube"):
            yield f"**Query:** {query_text}\n\n"
            youtube_data = await execute_youtube_pipeline(subquery)
            response = await generate_intermediate_response({
                "query": query_text,
                "information": youtube_data.get("transcript", ""),
                "urls": subquery.get("youtube"),
                "priority": priority,
                "id": subquery_id
            })
            yield response + "\n\n"
            continue
        
        # Document/Website processing
        if subquery.get("document"):
            yield f"**Query:** {query_text}\n\n"
            doc_data = await execute_scrape_pipeline(subquery)
            response = await generate_intermediate_response({
                "query": query_text,
                "information": doc_data.get("content", ""),
                "urls": subquery.get("document"),
                "priority": priority,
                "id": subquery_id
            })
            yield response + "\n\n"
            continue
