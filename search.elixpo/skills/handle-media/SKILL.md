---
name: handle-media
description: Process visual, YouTube, and audio inspection requests in lixSearch. Use to find or generate images, understand an image, inspect YouTube metadata, or transcribe a YouTube video.
---

# Handle Media

Choose the narrowest media operation that satisfies the request.

## Tool selection

- Find images: `image_search`
- Turn an image into a search query: `generate_prompt_from_image`
- Answer about an image: `replyFromImage`
- Inspect a YouTube video: `youtubeMetadata`
- Extract spoken content: `transcribe_audio`

## Execution rules

- Run metadata and transcription concurrently when both are requested.
- Run independent image analyses concurrently.
- Avoid transcription when metadata answers the question.
- Preserve returned media URLs exactly.
- Apply per-operation timeouts and allow partial success.

## Runtime contract

    agent: media
    tools: [image_search, generate_prompt_from_image, replyFromImage, youtubeMetadata, transcribe_audio]
    timeout_seconds: 45
    max_concurrency: 3
    output: media_bundle
