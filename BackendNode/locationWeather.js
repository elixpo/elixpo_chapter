import fetch from 'node-fetch';
import process from 'process';

// Step 1: Get location coordinates from IP
async function getLocationFromIP() {
  const services = [
    ['https://ipwho.is/', data => data.success ? [data.latitude, data.longitude] : null],
    ['http://ip-api.com/json', data => data.status === 'success' ? [data.lat, data.lon] : null],
    ['https://ipinfo.io/json', data => data.loc ? data.loc.split(',').map(Number) : null],
    ['https://ipapi.co/json', data => data.latitude ? [data.latitude, data.longitude] : null]
  ];

  for (const [url, parser] of services) {
    try {
      const res = await fetch(url);
      const data = await res.json();
      const result = parser(data);
      if (result) return result;
    } catch (_) { }
  }
  return [null, null];
}

async function getLocation() {
  const args = process.argv;
  if (args.length >= 4) {
    try {
      return [parseFloat(args[2]), parseFloat(args[3])];
    } catch (_) { }
  }

  const lat = process.env.LAT;
  const lon = process.env.LON;
  if (lat && lon) {
    try {
      return [parseFloat(lat), parseFloat(lon)];
    } catch (_) { }
  }

  return await getLocationFromIP();
}

// Step 2: Reverse geocoding to get location name
async function getNearestLocationName(lat, lon) {
  let city = null, region = null;

  try {
    const geoRes = await fetch(`https://geocode.xyz/${lat},${lon}?json=1`);
    const geo = await geoRes.json();
    const gcCity = geo.city || geo.region || geo.prov;
    const gcState = geo.state || geo.country;
    if (gcCity && (!city || gcCity.length < city.length)) {
      city = gcCity;
      region = gcState;
    }
  } catch (_) { }

  try {
    const nomRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, {
      headers: { 'User-Agent': 'WeatherBot/1.0' }
    });
    const nom = await nomRes.json();
    const addr = nom.address || {};
    const nomCity = addr.city || addr.town || addr.village || addr.hamlet || addr.suburb || addr.municipality || addr.county || addr.state_district;
    const nomState = addr.state || addr.region || addr.country;
    city = nomCity;
    region = nomState;
  } catch (_) { }

  return [city, region];
}

// Step 3: Fetch weather data
async function getStructuredWeather(lat, lon, city) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weathercode&current_weather=true&timezone=auto`;
    const res = await fetch(url);
    const data = await res.json();

    const current = data.current_weather;
    const daily = data.daily;

    const weatherCodes = {
      0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
      45: "Fog", 48: "Depositing rime fog",
      51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
      56: "Light freezing drizzle", 57: "Dense freezing drizzle",
      61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
      66: "Light freezing rain", 67: "Heavy freezing rain",
      71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
      77: "Snow grains",
      80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
      85: "Slight snow showers", 86: "Heavy snow showers",
      95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail"
    };

    const structured = {
      location: city,
      current: {
        datetime: new Date().toISOString(),
        temperature: Math.round(current.temperature),
        condition: weatherCodes[current.weathercode] || "Unknown",
        wind_speed: current.windspeed
      },
      forecast: []
    };

    for (let i = 0; i < 7; i++) {
      structured.forecast.push({
        day: new Date(daily.time[i]).toLocaleDateString('en-US', { weekday: 'long' }),
        date: daily.time[i],
        high: Math.round(daily.temperature_2m_max[i]),
        low: Math.round(daily.temperature_2m_min[i]),
        condition: weatherCodes[daily.weathercode[i]] || "Unknown"
      });
    }

    return structured;
  } catch (err) {
    console.error("Error fetching weather data:", err);
    return null;
  }
}

// Step 4: AI Summary
async function generateAISummary(structuredWeather) {
  if (!structuredWeather) return "Weather data is unavailable.";

  const current = structuredWeather.current;
  const location = structuredWeather.location;
  const forecastLines = structuredWeather.forecast.map(f =>
    `${f.day} (${f.date}): ${f.condition}, High: ${f.high}°C, Low: ${f.low}°C`
  ).join('\n');

  const prompt = `The current weather in ${location} is ${current.condition} at ${current.temperature}°C with wind speed ${current.wind_speed} km/h.\n\nHere's the 7-day forecast:\n${forecastLines}\n\nWrite a short, friendly summary.`;
  
  const res = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai",
      messages: [
        { role: "system", content: "You're a weather reporter. Respond in proper markdown formatting with the weather summary, and a fun fact about the weather and the day!" },
        { role: "user", content: prompt }
      ],
      token: "fEWo70t94146ZYgk",
      referrer: "elixpoart",
      seed: 42
    })
   
  });
  const result = await res.json();
  return result.choices?.[0]?.message?.content || "No summary available.";
}

function generateAIImage(condition) {
  const payload = {
    prompt: `A watercolor illustration of ${condition} weather, 16:9 aspect ratio, max 512x512 pixels`,
    width: 512,
    height: 288,
    nologo: true,
    private: true,
    seed: 42,
    token: "fEWo70t94146ZYgk",
    referrer: "elixpoart"
  };
  const params = new URLSearchParams({
    width: payload.width,
    height: payload.height,
    nologo: payload.nologo,
    private: payload.private,
    seed: payload.seed,
    token: payload.token,
    referrer: payload.referrer,
    model: "turbo"
  });
  const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(payload.prompt)}?${params.toString()}`;
  return imageUrl;
}

export { getLocation, getNearestLocationName, getStructuredWeather, generateAISummary, generateAIImage}
