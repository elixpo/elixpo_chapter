import { encodeValue } from './typescript/encode/encoders.ts';
import users from './typescript/dummy_w_nest.json' assert { type: 'json' };
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();
const polliToken = process.env.polli_token;
async function sendPayload() {
  const url = "https://enter.pollinations.ai/api/generate/v1/chat/completions";

  const payload = {
    messages: [
      {
        role: "system",
        name: "example-system",
        content: "You are an expert AI model and you can figure out users data and information from the given data to you",
      },
      {
        role: "user",
        content: `Tell me something about David Brown from the data -- ${JSON.stringify(encodeValue(users, { indent: 2, delimiter: ",", lengthMarker: "#" }))}`,
      },
    ],
    model: "grok",
    frequency_penalty: 0,
    logit_bias: null,
    logprobs: false,
    top_logprobs: 0,
    max_tokens: 200,
    n: 1,
    presence_penalty: 0,
    response_format: {
      type: "text",
    },
    seed: 42,
    stop: "",
    stream: false,
    stream_options: {
      include_usage: true,
    },
    thinking: {
      type: "enabled",
      budget_tokens: 1,
    },
    reasoning_effort: "high",
    temperature: 1,
    top_p: 1,
  };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        'Authorization': `Bearer ${polliToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as { choices: { message: { content: string } }[] };
    console.log("Full response data:", data);
    console.log("Response:", data.choices[0]?.message?.content);
  } catch (error : any) {
    console.error("Error sending request:", error.message);
  }
}

sendPayload();