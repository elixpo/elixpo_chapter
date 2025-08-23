tools = [
    {
        "type": "function",
        "function": {
            "name": "cleanQuery",
            "description": "Clean and extract URLs from a search query",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query to clean"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web for information",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_full_text",
            "description": "Fetch full text content from a URL",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL to fetch content from"
                    }
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_youtube_metadata",
            "description": "Get metadata from a YouTube URL",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The YouTube URL"
                    }
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_youtube_transcript",
            "description": "Get transcript from a YouTube URL",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The YouTube URL"
                    }
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_local_time",
            "description": "Get local time for a specific location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location_name": {
                        "type": "string",
                        "description": "The location name"
                    }
                },
                "required": ["location_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_prompt_from_image",
            "description": "Generate a search prompt from an image URL",
            "parameters": {
                "type": "object",
                "properties": {
                    "imageURL": {
                        "type": "string",
                        "description": "The image URL to analyze"
                    }
                },
                "required": ["imageURL"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "replyFromImage",
            "description": "Reply to a query based on an image",
            "parameters": {
                "type": "object",
                "properties": {
                    "imageURL": {
                        "type": "string",
                        "description": "The image URL"
                    },
                    "query": {
                        "type": "string",
                        "description": "The query about the image"
                    }
                },
                "required": ["imageURL", "query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "image_search",
            "description": "Search for images based on a query",
            "parameters": {
                "type": "object",
                "properties": {
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
                "required": ["image_query"]
            }
        }
    }
]