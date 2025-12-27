# Deep Research Pipeline Documentation

## Overview

The deep research pipeline is a comprehensive research system that breaks down complex queries into focused subqueries, resolves each independently with specialized research tools, and synthesizes findings into a coherent response. Results are persisted to JSON files and streamed via Server-Sent Events (SSE) for real-time progress updates.

## Features

### 1. **Incremental JSON Persistence**
- Planning data is saved immediately after each subquery completion
- Maintains strict JSON schema throughout execution
- Each planning file stores:
  - Main query and metadata
  - Generated research plan with subqueries
  - Incremental results as they are resolved
  - Final synthesis

### 2. **Streaming Results via SSE**
- Real-time subquery completion events
- Structured JSON metadata for each result
- Progress tracking and task monitoring
- Fallback support for non-SSE clients

### 3. **Schema-Preserved JSON Structure**
```json
{
  "request_id": "deep-xxxxx",
  "created_at": "2025-12-27T...",
  "main_query": "User's original query",
  "planning": {
    "main_query": "...",
    "max_tokens": 1500,
    "subqueries": [
      {
        "id": 1,
        "q": "Subquery text",
        "priority": "high",
        "direct_response": true,
        "max_tokens": 800
      }
    ]
  },
  "subqueries": [...],
  "results": {
    "1": {
      "subquery_id": 1,
      "result": "Research result text...",
      "completed_at": "2025-12-27T..."
    }
  },
  "completed_tasks": ["1", "2", "3"],
  "synthesis": "Final synthesized response...",
  "status": "completed|executing|planning|failed",
  "completed_at": "2025-12-27T..."
}
```

## API Endpoints

### 1. Deep Research Endpoint
**POST/GET** `/deep-research`

Initiates a deep research request with streaming results.

**Parameters:**
- `query` (string, required): The research query
- `request_id` (string, optional): Custom request ID. If not provided, auto-generated as `deep-xxxxx`

**Example:**
```bash
curl -N "http://localhost:5000/deep-research?query=What%20are%20the%20latest%20developments%20in%20AI%3F"
```

**Response:** Server-Sent Events stream with OpenAI-compatible chunks

```json
data: {
  "id": "chatcmpl-xxxxx",
  "object": "chat.completion.chunk",
  "created": 1234567890,
  "model": "elixpo-deep-research",
  "choices": [{
    "index": 0,
    "delta": {
      "role": "assistant",
      "content": "<TASK>Creating research plan</TASK>...",
      "elixpo_meta": {
        "type": "subquery_result",
        "subquery_id": 1
      }
    },
    "finish_reason": null
  }]
}
```

### 2. Retrieve Planning File
**GET** `/deep-research/planning/<request_id>`

Fetch the completed planning file with all results.

**Example:**
```bash
curl "http://localhost:5000/deep-research/planning/deep-a1b2c3d4"
```

**Response:** Complete JSON planning file

## How It Works

### Step 1: Query Planning
1. User submits a complex query to `/deep-research`
2. LLM analyzes query and generates structured plan
3. Plan includes 2+ focused subqueries with metadata:
   - Priority levels (high/medium/low)
   - Query type (direct response vs. research-intensive)
   - Resource requirements (YouTube transcription, document fetching, etc.)
   - Token budgets

### Step 2: Subquery Resolution
1. For each subquery in sequence:
   - Check for special requirements (YouTube URLs, documents, time zones)
   - Fetch necessary context (transcripts, web search, document content)
   - Use LLM to generate comprehensive answer
   - Save result to JSON file immediately
   - Yield result via SSE (if active)

### Step 3: Result Yielding via SSE
As each subquery completes:
```json
{
  "subquery_id": 1,
  "query": "What is the current understanding of AI capabilities?",
  "result": "Detailed research result...",
  "completed_at": "2025-12-27T10:30:45Z"
}
```

### Step 4: Final Synthesis
1. Collect all subquery results
2. Create comprehensive synthesis combining findings
3. Format response with `<TASK>` blocks for structure
4. Save complete planning file
5. Send final chunk via SSE

### Step 5: Fallback for Non-SSE Clients
If SSE is not active (no `event_id`):
- All processing happens server-side
- Complete planning file returned at the end
- No real-time updates

## File Storage

Planning files are stored in: `/api/searchSessions/<request_id>/`

Structure:
```
searchSessions/
└── deep-a1b2c3d4/
    └── deep-a1b2c3d4_planning.json
```

## Query Types Supported

### Direct Response Queries
```json
{
  "id": 1,
  "q": "What is 1+1?",
  "direct_response": true,
  "max_tokens": 100
}
```
✓ Answered directly by LLM without web search

### Web Search Queries
```json
{
  "id": 2,
  "q": "What are the latest AI developments in 2025?",
  "direct_response": false,
  "max_tokens": 800
}
```
✓ Requires web search for current information

### YouTube Queries
```json
{
  "id": 3,
  "q": "Summarize the video content",
  "youtube": [
    {
      "url": "https://www.youtube.com/watch?v=xxx",
      "full_text": true
    }
  ],
  "max_tokens": 800
}
```
✓ Transcribes YouTube video and answers based on transcript

### Document Queries
```json
{
  "id": 4,
  "q": "What is the main topic?",
  "document": [
    {
      "url": "https://example.com/doc.pdf",
      "query": "Extract specific information"
    }
  ],
  "max_tokens": 800
}
```
✓ Fetches document content and answers queries

### Time-Based Queries
```json
{
  "id": 5,
  "q": "What is the current time in Tokyo?",
  "time_based_query": "Asia/Tokyo",
  "max_tokens": 100
}
```
✓ Uses timezone information for time-specific queries

## Format of Final Response

The final response comes formatted in `<TASK>` blocks:

```markdown
<TASK>Query: What are the latest developments in AI and their applications in healthcare?</TASK>

<TASK>Research Plan</TASK>
Total Subqueries: 3
Max Tokens Budget: 1500

<TASK>Subquery 1: What are the current cutting-edge AI developments as of 2025?</TASK>
[Detailed research result 1...]

<TASK>Subquery 2: How is AI being applied in modern healthcare systems?</TASK>
[Detailed research result 2...]

<TASK>Subquery 3: What are the future implications of AI in healthcare?</TASK>
[Detailed research result 3...]

<TASK>Final Synthesis</TASK>
[Comprehensive synthesis combining all findings...]

<TASK>Status: completed</TASK>
Completed At: 2025-12-27T10:35:22Z
```

## Integration with Search Endpoint

The `/search` endpoint also supports deep research via the `deep` parameter:

**Standard Search:**
```bash
curl "http://localhost:5000/search?query=What%20is%20AI&stream=true"
```

**Deep Research:**
```bash
curl "http://localhost:5000/search?query=What%20is%20AI&deep=true&stream=true"
```

When `deep=true`, the request is automatically routed to the deep research pipeline.

## Error Handling

### Graceful Degradation
- If web search fails: Uses LLM knowledge
- If YouTube transcription fails: Logs error and continues
- If synthesis fails: Returns individual results with error note

### Status Tracking
- `planning`: Initial plan generation
- `executing`: Resolving subqueries
- `synthesizing`: Creating final synthesis
- `completed`: Successfully finished
- `completed_with_errors`: Finished with some failures
- `failed`: Critical failure occurred

## Performance Characteristics

- **Single subquery**: 10-30 seconds
- **3 subqueries**: 30-90 seconds
- **Complex deep research**: 2-5 minutes

Factors affecting performance:
- Query complexity
- Number of subqueries
- YouTube transcription (slowest operation)
- Document size and fetching time
- LLM response latency

## Usage Examples

### Example 1: Technology Research
```bash
curl -N "http://localhost:5000/deep-research?query=Explain%20quantum%20computing%20breakthroughs%20in%202025%20and%20their%20applications"
```

### Example 2: With Custom Request ID
```bash
curl -N "http://localhost:5000/deep-research?query=How%20do%20transformer%20models%20work&request_id=my-research-001"
```

### Example 3: Retrieve Results Later
```bash
# Step 1: Start research (note the request_id)
curl -N "http://localhost:5000/deep-research?query=research%20topic"

# Step 2: Retrieve planning file
curl "http://localhost:5000/deep-research/planning/deep-a1b2c3d4"
```

## Best Practices

1. **Use meaningful queries**: More specific queries generate better subqueries
2. **Monitor progress**: SSE events provide real-time updates
3. **Retrieve planning file**: Always fetch the planning file for audit trail
4. **Handle timeouts**: Set appropriate client-side timeouts (180+ seconds)
5. **Parse results carefully**: Use the `elixpo_meta` field for structured data

## Troubleshooting

### Request Hangs
- Check server logs: `docker logs <container>`
- Verify query is not too complex
- Check server resources (CPU, memory)

### Missing Results
- Verify request_id is correct
- Check `/api/searchSessions/` directory
- View planning file for status

### Empty Subquery Results
- Check if LLM response was truncated
- Verify token budget was sufficient
- Review error logs in planning file

## Architecture Diagram

```
User Query
    ↓
    └─→ /deep-research endpoint
         ↓
         └─→ generate_plan() - Create structured plan with subqueries
              ↓
              └─→ For each subquery:
                   ├─→ emit_event("INFO", progress)
                   ├─→ Fetch context (web search, YouTube, docs, etc.)
                   ├─→ resolve_subquery() - LLM generates answer
                   ├─→ update_subquery_result() - Save to JSON
                   ├─→ emit_event("result", ...) - Stream via SSE
                   ↓
              └─→ Synthesis - Combine all results
                   ↓
                   └─→ format_planning_response() - Format with <TASK> blocks
                        ↓
                        └─→ emit_event("final", ...) - Stream final result
                             ↓
                             └─→ Client receives SSE chunks

Parallel: save_planning_file() after each update
         (maintains schema, incremental persistence)
```

## Integration with Frontend

The frontend should:
1. Connect to `/deep-research` with SSE
2. Parse JSON chunks from `delta.content`
3. Check `delta.elixpo_meta.type === "subquery_result"` for completed subqueries
4. Show progress updates from `INFO` events
5. Wait for `finish_reason === "stop"` to end stream

## Advanced Configuration

### Token Budget Allocation
Controlled via planning LLM:
- Lower complexity queries: More tokens per subquery
- Higher complexity: Distributed across more subqueries
- Total budget: Usually 1500-3000 tokens

### Timeout Settings
Server-side:
- LLM call: 60 seconds
- YouTube transcription: 120 seconds
- Document fetch: 10 seconds
- Overall request: 180 seconds

## Future Enhancements

Planned features:
- Parallel subquery resolution
- Multi-language support
- Custom synthesis prompts
- Result deduplication
- Relevance scoring
- Citation management
