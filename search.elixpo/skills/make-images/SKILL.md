---
name: make-images
description: Create a new image from a user request. Use only when the user explicitly asks to generate, draw, render, or create a visual rather than find or analyze an existing image.
---

# Make Images

Convert the request into one precise visual prompt and call the image tool once.

## Workflow

1. Preserve requested subject, composition, style, colors, text, and aspect ratio.
2. Add only details that clarify the requested result.
3. Call `create_image` once with the final prompt.
4. Return the generated image URL unchanged.

## Guardrails

- Do not use image search as a substitute for creation.
- Do not silently change requested text or identity details.
- Avoid a preliminary model call when the user prompt is already specific.

## Runtime contract

    agent: image-maker
    tools: [create_image]
    timeout_seconds: 45
    max_concurrency: 2
    output: image_bundle
