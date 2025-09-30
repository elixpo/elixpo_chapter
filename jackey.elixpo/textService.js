import fetch from 'node-fetch';

/**
 * Generates a witty, playful intermediate status message for image generation.
 * @param {string} promptContent - The user's prompt.
 * @returns {Promise<string>}
 */
export async function generateIntermediateText(promptContent) {
  const textURL = "https://text.pollinations.ai/openai";
  const payload = {
    model: "evil",
    messages: [
      {
        role: "system",
        content: "You are a witty and humorous assistant for an AI image generation bot. Respond with a playful, quirky, or slightly sarcastic remark related to the user's prompt, indicating that the image is being generated/processed. Keep it concise and engaging, ideally one or two sentences. Feel free to use **bold** or *italics* for emphasis within the text. Avoid standard bot responses. Be creative and slightly dramatic about the process. Do NOT include any links, URLs, code blocks (`...` or ```...```), lists, quotes (>), or special characters that might mess up Discord formatting outside of allowed markdown like *, **, _, ~."
      },
      {
        role: "user",
        content: promptContent
      },
    ],
    seed: 42,
    referrer: "elixpoart",
  };

  try {
    const response = await fetch(textURL, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Error generating intermediate text: ${response.status} ${response.statusText}`, errorBody);
      return 'Summoning the creative spirits...';
    }

    const textResult = await response.json();
    return textResult.choices && textResult.choices[0] && textResult.choices[0].message && textResult.choices[0].message.content
           ? textResult.choices[0].message.content
           : 'Wooglie Boogliee.. Something is cooking!!';

  } catch (error) {
    console.error('Network or parsing error generating intermediate text:', error);
    return 'The AI generators are whirring...';
  }
}

/**
 * Generates a witty, playful conclusion message for image completion.
 * @param {string} promptContent - The user's prompt.
 * @returns {Promise<string|null>}
 */
export async function generateConclusionText(promptContent) {
  const textURL = "https://text.pollinations.ai/openai";
  const payload = {
    model: "evil",
    messages: [
      {
        role: "system",
        content: "You are a witty and humorous assistant for an AI image generation bot. Respond with a playful, quirky, or slightly dramatic flourish acknowledging that the image based on the user's prompt is complete and ready to be viewed. Keep it concise and fun, ideally one sentence, like a reveal. Feel free to use **bold** or *italics* for emphasis. Do not ask questions or continue the conversation. Just a short, punchy statement about the completion. Do NOT include any links, URLs, code blocks (`...` or ```...```), lists, quotes (>), or special characters that might mess up Discord formatting outside of allowed markdown like *, **, _, ~."
      },
      {
        role: "user",
        content: `The image based on "${promptContent}" is now complete.`
      },
    ],
    seed: 43,
    referrer: "elixpoart",
  };

  try {
    const response = await fetch(textURL, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Error generating conclusion text: ${response.status} ${response.statusText}`, errorBody);
      return null;
    }

    const textResult = await response.json();
    return textResult.choices && textResult.choices[0] && textResult.choices[0].message && textResult.choices[0].message.content
           ? textResult.choices[0].message.content
           : 'Behold the creation!';
  } catch (error) {
    console.error('Network or parsing error generating conclusion text:', error);
    return null;
  }
}

/**
 * Generate a conversational reply using text.pollinations OpenAI-compatible endpoint.
 * @param {string} promptContent - The user's message content.
 * @param {string} [systemPrompt] - Optional system instruction.
 * @returns {Promise<string>}
 */
export async function generateChatReply(promptContent, systemPrompt) {
  const textURL = "https://text.pollinations.ai/openai";
  const payload = {
    model: "evil",
    messages: [
      {
        role: "system",
        content: systemPrompt || "You are Jackey, a helpful, witty Discord bot. Keep replies concise (<= 120 words), friendly, and safe for work. Use simple markdown (bold/italics) sparingly. Never include links or code blocks unless explicitly asked."
      },
      {
        role: "user",
        content: promptContent
      }
    ],
    seed: 101,
    referrer: "jackey",
  };

  try {
    const response = await fetch(textURL, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Error generating chat reply: ${response.status} ${response.statusText}`, errorBody);
      return "I'm having a small hiccup right now. Try again in a moment!";
    }

    const textResult = await response.json();
    return textResult.choices && textResult.choices[0] && textResult.choices[0].message && textResult.choices[0].message.content
           ? textResult.choices[0].message.content
           : "I'm here! How can I help?";
  } catch (error) {
    console.error('Network or parsing error generating chat reply:', error);
    return "Connection seems glitchy. Please try again.";
  }
}