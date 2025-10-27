import { type NextRequest, NextResponse } from "next/server"

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

interface EnhancePromptRequest {
  prompt: string
  context?: {
    fileName?: string
    language?: string
    codeContent?: string
  }
}

interface OllamaResponse {
  response?: string
  error?: string
  [key: string]: unknown // allows extra fields safely
}

async function generateAIResponse(messages: ChatMessage[]) {
  const systemPrompt = `You are an expert AI coding assistant...`

  const fullMessages = [{ role: "system", content: systemPrompt }, ...messages]
  const prompt = fullMessages.map((msg) => `${msg.role}: ${msg.content}`).join("\n\n")

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 20000)

  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "codellama:latest",
        prompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: 1000,
          repeat_penalty: 1.1,
        },
      }),
      signal: controller.signal,
    })

    const raw = await response.text()
    if (!response.ok) {
      console.error("Ollama error response:", raw)
      throw new Error(`AI model API error: ${response.status}`)
    }

    let data: OllamaResponse
    try {
      data = JSON.parse(raw) as OllamaResponse
    } catch {
      console.error("Invalid JSON from Ollama:", raw)
      throw new Error("AI model returned invalid JSON")
    }

    if (!data.response) throw new Error("No response from AI model")
    return data.response.trim()
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error("Request timeout: AI model took too long to respond")
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

async function enhancePrompt(request: EnhancePromptRequest) {
  const enhancementPrompt = `You are a prompt enhancement assistant. Take the user's basic prompt and enhance it...

Original prompt: "${request.prompt}"

Context: ${request.context ? JSON.stringify(request.context, null, 2) : "No additional context"}

Enhanced prompt should:
- Be more specific and detailed
- Include relevant technical context
- Ask for specific examples or explanations
- Be clear about expected output format
- Maintain the original intent

Return only the enhanced prompt, nothing else.`

  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "codellama:latest",
        prompt: enhancementPrompt,
        stream: false,
        options: { temperature: 0.3, max_tokens: 500 },
      }),
    })

    if (!response.ok) throw new Error("Failed to enhance prompt")

    const data = (await response.json()) as OllamaResponse
    return data.response?.trim() || request.prompt
  } catch (error) {
    console.error("Prompt enhancement error:", error)
    return request.prompt
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (body.action === "enhance") {
      if (!body.prompt || typeof body.prompt !== "string") {
        return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
      }
      const enhancedPrompt = await enhancePrompt(body as EnhancePromptRequest)
      return NextResponse.json({ enhancedPrompt })
    }

    const { message, history } = body
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    const validHistory: ChatMessage[] = Array.isArray(history)
      ? history.filter(
          (msg: unknown): msg is ChatMessage =>
            typeof msg === "object" &&
            msg !== null &&
            "role" in msg &&
            "content" in msg &&
            typeof (msg as ChatMessage).role === "string" &&
            typeof (msg as ChatMessage).content === "string" &&
            ["user", "assistant"].includes((msg as ChatMessage).role),
        )
      : []

    const recentHistory = validHistory.slice(-10)
    const messages: ChatMessage[] = [...recentHistory, { role: "user", content: message }]

    const aiResponse = await generateAIResponse(messages)

    return NextResponse.json({
      response: aiResponse,
      model: "codellama:latest",
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { error: "Failed to generate AI response", details: errorMessage, timestamp: new Date().toISOString() },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json({
    status: "AI Chat API is running",
    timestamp: new Date().toISOString(),
    info: "Use POST method to send chat messages or enhance prompts",
  })
}
