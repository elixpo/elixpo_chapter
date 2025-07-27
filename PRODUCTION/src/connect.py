import requests
import json
import sseclient 

url = "http://localhost:5000/search/sse"
payload = {
    "model": "openai",
    "messages": [
        {"role": "user", "content": "what is the capital of France?"},
    ],
    "stream": True
}
headers = {
    "Content-Type": "application/json",
    "Accept": "text/event-stream"
}

try:
    response = requests.post(url, headers=headers, json=payload, stream=True)
    response.raise_for_status()

    client = sseclient.SSEClient(response)
    full_response = ""
    print("Streaming response:")
    for event in client.events():
        if event.data:
            try:
                # Handle potential '[DONE]' marker
                if event.data.strip() == '[DONE]':
                     print("\nStream finished.")
                     break
                chunk = json.loads(event.data)
                content = chunk.get('choices', [{}])[0].get('delta', {}).get('content')
                if content:
                    print(content, end='', flush=True)
                    full_response += content
            except json.JSONDecodeError:
                 print(f"\nReceived non-JSON data (or marker other than [DONE]): {event.data}")

    print("\n--- End of Stream ---")
    # print("Full streamed response:", full_response)

except requests.exceptions.RequestException as e:
    print(f"\nError during streaming request: {e}")
except Exception as e:
    print(f"\nError processing stream: {e}")
