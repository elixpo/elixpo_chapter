"""
SearchEndpointTester - Core class for testing the /api/search endpoint
Handles SSE streaming response parsing and HTTP requests
"""

import requests
import time
from typing import Generator, Optional


class SearchEndpointTester:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.api_endpoint = f"{base_url}/api/search"
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "Accept": "text/event-stream"
        })
    
    def parse_sse_stream(self, response: requests.Response) -> Generator[dict, None, None]:
        """
        Parse Server-Sent Events stream from response
        Yields dict with {event, data}
        """
        if response.status_code != 200:
            yield {
                "event": "error",
                "data": f"HTTP {response.status_code}: {response.text}"
            }
            return
        
        current_event = None
        current_data = []
        
        for line in response.iter_lines(decode_unicode=True):
            if not line:
                # Empty line signals end of event
                if current_event and current_data:
                    yield {
                        "event": current_event,
                        "data": "\n".join(current_data)
                    }
                    current_event = None
                    current_data = []
                continue
            
            if line.startswith("event:"):
                current_event = line.replace("event:", "").strip()
            elif line.startswith("data:"):
                data_content = line.replace("data:", "").strip()
                current_data.append(data_content)
        
        # Handle last event if stream ended without empty line
        if current_event and current_data:
            yield {
                "event": current_event,
                "data": "\n".join(current_data)
            }
    
    def search(
        self,
        query: str,
        image_url: Optional[str] = None,
        session_id: Optional[str] = None,
        request_id: Optional[str] = None,
        verbose: bool = True
    ) -> dict:
        """
        Send search request to /api/search endpoint
        
        Args:
            query: Search query string (required)
            image_url: Optional image URL for image-based search
            session_id: Optional session ID to continue existing session
            request_id: Optional request ID for tracking
            verbose: Print detailed output during request
        
        Returns:
            dict with final response data
        """
        if verbose:
            print(f"\n{'='*80}")
            print(f"🔍 Search Query: {query}")
            if image_url:
                print(f"📷 Image URL: {image_url}")
            if session_id:
                print(f"📌 Session ID: {session_id}")
            print(f"{'='*80}\n")
        
        # Build request payload
        payload = {
            "query": query
        }
        if image_url:
            payload["image_url"] = image_url
        if session_id:
            payload["session_id"] = session_id
        
        headers = {
            "X-Request-ID": request_id or f"test-{int(time.time()*1000)}"
        }
        
        try:
            # Send streaming request
            start_time = time.time()
            response = self.session.post(
                self.api_endpoint,
                json=payload,
                headers=headers,
                stream=True,
                timeout=120
            )
            
            # Process SSE stream
            final_response = None
            event_count = 0
            
            for sse_event in self.parse_sse_stream(response):
                event_count += 1
                event_type = sse_event["event"]
                event_data = sse_event["data"]
                
                if verbose:
                    if event_type == "info":
                        print(f"ℹ️  {event_data}")
                    elif event_type == "final":
                        print(f"\n✅ Final Response:")
                        print(f"{'─'*80}")
                        # Print first 500 chars of final response
                        preview = event_data[:500] if len(event_data) > 500 else event_data
                        print(preview)
                        if len(event_data) > 500:
                            print(f"\n... (truncated, {len(event_data)} chars total)")
                        print(f"{'─'*80}\n")
                        final_response = event_data
                    elif event_type == "error":
                        print(f"❌ Error: {event_data}")
                
            elapsed_time = time.time() - start_time
            
            if verbose:
                print(f"⏱️  Response time: {elapsed_time:.2f}s")
                print(f"📊 Events received: {event_count}")
                print(f"{'='*80}\n")
            
            return {
                "success": response.status_code == 200,
                "query": query,
                "session_id": session_id,
                "response": final_response,
                "events_count": event_count,
                "elapsed_time": elapsed_time,
                "status_code": response.status_code
            }
        
        except requests.exceptions.Timeout:
            print(f"❌ Request timed out after 120s")
            return {
                "success": False,
                "query": query,
                "error": "Timeout",
                "status_code": None
            }
        except requests.exceptions.ConnectionError as e:
            print(f"❌ Connection error: {e}")
            print(f"💡 Make sure the server is running on {self.base_url}")
            return {
                "success": False,
                "query": query,
                "error": f"Connection error: {e}",
                "status_code": None
            }
        except Exception as e:
            print(f"❌ Unexpected error: {e}")
            return {
                "success": False,
                "query": query,
                "error": str(e),
                "status_code": None
            }
    
    def search_multiple(
        self,
        queries: list,
        use_sessions: bool = False,
        verbose: bool = True
    ) -> list:
        """
        Send multiple search requests
        
        Args:
            queries: List of query strings or dicts with {query, image_url?, session_id?}
            use_sessions: If True, reuse session_id across queries
            verbose: Print detailed output
        
        Returns:
            List of results for each query
        """
        results = []
        session_id = None
        
        print(f"\n{'#'*80}")
        print(f"Starting batch search with {len(queries)} queries")
        print(f"{'#'*80}\n")
        
        for idx, query_item in enumerate(queries, 1):
            # Parse query item (string or dict)
            if isinstance(query_item, str):
                query = query_item
                image_url = None
                request_session_id = None
            else:
                query = query_item.get("query")
                image_url = query_item.get("image_url")
                request_session_id = query_item.get("session_id")
            
            # Use session from previous request if enabled
            if use_sessions and session_id:
                request_session_id = session_id
            
            print(f"\n[Query {idx}/{len(queries)}]")
            result = self.search(
                query=query,
                image_url=image_url,
                session_id=request_session_id,
                request_id=f"batch-{idx}",
                verbose=verbose
            )
            
            results.append(result)
            
            # Store session ID from first result
            if use_sessions and idx == 1 and result.get("session_id"):
                session_id = result["session_id"]
            
            # Small delay between queries to avoid overwhelming the server
            if idx < len(queries):
                time.sleep(1)
        
        # Print summary
        print(f"\n{'#'*80}")
        print(f"Batch search completed")
        print(f"Total queries: {len(results)}")
        successful = sum(1 for r in results if r.get("success"))
        print(f"Successful: {successful}")
        print(f"Failed: {len(results) - successful}")
        total_time = sum(r.get("elapsed_time", 0) for r in results)
        print(f"Total time: {total_time:.2f}s")
        print(f"Average time per query: {total_time/len(results):.2f}s")
        print(f"{'#'*80}\n")
        
        return results
