export const MODEL_POLICY = {
  text: ['nova', 'nova-fast', 'qwen-coder', 'Circuit-Overtime/OreoLook'],
  webSearch: ['perplexity'],
  image: ['flux', 'klein'],
  video: ['wan-fast'],
  audio: ['elevenflash'],
  threeD: ['trellis-2'],
  transcription: ['whisper'],
  embedding: ['openai-3-small'],
  decision: ['typesafe/jev-1.13'],
} as const

export const CONNECTOR_MODELS = Object.values(MODEL_POLICY).flat()
