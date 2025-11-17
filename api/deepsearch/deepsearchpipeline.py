from planning import generate_plan
from searcher import mainQueryPlan, subQueryPlan
from responseGenerator import generate_intermediate_response
import json
import os
import asyncio

def format_sse(event: str, data: str) -> str:
    lines = data.splitlines()
    data_str = ''.join(f"data: {line}\n" for line in lines)
    return f"event: {event}\n{data_str}\n\n"

async def deepSearchPipeline(query: str, reqID: str, event_id: str = None):
    """
    Deep search pipeline that yields streaming responses with status updates
    """
    def emit_event(event_type, message):
        if event_id:
            return format_sse(event_type, message)
        return None
    
    try:
        # Step 1: Generate planning
        initial_event = emit_event("INFO", "<TASK>Understanding and Planning Your Query</TASK>")
        if initial_event:
            yield initial_event
            
        plan = await generate_plan(query)
        
        planning_event = emit_event("INFO", "<TASK>Creating Search Strategy</TASK>")
        if planning_event:
            yield planning_event
            
        # Parse and save planning data
        try:
            reply_json = json.loads(plan)
            if "response" not in reply_json:
                os.makedirs(f"searchSessions/{reqID}", exist_ok=True)
                fileName_plan = f"searchSessions/{reqID}/{reqID}_planning.json"
                with open(fileName_plan, "w") as f:
                    f.write(json.dumps(reply_json, indent=2))
                    
                planning_success = emit_event("INFO", "<TASK>Search Plan Created Successfully</TASK>")
                if planning_success:
                    yield planning_success
            else:
                error_event = emit_event("error", "<TASK>Planning Failed - Invalid Response</TASK>")
                if error_event:
                    yield error_event
                return
                
        except json.JSONDecodeError as e:
            error_event = emit_event("error", f"<TASK>Planning JSON Parse Error: {str(e)}</TASK>")
            if error_event:
                yield error_event
            return
        
        # Step 2: Execute main query search
        main_search_event = emit_event("INFO", "<TASK>Searching Main Query</TASK>")
        if main_search_event:
            yield main_search_event
            
        mainResponse = mainQueryPlan(reqID)
        
        main_processing_event = emit_event("INFO", "<TASK>Processing Main Search Results</TASK>")
        if main_processing_event:
            yield main_processing_event
            
        # Generate main response
        with open(mainResponse, "r") as f:
            main_response_json = json.load(f)
            
        main_response = await generate_intermediate_response(main_response_json)
        
        # Yield main response
        main_ready_event = emit_event("INFO", "<TASK>Main Search Complete</TASK>")
        if main_ready_event:
            yield main_ready_event
            
        if event_id:
            # Stream main response in chunks
            chunk_size = 1000
            for i in range(0, len(main_response), chunk_size):
                chunk = main_response[i:i+chunk_size]
                yield format_sse("main-response", chunk)
        else:
            yield format_sse("main-response", main_response)
        
        # Step 3: Execute sub queries search
        sub_search_event = emit_event("INFO", "<TASK>Searching Sub-Queries</TASK>")
        if sub_search_event:
            yield sub_search_event
            
        subResponse = subQueryPlan(reqID)
        
        sub_processing_event = emit_event("INFO", "<TASK>Processing Sub-Query Results</TASK>")
        if sub_processing_event:
            yield sub_processing_event
            
        # Generate sub responses
        with open(subResponse, "r") as f:
            sub_response_json = json.load(f)
        
        # Handle multiple sub-queries (array of results)
        if isinstance(sub_response_json, list):
            for i, sub_item in enumerate(sub_response_json):
                sub_item_event = emit_event("INFO", f"<TASK>Processing Sub-Query {i+1}/{len(sub_response_json)}</TASK>")
                if sub_item_event:
                    yield sub_item_event
                    
                sub_response = await generate_intermediate_response(sub_item)
                
                # Yield each sub response
                if event_id:
                    chunk_size = 1000
                    for j in range(0, len(sub_response), chunk_size):
                        chunk = sub_response[j:j+chunk_size]
                        yield format_sse(f"sub-response-{i+1}", chunk)
                else:
                    yield format_sse(f"sub-response-{i+1}", sub_response)
        else:
            # Single sub-query result
            sub_response = await generate_intermediate_response(sub_response_json)
            
            if event_id:
                chunk_size = 1000
                for i in range(0, len(sub_response), chunk_size):
                    chunk = sub_response[i:i+chunk_size]
                    yield format_sse("sub-response", chunk)
            else:
                yield format_sse("sub-response", sub_response)
        
        # Final completion event
        completion_event = emit_event("INFO", "<TASK>Deep Search Completed Successfully</TASK>")
        if completion_event:
            yield completion_event
            
        final_event = emit_event("final", "Deep search analysis complete.")
        if final_event:
            yield final_event
            
    except Exception as e:
        error_event = emit_event("error", f"<TASK>Deep Search Error: {str(e)}</TASK>")
        if error_event:
            yield error_event
        
        # Fallback response
        fallback_event = emit_event("final", f"# {query}\n\nDeep search encountered an error: {str(e)}")
        if fallback_event:
            yield fallback_event

# Test function
if __name__ == "__main__":
    async def main():
        reqID = "test123"
        query = "Who really invented the light bulb?"
        event_id = "test_event"
        
        print("Starting Deep Search Pipeline...")
        
        async for event_chunk in deepSearchPipeline(query, reqID, event_id=event_id):
            if event_chunk:
                print(event_chunk, end="")
                
        print("\nDeep Search Pipeline Completed!")
    
    asyncio.run(main())