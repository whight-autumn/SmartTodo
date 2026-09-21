(function exposeUIAppearance(root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.UIAppearance = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createUIAppearance() {
  const STORAGE_KEY = "smart_ui_brightness";
  const MIN_BRIGHTNESS = 75;
  const MAX_BRIGHTNESS = 125;
  const DEFAULT_BRIGHTNESS = 100;
  const BRIGHTNESS_STEP = 5;

  function normalizeBrightness(value) {
    if (value === null || value === undefined || value === "") {
      return DEFAULT_BRIGHTNESS;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return DEFAULT_BRIGHTNESS;
    const stepped = Math.round(numeric / BRIGHTNESS_STEP) * BRIGHTNESS_STEP;
    return Math.min(MAX_BRIGHTNESS, Math.max(MIN_BRIGHTNESS, stepped));
  }

  function resolveBrightness(value) {
    const normalized = normalizeBrightness(value);
    return {
      value: normalized,
      tint: normalized < DEFAULT_BRIGHTNESS ? "#000000" : "#ffffff",
      mix: `${Math.abs(normalized - DEFAULT_BRIGHTNESS)}%`
    };
  }

  function loadBrightness(storage = globalThis.localStorage) {
    try {
      return normalizeBrightness(storage.getItem(STORAGE_KEY));
    } catch {
      return DEFAULT_BRIGHTNESS;
    }
  }

  function saveBrightness(storage = globalThis.localStorage, value) {
    const normalized = normalizeBrightness(value);
    try {
      storage.setItem(STORAGE_KEY, String(normalized));
    } catch {
      // The UI still uses the selected value when storage is unavailable.
    }
    return normalized;
  }

  function formatTaskTimestamp(value) {
    if (value === null || value === undefined || value === "") return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = number => String(number).padStart(2, "0");
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate())
    ].join("-") + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function formatDisplayVersion(value) {
    const match = String(value || "").replace(/^v/i, "").match(/^(\d+)\.(\d+)/);
    return match ? `${match[1]}.${match[2]}` : "1.2";
  }

  return {
    STORAGE_KEY,
    MIN_BRIGHTNESS,
    MAX_BRIGHTNESS,
    DEFAULT_BRIGHTNESS,
    BRIGHTNESS_STEP,
    normalizeBrightness,
    resolveBrightness,
    loadBrightness,
    saveBrightness,
    formatTaskTimestamp,
    formatDisplayVersion
  };
});
