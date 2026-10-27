tools = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web. Use for real-time info: news, weather, prices, scores, current events.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query"
                    },
                    "search_depth": {
                        "type": "string",
                        "enum": ["quick", "standard", "thorough"],
                        "description": "quick=1-2 URLs, standard=2-5, thorough=4-10. Default: standard."
                    },
                    "freshness": {
                        "type": "string",
                        "enum": ["any", "day", "week", "month", "year"],
                        "description": "Recency window. Use day or week for latest news; default any."
                    },
                    "exclude_domains": {
                        "type": "array",
                        "items": {"type": "string"},
                        "maxItems": 10,
                        "description": "Domains to omit when they are low-quality or irrelevant."
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
            "description": "Fetch text content from a URL. Use on URLs from web_search results.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "URL to fetch"
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
            "description": "Get the current local date and time for a location. Use for direct time/timezone questions and whenever a location-specific request uses relative dates such as today, tomorrow, next N days, or this week. The returned local date anchors the requested range.",
            "parameters": {
                "type": "object",
                "properties": {
                    "location_name": {
                        "type": "string",
                        "description": "City or region name"
                    }
                },
                "required": ["location_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "image_search",
            "description": "Search for images by query.",
            "parameters": {
                "type": "object",
                "properties": {
                    "image_query": {
                        "type": "string",
                        "description": "Image search query"
                    },
                    "max_images": {
                        "type": "integer",
                        "description": "Max images to return",
                        "default": 10
                    }
                },
                "required": ["image_query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_image",
            "description": "Generate an image from a text prompt. Use only when user asks to create/generate/draw an image.",
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "Detailed prompt for image generation"
                    }
                },
                "required": ["prompt"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "transcribe_audio",
            "description": "Transcribe audio from a YouTube URL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "YouTube URL"
                    },
                    "full_transcript": {
                        "type": "boolean",
                        "description": "Full transcript or query-relevant extract"
                    },
                    "query": {
                        "type": "string",
                        "description": "Optional query to extract relevant parts"
                    }
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "youtubeMetadata",
            "description": "Fetch metadata from a YouTube URL (title, description, duration, views).",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "YouTube URL"
                    }
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_prompt_from_image",
            "description": "Generate a search prompt from an image URL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "imageURL": {
                        "type": "string",
                        "description": "Image URL to analyze"
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
            "description": "Answer a question about an image.",
            "parameters": {
                "type": "object",
                "properties": {
                    "imageURL": {
                        "type": "string",
                        "description": "Image URL"
                    },
                    "query": {
                        "type": "string",
                        "description": "Question about the image"
                    }
                },
                "required": ["imageURL", "query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_session_conversation_history",
            "description": "Retrieve conversation history for current session. Session ID is auto-detected. Use when user asks about past conversation, summary, or recap.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "export_to_pdf",
            "description": "Export the current response or provided content as a professionally formatted PDF document. Use when user asks to save, export, download, or create a PDF of the answer.",
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "Markdown content to export as PDF"
                    },
                    "title": {
                        "type": "string",
                        "description": "Title for the PDF document"
                    }
                },
                "required": ["content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "deep_research",
            "description": "Trigger multi-step deep research mode. Decomposes the query into sub-topics, researches each independently, and synthesizes a comprehensive answer. Use ONLY when the query is a genuine research question requiring investigation from multiple angles (e.g. comparative analysis across 3+ options, multi-domain impact studies, investigative deep dives into complex events). NEVER use for: PDF exports, summaries, recaps, image generation, simple lookups, single-topic questions, follow-up questions, or any request that can be handled by another tool.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The full research query to investigate in depth"
                    }
                },
                "required": ["query"]
            }
        }
    }
]
