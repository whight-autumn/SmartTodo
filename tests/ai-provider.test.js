const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeProviderConfig,
  buildChatCompletionsUrl,
  parseSseChunk
} = require("../renderer/ai-provider.js");

test("normalizes a DeepSeek-compatible provider", () => {
  const config = normalizeProviderConfig({
    provider: "deepseek",
    apiKey: "k",
    model: "deepseek-chat"
  });
  assert.equal(config.baseUrl, "https://api.deepseek.com");
  assert.equal(
    buildChatCompletionsUrl(config),
    "https://api.deepseek.com/chat/completions"
  );
});

test("does not duplicate chat completions path", () => {
  const config = normalizeProviderConfig({
    baseUrl: "https://example.test/v1/chat/completions",
    model: "m"
  });
  assert.equal(
    buildChatCompletionsUrl(config),
    "https://example.test/v1/chat/completions"
  );
});

test("preserves custom provider values", () => {
  const config = normalizeProviderConfig({
    provider: "custom",
    baseUrl: "https://llm.test/v1",
    model: "my-model"
  });
  assert.equal(config.baseUrl, "https://llm.test/v1");
  assert.equal(config.model, "my-model");
});

test("reads OpenAI-compatible SSE delta content", () => {
  assert.equal(
    parseSseChunk('data: {"choices":[{"delta":{"content":"你好"}}]}\n\n'),
    "你好"
  );
});
