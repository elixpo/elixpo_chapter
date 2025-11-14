tools = [
    {
        "type": "function",
        "function": {
            "name": "cleanQuery",
            "description": "Clean and extract URLs from a search query",
            "parameters": {
                "query": {
                    "type": "string",
                    "description": "The search query to clean"
                }
            },
            "strict": False
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web for information",
            "parameters": {
                "query": {
                    "type": "string",
                    "description": "The search query"
                }
            },
            "strict": False
        }
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_full_text",
            "description": "Fetch full text content from a URL",
            "parameters": {
                "url": {
                    "type": "string",
                    "description": "The URL to fetch content from"
                }
            },
            "strict": False
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_youtube_metadata",
            "description": "Get metadata from a YouTube URL",
            "parameters": {
                "url": {
                    "type": "string",
                    "description": "The YouTube URL"
                }
            },
            "strict": False
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_youtube_transcript",
            "description": "Get transcript from a YouTube URL",
            "parameters": {
                "url": {
                    "type": "string",
                    "description": "The YouTube URL"
                }
            },
            "strict": False
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_local_time",
            "description": "Get local time for a specific location",
            "parameters": {
                "location_name": {
                    "type": "string",
                    "description": "The location name"
                }
            },
            "strict": False
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_prompt_from_image",
            "description": "Generate a search prompt from an image URL",
            "parameters": {
                "imageURL": {
                    "type": "string",
                    "description": "The image URL to analyze"
                }
            },
            "strict": False
        }
    },
    {
        "type": "function",
        "function": {
            "name": "replyFromImage",
            "description": "Reply to a query based on an image",
            "parameters": {
                "imageURL": {
                    "type": "string",
                    "description": "The image URL"
                },
                "query": {
                    "type": "string",
                    "description": "The query about the image"
                }
            },
            "strict": False
        }
    },
    {
        "type": "function",
        "function": {
            "name": "image_search",
            "description": "Search for images based on a query",
            "parameters": {
                "image_query": {
                    "type": "string",
                    "description": "The image search query"
                },
                "max_images": {
                    "type": "integer",
                    "description": "Maximum number of images to return",
                    "default": 10
                }
            },
            "strict": False
        }
    }
]