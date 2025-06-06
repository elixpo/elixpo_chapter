# Web Search and Synthesis Module

This repository contains a Python-based web search and synthesis module designed to process user queries, perform web searches, scrape content, and synthesize detailed answers in Markdown format. The module is built for extensibility, robust error handling, and efficient information retrieval using modern APIs and libraries.

---

## Features

### 1. **Search and Synthesis**
- Accepts user queries and processes them using a combination of native knowledge, web search, and YouTube transcript analysis.
- Synthesizes a comprehensive Markdown response based on the retrieved information.
- Includes inline citations for transparency.

### 2. **Web Search**
- Uses the DuckDuckGo Search API to fetch search results.
- Filters and processes URLs to extract relevant content.

### 3. **Web Scraping**
- Scrapes text and images from websites while adhering to word count limits.
- Filters irrelevant images and avoids scraping search result pages.

### 4. **YouTube Integration**
- Extracts transcripts and metadata from YouTube videos.
- Handles common errors like unavailable transcripts or live streams.

### 5. **AI-Powered Planning and Synthesis**
- Uses AI models to plan query execution and synthesize final answers.
- Supports both classification and synthesis tasks with different AI models.

### 6. **REST API with Flask**
- Exposes a `/search` endpoint for programmatic access.
- Supports both GET and POST requests with query parameters.

### 7. **Rate Limiting and CORS**
- Protects the API with request limits using `Flask-Limiter`.
- Enables cross-origin requests for web front-ends.

---

## File Structure

### 1. `ai_search_agent_prod.py`
- **Main Backend Logic**: Implements the Flask API, search and synthesis orchestration, error handling, and AI integration.
- **Configuration**: Adjustable parameters for search results, scraping limits, concurrency, and retry logic.
- **Helper Functions**: URL extraction, YouTube transcript fetching, web scraping, and AI planning/synthesis utilities.
- **Concurrency**: Uses a thread pool and semaphore to handle multiple requests efficiently.

### 2. `index.html`
- **Front-End Interface**: Allows users to input queries, toggle server logs, and view synthesized Markdown responses rendered as HTML.
- **Dynamic Results Display**: Uses `marked.js` for Markdown rendering and provides status messages for user feedback.

### 3. `requirements.txt`
- Lists all required Python dependencies.

### 4. `Dockerfile`
- **Production-Ready Build**: Defines a minimal Python 3.12-based image.
- **Installs System Dependencies**: Includes build tools and `ffmpeg` for YouTube processing.
- **Copies Source Code and Installs Python Packages**.
- **Exposes Port 5000** and sets up the Flask app to run with `waitress-serve`.

### 5. `docker-compose.yml`
- **Service Definition**: Builds the Docker image and runs the container as `elixpo-search-proxy`.
- **Environment Variables**: Loads from `.env` and sets required Flask/Python settings.
- **Volume Mounts**: Maps a local `logs` directory for persistent logging.
- **Healthcheck**: Periodically checks the `/search` endpoint for readiness.
- **Port Mapping**: Exposes the API on port 5000.

---

## Usage

### Prerequisites
- Python 3.8 or higher (Python 3.12 recommended for Docker)
- Required libraries: see `requirements.txt`
- Docker (optional, for containerized deployment)

Install dependencies using:
```bash
pip install -r requirements.txt
```

### Running Locally

1. Start the Flask API:
    ```bash
    python ai_search_agent_prod.py
    ```
2. The server will start at `http://127.0.0.1:5000/search`.

3. You can send queries via the front-end (`index.html`) or directly using tools like `curl` or Postman.

#### Example Query via API
```bash
curl -X POST http://127.0.0.1:5000/search \
-H "Content-Type: application/json" \
-d '{"query": "What are the latest trends in AI research? Summarize this YouTube video https://www.youtube.com/watch?v=dQw4w9WgXcQ", "show_logs": false, "show_images": false, "show_sources": true}'
```

### Running with Docker

1. Build and run the service using Docker Compose:
    ```bash
    docker-compose up --build
    ```
2. The API will be available at `http://localhost:5000/search`.

---

## Configuration

You can adjust the following parameters in `ai_search_agent_prod.py`:
- `MAX_SEARCH_RESULTS_PER_QUERY`: Number of search results to fetch.
- `MAX_SCRAPE_WORD_COUNT`: Maximum word count per scraped page.
- `MAX_IMAGES_TO_INCLUDE`: Number of images to include in the output.
- `MAX_CONCURRENT_REQUESTS`: Maximum simultaneous requests handled by the API.
- AI models for classification and synthesis.

Environment variables can be set in a `.env` file for API tokens and other secrets.

---

## CURL Queries 

### Root Endpoint / (GET)
```bash
curl https://search.pollinations.ai/
```

### Search Endpoint /search (GET)
```bash
# Basic GET request with just the query
curl "https://search.pollinations.ai/search?query=weather in London tomorrow"

# GET request with specific parameters
curl "https://search.pollinations.ai/search?query=latest news on AI&show_sources=false&show_images=true&show_logs=true"
```

### Search Endpoint /search (POST - Old/Custom JSON Format)
```bash
# Basic POST request with just the query JSON
curl -X POST https://search.pollinations.ai/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "how tall is mount everest"}'

# POST request with specific parameters in JSON
curl -X POST https://search.pollinations.ai/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "explain quantum computing", "show_sources": true, "show_images": false}'
```

### Search Endpoint /search (POST - OpenAI-compatible JSON Format)
```bash
# Basic POST request with messages array
curl -X POST https://search.pollinations.ai/search \
  -H 'Content-Type: application/json' \
  -d '{
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "What is the capital of France?"}
    ]
  }'

# POST request with messages and specific parameters in JSON
curl -X POST https://search.pollinations.ai/search \
  -H 'Content-Type: application/json' \
  -d '{
    "messages": [
      {"role": "user", "content": "Tell me about the history of the internet."}
    ],
    "show_sources": true,
    "show_images": true
  }'
```

### Special Query: `pollinations_test`
```bash
# Test via GET
curl "https://search.pollinations.ai/search?query=pollinations_test"

# Test via POST (Old/Custom JSON)
curl -X POST https://search.pollinations.ai/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "pollinations_test"}'

# Test via POST (OpenAI-compatible JSON)
curl -X POST https://search.pollinations.ai/search \
  -H 'Content-Type: application/json' \
  -d '{
    "messages": [
      {"role": "user", "content": "pollinations_test"}
    ]
  }'
```

## Limitations

- Relies on Pollinations APIs for AI model endpoints and is subject to their rate limits or restrictions.
- Requires internet connectivity for web search and scraping.
- Some features (e.g., YouTube transcript extraction) depend on third-party services and may be affected by their availability.

---

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.



