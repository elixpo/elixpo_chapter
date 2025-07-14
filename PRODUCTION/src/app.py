from flask_cors import CORS
from flask import Flask, request, Response, stream_with_context
import time
from searchPipeline import run_elixposearch_pipeline
import random

app = Flask(__name__)
CORS(app)



@app.route("/search/sse", methods=["POST"])
def search_sse():
    user_query = request.json.get("query", "")
    event_id = f"elixpo-{int(time.time() * 1000)}-{random.randint(1000,9999)}"
    return Response(
        stream_with_context(run_elixposearch_pipeline(user_query, event_id)),
        mimetype="text/event-stream"
    )


@app.route("/search", methods=["GET", "POST"])
def search_json():
    if request.method == "POST":
        data = request.get_json(force=True, silent=True) or {}
        user_query = data.get("query") or data.get("message") or data.get("prompt") or ""
    else:
        user_query = request.args.get("query")
    if not user_query:
        return {"error": "Missing query"}, 400

    final_response = run_elixposearch_pipeline(user_query)
    # Handle generator return value properly
    if hasattr(final_response, '__iter__') and not isinstance(final_response, str):
        try:
            last_value = None
            while True:
                last_value = next(final_response)
        except StopIteration as e:
            final_response = e.value
        except Exception:
            final_response = None

    return {"result": final_response or "Didn't Wait"}

@app.route("/search/v1/chat/completions", methods=["GET", "POST"])
def openai_chat_completions():
    if request.method == "POST":
        data = request.get_json(force=True, silent=True) or {}
        messages = data.get("messages", [])
    else:
        # For GET, allow ?query=... or ?message=...
        query = request.args.get("query") or request.args.get("message") or ""
        messages = [{"role": "user", "content": query}] if query else []

    if not messages or not isinstance(messages, list):
        return {"error": "Missing or invalid messages"}, 400

    user_query = ""
    for msg in reversed(messages):
        if msg.get("role") == "user":
            user_query = msg.get("content", "")
            break

    if not user_query:
        return {"error": "No user message found"}, 400

    final_response = run_elixposearch_pipeline(user_query)
    # Handle generator return value properly
    if hasattr(final_response, '__iter__') and not isinstance(final_response, str):
        try:
            last_value = None
            while True:
                last_value = next(final_response)
        except StopIteration as e:
            final_response = e.value
        except Exception:
            final_response = None

    return {
        "id": "chatcmpl-elixpo",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": "elixpo-search",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": final_response or ""
                },
                "finish_reason": "stop"
            }
        ]
    }


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, threaded=True)