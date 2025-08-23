import requests
import json
from clean_query import cleanQuery
from getImagePrompt import generate_prompt_from_image, replyFromImage
from tools import tools
from datetime import datetime, timezone
from getTimeZone import get_local_time
from utility import fetch_youtube_parallel, agent_manager, fetch_url_content_parallel, fetch_youtube_parallel, image_search, web_search
import random
import logging
import dotenv
import os
import asyncio


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("elixpo")
dotenv.load_dotenv()
POLLINATIONS_TOKEN=os.getenv("TOKEN")
MODEL=os.getenv("MODEL")
REFRRER=os.getenv("REFERRER")
POLLINATIONS_ENDPOINT = "https://text.pollinations.ai/openai"
print(MODEL, POLLINATIONS_TOKEN)




def format_sse(event: str, data: str) -> str:
    lines = data.splitlines()
    data_str = ''.join(f"data: {line}\n" for line in lines)
    return f"event: {event}\n{data_str}\n\n"

async def run_elixposearch_pipeline(user_query: str, user_image: str, event_id: str = None):
    logger.info(f"Starting ElixpoSearch Pipeline for query: '{user_query}' with image: '{user_image[:50] + '...' if user_image else 'None'}'")
    
    def emit_event(event_type, message):
        if event_id:
            return format_sse(event_type, message)
        return None

    initial_event = emit_event("INFO", " <TASK>Decomposing Request</TASK>")
    if initial_event:
        yield initial_event
    
    try:
        current_utc_time = datetime.now(timezone.utc)
        
        headers = {"Content-Type": "application/json"}

        memoized_results = {
            "timezone_info": {},
            "web_searches": {},
            "fetched_urls": {},
            "youtube_metadata": {},
            "youtube_transcripts": {},
            "base64_cache": {} 
        }
        
        messages = [
        {
        "role": "system",
        "content": f"""
        Mission: Provide comprehensive, detailed, and well-researched answers that synthesize ALL gathered information into rich content.
        
        CRITICAL CONTENT REQUIREMENTS:
        - Write detailed, substantive responses (minimum 400-600 words for substantial topics)
        - SYNTHESIZE information from all tools into the main answer content
        - Include specific facts, data, statistics, examples from your research
        - Structure responses with clear sections and detailed explanations
        - The main content should be 80% of your response, sources only 20%
        - Time Context if needed use this information to resolve any time related queries: {current_utc_time}
        - Mention time of the respective location if user query is time related.

        RESPONSE PRIORITY ORDER:
        1. **Comprehensive Main Answer** (most important - detailed analysis)
        2. **Supporting Details & Context** (from research findings)  
        3. **Images** (when applicable)
        4. **Sources** (minimal, at the end)
        
        USE TOOLS STRATEGICALLY:
        Answer directly if you know the answer (basic facts, math, general knowledge) — no tools needed.
        Use tools when:
        - Query needs recent info (weather, news, stocks, etc.)
        - Current events or time-sensitive information
        - User provides an image
        - Explicit research requested
        
        When you use tools, INTEGRATE the results into your main response content, don't just list sources.
        
        Available Tools:
        - cleanQuery(query: str)
        - web_search(query: str) - Don't query more than 2 times on same topic
        - fetch_full_text(url: str)
        - get_youtube_metadata(url: str)
        - get_youtube_transcript(url: str)
        - get_local_time(location: str)
        - generate_prompt_from_image(imgURL: str)
        - replyFromImage(imgURL: str, query: str)
        - image_search(image_query: str, max_images=10)
        
        
        IMAGE HANDLING:
        1. Text Only → Answer directly or web_search (NO image_search unless requested)
        2. Image Only → generate_prompt + image_search(10) + detailed analysis
        3. Image + Text → replyFromImage + image_search(5) + comprehensive response
        
        WRITING STYLE:
        - Rich, informative content with specific details
        - Professional yet conversational tone
        - Well-structured with clear sections
        - Include ALL relevant information from research
        - Make it comprehensive and thoroughly informative
        - Sources should supplement, not dominate the response
        """
        },
    {
        "role": "user", 
        "content": f"""Query: {user_query} {"Image: " + user_image if user_image else ''}"""
    }
    ]

        max_iterations = 7
        current_iteration = 0
        collected_sources = []
        collected_images_from_web = []
        collected_similar_images = []
        final_message_content = None

        while current_iteration < max_iterations:
            current_iteration += 1

            iteration_event = emit_event("INFO", f"<TASK>Moving On</TASK> \n")
            if iteration_event:
                yield iteration_event
                
            payload = {
                "model": MODEL,
                "messages": messages,
                "tools": tools,
                "tool_choice": "auto",
                "token": POLLINATIONS_TOKEN,
                "referrer": REFRRER,
                "private": True,
                "seed": random.randint(1000, 9999)
            }

            try:
                response = requests.post(POLLINATIONS_ENDPOINT, headers=headers, json=payload)
                response.raise_for_status()
                response_data = response.json()
            except requests.exceptions.RequestException as e:
                error_text = ""
                if hasattr(e, "response") and e.response is not None:
                    try:
                        error_text = e.response.text
                    except Exception:
                        error_text = "[Could not read error response text]"
                logger.error(f"Pollinations API call failed at iteration {current_iteration}: {e}\nResponse: {error_text}")
                
                if event_id:
                    yield format_sse("error", f"<TASK> Oppsie!! Something went wrong while connecting to the brain </TASK>")
                break

            assistant_message = response_data["choices"][0]["message"]
            if not assistant_message.get("content") and assistant_message.get("tool_calls"):
                assistant_message["content"] = "I'll help you with that. Let me gather the information you need."
            elif not assistant_message.get("content"):
                assistant_message["content"] = "Processing your request..."
            
            messages.append(assistant_message)

            tool_calls = assistant_message.get("tool_calls")
            logger.info(f"Tool calls suggested by model: {tool_calls}")
            
            if not tool_calls:
                final_message_content = assistant_message.get("content")
                break

            tool_outputs = []
            for tool_call in tool_calls:
                function_name = tool_call["function"]["name"]
                function_args = json.loads(tool_call["function"]["arguments"])
                
                logger.info(f"Executing tool: {function_name} with args: {function_args}")
                if event_id:
                    yield format_sse("INFO", f"<TASK> Cooking Response </TASK>")

                try:                    
                    if function_name == "cleanQuery":
                        websites, youtube, cleaned_query = cleanQuery(function_args.get("query"))
                        tool_result = f"Cleaned Query: {cleaned_query}\nWebsites: {websites}\nYouTube URLs: {youtube}"

                    elif function_name == "get_local_time":
                        location_name = function_args.get("location_name")
                        if location_name in memoized_results["timezone_info"]:
                            tool_result = memoized_results["timezone_info"][location_name]
                        else:
                            localTime = get_local_time(location_name)
                            tool_result = f"Location: {location_name} and Local Time is: {localTime}, Please mention the location and time when making the final response!"
                            memoized_results["timezone_info"][location_name] = tool_result

                    elif function_name == "web_search":
                        web_event = emit_event("INFO", f"<TASK>Surfing Internet</TASK>")
                        if web_event:
                            yield web_event
                        logger.info(f"Performing web search for: {function_args.get('query')}")
                        search_query = function_args.get("query")

                        search_results_raw = await web_search(search_query)
                        collected_sources.extend([url for url in search_results_raw if url and url.startswith("http")])
                        logger.info(f"Web search returned {len(search_results_raw)} results")
                        if search_results_raw:
                            parallel_results = fetch_url_content_parallel(search_results_raw)
                        tool_result = f"{parallel_results} for the URLs {collected_sources}" if parallel_results else "[No relevant web search results found.]"

                    elif function_name == "generate_prompt_from_image":
                        web_event = emit_event("INFO", f"<TASK>Watching Images!</TASK>")
                        if web_event:
                            yield web_event
                        image_url = function_args.get("imageURL")  
                        get_prompt = await generate_prompt_from_image(image_url)
                        tool_result = f"Generated Search Query: {get_prompt}"
                        logger.info(f"Generated prompt: {get_prompt}")

                    elif function_name == "replyFromImage":
                        web_event = emit_event("INFO", f"<TASK>Understanding Images</TASK>")
                        if web_event:
                            yield web_event
                        image_url = function_args.get("imageURL") 
                        query = function_args.get("query")
                        reply = await replyFromImage(image_url, query)
                        tool_result = f"Reply from Image: {reply}"
                        logger.info(f"Reply from image for query '{query}': {reply[:100]}...")

                    elif function_name == "image_search":
                        web_event = emit_event("INFO", f"<TASK>Surfing Images</TASK>")
                        if web_event:
                            yield web_event
                        image_query = function_args.get("image_query")
                        max_images = function_args.get("max_images", 10)
                        
                        search_results_raw = await image_search(image_query, max_images=max_images)
                        logger.info(f"Image search for '{image_query[:50]}...' returned results.")

                        image_urls = []
                        url_context = ""
                        try:
                            if isinstance(search_results_raw, str):
                                try:
                                    image_dict = json.loads(search_results_raw)
                                    if isinstance(image_dict, dict):
                                        for src_url, imgs in image_dict.items():
                                            if not imgs:
                                                continue
                                            for img_url in imgs:
                                                if img_url and img_url.startswith("http"):
                                                    image_urls.append(img_url)
                                                    url_context += f"\t{img_url}"
                                    else:
                                        logger.error("Image search result is not a dict.")
                                except json.JSONDecodeError:
                                    logger.error(f"Image search raw result is not valid JSON: {search_results_raw[:100]}...")
                            else:
                                logger.error("Image search result is not a string.")

                            if not isinstance(image_urls, list):
                                image_urls = []

                            if user_image and user_query.strip():
                                collected_images_from_web.extend(image_urls[:5])
                            elif user_image and not user_query.strip():
                                collected_similar_images.extend(image_urls[:10])
                            elif not user_image and user_query.strip():
                                collected_images_from_web.extend(image_urls[:10])
                                
                        except Exception as e:
                            logger.error(f"Failed to process image search results: {e}", exc_info=True)
                            image_urls = []
                            url_context = ""
                        
                        tool_result = f"The relevant image URLs are {url_context}\n\n"

                    elif function_name == "get_youtube_metadata":
                        logger.info(f"Getting YouTube metadata for URLs")
                        urls = [function_args.get("url")]
                        results = fetch_youtube_parallel(urls, mode='metadata')
                        for url, metadata in results.items():
                            tool_result = json.dumps(metadata)
                            memoized_results["youtube_metadata"][url] = tool_result
                            collected_sources.append(url)

                    elif function_name == "get_youtube_transcript":
                        logger.info(f"Getting YouTube transcripts for URLs")
                        if event_id:
                            yield format_sse("INFO", f"<TASK> Watching Youtube </TASK>")
                        urls = [function_args.get("url")]
                        results = fetch_youtube_parallel(urls, mode='transcript')
                        for url, transcript in results.items():
                            tool_result = f"YouTube Transcript for {url}:\n{transcript if transcript else '[No transcript available]'}..."
                            memoized_results["youtube_transcripts"][url] = tool_result
                            collected_sources.append(url)

                    elif function_name == "fetch_full_text":
                        logger.info(f"Fetching full text for URLs")
                        if event_id:
                            yield format_sse("INFO", f"<TASK> Writing Script </TASK>")
                        urls = [function_args.get("url")]
                        parallel_results = fetch_url_content_parallel(urls)
                        tool_result = parallel_results if parallel_results else "[No content fetched from URL]"

                    else:
                        tool_result = f"Unknown tool: {function_name}"
                        logger.warning(f"Unknown tool called: {function_name}")

                except Exception as e:
                    tool_result = f"[ERROR] Oppsie!! {type(e).__name__}: {e}"
                    logger.error(f"Error executing tool {function_name}: {e}", exc_info=True)
                
                tool_outputs.append({
                    "role": "tool",
                    "tool_call_id": tool_call["id"],
                    "name": function_name,
                    "content": tool_result
                })
            
            messages.extend(tool_outputs)
            logger.info(f"Completed tool execution for iteration {current_iteration}. Number of messages: {len(messages)}")
            if event_id:
                yield format_sse("INFO", f"<TASK> Summarizing Findings </TASK>")

        if not final_message_content and current_iteration >= max_iterations:
            # Force a comprehensive synthesis if we have gathered information but no final response
            synthesis_prompt = {
                "role": "user",
                "content": f"""Based on ALL the research and information gathered above, provide a comprehensive, detailed analysis answering the original query: "{user_query}". 
                
                Requirements:
                - Synthesize ALL information from web searches, fetched content, and any other sources
                - Write a detailed response (minimum 500-800 words)
                - Include specific facts, examples, and context
                - Structure with clear sections and headings
                - Provide thorough analysis, not just a summary
                - Make it comprehensive and well-researched"""
            }
            
            messages.append(synthesis_prompt)
            
            # Make one final API call for synthesis
            payload = {
                "model": MODEL,
                "messages": messages,
                "token": POLLINATIONS_TOKEN,
                "referrer": REFRRER,
                "private": True,
                "seed": random.randint(1000, 9999),
                "max_tokens": 4000  # Increase for longer responses
            }
            
            try:
                response = requests.post(POLLINATIONS_ENDPOINT, headers=headers, json=payload)
                response.raise_for_status()
                response_data = response.json()
                final_message_content = response_data["choices"][0]["message"].get("content")
            except Exception as e:
                logger.error(f"Synthesis step failed: {e}")

        if final_message_content:
            logger.info(f"Preparing final response.")
            response_parts = []
            
            response_parts.append(final_message_content)

            if user_image and not user_query.strip() and collected_similar_images:
                response_parts.append("\n\n**Similar Images:**\n")
                images_to_show = [img for img in collected_similar_images if img and img.startswith("http")][:10]
                for img in images_to_show:
                    response_parts.append(f"![Similar Image]({img})\n")

            elif user_image and user_query.strip() and collected_images_from_web:
                response_parts.append("\n\n**Related Images:**\n")
                images_to_show = [img for img in collected_images_from_web if img and img.startswith("http")][:5]
                for img in images_to_show:
                    response_parts.append(f"![Related Image]({img})\n")

            elif not user_image and user_query.strip() and collected_images_from_web:
                response_parts.append("\n\n**Requested Images:**\n")
                images_to_show = [img for img in collected_images_from_web if img and img.startswith("http")][:10]
                for img in images_to_show:
                    response_parts.append(f"![Image]({img})\n")

            if collected_sources:
                response_parts.append("\n\n---\n**Sources & References:**\n")
                unique_sources = sorted(list(set(collected_sources)))
                for i, src in enumerate(unique_sources):
                    response_parts.append(f"{i+1}. [{src}]({src})\n")

            response_with_sources = "".join(response_parts)

            logger.info(f"Final response prepared. Total length: {len(response_with_sources)}")
            
            # Log final agent status
            status = await agent_manager.get_agent_status()
            logger.info(f"Final agent status: {status}")
            
            if event_id:
                yield format_sse("INFO", "<TASK> SUCCESS</TASK>")
                chunk_size = 5000
                for i in range(0, len(response_with_sources), chunk_size):
                    chunk = response_with_sources[i:i+chunk_size]
                    event_name = "final" if i + chunk_size >= len(response_with_sources) else "final-part"
                    yield format_sse(event_name, chunk)
            else:
                yield format_sse("final", response_with_sources)
            return    
        else:
            error_msg = f"[ERROR] ElixpoSearch failed after {max_iterations} iterations. No final content generated. Model might be stuck in a tool loop or failed to generate a coherent response."
            logger.error(error_msg)
            if event_id:
                yield format_sse("error", "<TASK> Oppsie!! Something went wrong and I couldn't fetch the answer </TASK>")
                return  
            else:
                print(error_msg)
    except Exception as e:
        logger.error(f"Pipeline error: {e}", exc_info=True)
    finally:
        logger.info("Search Completed")

if __name__ == "__main__":
    import asyncio
    
    async def main():
        user_query = "who built this?"
        user_image = "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Tour_Eiffel_Wikimedia_Commons_%28cropped%29.jpg/500px-Tour_Eiffel_Wikimedia_Commons_%28cropped%29.jpg"
        
        event_id = None 

        async_generator = run_elixposearch_pipeline(user_query, user_image, event_id=event_id)
        answer = None
        
        try:
            async for event_chunk in async_generator:
                if event_chunk and "event: final" in event_chunk:
                    lines = event_chunk.split('\n')
                    for line in lines:
                        if line.startswith('data: '):
                            if answer is None:
                                answer = line[6:]
                            else:
                                answer += line[6:]
                    break 
                elif event_chunk and "event: final-part" in event_chunk:
                    lines = event_chunk.split('\n')
                    for line in lines:
                        if line.startswith('data: '):
                            if answer is None:
                                answer = line[6:]
                            else:
                                answer += line[6:]
        except Exception as e:
            logger.error(f"Error during async generator iteration: {e}", exc_info=True)
            answer = "Failed to get answer due to an error."
        
        if answer:
            print(f"\n--- Final Answer Received ---\n{answer}")
        else:
            print("\n--- No answer received ---")
        
        # Show final agent status
        status = await agent_manager.get_agent_status()
        print(f"\nFinal Agent Status: {status}")
    
    asyncio.run(main())