from quart import Quart, request, Response
from hypercorn.config import Config
import hypercorn.asyncio
from quart_cors import cors
import asyncio
import json

app = Quart(__name__)
app = cors(app, allow_origin="*")

async def sse_event_generator(response_data: dict):
    # Dummy intermediate steps
    steps = [
        "<TASK>surfing the web for latest info...</TASK>",
        "<TASK>analyzing multiple sources...</TASK>",
        "<TASK>understanding the context...</TASK>",
        "<TASK>summarizing insights...</TASK>"
    ]

    for step in steps:
        await asyncio.sleep(1)  # simulate processing delay
        yield f"data: {json.dumps({'status': step})}\n\n"

    # Final response
    await asyncio.sleep(1)
    yield f"data: {json.dumps(response_data)}\n\n"
    yield "event: end\ndata: done\n\n"  # signal end of stream


@app.route("/test", methods=["POST", "GET"])
async def testResponse():
    if request.method == "POST":
        data = await request.get_json(force=True, silent=True) or {}
        getTestCode = data.get("code") == "X45110"
    else:
        getTestCode = request.args.get("code") == "X45110"

    if getTestCode:
        response = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": (
                            "as of Tuesday, September 9, 2025, here's the latest news from Nepal:\n\n"
                            "**Major Political Unrest and Protests:**\n\n"
                            "*   **Prime Minister Resigns Amidst Widespread Protests**\n"
                            "*   **Violence and Arson**\n"
                            "*   **Gen Z-Led Movement**\n"
                            "*   **Airport Closure**\n"
                            "*   **Social Media Restrictions**"
                        )
                    }
                }
            ]
        }
    else:
        response = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "oops some error occured"
                    }
                }
            ]
        }

    return Response(sse_event_generator(response), mimetype="text/event-stream")


if __name__ == "__main__":
    config = Config()
    config.bind = ["0.0.0.0:5001"]
    config.use_reloader = False
    config.workers = 1
    config.backlog = 1000
    asyncio.run(hypercorn.asyncio.serve(app, config))
