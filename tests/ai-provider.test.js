const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
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

test("OpenAI preset and whitespace normalization preserve provider storage compatibility", () => {
  assert.deepEqual(normalizeProviderConfig({ provider: "openai", apiKey: " legacy-key " }), {
    provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", apiKey: "legacy-key"
  });
  assert.deepEqual(normalizeProviderConfig({ provider: "custom", baseUrl: " https://llm.test/v1/// ", model: " my-model ", apiKey: " k " }), {
    provider: "custom", baseUrl: "https://llm.test/v1", model: "my-model", apiKey: "k"
  });
});

test("reads OpenAI-compatible SSE delta content", () => {
  assert.equal(
    parseSseChunk('data: {"choices":[{"delta":{"content":"你好"}}]}\n\n'),
    "你好"
  );
});

test("application settings adapter preserves legacy AI keys and updates live chat config", () => {
  const source = fs.readFileSync(path.join(__dirname, "../renderer/app.js"), "utf8");
  const initial = source.slice(source.indexOf("const storedProviderConfig"), source.indexOf("let chatState"));
  const settingsStart = source.indexOf("   设置模块");
  const settings = source.slice(source.indexOf("*/", settingsStart) + 2,
    source.indexOf("/* ==========================================================", settingsStart + 30));
  const storage = new Map([
    ["deepseek_api_key", "legacy-key"],
    ["ai_provider_config", JSON.stringify({ provider: "custom", baseUrl: "https://legacy.test/v1", model: "legacy-model" })]
  ]);
  let adapter;
  const node = { value: "", addEventListener() {}, querySelectorAll() { return []; } };
  const context = vm.createContext({
    window: { desktop: {}, SettingsController: { create(options) { adapter = options; return { open() {}, dispose() {} }; } }, addEventListener() {} },
    document: {}, motion: {}, aiProvider: require("../renderer/ai-provider.js"),
    STORAGE_KEYS: { provider: "ai_provider_config", apiKey: "deepseek_api_key" },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    loadJSON: (key, fallback) => storage.has(key) ? JSON.parse(storage.get(key)) : fallback,
    saveJSON: (key, value) => storage.set(key, JSON.stringify(value)), showToast() {},
    els: { providerSelect: node, baseUrlInput: node, modelInput: node, apiKeyInput: node,
      settingsBtn: node, globalSettingsBtn: node, saveKeyBtn: node, modal: node }
  });
  vm.runInContext(initial + settings, context);
  assert.ok(adapter, "Application delegates settings interactions to SettingsController");
  assert.equal(adapter.readAIConfig().apiKey, "legacy-key");
  assert.equal(adapter.readAIConfig().model, "legacy-model");
  const next = { provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", apiKey: "saved-key" };
  adapter.writeAIConfig(next);
  assert.deepEqual(JSON.parse(storage.get("ai_provider_config")), next);
  assert.equal(storage.get("deepseek_api_key"), "saved-key");
  assert.equal(vm.runInContext("aiKey", context), "saved-key");
  assert.deepEqual(adapter.readAIConfig(), next);
});
