import requests
import json

url = "https://text.pollinations.ai/openai"
headers = {"Content-Type": "application/json"}

# Initial messages from the conversation
messages = [{"role": "user", "content": "What's the weather in Tokyo?"}]

# Definition of the tool(s) your application exposes to the AI model
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_current_weather",
            "description": "Get the current weather in a given location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string", "description": "The city and state, e.g. San Francisco, CA"},
                    "unit": {"type": "string", "enum": ["celsius", "fahrenheit"], "default": "celsius"}
                },
                "required": ["location"]
            }
        }
    }
]

# Payload for the initial API call
payload = {
    "model": "openai", # The model must support function calling
    "messages": messages,
    "tools": tools,
    "tool_choice": "auto" # Allows the model to decide whether to call a tool or respond directly
                         # Can also be set to force a specific tool: {"type": "function", "function": {"name": "get_current_weather"}}
}

# --- YOUR FUNCTION IMPLEMENTATION ---
# This function simulates fetching weather data. In a real application,
# it would make an actual API call to a weather service.
def execute_get_current_weather(location, unit="celsius"):
    print(f"\n--- Executing get_current_weather(location='{location}', unit='{unit}') ---")
    # Dummy response based on location
    if "tokyo" in location.lower():
        return json.dumps({"location": location, "temperature": "15", "unit": unit, "description": "Cloudy"})
    else:
        return json.dumps({"location": location, "temperature": "unknown"})
# --- END OF YOUR FUNCTION IMPLEMENTATION ---

try:
    print("--- First API Call (User Request) ---")
    response = requests.post(url, headers=headers, json=payload)
    response.raise_for_status()

    # Parse the JSON response from the first API call
    response_data = response.json()

    # Check if the model decided to call a tool
    if response_data.get("choices", [{}])[0].get("message", {}).get("tool_calls"):
        print("\n--- Model requested tool call ---")
        # Assuming only one tool call for simplicity; iterate tool_calls for multiple
        tool_call = response_data["choices"][0]["message"]["tool_calls"][0] 
        function_name = tool_call["function"]["name"]
        function_args = json.loads(tool_call["function"]["arguments"])

        if function_name == "get_current_weather":
            # Call your actual backend function with arguments provided by the model
            function_response_content = execute_get_current_weather(
                location=function_args.get("location"),
                unit=function_args.get("unit", "celsius") # Handle default value
            )

            # Append the assistant's request (with tool_calls) to the message history
            messages.append(response_data["choices"][0]["message"]) 
            # Append the tool's response to the message history
            messages.append(
                {
                    "tool_call_id": tool_call["id"], # Crucial for linking tool call to its result
                    "role": "tool",
                    "name": function_name,
                    "content": function_response_content, # The actual result from your executed function
                }
            )

            # --- Second API Call (With Function Result) ---
            print("\n--- Second API Call (Sending function result back to model) ---")
            second_payload = {
                 "model": "openai",
                 "messages": messages # Send the updated message history including the tool's output
            }
            second_response = requests.post(url, headers=headers, json=second_payload)
            second_response.raise_for_status()
            final_result = second_response.json()
            print("\n--- Final Response from Model ---")
            print(json.dumps(final_result, indent=2))
            print("\nFinal Assistant Message:", final_result['choices'][0]['message']['content'])

        else:
            print(f"Error: Model requested an unknown function '{function_name}'")

    else:
        print("\n--- Model responded directly (no tool call) ---")
        print("Assistant:", response_data['choices'][0]['message']['content'])

except requests.exceptions.RequestException as e:
    print(f"Error during function calling request: {e}")
    # if response is not None: print(response.text) # Print API error for debugging
except Exception as e:
     print(f"An unexpected error occurred during processing: {e}")