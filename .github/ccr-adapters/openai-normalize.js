#!/usr/bin/env node

/**
 * openai-normalize.js — CCR transformer for any non-Anthropic provider.
 *
 * Originally written for Vertex Gemini's `thought_signature` requirement, the
 * same flatten-and-strip pass is needed for every non-Anthropic model served
 * through an OpenAI-style proxy (Pollinations: kimi, qwen-coder, perplexity-*,
 * glm, gemini, gemini-search, and friends). Each validates OpenAI schema
 * strictly and rejects:
 *   - `content: [{type: 'text', text: '...'}, ...]` structured arrays,
 *   - `cache_control: {type: 'ephemeral'}` markers on text blocks,
 *   - Anthropic-style `tool_use` / `tool_result` blocks in history.
 *
 * The fix: before the request hits the proxy, collapse every message's
 * content into a plain string and drop cache_control by virtue of the join.
 *
 * Rules:
 *   1. Tool exchanges (tool_use → tool_result) become user-role narrative
 *      notes like "Earlier I ran X(args). It returned: Y".
 *   2. Assistant messages that contained ONLY tool_use (no real text) are
 *      dropped entirely — no placeholders to copy.
 *   3. Assistant messages with real text keep that text only; any tool_use
 *      blocks inside are discarded (their context moves to the next user
 *      note).
 *   4. System and user messages with array content are joined to a single
 *      string; cache_control on individual text blocks is dropped in the join.
 *   5. Consecutive user messages are merged so the proxy sees clean alternation.
 *
 * The current turn's response is untouched; real tool calls still flow.
 *
 * The filter: SKIP flattening only for models that accept Anthropic-native
 * structured content (real Claude). Everything else gets the flatten pass.
 *
 * CCR contract: `registerTransformerFromConfig` calls `new Ctor(options)`.
 * Register at top-level and reference by name:
 *
 *   {
 *     "transformers": [{"path": "/abs/path/openai-normalize.js"}],
 *     "Providers": [{
 *       "transformer": { "use": ["openai-normalize", "openai", ...] }
 *     }]
 *   }
 */

"use strict";

// Only bypass normalization for Claude models.
const ANTHROPIC_NATIVE_RE = /^claude(?:-|$)/i;

/**
 * Safely convert values to strings.
 */
function asString(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

/**
 * Extract readable text from structured content.
 */
function extractText(content) {
    if (content == null) return "";
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return asString(content);

    return content
        .map((block) => {
            if (!block || typeof block !== "object") {
                return asString(block);
            }
            if (block.type === "text") {
                return typeof block.text === "string" ? block.text : "";
            }
            return "";
        })
        .filter(Boolean)
        .join("\n");
}

/**
 * Build an index of tool calls from assistant messages.
 */
function buildToolUseIndex(messages) {
    const index = new Map();

    for (const message of messages) {
        if (!message || message.role !== "assistant") {
            continue;
        }

        // Anthropic-style tool calls in message.content
        if (Array.isArray(message.content)) {
            for (const block of message.content) {
                if (block?.type === "tool_use" && block.id) {
                    index.set(block.id, {
                        name: block.name || "unknown",
                        input: asString(block.input ?? {}),
                    });
                }
            }
        }

        // OpenAI-style tool calls in message.tool_calls
        if (Array.isArray(message.tool_calls)) {
            for (const toolCall of message.tool_calls) {
                if (!toolCall?.id) continue;
                const fn = toolCall.function || {};
                index.set(toolCall.id, {
                    name: fn.name || "unknown",
                    input: asString(fn.arguments ?? "{}"),
                });
            }
        }
    }

    return index;
}

/**
 * Convert tool results into readable conversation notes.
 */
function toolResultNarrative(index, toolId, resultContent) {
    const tool = index?.get(toolId);
    const result = extractText(resultContent);

    if (tool) {
        return `Earlier I ran ${tool.name} with ${tool.input}. It returned: ${result}`;
    }

    return `Earlier tool output: ${result}`;
}

/**
 * Check whether the model supports native Anthropic content.
 */
function isAnthropicModel(model) {
    return typeof model === "string" && ANTHROPIC_NATIVE_RE.test(model);
}

/**
 * Normalize an individual message.
 * Strictly returns only `{ role, content }` to prevent leaking provider-specific
 * metadata (e.g. thought_signature, reasoning_content, stop_reason, tool_calls).
 */
function normalizeMessage(message, toolIndex) {
    if (!message || typeof message !== "object") {
        return null;
    }

    const role = message.role;

    // System and developer messages: flatten text blocks, drop cache_control.
    // If empty, drop it.
    if (role === "system" || role === "developer") {
        const content = extractText(message.content);
        if (!content) {
            return null;
        }
        return {
            role,
            content,
        };
    }

    // User messages: flatten text and convert Anthropic tool_result blocks.
    // Preserves user turns even if empty to maintain turn alternation.
    if (role === "user") {
        if (Array.isArray(message.content)) {
            const parts = [];

            for (const block of message.content) {
                if (!block || typeof block !== "object") {
                    const str = asString(block);
                    if (str) parts.push(str);
                    continue;
                }

                if (block.type === "text" && typeof block.text === "string") {
                    if (block.text) parts.push(block.text);
                } else if (block.type === "tool_result") {
                    parts.push(
                        toolResultNarrative(
                            toolIndex,
                            block.tool_use_id,
                            block.content
                        )
                    );
                }
            }

            return {
                role: "user",
                content: parts.join("\n"),
            };
        }

        return {
            role: "user",
            content: extractText(message.content),
        };
    }

    // Assistant messages: keep text only, discard tool calls (Rules 2 & 3).
    if (role === "assistant") {
        const content = extractText(message.content);

        // Assistant messages that contained ONLY tool_use (no real text) are dropped entirely.
        if (!content.trim()) {
            return null;
        }

        return {
            role: "assistant",
            content,
        };
    }

    // OpenAI-style tool result messages: convert to user narrative (Rule 1).
    if (role === "tool") {
        return {
            role: "user",
            content: toolResultNarrative(
                toolIndex,
                message.tool_call_id,
                message.content
            ),
        };
    }

    // Unrecognized roles: rebuild cleanly with only role and content.
    return {
        role: String(role || "user"),
        content: extractText(message.content),
    };
}

/**
 * Merge consecutive user messages so the downstream proxy sees clean alternation (Rule 5).
 */
function mergeConsecutiveUserMessages(messages) {
    const merged = [];

    for (const message of messages) {
        if (!message) continue;

        const previous = merged[merged.length - 1];

        if (previous && previous.role === "user" && message.role === "user") {
            if (previous.content && message.content) {
                previous.content = `${previous.content}\n${message.content}`;
            } else {
                previous.content = previous.content || message.content || "";
            }
        } else {
            merged.push({ role: message.role, content: message.content });
        }
    }

    return merged;
}

/**
 * Normalize the complete message history.
 */
function flattenMessages(messages) {
    const toolIndex = buildToolUseIndex(messages);

    const normalized = messages
        .map((message) => normalizeMessage(message, toolIndex))
        .filter(Boolean);

    return mergeConsecutiveUserMessages(normalized);
}

/**
 * CCR Transformer.
 */
class OpenAINormalizeAdapter {
    constructor(options = {}) {
        this.name = "openai-normalize";
        this.options = options;
    }

    async transformRequestIn(request) {
        return this._flatten(request);
    }

    async transformRequestOut(request) {
        return this._flatten(request);
    }

    /**
     * Normalize request messages without mutating
     * the original request object.
     */
    _flatten(request) {
        if (!request || typeof request !== "object") {
            return request;
        }

        const hasBody =
            request.body &&
            typeof request.body === "object" &&
            !Array.isArray(request.body);

        const body = hasBody ? request.body : request;

        if (!Array.isArray(body.messages)) {
            return request;
        }

        // Preserve native Anthropic content for Claude models.
        if (isAnthropicModel(body.model)) {
            return request;
        }

        const normalizedBody = {
            ...body,
            messages: flattenMessages(body.messages),
        };

        // Preserve the original request wrapper if present.
        if (hasBody) {
            return {
                ...request,
                body: normalizedBody,
            };
        }

        return normalizedBody;
    }
}

module.exports = OpenAINormalizeAdapter;
