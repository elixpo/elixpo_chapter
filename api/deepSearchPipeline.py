import json
import os
import asyncio
import random
import requests
import logging
from typing import Optional, AsyncGenerator, Dict, List, Any
from datetime import datetime, timezone
from pathlib import Path
from loguru import logger
from deep_planning import generate_plan
from searchPipeline import optimized_tool_execution
from config import POLLINATIONS_ENDPOINT
from dotenv import load_dotenv

load_dotenv()

POLLINATIONS_TOKEN = os.getenv("TOKEN")
MODEL = os.getenv("MODEL")
REFERRER = os.getenv("REFERRER")

# Configure storage path for planning files
PLANNING_STORAGE_PATH = Path(__file__).parent / "searchSessions"
PLANNING_STORAGE_PATH.mkdir(exist_ok=True)


def format_sse(event: str, data: str) -> str:
    """Format data as SSE event"""
    lines = data.splitlines()
    data_str = ''.join(f"data: {line}\n" for line in lines)
    return f"event: {event}\n{data_str}\n\n"


def load_or_create_planning_file(request_id: str) -> Dict[str, Any]:
    """Load existing planning file or create new one"""
    planning_dir = PLANNING_STORAGE_PATH / request_id
    planning_dir.mkdir(exist_ok=True)
    planning_file = planning_dir / f"{request_id}_planning.json"
    
    if planning_file.exists():
        with open(planning_file, 'r') as f:
            return json.load(f)
    
    return {
        "request_id": request_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "main_query": "",
        "planning": {},
        "subqueries": [],
        "results": {},
        "completed_tasks": [],
        "status": "planning"
    }


def save_planning_file(request_id: str, planning_data: Dict[str, Any]) -> None:
    """Save planning file with current state"""
    planning_dir = PLANNING_STORAGE_PATH / request_id
    planning_dir.mkdir(exist_ok=True)
    planning_file = planning_dir / f"{request_id}_planning.json"
    
    with open(planning_file, 'w') as f:
        json.dump(planning_data, f, indent=2)
    
    logger.info(f"Planning file saved: {planning_file}")


def update_subquery_result(request_id: str, planning_data: Dict[str, Any], 
                          subquery_id: int, result: str) -> Dict[str, Any]:
    """Update a subquery result while maintaining schema"""
    if "results" not in planning_data:
        planning_data["results"] = {}
    
    if str(subquery_id) not in planning_data["results"]:
        planning_data["results"][str(subquery_id)] = {
            "subquery_id": subquery_id,
            "completed_at": None,
            "result": None
        }
    
    planning_data["results"][str(subquery_id)].update({
        "result": result,
        "completed_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Track completed tasks
    if str(subquery_id) not in planning_data.get("completed_tasks", []):
        if "completed_tasks" not in planning_data:
            planning_data["completed_tasks"] = []
        planning_data["completed_tasks"].append(str(subquery_id))
    
    # Save immediately after each result
    save_planning_file(request_id, planning_data)
    
    return planning_data


async def resolve_subquery(subquery: Dict[str, Any], 
                          memoized_results: Dict[str, Any],
                          emit_event_func,
                          event_id: Optional[str] = None) -> str:
    """Resolve a single subquery and return result"""
    subquery_id = subquery.get("id")
    query_text = subquery.get("q", "")
    
    logger.info(f"Resolving subquery {subquery_id}: {query_text[:100]}")
    
    # Use LLM to resolve the subquery with gathered information
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {POLLINATIONS_TOKEN}"
    }
    
    messages = [
        {
            "role": "system",
            "content": "You are a research assistant. Provide a comprehensive, detailed answer to the following query based on the information provided."
        },
        {
            "role": "user",
            "content": f"Query: {query_text}\n\nProvide a detailed, well-researched response."
        }
    ]
    
    # Check for specific query types
    if subquery.get("youtube"):
        youtube_urls = [yt.get("url") for yt in subquery.get("youtube", []) if yt.get("url")]
        if youtube_urls:
            logger.info(f"Transcribing YouTube for subquery {subquery_id}")
            event = emit_event_func("INFO", f"<TASK>Processing YouTube Video for subquery {subquery_id}</TASK>")
            if event:
                pass  # Event is just for logging
            
            # Transcribe YouTube
            from getYoutubeDetails import transcribe_audio
            try:
                transcript = await transcribe_audio(youtube_urls[0], full_transcript=True, query=query_text)
                messages.append({
                    "role": "user",
                    "content": f"YouTube Transcript:\n{transcript}\n\nNow provide a comprehensive answer to: {query_text}"
                })
            except Exception as e:
                logger.error(f"Failed to transcribe YouTube: {e}")
    
    if subquery.get("document"):
        doc_urls = [doc.get("url") for doc in subquery.get("document", []) if doc.get("url")]
        if doc_urls:
            logger.info(f"Fetching document for subquery {subquery_id}")
            event = emit_event_func("INFO", f"<TASK>Reading Document for subquery {subquery_id}</TASK>")
            if event:
                pass  # Event is just for logging
            
            # Fetch document content
            from utility import fetch_url_content_parallel
            try:
                content = fetch_url_content_parallel([query_text], doc_urls)
                messages.append({
                    "role": "user",
                    "content": f"Document Content:\n{content}\n\nNow provide a comprehensive answer to: {query_text}"
                })
            except Exception as e:
                logger.error(f"Failed to fetch document: {e}")
    
    # If direct_response is true and no special content, use LLM directly
    if subquery.get("direct_response", True) and not subquery.get("youtube") and not subquery.get("document"):
        logger.info(f"Direct LLM response for subquery {subquery_id}")
    else:
        # Run web search for context
        event = emit_event_func("INFO", f"<TASK>Searching for information on: {query_text[:50]}</TASK>")
        if event:
            pass  # Event is just for logging
        
        from utility import webSearch
        try:
            search_results = webSearch(query_text)
            if search_results:
                messages.append({
                    "role": "user",
                    "content": f"Search Results Context:\n{search_results}\n\nBased on this information, provide a detailed answer to: {query_text}"
                })
        except Exception as e:
            logger.error(f"Web search failed for subquery {subquery_id}: {e}")
    
    # Get LLM response for this subquery
    payload = {
        "model": MODEL,
        "messages": messages,
        "temperature": 0.7,
        "stream": False,
        "max_tokens": subquery.get("max_tokens", 800),
        "seed": random.randint(1000, 1000000),
        "frequency_penalty": 1,
        "logit_bias": {},
        "logprobs": False,
        "modalities": ["text"]
    }
    
    try:
        response = requests.post(
            "https://enter.pollinations.ai/api/generate/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=60
        )
        response.raise_for_status()
        data = response.json()
        
        result = data["choices"][0]["message"]["content"]
        
        # Clean up sponsor sections
        if "---" in result and "**Sponsor**" in result:
            sponsor_start = result.find("---")
            if sponsor_start != -1:
                sponsor_section = result[sponsor_start:]
                if "**Sponsor**" in sponsor_section:
                    result = result[:sponsor_start].strip()
        
        logger.info(f"Subquery {subquery_id} resolved successfully")
        return result.strip()
        
    except Exception as e:
        logger.error(f"Failed to resolve subquery {subquery_id}: {e}")
        return f"[ERROR] Failed to resolve query: {str(e)[:100]}"


async def run_deep_research_pipeline(
    user_query: str,
    request_id: str,
    event_id: Optional[str] = None
) -> AsyncGenerator[str, None]:
    """
    Deep research pipeline that:
    1. Generates a plan with subqueries
    2. Resolves each subquery and saves results incrementally
    3. Yields results via SSE as they complete
    4. Returns full planning file at the end
    """
    
    def emit_event(event_type: str, message: str) -> Optional[str]:
        """Emit SSE event if event_id is provided"""
        if event_id:
            return format_sse(event_type, message)
        return None
    
    # Load or create planning file
    planning_data = load_or_create_planning_file(request_id)
    planning_data["main_query"] = user_query
    planning_data["status"] = "planning"
    
    logger.info(f"Starting deep research pipeline for: {user_query[:100]}")
    
    try:
        # Step 1: Generate plan
        event = emit_event("INFO", "<TASK>Creating research plan</TASK>")
        if event:
            yield event
        
        plan_json_str = await generate_plan(user_query, max_tokens=600)
        
        try:
            plan_data = json.loads(plan_json_str)
        except json.JSONDecodeError:
            logger.error(f"Failed to parse plan JSON: {plan_json_str[:200]}")
            event = emit_event("error", "Failed to create research plan")
            if event:
                yield event
            return
        
        planning_data["planning"] = plan_data
        planning_data["subqueries"] = plan_data.get("subqueries", [])
        planning_data["status"] = "executing"
        save_planning_file(request_id, planning_data)
        
        event = emit_event("INFO", f"<TASK>Plan created with {len(planning_data['subqueries'])} subqueries</TASK>")
        if event:
            yield event
        
        # Step 2: Resolve each subquery
        memoized_results = {
            "timezone_info": {},
            "web_searches": {},
            "fetched_urls": {},
            "youtube_metadata": {},
            "youtube_transcripts": {},
            "base64_cache": {}
        }
        
        subqueries = planning_data.get("subqueries", [])
        
        for idx, subquery in enumerate(subqueries, 1):
            subquery_id = subquery.get("id", idx)
            query_text = subquery.get("q", "")
            
            event = emit_event("INFO", f"<TASK>Resolving subquery {subquery_id}/{len(subqueries)}: {query_text[:60]}</TASK>")
            if event:
                yield event
            
            try:
                # Resolve subquery
                result = await resolve_subquery(subquery, memoized_results, emit_event, event_id)
                
                # Update planning file with result
                planning_data = update_subquery_result(request_id, planning_data, subquery_id, result)
                
                # Yield the completed subquery via SSE
                yield_data = {
                    "subquery_id": subquery_id,
                    "query": query_text,
                    "result": result,
                    "completed_at": datetime.now(timezone.utc).isoformat()
                }
                
                event = emit_event("result", json.dumps(yield_data))
                if event:
                    yield event
                
                logger.info(f"Subquery {subquery_id} completed and yielded")
                
            except Exception as e:
                logger.error(f"Error resolving subquery {subquery_id}: {e}")
                error_result = f"[ERROR] Failed to resolve: {str(e)[:200]}"
                planning_data = update_subquery_result(request_id, planning_data, subquery_id, error_result)
                
                event = emit_event("error", f"<TASK>Failed to resolve subquery {subquery_id}</TASK>")
                if event:
                    yield event
        
        # Step 3: Final synthesis
        planning_data["status"] = "synthesizing"
        save_planning_file(request_id, planning_data)
        
        event = emit_event("INFO", "<TASK>Synthesizing final response</TASK>")
        if event:
            yield event
        
        # Create final synthesis message
        synthesis_messages = [
            {
                "role": "system",
                "content": "You are a research synthesis expert. Create a comprehensive, well-structured response that integrates all the research findings."
            },
            {
                "role": "user",
                "content": f"Original Query: {user_query}\n\nResearch Findings:\n" + 
                          "\n\n".join([
                              f"Subquery {sq.get('id')}: {sq.get('q')}\n\n"
                              f"Result:\n{planning_data['results'].get(str(sq.get('id')), {}).get('result', '[No result]')}"
                              for sq in subqueries
                          ]) +
                          "\n\nPlease synthesize these findings into a comprehensive, well-structured response with clear sections and insights."
            }
        ]
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {POLLINATIONS_TOKEN}"
        }
        
        payload = {
            "model": MODEL,
            "messages": synthesis_messages,
            "temperature": 0.7,
            "stream": False,
            "max_tokens": 2500,
            "seed": random.randint(1000, 1000000),
        }
        
        try:
            response = requests.post(
                "https://enter.pollinations.ai/api/generate/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=60
            )
            response.raise_for_status()
            data = response.json()
            synthesis_result = data["choices"][0]["message"]["content"]
            
            planning_data["synthesis"] = synthesis_result
            planning_data["status"] = "completed"
            planning_data["completed_at"] = datetime.now(timezone.utc).isoformat()
            save_planning_file(request_id, planning_data)
            
        except Exception as e:
            logger.error(f"Synthesis failed: {e}")
            planning_data["synthesis"] = f"[ERROR] Synthesis failed: {str(e)}"
            planning_data["status"] = "completed_with_errors"
            save_planning_file(request_id, planning_data)
        
        # Step 4: Return full planning file
        event = emit_event("INFO", "<TASK>Deep research completed</TASK>")
        if event:
            yield event
        
        # Format final response with planning blocks
        final_response = format_planning_response(planning_data)
        
        yield format_sse("final", final_response)
        
    except Exception as e:
        logger.error(f"Deep research pipeline error: {e}", exc_info=True)
        planning_data["status"] = "failed"
        planning_data["error"] = str(e)
        save_planning_file(request_id, planning_data)
        
        event = emit_event("error", f"<TASK>Pipeline failed: {str(e)[:100]}</TASK>")
        if event:
            yield event


def format_planning_response(planning_data: Dict[str, Any]) -> str:
    """Format planning data into response with <TASK> blocks"""
    parts = []
    
    # Main query
    parts.append(f"<TASK>Query: {planning_data.get('main_query')}</TASK>\n\n")
    
    # Planning overview
    if planning_data.get("planning"):
        parts.append("<TASK>Research Plan</TASK>\n")
        plan = planning_data.get("planning", {})
        parts.append(f"Total Subqueries: {len(plan.get('subqueries', []))}\n")
        parts.append(f"Max Tokens Budget: {plan.get('max_tokens', 'N/A')}\n\n")
    
    # Individual results
    if planning_data.get("results"):
        parts.append("<TASK>Research Results</TASK>\n\n")
        for subquery in planning_data.get("subqueries", []):
            subquery_id = str(subquery.get("id"))
            result_data = planning_data.get("results", {}).get(subquery_id, {})
            
            parts.append(f"<TASK>Subquery {subquery_id}: {subquery.get('q', 'N/A')}</TASK>\n")
            parts.append(f"{result_data.get('result', '[No result]')}\n\n")
    
    # Synthesis
    if planning_data.get("synthesis"):
        parts.append("<TASK>Final Synthesis</TASK>\n")
        parts.append(f"{planning_data.get('synthesis')}\n\n")
    
    # Status
    parts.append(f"<TASK>Status: {planning_data.get('status', 'unknown')}</TASK>\n")
    if planning_data.get("completed_at"):
        parts.append(f"Completed At: {planning_data.get('completed_at')}")
    
    return "".join(parts)


if __name__ == "__main__":
    import asyncio
    
    async def test():
        user_query = "What are the latest developments in AI and their applications in healthcare?"
        request_id = f"test_{int(datetime.now(timezone.utc).timestamp())}"
        
        logger.info(f"Testing deep research pipeline with request_id: {request_id}")
        
        async for chunk in run_deep_research_pipeline(user_query, request_id, event_id=None):
            if chunk.startswith("event:"):
                print(f"\n[EVENT]\n{chunk}")
            else:
                print(chunk, end="", flush=True)
        
        print("\n\n[DONE]")
    
    asyncio.run(test())
