import fs from 'file-sync';
import path from 'path';
import { encodeValue } from './encode/encoders.ts';

import dotenv from 'dotenv';
import fetch from 'node-fetch';

const dummyData = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'dummy.json'), 'utf8'));
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
        content: `${encodeToon(dummyData)}`,
      },
    ],
    model: "openai",
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
    seed: 0,
    stop: "",
    stream: false,
    stream_options: {
      include_usage: true,
    },
    thinking: {
      type: "disabled",
      budget_tokens: 1,
    },
    temperature: 1,
    top_p: 1,
  };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${polliToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("Response:", data);
  } catch (error) {
    console.error("Error sending request:", error.message);
  }
}

sendPayload();