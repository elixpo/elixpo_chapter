# Deep Research Pipeline - Quick Reference

## What Was Implemented

### 1. **deepSearchPipeline.py** - New Complete Module
   - Generates intelligent research plans with subqueries
   - Resolves each subquery independently with specialized tools
   - Saves results incrementally to JSON files
   - Streams completed subqueries via SSE in real-time
   - Provides final synthesis combining all findings

### 2. **Incremental JSON File Persistence**
   - Location: `/api/searchSessions/<request_id>/`
   - Schema maintained throughout: `<request_id>_planning.json`
   - Results appended immediately after each subquery resolution
   - Supports recovery from interruptions

### 3. **SSE Integration**
   - Each completed subquery yielded in real-time
   - Progress events with `<TASK>` blocks
   - OpenAI-compatible chunking format
   - Fallback mode for non-SSE clients (returns full file)

### 4. **<TASK> Block Formatting**
   - All planning elements wrapped in `<TASK>...</TASK>`
   - Query: `<TASK>Original query here</TASK>`
   - Subquery results: `<TASK>Subquery X: question text</TASK>`
   - Synthesis: `<TASK>Final Synthesis</TASK>`
   - Status: `<TASK>Status: completed</TASK>`

### 5. **API Endpoints Added**
   - `POST/GET /deep-research` - Start deep research (SSE stream)
   - `GET /deep-research/planning/<request_id>` - Retrieve planning file
   - `/search?query=...&deep=true&stream=true` - Unified endpoint

## File Structure Created

```
/api/
├── deepSearchPipeline.py          ← NEW: Main deep research module
├── deep_planning.py               ← EXISTING: Plan generation (imported)
├── searchPipeline.py              ← EXISTING: Tool execution (imported)
├── app.py                         ← MODIFIED: Added endpoints
└── searchSessions/
    ├── <request_id>/
    │   └── <request_id>_planning.json
    └── ...
```

## Usage

### Start Deep Research
```bash
curl -N "http://localhost:5000/deep-research?query=What%20are%20the%20latest%20AI%20breakthroughs?"
```

### Get Planning File After Completion
```bash
curl "http://localhost:5000/deep-research/planning/deep-a1b2c3d4"
```

### Through Main Search Endpoint
```bash
curl -N "http://localhost:5000/search?query=AI%20developments&deep=true&stream=true"
```

## JSON Schema

```json
{
  "request_id": "deep-xxxxx",
  "created_at": "ISO timestamp",
  "main_query": "User's query",
  "status": "planning|executing|synthesizing|completed|failed",
  
  "planning": {
    "main_query": "...",
    "max_tokens": 1500,
    "subqueries": [
      {
        "id": 1,
        "q": "Subquery text",
        "priority": "high|medium|low",
        "direct_response": true|false,
        "youtube": [...],
        "document": [...],
        "time_based_query": "timezone or null",
        "max_tokens": 800
      }
    ]
  },
  
  "results": {
    "1": {
      "subquery_id": 1,
      "result": "Research answer...",
      "completed_at": "ISO timestamp"
    }
  },
  
  "completed_tasks": ["1", "2", ...],
  "synthesis": "Final comprehensive answer...",
  "completed_at": "ISO timestamp"
}
```

## Key Features

### 1. Incremental Saving
```python
# Every subquery completion triggers:
save_planning_file(request_id, planning_data)
# File is updated with new results
```

### 2. Real-time SSE Yielding
```python
# When subquery completes:
yield format_sse("result", json.dumps({
    "subquery_id": 1,
    "query": "...",
    "result": "...",
    "completed_at": "..."
}))
```

### 3. TASK Block Formatting
```
<TASK>Query: What is AI?</TASK>

<TASK>Research Plan</TASK>
Total Subqueries: 2

<TASK>Subquery 1: What is artificial intelligence?</TASK>
[Result 1...]

<TASK>Final Synthesis</TASK>
[Comprehensive answer...]

<TASK>Status: completed</TASK>
```

## Query Types Handled

| Type | Tool | Example |
|------|------|---------|
| **Direct Response** | LLM only | "What is 1+1?" |
| **Web Search** | Web + LLM | "Latest AI news 2025" |
| **YouTube** | Transcription + LLM | Video summaries |
| **Documents** | Content fetch + LLM | PDF analysis |
| **Time Zone** | Timezone resolver | "Time in Tokyo" |
| **Combined** | Multiple tools | Complex queries |

## Response Flow

```
User → /deep-research
       ↓
    Plan Generation
       ↓
    For Each Subquery:
       ├─ Fetch Context (web/YouTube/docs)
       ├─ LLM Resolution
       ├─ Save to JSON
       └─ Stream via SSE ← Real-time updates!
       ↓
    Synthesis
       ↓
    Final Chunk (finish_reason: "stop")
```

## Testing the Pipeline

### 1. Simple Query
```bash
curl -N "http://localhost:5000/deep-research?query=What%20is%20quantum%20computing?"
```

### 2. Monitor Progress
```bash
# In another terminal, watch the file grow:
watch -n 1 'wc -c /api/searchSessions/deep-*/deep-*_planning.json | tail -1'
```

### 3. Retrieve Final Results
```bash
# After request completes, get full file:
curl "http://localhost:5000/deep-research/planning/deep-xxxxx" | jq '.'
```

### 4. Multi-Query Research
```bash
curl -N "http://localhost:5000/deep-research?query=Compare%20machine%20learning%20vs%20deep%20learning:%20definitions,%20use%20cases,%20and%20future%20trends"
```

## Logs & Monitoring

### View Logs
```bash
# From Docker
docker logs <container> | grep -i "deep\|research\|subquery"

# From Python
logger.info(f"Resolving subquery {subquery_id}")
```

### Check File Growth
```bash
# Watch a planning file grow in real-time:
tail -f /api/searchSessions/deep-xxxxx/deep-xxxxx_planning.json | jq '.'
```

## Error Handling

All errors are:
1. **Logged** with full context
2. **Persisted** in planning file with error field
3. **Reported** via SSE with `elixpo_meta.type = "error"`
4. **Non-blocking** - other subqueries continue

Example error result:
```json
{
  "1": {
    "result": "[ERROR] Web search timeout: ...",
    "completed_at": "..."
  }
}
```

## Performance Notes

- **Per subquery**: 10-30 seconds
- **3 subqueries**: 30-90 seconds  
- **YouTube transcription**: 30-60 seconds (slowest)
- **Web search**: 2-5 seconds
- **LLM synthesis**: 5-15 seconds

## Integration Checklist

- [x] deepSearchPipeline.py created with async/await support
- [x] Incremental JSON saving after each subquery
- [x] SSE streaming of completed results  
- [x] Schema preservation throughout execution
- [x] TASK block formatting in responses
- [x] Fallback mode for non-SSE clients
- [x] Planning file retrieval endpoint
- [x] Integration with main /search endpoint
- [x] Error handling and recovery
- [x] Full documentation provided

## Next Steps (Optional Enhancements)

1. **Parallel execution**: Process multiple subqueries simultaneously
2. **Caching**: Cache web search and transcription results
3. **Priority-based ordering**: Execute high-priority subqueries first
4. **Custom synthesis prompts**: User-defined synthesis instructions
5. **Result deduplication**: Remove redundant information
6. **Citation generation**: Automatic source attribution
7. **Multi-language**: Support queries and responses in different languages
8. **Advanced metrics**: Relevance scoring, confidence levels

## Support

For issues:
1. Check `/api/searchSessions/<request_id>/` for planning file
2. Review logs for error details
3. Verify all dependencies installed
4. Test with simple query first
5. Check available disk space for JSON files
