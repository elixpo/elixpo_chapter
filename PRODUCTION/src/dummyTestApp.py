from quart import Quart, request, Response, jsonify
from hypercorn.config import Config
import hypercorn.asyncio
from quart_cors import cors
import asyncio
import json
import requests
from bs4 import BeautifulSoup

app = Quart(__name__)
app = cors(app, allow_origin="*")

async def sse_event_generator(response_data: dict):
    # Dummy intermediate steps
    steps = [
        "<TASK>surfing the web for latest info...</TASK>",
        "<TASK>analyzing multiple sources...</TASK>",
        "<TASK>understanding the context...</TASK>",
        "<TASK>summarizing insights...</TASK>",
        "<TASK>Well all done!</TASK>"
    ]

    for step in steps:
        await asyncio.sleep(0.25) 
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
                            """
                           The latest news from Nepal includes a variety of topics, as indicated by recent search results. While specific headlines require a direct look at news outlets, general themes often involve political developments, economic updates, and social issues. For instance, one search result points to recent protests in Kathmandu involving Gen Z, highlighting youth engagement in civic matters. Another result indicates that international news agencies like AP are covering events in Nepal, suggesting topics of broader significance are being reported.\n\nTo provide the most current and detailed news, it would be beneficial to check reputable Nepalese news sources directly. Websites such as `nepalnews.com` (in English) are excellent resources for up-to-date information on politics, business, features, opinions, sports, entertainment, climate, science, technology, weather, and travel within Nepal.\n\nHere are some sample images that represent current events or general scenes from Nepal:\n\n*   An image depicting a bustling street scene in Kathmandu, showcasing the vibrant city life.\n*   A photograph of a political rally or public gathering, possibly related to recent demonstrations or official events.\n*   A scenic view of Nepal's natural landscape, such as the Himalayas, reflecting the country's significant tourism appeal.\n*   An image related to infrastructure development or a community project, indicating progress and local initiatives.\n*   A picture of a cultural festival or traditional ceremony, representing Nepal's rich heritage.\n\nFor the most accurate and up-to-the-minute news, I recommend visiting the following sources:\n\n*   **NepalNews.com:** Provides comprehensive news coverage in English.\n*   **Associated Press (AP):** Offers international reporting that may include significant events from Nepal.\n\n**Related Images:**\n![Image](https://tse1.mm.bing.net/th/id/OIF.RGSB27sIPQTR88CCTlnGhA?pid=Api&P=0&h=220)\n![Image](https://tse4.mm.bing.net/th?id=OIF.%2bb%2bVjHJ6M1Quij8gywM5zw&pid=Api&P=0&h=220)\n![Image](https://tse1.mm.bing.net/th?id=OIF.q%2bklBqo2gCO8HEQu7yk81Q&pid=Api&P=0&h=220)\n![Image](https://tse2.mm.bing.net/th/id/OIF.Dh8q5mpzTOPilByRPW5uEg?pid=Api&P=0&h=220)\n![Image](https://tse1.mm.bing.net/th/id/OIF.ankDjgVKVfFhccw1g2t5Ag?pid=Api&P=0&h=220)\n\n\n---\n**Sources:**\n1. [https://apnews.com/article/nepal-gen-z-protests-army-kathmandu-2e4d9e835216b11fa238d7bcf8915cbf](https://apnews.com/article/nepal-gen-z-protests-army-kathmandu-2e4d9e835216b11fa238d7bcf8915cbf)\n2. [https://english.nepalnews.com/](https://english.nepalnews.com/)
                            """
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


@app.route("/metadata", methods=["GET"])
def get_metadata():
    if request.method == "GET":
        url = request.args.get("url")
    resp = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
    html = resp.text

    soup = BeautifulSoup(html, "html.parser")

    metadata = {
        "title": soup.title.string if soup.title else None,
        "description": soup.find("meta", attrs={"name": "description"})["content"]
            if soup.find("meta", attrs={"name": "description"}) else None,
        "og_title": soup.find("meta", property="og:title")["content"]
            if soup.find("meta", property="og:title") else None,
        "og_description": soup.find("meta", property="og:description")["content"]
            if soup.find("meta", property="og:description") else None,
        "og_image": soup.find("meta", property="og:image")["content"]
            if soup.find("meta", property="og:image") else None,
    }

    response = {
        "url": url,
        "metadata": metadata["description"]
    }

    return jsonify(response)

if __name__ == "__main__":
    config = Config()
    config.bind = ["0.0.0.0:5001"]
    config.use_reloader = False
    config.workers = 1
    config.backlog = 1000
    asyncio.run(hypercorn.asyncio.serve(app, config))
