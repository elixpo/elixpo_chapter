from quart import Quart, request, jsonify, Response
from quart_cors import cors
import asyncio
import time
import random
import logging
import sys
from searchPipeline import run_elixposearch_pipeline


app = Quart(__name__)
app = cors(app, allow_origin="*")

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s', stream=sys.stdout)
app.logger.setLevel(logging.DEBUG)


@app.route("/search/sse", methods=["POST"])
async def search_sse():
    data = await request.get_json()
    user_query = data.get("query", "")
    event_id = f"elixpo-{int(time.time() * 1000)}-{random.randint(1000, 9999)}"
    app.logger.info(f"Received SSE search request: event_id={event_id}, query={user_query}")

    async def event_stream():
        for chunk in run_elixposearch_pipeline(user_query, event_id):
            yield chunk
            await asyncio.sleep(0.05)
        while True:
            yield ":\n\n"  # Ping
            await asyncio.sleep(30)

    return Response(event_stream(), content_type="text/event-stream")


from flask import jsonify, request
import asyncio


@app.route('/search', methods=['GET', 'POST'])
async def search_json():
    is_openai_chat_format = False

    if request.method == "POST":
        data = await request.get_json(force=True, silent=True) or {}
        user_query = ""
        messages = data.get("messages", [])
        if messages and isinstance(messages, list):
            for msg in reversed(messages):
                if msg.get("role") == "user":
                    user_query = msg.get("content", "").strip()
                    is_openai_chat_format = True
                    break

        if not user_query:
            user_query = data.get("query") or data.get("message") or data.get("prompt") or ""
    else:
        user_query = request.args.get("query", "").strip()

    if not user_query:
        return jsonify({"error": "Missing query"}), 400

    loop = asyncio.get_event_loop()
    generator = await loop.run_in_executor(None, lambda: run_elixposearch_pipeline(user_query))

    final_result_content = []
    final_response = None
    try:
        while True:
            chunk = next(generator)
            app.logger.debug(f"[DEBUG] Chunk: {chunk}")
            lines = chunk.splitlines()
            event_type = None
            data_lines = []

            for line in lines:
                if line.startswith("event:"):
                    event_type = line.replace("event:", "").strip()
                elif line.startswith("data:"):
                    data_lines.append(line.replace("data:", "").strip())

            data_text = "\n".join(data_lines)

            if data_text and event_type in ["final", "final-part"]:
                final_result_content.append(data_text)
    except StopIteration as e:
        final_response = e.value
    except Exception as e:
        app.logger.error(f"Error iterating generator: {e}", exc_info=True)
        final_response = None

    if not final_response:
        final_response = "\n".join(final_result_content).strip() or "Didn't Wait"

    app.logger.debug(f"Returning response for /search: {final_response}")

    if is_openai_chat_format:
        return jsonify([
            {
                "message": {
                    "role": "assistant",
                    "content": final_response
                }
            }
        ])

    return jsonify({"content": final_response})



@app.route("/v1/chat/completions", methods=["GET", "POST"])
async def openai_chat_completions():
    if request.method == "POST":
        data = await request.get_json(force=True, silent=True) or {}
        messages = data.get("messages", [])
        app.logger.info(f"POST /search/v1/chat/completions with body: {data}")
    else:
        query = request.args.get("query") or request.args.get("message") or ""
        messages = [{"role": "user", "content": query}] if query else []
        app.logger.info(f"GET /search/v1/chat/completions with query: {query}")

    if not messages or not isinstance(messages, list):
        app.logger.warning("Missing or invalid messages in /search/v1/chat/completions request")
        return jsonify({"error": "Missing or invalid messages"}), 400

    user_query = ""
    for msg in reversed(messages):
        if msg.get("role") == "user":
            user_query = msg.get("content", "")
            break

    if not user_query:
        app.logger.warning("No user message found in /search/v1/chat/completions request")
        return jsonify({"error": "No user message found"}), 400

    loop = asyncio.get_event_loop()
    generator = await loop.run_in_executor(None, lambda: run_elixposearch_pipeline(user_query))

    final_result_content = []
    final_response = None
    try:
        while True:
            chunk = next(generator)
            app.logger.debug(f"[DEBUG] Chunk: {chunk}")
            lines = chunk.splitlines()
            event_type = None
            data_lines = []

            for line in lines:
                if line.startswith("event:"):
                    event_type = line.replace("event:", "").strip()
                elif line.startswith("data:"):
                    data_lines.append(line.replace("data:", "").strip())

            data_text = "\n".join(data_lines)

            if data_text and event_type in ["final", "final-part"]:
                final_result_content.append(data_text)
    except StopIteration as e:
        final_response = e.value
    except Exception as e:
        app.logger.error(f"Error iterating generator in /search/v1/chat/completions: {e}", exc_info=True)
        final_response = None

    if not final_response:
        final_response = "\n".join(final_result_content).strip() or ""

    response = {
        "id": "chatcmpl-elixpo",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": "elixpo-search",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": final_response
                },
                "finish_reason": "stop"
            }
        ]
    }
    app.logger.debug(f"Returning response for /search/v1/chat/completions: {response}")
    return jsonify(response)

@app.route("/test", methods=["GET"])
async def test():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    import hypercorn.asyncio
    from hypercorn.config import Config
    config = Config()
    config.bind = ["0.0.0.0:5000"]
    config.use_reloader = False
    config.workers = 1
    asyncio.run(hypercorn.asyncio.serve(app, config))
