# Elixpo Search Agent

![Elixpo Logo](https://github.com/user-attachments/assets/98fb5606-2466-49cc-836b-bc4cf088e283)

A Python-based web search and synthesis API that processes user queries, performs web and YouTube searches, scrapes content, and generates detailed Markdown answers with sources and images. Built for extensibility, robust error handling, and efficient information retrieval using modern async APIs and concurrency.

---

## Features

### 1. **Advanced Search & Synthesis**
- Accepts user queries and processes them using web search, YouTube transcript analysis, and AI-powered synthesis.
- Produces comprehensive Markdown responses with inline citations and images.
- Handles complex, multi-step queries with iterative tool use.

### 2. **Web Search & Scraping**
- Scrapes main text and images from selected URLs (after evaluating snippets).
- Avoids scraping irrelevant or search result pages.

### 3. **YouTube Integration**
- Extracts metadata and transcripts from YouTube videos.
- Presents transcripts as clean, readable text.

### 4. **AI-Powered Reasoning**
- Uses Pollinations API for LLM-based planning and synthesis.
- Iteratively calls tools (web search, scraping, YouTube, timezone) as needed.
- Gathers evidence from multiple sources before answering.

### 5. **REST API (Quart)**
- Exposes `/search` (JSON) and `/search/sse` (Server-Sent Events) endpoints.
- Supports both GET and POST requests, including OpenAI-compatible message format.
- CORS enabled for web front-ends.

### 6. **Concurrency & Performance**
- Uses async and thread pools for parallel web scraping and YouTube processing.
- Handles multiple requests efficiently.

---

## File Structure

- **`app.py`**  
  Main Quart API server. Handles `/search`, `/search/sse`, and OpenAI-compatible `/v1/chat/completions` endpoints. Manages async event streams and JSON responses.

- **`searchPipeline.py`**  
  Core pipeline logic. Orchestrates tool calls (web search, scraping, YouTube, timezone), interacts with Pollinations LLM API, and formats Markdown answers with sources and images.

- **Other modules:**  
  - `clean_query.py`, `search.py`, `scrape.py`, `getYoutubeDetails.py`, `tools.py`, `getTimeZone.py`: Tool implementations for query cleaning, web search, scraping, YouTube, and timezone handling.
  - `.env`: Environment variables for API tokens and model config.
  - `requirements.txt`: Python dependencies.
  - `Dockerfile`, `docker-compose.yml`: Containerization and deployment.

---

## Usage

### Prerequisites

- Python 3.12
- Install dependencies:
  ```bash
  pip install -r requirements.txt
  ```
- Set up `.env` with required API tokens.

### Running Locally

```bash
python app.py
```
- API available at `http://127.0.0.1:5000/search`

### Example API Queries

#### Simple POST (JSON)
```bash
curl -X POST http://localhost:5000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "What are the latest trends in AI research? Summarize this YouTube video https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

#### OpenAI-Compatible POST
```bash
curl -X POST http://localhost:5000/search \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Tell me about the history of the internet."}
    ]
  }'
```

#### SSE Streaming
```bash
curl -N -X POST http://localhost:5000/search/sse \
  -H "Content-Type: application/json" \
  -d '{"query": "weather in London tomorrow"}'
```

---

## API Endpoints

- **`/search`**  
  - `POST`/`GET`  
  - Accepts `{"query": "..."}`
  - Also supports OpenAI-style `{"messages": [...]}`

- **`/search/sse`**  
  - `POST`  
  - Streams results as Server-Sent Events (SSE)

- **`/v1/chat/completions`**  
  - OpenAI-compatible chat completions endpoint

---

## Configuration

- Set environment variables in `.env`:
  - `TOKEN`, `MODEL`, `REFERRER` for Pollinations API
- Adjust concurrency, scraping, and search parameters in `searchPipeline.py` as needed.

---

## Limitations

- Relies on Pollinations API for LLM responses (subject to their rate limits).
- Requires internet connectivity for search and scraping.
- YouTube transcript extraction depends on third-party services.

---
