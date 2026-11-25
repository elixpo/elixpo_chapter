import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const adapterPath = path.resolve(".github/ccr-adapters/openai-normalize.js");
const OpenAINormalizeAdapter = require(adapterPath);

test("openai-normalize.js starts with shebang at line 1 column 1 without leading blank lines", () => {
    const content = fs.readFileSync(adapterPath, "utf8");
    assert.ok(content.startsWith("#!/usr/bin/env node"), "Shebang must be at line 1 column 1");
    const lines = content.split(/\r?\n/);
    assert.equal(lines[0], "#!/usr/bin/env node");
});

test("instantiates adapter with options and default name", () => {
    const adapter = new OpenAINormalizeAdapter({ foo: "bar" });
    assert.equal(adapter.name, "openai-normalize");
    assert.equal(adapter.options.foo, "bar");
});

test("passes through Claude models unchanged without flattening", async () => {
    const adapter = new OpenAINormalizeAdapter();
    const rawMessages = [
        {
            role: "user",
            content: [
                { type: "text", text: "Hello Claude", cache_control: { type: "ephemeral" } },
            ],
        },
    ];
    const request = {
        body: {
            model: "claude-3-7-sonnet-20250219",
            messages: rawMessages,
        },
    };

    const transformed = await adapter.transformRequestIn(request);
    assert.equal(transformed, request);
    assert.equal(transformed.body.messages, rawMessages);
});

test("flattens non-Claude models and does not mutate original request or body", async () => {
    const adapter = new OpenAINormalizeAdapter();
    const originalMessages = [
        {
            role: "user",
            content: [
                { type: "text", text: "Part 1" },
                { type: "text", text: "Part 2" },
            ],
        },
    ];
    const request = {
        body: {
            model: "gemini-2.5-pro",
            messages: originalMessages,
        },
    };

    const transformed = await adapter.transformRequestIn(request);
    assert.notEqual(transformed, request, "request object should be non-mutated");
    assert.notEqual(transformed.body, request.body, "body object should be non-mutated");
    assert.equal(originalMessages[0].content.length, 2, "original messages array preserved");
    assert.deepEqual(transformed.body.messages, [
        { role: "user", content: "Part 1\nPart 2" },
    ]);
});

test("handles request passed directly as body without wrapping body property", async () => {
    const adapter = new OpenAINormalizeAdapter();
    const payload = {
        model: "qwen-coder",
        messages: [{ role: "user", content: "test" }],
    };
    const transformed = await adapter.transformRequestIn(payload);
    assert.deepEqual(transformed.messages, [{ role: "user", content: "test" }]);
});

test("Rule 1 & enhanced tool indexing: Anthropic tool_use and tool_result exchanges become user narrative", async () => {
    const adapter = new OpenAINormalizeAdapter();
    const request = {
        body: {
            model: "kimi",
            messages: [
                {
                    role: "assistant",
                    content: [
                        { type: "text", text: "I will check the file." },
                        {
                            type: "tool_use",
                            id: "call_abc123",
                            name: "read_file",
                            input: { path: "notes.txt" },
                        },
                    ],
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "tool_result",
                            tool_use_id: "call_abc123",
                            content: [{ type: "text", text: "hello file content" }],
                        },
                    ],
                },
            ],
        },
    };

    const res = await adapter.transformRequestIn(request);
    assert.deepEqual(res.body.messages, [
        { role: "assistant", content: "I will check the file." },
        {
            role: "user",
            content: 'Earlier I ran read_file with {"path":"notes.txt"}. It returned: hello file content',
        },
    ]);
});

test("OpenAI-style tool_calls and tool role messages become user narrative", async () => {
    const adapter = new OpenAINormalizeAdapter();
    const request = {
        body: {
            model: "glm-4",
            messages: [
                {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                        {
                            id: "call_def456",
                            type: "function",
                            function: {
                                name: "lookup_user",
                                arguments: '{"username":"divyanshu"}',
                            },
                        },
                    ],
                },
                {
                    role: "tool",
                    tool_call_id: "call_def456",
                    content: '{"found":true}',
                },
            ],
        },
    };

    const res = await adapter.transformRequestIn(request);
    // Tool-only assistant message is dropped (Rule 2)
    // Tool result message becomes user narrative (Rule 1)
    assert.deepEqual(res.body.messages, [
        {
            role: "user",
            content: 'Earlier I ran lookup_user with {"username":"divyanshu"}. It returned: {"found":true}',
        },
    ]);
});

test("Rule 2: assistant messages containing ONLY tool calls are dropped entirely", async () => {
    const adapter = new OpenAINormalizeAdapter();
    const request = {
        body: {
            model: "perplexity-sonar",
            messages: [
                { role: "user", content: "Query" },
                {
                    role: "assistant",
                    content: [
                        {
                            type: "tool_use",
                            id: "call_1",
                            name: "search",
                            input: { q: "test" },
                        },
                    ],
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "tool_result",
                            tool_use_id: "call_1",
                            content: "result output",
                        },
                    ],
                },
            ],
        },
    };

    const res = await adapter.transformRequestIn(request);
    assert.equal(res.body.messages.length, 1);
    assert.equal(res.body.messages[0].role, "user");
    assert.equal(
        res.body.messages[0].content,
        'Query\nEarlier I ran search with {"q":"test"}. It returned: result output'
    );
});

test("Rule 4 & developer role: system and developer structured content flattened into text", async () => {
    const adapter = new OpenAINormalizeAdapter();
    const request = {
        body: {
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: [
                        { type: "text", text: "System prompt line 1", cache_control: { type: "ephemeral" } },
                        { type: "text", text: "System prompt line 2" },
                    ],
                },
                {
                    role: "developer",
                    content: [
                        { type: "text", text: "Developer prompt instructions" },
                    ],
                },
                { role: "user", content: "Hi" },
            ],
        },
    };

    const res = await adapter.transformRequestIn(request);
    assert.deepEqual(res.body.messages, [
        { role: "system", content: "System prompt line 1\nSystem prompt line 2" },
        { role: "developer", content: "Developer prompt instructions" },
        { role: "user", content: "Hi" },
    ]);
});

test("empty system and developer messages are dropped, while empty user messages are preserved", async () => {
    const adapter = new OpenAINormalizeAdapter();
    const request = {
        body: {
            model: "qwen",
            messages: [
                { role: "system", content: "" },
                { role: "developer", content: [] },
                { role: "user", content: "" },
                { role: "assistant", content: "reply" },
                { role: "user", content: "   " },
            ],
        },
    };

    const res = await adapter.transformRequestIn(request);
    // system and developer with empty content dropped; empty user message kept
    assert.deepEqual(res.body.messages, [
        { role: "user", content: "" },
        { role: "assistant", content: "reply" },
        { role: "user", content: "   " },
    ]);
});

test("Rule 5: consecutive user messages are merged with clean alternation", async () => {
    const adapter = new OpenAINormalizeAdapter();
    const request = {
        body: {
            model: "gemini-2.0-flash",
            messages: [
                { role: "user", content: "First user message" },
                { role: "user", content: "Second user message" },
                { role: "assistant", content: "Assistant response" },
                { role: "user", content: "Third message" },
                { role: "user", content: "Fourth message" },
            ],
        },
    };

    const res = await adapter.transformRequestIn(request);
    assert.deepEqual(res.body.messages, [
        { role: "user", content: "First user message\nSecond user message" },
        { role: "assistant", content: "Assistant response" },
        { role: "user", content: "Third message\nFourth message" },
    ]);
});

test("strips provider-specific fields (thought_signature, reasoning_content, stop_reason, tool_calls)", async () => {
    const adapter = new OpenAINormalizeAdapter();
    const request = {
        body: {
            model: "gemini-experimental",
            messages: [
                {
                    role: "system",
                    content: "System text",
                    thought_signature: "sig_abc",
                },
                {
                    role: "user",
                    content: "User question",
                    provider_metadata: { token_count: 10 },
                },
                {
                    role: "assistant",
                    content: "Answer text",
                    reasoning_content: "internal chain of thought",
                    stop_reason: "end_turn",
                    thought_signature: "sig_xyz",
                    tool_calls: [],
                },
            ],
        },
    };

    const res = await adapter.transformRequestIn(request);
    for (const msg of res.body.messages) {
        assert.deepEqual(Object.keys(msg).sort(), ["content", "role"]);
        assert.equal(msg.thought_signature, undefined);
        assert.equal(msg.reasoning_content, undefined);
        assert.equal(msg.stop_reason, undefined);
        assert.equal(msg.tool_calls, undefined);
        assert.equal(msg.provider_metadata, undefined);
    }
});

test("unknown tool results fall back gracefully to Earlier tool output", async () => {
    const adapter = new OpenAINormalizeAdapter();
    const request = {
        body: {
            model: "glm-4",
            messages: [
                {
                    role: "tool",
                    tool_call_id: "unknown_id",
                    content: "Direct output",
                },
            ],
        },
    };

    const res = await adapter.transformRequestIn(request);
    assert.deepEqual(res.body.messages, [
        { role: "user", content: "Earlier tool output: Direct output" },
    ]);
});

test("transformRequestOut delegates to _flatten", async () => {
    const adapter = new OpenAINormalizeAdapter();
    const request = {
        body: {
            model: "qwen-max",
            messages: [{ role: "user", content: "test out" }],
        },
    };
    const res = await adapter.transformRequestOut(request);
    assert.deepEqual(res.body.messages, [{ role: "user", content: "test out" }]);
});
