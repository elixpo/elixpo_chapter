from loguru import logger 
from commons.minimal import cleanQuery
from pipeline.tools import tools
from functionCalls.getTimeZone import get_local_time
from functionCalls.getImagePrompt import generate_prompt_from_image, replyFromImage
import asyncio
import time
import json
from commons.searching_based import fetch_url_content_parallel, webSearch, imageSearch
from commons.minimal import cleanQuery
from functionCalls.getYoutubeDetails import transcribe_audio, youtubeMetadata
from pipeline.utils import get_model_server, cached_web_search_key
from pipeline.config import MAX_IMAGES_TO_INCLUDE, LOG_MESSAGE_QUERY_TRUNCATE, LOG_MESSAGE_PREVIEW_TRUNCATE, ERROR_MESSAGE_TRUNCATE, REQUEST_ID_HEX_SLICE_SIZE

async def optimized_tool_execution(function_name: str, function_args: dict, memoized_results: dict, emit_event_func):
    try:
        VALID_TOOL_NAMES = {tool["function"]["name"] for tool in tools}
        if function_name not in VALID_TOOL_NAMES:
            error_msg = f"Tool '{function_name}' is not available. Valid tools are: {', '.join(sorted(VALID_TOOL_NAMES))}"
            logger.error(f"Unknown tool called: {function_name}")
            yield error_msg
            return
        
        if function_name == "cleanQuery":
            websites, youtube, cleaned_query = cleanQuery(function_args.get("query"))
            yield f"Cleaned Query: {cleaned_query}\nWebsites: {websites}\nYouTube URLs: {youtube}"

        elif function_name == "query_conversation_cache":
            logger.info("[Pipeline] Query conversation cache tool called")
            query = function_args.get("query")
            use_window = function_args.get("use_window", True)
            threshold = function_args.get("similarity_threshold")
            
            if "conversation_cache" not in memoized_results:
                yield "[CACHE] No conversation cache available"
                return
            
            cache_manager = memoized_results["conversation_cache"]
            cache_hit, similarity_score = cache_manager.query_cache(
                query=query,
                use_window=use_window,
                similarity_threshold=threshold,
                return_compressed=False
            )
            
            if cache_hit:
                cached_response = cache_hit.get("response", "")
                cache_metadata = cache_hit.get("metadata", {})
                result = f"""[CACHE HIT] Found relevant previous answer (similarity: {similarity_score:.2%})

Original Query: {cache_hit.get('query')}

Cached Response:
{cached_response}

---
Sources: {cache_metadata.get('sources', 'N/A')}"""
                memoized_results["cache_hit"] = True
                memoized_results["cached_response"] = cached_response
                logger.info(f"[Pipeline] Cache hit with similarity: {similarity_score:.2%}")
                yield result
            else:
                msg = f"[CACHE] No match found (best similarity: {similarity_score:.2%}). Proceeding with RAG/web search..."
                logger.info(msg)
                memoized_results["cache_hit"] = False
                yield msg

        elif function_name == "get_local_time":
            location_name = function_args.get("location_name")
            if location_name in memoized_results["timezone_info"]:
                yield memoized_results["timezone_info"][location_name]
            localTime = get_local_time(location_name)
            result = f"Location: {location_name} and Local Time is: {localTime}, Please mention the location and time when making the final response!"
            memoized_results["timezone_info"][location_name] = result
            yield result

        elif function_name == "web_search":
            start_time = time.time()
            search_query = function_args.get("query")
            memoized_results["search_query"] = search_query
            web_event = emit_event_func("INFO", f"<TASK>Searching for '{search_query}'</TASK>")
            if web_event:
                yield web_event
            cache_key = cached_web_search_key(search_query)
            if cache_key in memoized_results["web_searches"]:
                logger.info(f"Using cached web search for: {search_query}")
                yield memoized_results["web_searches"][cache_key]
            logger.info(f"Performing optimized web search for: {search_query}")
            tool_result = webSearch(search_query)
            source_urls = tool_result
            memoized_results["web_searches"][cache_key] = tool_result
            if "current_search_urls" not in memoized_results:
                memoized_results["current_search_urls"] = []
            memoized_results["current_search_urls"] = source_urls
            yield tool_result

        elif function_name == "generate_prompt_from_image":
            web_event = emit_event_func("INFO", "<TASK>Analyzing Image</TASK>")
            if web_event:
                yield web_event
            image_url = function_args.get("imageURL")
            try:
                get_prompt = await generate_prompt_from_image(image_url)
                result = f"Generated Search Query: {get_prompt}"
                logger.info(f"Generated prompt: {get_prompt}")
                yield result
            except Exception as e:
                logger.error(f"Image analysis error: {e}")
                yield f"[ERROR] Image analysis failed: {str(e)[:ERROR_MESSAGE_TRUNCATE]}"

        elif function_name == "replyFromImage":
            web_event = emit_event_func("INFO", "<TASK>Processing Image Query</TASK>")
            if web_event:
                yield web_event
            image_url = function_args.get("imageURL")
            query = function_args.get("query")
            try:
                reply = await replyFromImage(image_url, query)
                result = f"Reply from Image: {reply}"
                logger.info(f"Reply from image for query '{query}': {reply[:LOG_MESSAGE_PREVIEW_TRUNCATE]}...")
                yield result
            except Exception as e:
                logger.error(f"Image query error: {e}")
                yield f"[ERROR] Image query failed: {str(e)[:ERROR_MESSAGE_TRUNCATE]}"

        elif function_name == "image_search":
            start_time = time.time()
            web_event = emit_event_func("INFO", f"<TASK>Finding Images</TASK>")
            if web_event:
                yield web_event
            elapsed = time.time() - start_time
            if elapsed > 10:
                web_event = emit_event_func("INFO", f"<TASK>Taking a bit of time... just a minute</TASK>")
                if web_event:
                    yield web_event
            image_query = function_args.get("image_query")
            max_images = function_args.get("max_images", MAX_IMAGES_TO_INCLUDE)
            search_results_raw = await imageSearch(image_query, max_images=max_images)
            logger.info(f"Image search for '{image_query[:LOG_MESSAGE_QUERY_TRUNCATE]}...' completed.")
            image_urls = []
            url_context = ""
            try:
                if isinstance(search_results_raw, list):
                    image_urls = search_results_raw[:max_images]
                elif isinstance(search_results_raw, str):
                    try:
                        image_dict = json.loads(search_results_raw)
                        if isinstance(image_dict, dict):
                            for src_url, imgs in image_dict.items():
                                if not imgs:
                                    continue
                                for img_url in imgs[:REQUEST_ID_HEX_SLICE_SIZE]:
                                    if img_url and img_url.startswith("http"):
                                        image_urls.append(img_url)
                    except json.JSONDecodeError:
                        logger.warning(f"Could not parse image search results as JSON")
                
                for url in image_urls:
                    if url.startswith("http"):
                        url_context += f"\t{url}\n"
                
                yield (f"Found {len(image_urls)} relevant images:\n{url_context}\n", image_urls)
            except Exception as e:
                logger.error(f"Failed to process image search results: {e}")
                yield ("Image search completed but results processing failed", [])

        elif function_name == "youtubeMetadata":
            url = function_args.get("url")
            web_event = emit_event_func("INFO", f"<TASK>Fetching YouTube Metadata</TASK>")
            if web_event:
                yield web_event
            metadata = await youtubeMetadata(url)
            result = f"YouTube Metadata:\n{metadata if metadata else '[No metadata available]'}"
            memoized_results["youtube_metadata"][url] = result
            yield result

        elif function_name == "transcribe_audio":
            logger.info("Getting YouTube transcript")
            web_event = emit_event_func("INFO", "<TASK>Processing Video, This will take a minute</TASK>")
            if web_event:
                yield web_event
            try:
                url = function_args.get("url")
                search_query = memoized_results.get("search_query", "")
                result = await transcribe_audio(url, full_transcript=False, query=search_query)
                transcript_text = f"YouTube Transcript:\n{result if result else '[No transcript available]'}"
                memoized_results["youtube_transcripts"][url] = transcript_text
                yield transcript_text
            except asyncio.TimeoutError:
                logger.warning("Transcribe audio timed out")
                yield "[TIMEOUT] Video transcription took too long"
            except Exception as e:
                logger.error(f"Transcription error: {e}")
                yield f"[ERROR] Failed to transcribe: {str(e)[:ERROR_MESSAGE_TRUNCATE]}"

        elif function_name == "fetch_full_text":
            logger.info("Fetching webpage content")
            web_event = emit_event_func("INFO", "<TASK>Reading Webpage</TASK>")
            if web_event:
                yield web_event
            url = function_args.get("url")
            try:
                queries = memoized_results.get("search_query", "")
                if isinstance(queries, str):
                    queries = [queries]
                parallel_results = await asyncio.wait_for(
                    asyncio.to_thread(fetch_url_content_parallel, queries, [url]),
                    timeout=15.0
                )
                
                try:
                    model_server = get_model_server()
                    core_service = model_server.CoreEmbeddingService()
                    ingest_result = await asyncio.to_thread(core_service.ingest_url, url)
                    chunks_count = ingest_result.get('chunks_ingested', 0)
                    logger.info(f"[Pipeline] Ingested {chunks_count} chunks from {url} into vector store")
                except Exception as e:
                    logger.warning(f"[Pipeline] Failed to ingest content to vector store: {e}")
                
                yield parallel_results if parallel_results else "[No content fetched from URL]"
            except asyncio.TimeoutError:
                logger.warning(f"URL fetch timed out for {url}")
                yield f"[TIMEOUT] Fetching {url} took too long"
            except Exception as e:
                logger.error(f"URL fetch error for {url}: {e}")
                yield f"[ERROR] Failed to fetch {url}: {str(e)[:ERROR_MESSAGE_TRUNCATE]}"
    except asyncio.TimeoutError:
        logger.warning(f"Tool {function_name} timed out")
        yield f"[TIMEOUT] Tool {function_name} took too long to execute"
    except Exception as e:
        logger.error(f"Error executing tool {function_name}: {e}")
        yield f"[ERROR] Tool execution failed: {str(e)[:ERROR_MESSAGE_TRUNCATE]}"

