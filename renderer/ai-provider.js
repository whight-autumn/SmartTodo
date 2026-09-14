(function exposeAIProvider(root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.AIProvider = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createAIProvider() {
  const PROVIDER_PRESETS = {
    deepseek: {
      label: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat"
    },
    openai: {
      label: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini"
    },
    custom: {
      label: "自定义",
      baseUrl: "",
      model: ""
    }
  };

  function normalizeProviderConfig(raw = {}) {
    const provider = PROVIDER_PRESETS[raw.provider] ? raw.provider : "deepseek";
    const preset = PROVIDER_PRESETS[provider];
    return {
      provider,
      baseUrl: String(raw.baseUrl || preset.baseUrl).trim().replace(/\/+$/, ""),
      model: String(raw.model || preset.model).trim(),
      apiKey: String(raw.apiKey || "").trim()
    };
  }

  function buildChatCompletionsUrl(config) {
    const baseUrl = String(config.baseUrl || "").trim().replace(/\/+$/, "");
    if (!baseUrl) return "";
    return /\/chat\/completions$/i.test(baseUrl)
      ? baseUrl
      : `${baseUrl}/chat/completions`;
  }

  function parseSseChunk(chunk) {
    return String(chunk || "")
      .split(/\r?\n/)
      .reduce((result, line) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) return result;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") return result;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          return result + (typeof content === "string" ? content : "");
        } catch {
          return result;
        }
      }, "");
  }

  return {
    PROVIDER_PRESETS,
    normalizeProviderConfig,
    buildChatCompletionsUrl,
    parseSseChunk
  };
});
