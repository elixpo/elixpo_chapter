from quart import Quart, request, jsonify, Response
from hypercorn.config import Config
import hypercorn.asyncio
from quart_cors import cors
import asyncio

app = Quart(__name__)
app = cors(app, allow_origin="*")


@app.route("/test", methods=["POST", "GET"])
async def testResponse():
    if request.method == "POST":
        data = await request.get_json(force=True, silent=True) or {}
        getTestCode = data.get("code") == "X45110"
        if(getTestCode):
            return jsonify({
                "choices" : [
                    {
                        "message" : {
                            "role" : "assistant",
                            "content" : "as of Tuesday, September 9, 2025, here's the latest news from Nepal:\n\n**Major Political Unrest and Protests:**\n\n*   **Prime Minister Resigns Amidst Widespread Protests:** Prime Minister K. P. Sharma Oli resigned from his position on Tuesday, September 9, 2025. This resignation followed a period of intense mass protests and significant unrest across the country.\n*   **Violence and Arson:** The protests escalated to a point where protesters entered the parliament building and set it on fire. There are also reports of government ministers being attacked and their homes being targeted.\n*   **Gen Z-Led Movement:** A significant driving force behind the recent protests appears to be Nepal's Generation Z, who are expressing deep anger and dissatisfaction, demanding not only the Prime Minister's resignation but also broader systemic changes. Their sentiment is captured in slogans like \"Topple this government.\"\n*   **Airport Closure:** As a consequence of the unrest, the airport in Nepal was shut down, indicating the severity of the situation and its impact on daily life and national operations.\n*   **Social Media Restrictions:** In response to the ongoing protests and to manage information flow, there were reports of a social media ban being implemented.\n\n**Contextual Information:**\n\nThe news indicates a period of significant political instability in Nepal. The mass protests, seemingly fueled by a younger generation's demand for change, have led to a change in leadership and widespread disruption. The actions taken, such as setting fire to parliament and closing the airport, highlight the intensity of the public's dissatisfaction. The government's response, including a potential social media ban, suggests efforts to control the narrative and maintain order amidst the chaos.\n\nIt's important to note that this is a developing situation, and further updates would be necessary to understand the long-term implications of these events on Nepal's political landscape.\n\n---\n**Sources:**\n1. [https://english.nepalnews.com/](https://english.nepalnews.com/)\n2. [https://www.aljazeera.com/features/2025/9/9/we-want-mass-resignations-nepals-gen-z-anger-explodes-after-19-killed](https://www.aljazeera.com/features/2025/9/9/we-want-mass-resignations-nepals-gen-z-anger-explodes-after-19-killed)\n3. [https://www.aljazeera.com/news/liveblog/2025/9/9/nepal-protests-live-nepali-congress-office-top-leaders-homes-set-on-fire](https://www.aljazeera.com/news/liveblog/2025/9/9/nepal-protests-live-nepali-congress-office-top-leaders-homes-set-on-fire)\n4. [https://www.cnn.com/2025/09/09/asia/nepal-protests-social-media-ban-explainer-intl-hnk](https://www.cnn.com/2025/09/09/asia/nepal-protests-social-media-ban-explainer-intl-hnk)\n5. [https://www.firstpost.com/explainers/photos-videos-nepal-protests-gen-z-13932219.html](https://www.firstpost.com/explainers/photos-videos-nepal-protests-gen-z-13932219.html)"
                        }
                    }
                ]
            })
        else:
            return jsonify({
                "choices" : [
                    {
                        "message" : {
                            "role" : "assistant",
                            "content" : "oops some error occured"
                        }
                    }
                ]
            })
    else:
        getTestCode = request.args.get("code") == "X45110"
        if(getTestCode):
            return jsonify({
                "choices" : [
                    {
                        "message" : {
                            "role" : "assistant",
                            "content" : "as of Tuesday, September 9, 2025, here's the latest news from Nepal:\n\n**Major Political Unrest and Protests:**\n\n*   **Prime Minister Resigns Amidst Widespread Protests:** Prime Minister K. P. Sharma Oli resigned from his position on Tuesday, September 9, 2025. This resignation followed a period of intense mass protests and significant unrest across the country.\n*   **Violence and Arson:** The protests escalated to a point where protesters entered the parliament building and set it on fire. There are also reports of government ministers being attacked and their homes being targeted.\n*   **Gen Z-Led Movement:** A significant driving force behind the recent protests appears to be Nepal's Generation Z, who are expressing deep anger and dissatisfaction, demanding not only the Prime Minister's resignation but also broader systemic changes. Their sentiment is captured in slogans like \"Topple this government.\"\n*   **Airport Closure:** As a consequence of the unrest, the airport in Nepal was shut down, indicating the severity of the situation and its impact on daily life and national operations.\n*   **Social Media Restrictions:** In response to the ongoing protests and to manage information flow, there were reports of a social media ban being implemented.\n\n**Contextual Information:**\n\nThe news indicates a period of significant political instability in Nepal. The mass protests, seemingly fueled by a younger generation's demand for change, have led to a change in leadership and widespread disruption. The actions taken, such as setting fire to parliament and closing the airport, highlight the intensity of the public's dissatisfaction. The government's response, including a potential social media ban, suggests efforts to control the narrative and maintain order amidst the chaos.\n\nIt's important to note that this is a developing situation, and further updates would be necessary to understand the long-term implications of these events on Nepal's political landscape.\n\n---\n**Sources:**\n1. [https://english.nepalnews.com/](https://english.nepalnews.com/)\n2. [https://www.aljazeera.com/features/2025/9/9/we-want-mass-resignations-nepals-gen-z-anger-explodes-after-19-killed](https://www.aljazeera.com/features/2025/9/9/we-want-mass-resignations-nepals-gen-z-anger-explodes-after-19-killed)\n3. [https://www.aljazeera.com/news/liveblog/2025/9/9/nepal-protests-live-nepali-congress-office-top-leaders-homes-set-on-fire](https://www.aljazeera.com/news/liveblog/2025/9/9/nepal-protests-live-nepali-congress-office-top-leaders-homes-set-on-fire)\n4. [https://www.cnn.com/2025/09/09/asia/nepal-protests-social-media-ban-explainer-intl-hnk](https://www.cnn.com/2025/09/09/asia/nepal-protests-social-media-ban-explainer-intl-hnk)\n5. [https://www.firstpost.com/explainers/photos-videos-nepal-protests-gen-z-13932219.html](https://www.firstpost.com/explainers/photos-videos-nepal-protests-gen-z-13932219.html)"
                        }
                    }
                ]
            })
        else:
            return jsonify({
                "choices" : [
                    {
                        "message" : {
                            "role" : "assistant",
                            "content" : "oops some error occured"
                        }
                    }
                ]
            })





if __name__ == "__main__":
    config = Config()
    config.bind = ["0.0.0.0:5001"]
    config.use_reloader = False 
    config.workers = 1
    config.backlog = 1000
    asyncio.run(hypercorn.asyncio.serve(app, config)) 