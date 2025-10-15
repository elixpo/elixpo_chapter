# Elixpo Art Generator API Integration Guide

This guide provides detailed information about integrating with the Elixpo Art Generator API, making it easier for developers to build applications that leverage our AI art generation capabilities.

## Table of Contents
1. [Authentication](#authentication)
2. [API Endpoints](#api-endpoints)
3. [Rate Limiting](#rate-limiting)
4. [Error Handling](#error-handling)
5. [Code Examples](#code-examples)
6. [Best Practices](#best-practices)

## Authentication

### Getting Started
1. Register for an API key at the [Elixpo Developer Portal](https://art.elixpo.ai/developers)
2. Include your API key in all requests using the `X-API-Key` header

Example:
```javascript
const headers = {
    'X-API-Key': 'your_api_key_here',
    'Content-Type': 'application/json'
};
```

## API Endpoints

### 1. Generate Art
Generate AI artwork based on text prompts.

```http
POST /api/v1/generate
Content-Type: application/json
X-API-Key: your_api_key_here

{
    "prompt": "A sunset over a cyberpunk city",
    "style": "realistic",
    "dimensions": {
        "width": 1024,
        "height": 1024
    },
    "parameters": {
        "guidance_scale": 7.5,
        "num_inference_steps": 50
    }
}
```

### 2. List Styles
Get available art styles.

```http
GET /api/v1/styles
X-API-Key: your_api_key_here
```

### 3. Get Generation Status
Check the status of an art generation request.

```http
GET /api/v1/status/:jobId
X-API-Key: your_api_key_here
```

## Rate Limiting

- Free tier: 50 requests per hour
- Pro tier: 500 requests per hour
- Enterprise tier: Custom limits

Rate limit headers are included in all responses:
```http
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1634567890
```

## Error Handling

The API uses standard HTTP status codes and returns detailed error messages:

```json
{
    "error": {
        "code": "invalid_parameters",
        "message": "Invalid image dimensions provided",
        "details": {
            "width": "Must be between 256 and 1024 pixels",
            "height": "Must be between 256 and 1024 pixels"
        }
    }
}
```

Common error codes:
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 429: Too Many Requests
- 500: Internal Server Error

## Code Examples

### JavaScript/Node.js
```javascript
async function generateArtwork(prompt) {
    const response = await fetch('https://api.art.elixpo.ai/v1/generate', {
        method: 'POST',
        headers: {
            'X-API-Key': process.env.ELIXPO_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            prompt,
            style: 'realistic',
            dimensions: { width: 1024, height: 1024 }
        })
    });

    const data = await response.json();
    return data.jobId;
}
```

### Python
```python
import requests

def generate_artwork(prompt):
    url = "https://api.art.elixpo.ai/v1/generate"
    headers = {
        "X-API-Key": "your_api_key_here",
        "Content-Type": "application/json"
    }
    payload = {
        "prompt": prompt,
        "style": "realistic",
        "dimensions": {"width": 1024, "height": 1024}
    }
    
    response = requests.post(url, json=payload, headers=headers)
    return response.json()["jobId"]
```

## Best Practices

1. **Error Handling**
   - Always implement proper error handling
   - Check rate limits before making requests
   - Implement exponential backoff for retries

2. **Performance**
   - Cache API responses when possible
   - Use webhook callbacks for long-running generations
   - Implement request queuing for batch processing

3. **Security**
   - Never expose your API key in client-side code
   - Implement proper input validation
   - Use HTTPS for all API calls

4. **Resource Management**
   - Clean up temporary files after processing
   - Implement proper timeout handling
   - Monitor API usage and set up alerts

## Webhooks Integration

For long-running art generation tasks, we recommend using webhooks:

1. Register a webhook URL:
```http
POST /api/v1/webhooks
Content-Type: application/json
X-API-Key: your_api_key_here

{
    "url": "https://your-app.com/webhooks/art-complete",
    "events": ["generation.complete", "generation.failed"]
}
```

2. Receive webhook notifications:
```javascript
// Example Express.js webhook handler
app.post('/webhooks/art-complete', (req, res) => {
    const { event, jobId, result } = req.body;
    if (event === 'generation.complete') {
        // Process completed artwork
        console.log(`Artwork ${jobId} is ready:`, result.url);
    }
    res.sendStatus(200);
});
```