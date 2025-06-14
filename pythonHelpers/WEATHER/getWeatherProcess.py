import requests
from datetime import datetime, timedelta

# Step 1: Get location coordinates from IP
def get_location_from_ip():
    try:
        res = requests.get("https://ipinfo.io/json")
        data = res.json()
        loc = data.get("loc")
        city = data.get("city")
        region = data.get("region")
        if loc:
            lat, lon = loc.split(",")
            return float(lat), float(lon), city, region
    except Exception:
        return None, None, None, None

# Step 2: Get 7-day forecast using Open-Meteo
def get_structured_weather(lat, lon, city):
    try:
        url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={lat}&longitude={lon}"
            f"&daily=temperature_2m_max,temperature_2m_min,weathercode"
            f"&current_weather=true&timezone=auto"
        )
        res = requests.get(url)
        if res.status_code != 200:
            return None

        data = res.json()
        current = data["current_weather"]
        daily = data["daily"]

        weather_codes = {
            0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
            45: "Fog", 48: "Depositing rime fog", 51: "Light drizzle", 53: "Moderate drizzle",
            55: "Dense drizzle", 61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
            71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow", 80: "Rain showers",
            81: "Moderate rain showers", 82: "Violent rain showers"
        }

        structured = {
            "location": city,
            "current": {
                "datetime": datetime.now().isoformat(),
                "temperature": int(current["temperature"]),
                "condition": weather_codes.get(current["weathercode"], "Unknown"),
                "wind_speed": current["windspeed"]
            },
            "forecast": []
        }

        for i in range(7):
            day = datetime.strptime(daily["time"][i], "%Y-%m-%d")
            structured["forecast"].append({
                "day": day.strftime("%A"),
                "date": daily["time"][i],
                "high": int(daily["temperature_2m_max"][i]),
                "low": int(daily["temperature_2m_min"][i]),
                "condition": weather_codes.get(daily["weathercode"][i], "Unknown")
            })

        return structured
    except Exception as e:
        print("Error parsing weather data:", e)
        return None

# Step 3: AI summary
def generate_ai_summary(structured_weather):
    if not structured_weather:
        return "Weather data is unavailable."

    current = structured_weather["current"]
    location = structured_weather["location"]
    forecast_lines = "\n".join(
        f"{f['day']} ({f['date']}): {f['condition']}, High: {f['high']}°C, Low: {f['low']}°C"
        for f in structured_weather["forecast"]
    )

    prompt = (
        f"The current weather in {location} is {current['condition']} at {current['temperature']}°C "
        f"with wind speed {current['wind_speed']} km/h.\n\n"
        f"Here's the 7-day forecast:\n{forecast_lines}\n\n"
        "Write a short, friendly summary."
    )

    url = "https://text.pollinations.ai/openai"
    headers = {"Content-Type": "application/json"}
    data = {
        "model": "openai",
        "messages": [
            {"role": "system", "content": "You're a weather reporter."},
            {"role": "user", "content": prompt}
        ],
        "token": "fEWo70t94146ZYgk",
        "referrer": "elixpoart",
        "seed": 42
    }

    response = requests.post(url, json=data, headers=headers)
    return response.json().get("choices", [{}])[0].get("message", {}).get("content", "No summary available.")

# --- Main usage ---
if __name__ == "__main__":
    lat, lon, city, region = get_location_from_ip()
    if city:
        print(f"Detected Location: {city}, {region} ({lat},{lon})")
        structured_weather = get_structured_weather(lat, lon, city)
        if structured_weather:
            print("Structured Weather Data:")
            print(structured_weather)
            print("\nAI Summary:")
            print(generate_ai_summary(structured_weather))
        else:
            print("Failed to fetch weather.")
    else:
        print("Could not determine your location.")
