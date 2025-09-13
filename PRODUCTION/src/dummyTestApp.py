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
        await asyncio.sleep(1) 
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
                            Germany is currently experiencing a mixed economic landscape. Recent reports indicate that the country's GDP contraction 
                            in the second quarter was worse than initially expected. This downturn has been a significant concern, particularly as it
                              follows a period that was expected to see some boost.\n\nEconomically, Germany has been grappling with several 
                              challenges. Despite efforts to stimulate growth, the overall economic performance has been sluggish. The impact of 
                              global economic trends, including inflation and supply chain disruptions, continues to be felt. There have been 
                              discussions among lawmakers about the need for increased investment, particularly in areas like air defense, which 
                              could have broader economic implications.\n\nOn a brighter note, the German basketball team is 
                              enjoying a \"golden era,\" achieving significant success. This is a positive development that has captured public 
                              attention and brought a sense of national pride.\n\nIn terms of policy and social issues, there has been a notable
                                sharp drop in asylum applications. This suggests a potential shift in migration patterns or policy effectiveness,
                                  and it is a trend that is being closely monitored. Additionally, a cultural event, a festival, had to address a 
                                  controversy regarding the dropping of a German orchestra due to the involvement of an Israeli conductor. 
                                  This highlights ongoing discussions and sensitivities surrounding international relations within cultural 
                                  spheres.\n\nWhile the economic outlook presents challenges, these developments in sports, social policy, and 
                                  cultural events paint a more nuanced picture of the current situation in Germany.
                                  \n\n---\n**Sources:**\n
                                  1. [https://apnews.com/article/germany-economy-gdp-shrank-second-quarter-ed5a0ca6732d3cf92828e045144defc2](https://apnews.com/article/germany-economy-gdp-shrank-second-quarter-ed5a0ca6732d3cf92828e045144defc2)\n
                                  2. [https://www.deutschland.de/en/news](https://www.deutschland.de/en/news)\n
                                  3. [https://www.dw.com/en/germany/s-1432](https://www.dw.com/en/germany/s-1432)\n
                                  4. [https://www.euronews.com/business/2025/08/22/germanys-gdp-contraction-worse-than-expected-after-tariff-boost](https://www.euronews.com/business/2025/08/22/germanys-gdp-contraction-worse-than-expected-after-tariff-boost)\n
                                  5. [https://www.newsworm.de/](https://www.newsworm.de/)
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
