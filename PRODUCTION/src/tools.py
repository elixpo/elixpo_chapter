
tools = [
    {
        "type": "function",
        "function": {
            "name": "cleanQuery",
            "description": "Takes in a query, and returns a json object with the following keys: 'websites', 'youtube', and 'cleaned_query'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The initial raw query mentioned made by the user"},
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Performs a search using either Google, DuckDuckGo, or Mojeek based on the query and returns up to 5 result URLs as a list",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The search query string."}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_youtube_metadata",
            "description": "Retrieves the title and duration of a YouTube video from its URL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "The URL of the YouTube video."}
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_youtube_transcript",
            "description": "Fetches the transcript of a YouTube video, truncated if too long.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "The URL of the YouTube video."}
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_full_text",
            "description": "Fetches and parses a web page, extracting text, title, and up to three main images.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "The URL of the web page to fetch."}
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_timezone_and_offset",
            "description": "Returns the timezone and UTC offset for a given location.",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string", "description": "The location for which to get the timezone and offset."}
                },
                "required": ["location"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "convert_utc_to_local",
            "description": "Converts a UTC datetime to local time using a UTC offset string (e.g., 'UTC+05:30'). Returns the local time as a formatted string.",
            "parameters": {
            "type": "object",
            "properties": {
                "utc_datetime": {
                "type": "string",
                "description": "The UTC datetime in ISO 8601 format (e.g., '2024-06-01T12:00:00')."
                },
                "offset_str": {
                "type": "string",
                "description": "The UTC offset string (e.g., 'UTC+05:30' or 'UTC-04:00')."
                }
            },
            "required": ["utc_datetime", "offset_str"]
            }
        }
    }
]
