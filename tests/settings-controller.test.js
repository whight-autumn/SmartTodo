const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const aiProvider = require("../renderer/ai-provider.js");

// Only the DOM and desktop boundary are doubled; all controller behavior runs.
class Element {
  constructor(document, id) {
    this.document = document;
    this.id = id;
    this.listeners = new Map();
    this.attributes = {};
    this.dataset = {};
    this.value = "";
    this.textContent = "";
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.isConnected = true;
    this.type = "password";
    this.open = false;
  }
  set innerHTML(_) { throw new Error("Settings must render data as text"); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatch(type, detail = {}) {
    const event = { target: this, preventDefault() { this.defaultPrevented = true; }, ...detail };
    for (const fn of this.listeners.get(type) || []) fn(event);
    return event;
  }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; }
  focus() { this.document.activeElement = this; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatch("close"); }
  querySelectorAll(selector) { return this.document.querySelectorAll(selector); }
  querySelector(selector) { return this.document.querySelector(selector); }
  getBoundingClientRect() { return { left: 10, top: 10, right: 100, bottom: 100 }; }
}

const settle = () => new Promise(resolve => setImmediate(resolve));
const token = "12345678-1234-4234-8234-123456789abc";
const snapshot = () => ({ autoStart: { available: true, enabled: false },
  storage: { currentPath: "C:\\SmartTodo\\运行数据", isDefault: true }, migrationResult: null });

function fixture(t, overrides = {}) {
  const nodes = new Map();
  const document = { activeElement: null,
    getElementById(id) { return nodes.get(id); },
    querySelectorAll(selector) {
      if (selector.includes('role="tab"')) return sections.map(s => nodes.get(`settings-tab-${s}`));
      if (selector.includes('role="tabpanel"')) return sections.map(s => nodes.get(`settings-panel-${s}`));
      if (selector === "[data-close-modal]") return [nodes.get("close-settings")];
      return [];
    },
    querySelector(selector) {
      if (selector.includes("tablist") || selector === ".settings-nav") return nodes.get("settings-nav");
      if (selector === ".dialog-sheet") return nodes.get("sheet");
      return null;
    }
  };
  const sections = ["general", "ai", "storage"];
  for (const id of ["settings-modal", "settings-nav", "sheet", "close-settings", "global-settings-btn",
    "ai-settings-btn", "task-title", "auto-start-input", "auto-start-status", "provider-select",
    "base-url-input", "model-input", "api-key-input", "toggle-api-key-btn", "ai-key-hint",
    "save-key-btn", "ai-settings-status", "data-current-path", "data-selected-path",
    "choose-data-directory-btn", "migrate-data-btn", "storage-status", "data-path-hint",
    ...sections.flatMap(s => [`settings-tab-${s}`, `settings-panel-${s}`])]) nodes.set(id, new Element(document, id));
  sections.forEach(s => {
    nodes.get(`settings-tab-${s}`).dataset.settingsSection = s;
    nodes.get(`settings-panel-${s}`).dataset.settingsSection = s;
  });
  nodes.get("data-selected-path").textContent = "未选择新目录";
  nodes.get("migrate-data-btn").disabled = true;
  nodes.get("toggle-api-key-btn").setAttribute("aria-label", "切换 API Key 可见性");
  const media = new Element(document, "media");
  media.matches = true;
  document.defaultView = { matchMedia(query) { assert.equal(query, "(min-width: 640px)"); return media; } };
  const calls = { consume: 0, migrate: [], autoStart: [], saves: [], notices: [] };
  let config = { provider: "deepseek", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", apiKey: "old-key" };
  const desktop = {
    async getAppSettings() { return snapshot(); },
    async setAutoStart(enabled) { calls.autoStart.push(enabled); return { available: true, enabled }; },
    async chooseDataDirectory() { return { canceled: false, selectionId: token, path: "D:\\新目录", secret: "discard" }; },
    async requestDataMigration(payload) { calls.migrate.push(payload); return { queued: true }; },
    async consumeMigrationResult() { calls.consume++; return null; },
    ...overrides.desktop
  };
  const modulePath = path.join(__dirname, "../renderer/settings-controller.js");
  assert.ok(fs.existsSync(modulePath), "Settings controller is implemented");
  const { create } = require(modulePath);
  const controller = create({ document, desktop: overrides.noDesktop ? undefined : desktop, aiProvider,
    motion: { animateDialog() {} }, readAIConfig: () => config,
    writeAIConfig: overrides.writeAIConfig || (next => { calls.saves.push(next); config = next; }),
    notify: (message, type) => calls.notices.push({ message, type }) });
  t.after(() => controller.dispose());
  return { controller, document, desktop, media, calls, get: id => nodes.get(id),
    click: id => nodes.get(id).dispatch("click"), config: () => config, nodes };
}

function assertSection(f, section) {
  for (const s of ["general", "ai", "storage"]) {
    assert.equal(f.get(`settings-tab-${s}`).getAttribute("aria-selected"), String(s === section));
    assert.equal(f.get(`settings-tab-${s}`).getAttribute("tabindex"), s === section ? "0" : "-1");
    assert.equal(f.get(`settings-panel-${s}`).hidden, s !== section);
  }
}

test("entry buttons explicitly select their section and close restores the original trigger", async t => {
  const f = fixture(t);
  f.click("global-settings-btn");
  assertSection(f, "general");
  assert.equal(f.get("settings-modal").open, true);
  f.click("close-settings");
  assert.equal(f.document.activeElement, f.get("global-settings-btn"));
  f.click("ai-settings-btn");
  assertSection(f, "ai");
  const event = f.get("settings-modal").dispatch("cancel");
  assert.equal(event.defaultPrevented, true);
  assert.equal(f.get("settings-modal").open, false);
  assert.equal(f.document.activeElement, f.get("ai-settings-btn"));
});

test("tabs remember the last section and both arrow axes plus Home/End synchronize focus", t => {
  const f = fixture(t);
  f.controller.open("ai", f.get("ai-settings-btn"));
  for (const [key, want] of [["ArrowDown", "storage"], ["ArrowRight", "general"],
    ["ArrowUp", "storage"], ["ArrowLeft", "ai"], ["Home", "general"], ["End", "storage"]]) {
    const event = f.document.activeElement.dispatch("keydown", { key });
    assert.equal(event.defaultPrevented, true);
    assertSection(f, want);
    assert.equal(f.document.activeElement, f.get(`settings-tab-${want}`));
  }
  f.controller.close();
  f.controller.open();
  assertSection(f, "storage");
  f.click("settings-tab-ai");
  assertSection(f, "ai");
  assert.equal(f.document.activeElement, f.get("settings-tab-ai"));
});

test("snapshot renders authoritative auto-start and literal current/default path", async t => {
  const rawPath = '<img src=x onerror="steal()">\\运行数据';
  const f = fixture(t, { desktop: { async getAppSettings() { return {
    autoStart: { available: true, enabled: true }, storage: { currentPath: rawPath, isDefault: true }
  }; } } });
  await f.controller.refresh();
  assert.equal(f.get("auto-start-input").checked, true);
  assert.equal(f.get("auto-start-input").disabled, false);
  assert.ok(f.get("data-current-path").textContent.includes(rawPath));
  assert.match(f.get("data-current-path").textContent, /默认目录/);
  assert.match(f.get("data-path-hint").textContent, /默认/);
  assert.ok(f.get("data-path-hint").textContent.includes(rawPath));
  f.desktop.getAppSettings = async () => ({ ...snapshot(), storage: { currentPath: "D:\\custom", isDefault: false } });
  await f.controller.open("storage");
  assert.match(f.get("data-path-hint").textContent, /自定义/);
  assert.match(f.get("data-current-path").textContent, /自定义目录/);
});

test("unavailable auto-start and absent desktop bridge disable settings with explanations", async t => {
  for (const options of [{ desktop: { async getAppSettings() { return { ...snapshot(), autoStart: { available: false, enabled: false } }; } } },
    { noDesktop: true }]) {
    const f = fixture(t, options);
    await f.controller.refresh();
    assert.equal(f.get("auto-start-input").disabled, true);
    assert.ok(f.get("auto-start-status").textContent.length > 0);
    if (options.noDesktop) assert.equal(f.get("choose-data-directory-btn").disabled, true);
  }
});

test("auto-start toggle is busy and explains when the OS rejects the requested state", async t => {
  let finish;
  const f = fixture(t, { desktop: { setAutoStart(enabled) {
    assert.equal(enabled, true); return new Promise(resolve => { finish = resolve; });
  } } });
  await f.controller.refresh();
  f.get("auto-start-input").checked = true;
  f.get("auto-start-input").dispatch("change");
  assert.equal(f.get("auto-start-input").disabled, true);
  assert.equal(f.get("settings-panel-general").getAttribute("aria-busy"), "true");
  finish({ available: true, enabled: false });
  await settle();
  assert.equal(f.get("auto-start-input").checked, false);
  assert.equal(f.get("auto-start-input").disabled, false);
  assert.equal(f.get("settings-panel-general").getAttribute("aria-busy"), "false");
  assert.match(f.get("auto-start-status").textContent, /实际状态|Windows.*设置|未接受/);
});

test("a settings read captured during auto-start save cannot overwrite its final OS state", async t => {
  let finishSave;
  let finishRead;
  const f = fixture(t, { desktop: { setAutoStart() { return new Promise(resolve => { finishSave = resolve; }); } } });
  await f.controller.refresh();
  f.get("auto-start-input").checked = true;
  f.get("auto-start-input").dispatch("change");
  f.desktop.getAppSettings = () => new Promise(resolve => { finishRead = resolve; });
  const reading = f.controller.refresh();
  finishSave({ available: true, enabled: true });
  await settle();
  finishRead(snapshot());
  await reading;
  assert.equal(f.get("auto-start-input").checked, true);
});

test("auto-start failures roll back to the previous checked state with bounded recovery", async t => {
  for (const failure of [async () => { throw new Error("secret-path:".repeat(400)); },
    async () => ({ ok: false, error: { message: "private-registry" } })]) {
    const f = fixture(t, { desktop: { async getAppSettings() { return { ...snapshot(), autoStart: { available: true, enabled: true } }; }, setAutoStart: failure } });
    await f.controller.refresh();
    f.get("auto-start-input").checked = false;
    f.get("auto-start-input").dispatch("change");
    await settle();
    assert.equal(f.get("auto-start-input").checked, true);
    assert.equal(f.get("auto-start-input").disabled, false);
    assert.match(f.get("auto-start-status").textContent, /重试/);
    assert.doesNotMatch(f.get("auto-start-status").textContent, /secret|private/);
    assert.ok(f.get("auto-start-status").textContent.length < 300);
  }
});

test("refresh read errors disable unknown state without exposing IPC exception data", async t => {
  const f = fixture(t, { desktop: { async getAppSettings() { return { ok: false, error: { message: "secret" } }; } } });
  await f.controller.refresh();
  assert.equal(f.get("auto-start-input").disabled, true);
  assert.match(f.get("auto-start-status").textContent, /重试/);
  assert.doesNotMatch(f.get("auto-start-status").textContent, /secret/);
});

test("selection renders literal final path and cancellation preserves its capability", async t => {
  const f = fixture(t);
  f.desktop.chooseDataDirectory = async () => ({ canceled: false, selectionId: token, path: '<b>新目录</b>\\SmartTodo' });
  f.click("choose-data-directory-btn");
  await settle();
  assert.equal(f.get("data-selected-path").textContent, '<b>新目录</b>\\SmartTodo');
  assert.equal(f.get("migrate-data-btn").disabled, false);
  const before = f.get("storage-status").textContent;
  f.desktop.chooseDataDirectory = async () => ({ canceled: true, selectionId: null, path: null });
  f.click("choose-data-directory-btn");
  await settle();
  assert.equal(f.get("data-selected-path").textContent, '<b>新目录</b>\\SmartTodo');
  assert.equal(f.get("storage-status").textContent, before);
  assert.equal(f.get("migrate-data-btn").disabled, false);
  f.click("migrate-data-btn");
  await settle();
  assert.deepEqual(f.calls.migrate, [{ selectionId: token }]);
});

test("migration is disabled without a valid token and one valid selection cannot replay", async t => {
  let finish;
  const f = fixture(t, { desktop: { requestDataMigration(payload) {
    f.calls.migrate.push(payload); return new Promise(resolve => { finish = resolve; });
  } } });
  f.click("migrate-data-btn");
  assert.deepEqual(f.calls.migrate, []);
  f.desktop.chooseDataDirectory = async () => ({ canceled: false, selectionId: "raw-path", path: "D:\\new" });
  f.click("choose-data-directory-btn");
  await settle();
  assert.equal(f.get("migrate-data-btn").disabled, true);
  f.desktop.chooseDataDirectory = async () => ({ canceled: false, selectionId: token, path: "D:\\new", sourcePath: "private" });
  f.click("choose-data-directory-btn");
  await settle();
  f.click("migrate-data-btn");
  f.click("migrate-data-btn");
  assert.equal(f.get("migrate-data-btn").disabled, true);
  assert.equal(f.get("choose-data-directory-btn").disabled, true);
  assert.equal(f.get("settings-panel-storage").getAttribute("aria-busy"), "true");
  assert.deepEqual(f.calls.migrate, [{ selectionId: token }]);
  finish({ queued: true });
  await settle();
  f.click("migrate-data-btn");
  assert.equal(f.calls.migrate.length, 1);
});

test("migration request failure consumes selection and offers safe re-selection", async t => {
  const f = fixture(t, { desktop: { async requestDataMigration() { return { ok: false, error: { message: "secret system payload" } }; } } });
  f.click("choose-data-directory-btn");
  await settle();
  f.click("migrate-data-btn");
  await settle();
  assert.equal(f.get("migrate-data-btn").disabled, true);
  assert.equal(f.get("choose-data-directory-btn").disabled, false);
  assert.match(f.get("storage-status").textContent, /重新选择/);
  assert.doesNotMatch(f.get("storage-status").textContent, /secret/);
});

test("initialization consumes migration result exactly once with safe toast and persistent summary", async t => {
  for (const status of ["success", "failure"]) {
    const f = fixture(t, { desktop: { async consumeMigrationResult() {
      f.calls.consume++; return { status, sourcePath: "secret source", targetPath: "secret target", error: "raw system error" };
    } } });
    await settle();
    assert.equal(f.calls.consume, 1);
    assert.equal(f.calls.notices.length, 1);
    const summary = f.get("storage-status").textContent;
    assert.match(f.calls.notices[0].message, /数据迁移/);
    assert.doesNotMatch(summary, /secret|raw system/);
    if (status === "failure") assert.match(summary, /原目录/);
    await f.controller.open("storage");
    await f.controller.refresh();
    assert.equal(f.calls.consume, 1);
    assert.equal(f.calls.notices.length, 1);
    assert.equal(f.get("storage-status").textContent, summary);
  }
});

test("successful result keeps current path and confirmed backup visible after one-time consumption", async t => {
  const backupPath = 'C:\\Old\\运行数据.backup-20261013-020304';
  const f = fixture(t, { desktop: { async consumeMigrationResult() {
    f.calls.consume++; return { status: "success", targetPath: "D:\\New\\<b>data</b>", backupPath, error: "RAW_MARKER" };
  }, async getAppSettings() { return { ...snapshot(), storage: { currentPath: "D:\\New\\<b>data</b>", isDefault: false } }; } } });
  await settle();
  assert.ok(f.get("storage-status").textContent.includes(backupPath));
  assert.ok(f.get("storage-status").textContent.includes("D:\\New\\<b>data</b>"));
  assert.doesNotMatch(f.get("storage-status").textContent, /RAW_MARKER/);
  await f.controller.open("storage");
  assert.equal(f.calls.consume, 1);
  assert.equal(f.calls.notices.length, 1);
  assert.ok(f.get("storage-status").textContent.includes(backupPath));
});

test("ordinary failure renders bounded category guidance and retained staging warning", async t => {
  const f = fixture(t, { desktop: { async consumeMigrationResult() {
    return { status: "failure", failureCode: "verification", warningCodes: ["staging-retained"],
      error: "RAW_MARKER", warning: "RAW_MARKER" };
  } } });
  await settle();
  const message = f.get("storage-status").textContent;
  assert.match(message, /原目录/);
  assert.match(message, /校验|验证/);
  assert.match(message, /暂存.*保留/);
  assert.doesNotMatch(message, /RAW_MARKER/);
});

test("backup recovery explicitly names the active recovery path without claiming original active", async t => {
  const backupPath = "C:\\Old\\data.backup-20261013-020304";
  const f = fixture(t, { desktop: { async consumeMigrationResult() {
    return { status: "failure", failureCode: "interrupted", backupPath, warningCodes: ["rollback-backup"], error: "RAW_MARKER" };
  }, async getAppSettings() { return { ...snapshot(), storage: { currentPath: backupPath, isDefault: false } }; } } });
  await settle();
  const message = f.get("storage-status").textContent;
  assert.ok(message.includes(backupPath));
  assert.match(message, /恢复|备份/);
  assert.doesNotMatch(message, /仍在使用原目录|RAW_MARKER/);
});

test("unrecognized result categories and warning text cannot leak into storage feedback", async t => {
  const f = fixture(t, { desktop: { async consumeMigrationResult() {
    return { status: "failure", failureCode: "RAW_MARKER", warningCodes: ["RAW_MARKER"], error: "RAW_MARKER", warning: "RAW_MARKER" };
  } } });
  await settle();
  assert.doesNotMatch(f.get("storage-status").textContent, /RAW_MARKER/);
  assert.ok(f.get("storage-status").textContent.length < 500);
});

test("confirmed backup recovery remains explicit when the OS settings snapshot fails", async t => {
  const backupPath = "C:\\Old\\data.backup-20261013-020304";
  const f = fixture(t, { desktop: { async consumeMigrationResult() {
    return { status: "failure", failureCode: "interrupted", backupPath };
  }, async getAppSettings() { throw new Error("RAW_MARKER"); } } });
  await settle();
  assert.ok(f.get("storage-status").textContent.includes(backupPath));
  assert.doesNotMatch(f.get("storage-status").textContent, /仍在使用原目录|RAW_MARKER/);
});

test("invalid bootstrap result describes the safe default fallback without claiming original active", async t => {
  const f = fixture(t, { desktop: { async consumeMigrationResult() {
    return { status: "failure", failureCode: "configuration" };
  } } });
  await settle();
  assert.match(f.get("storage-status").textContent, /默认目录/);
  assert.doesNotMatch(f.get("storage-status").textContent, /仍在使用原目录/);
});

test("AI presets retain DeepSeek/OpenAI/custom defaults and successful save normalizes live values", async t => {
  const f = fixture(t);
  await f.controller.open("ai");
  assert.equal(f.get("api-key-input").value, "old-key");
  for (const [provider, url, model] of [["openai", "https://api.openai.com/v1", "gpt-4o-mini"],
    ["custom", "", ""], ["deepseek", "https://api.deepseek.com", "deepseek-chat"]]) {
    f.get("provider-select").value = provider;
    f.get("provider-select").dispatch("change");
    assert.equal(f.get("base-url-input").value, url);
    assert.equal(f.get("model-input").value, model);
  }
  f.get("provider-select").value = "custom";
  f.get("base-url-input").value = " https://llm.test/v1/// ";
  f.get("model-input").value = " model-1 ";
  f.get("api-key-input").value = " new-key ";
  f.click("save-key-btn");
  await settle();
  assert.deepEqual(f.config(), { provider: "custom", baseUrl: "https://llm.test/v1", model: "model-1", apiKey: "new-key" });
  assert.equal(f.get("settings-modal").open, true);
  assert.match(f.get("ai-settings-status").textContent, /保存/);
  assert.equal(f.calls.notices.at(-1).type, "success");
});

test("AI invalid URL, empty URL/model/key never save", async t => {
  const f = fixture(t);
  await f.controller.open("ai");
  for (const [url, model, key] of [["javascript:alert(1)", "m", "k"], ["not-a-url", "m", "k"],
    ["ftp://llm.test", "m", "k"], ["", "m", "k"], ["https://llm.test", " ", "k"], ["https://llm.test", "m", " "]]) {
    f.get("provider-select").value = "custom";
    f.get("base-url-input").value = url;
    f.get("model-input").value = model;
    f.get("api-key-input").value = key;
    f.click("save-key-btn");
    await settle();
    assert.equal(f.calls.saves.length, 0);
    assert.ok(f.get("ai-settings-status").textContent.length > 0);
  }
});

test("AI persistence errors stay open with safe feedback", async t => {
  const f = fixture(t, { writeAIConfig() { throw new Error("secret localStorage"); } });
  await f.controller.open("ai");
  f.click("save-key-btn");
  await settle();
  assert.equal(f.get("settings-modal").open, true);
  assert.match(f.get("ai-settings-status").textContent, /重试/);
  assert.doesNotMatch(f.get("ai-settings-status").textContent, /secret/);
});

test("password visibility updates state/icon/hint while its accessible name stays invariant", async t => {
  const f = fixture(t);
  await f.controller.open("ai");
  const button = f.get("toggle-api-key-btn");
  assert.equal(f.get("api-key-input").type, "password");
  f.click("toggle-api-key-btn");
  assert.equal(f.get("api-key-input").type, "text");
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.equal(button.dataset.icon, "eye-off");
  assert.match(f.get("ai-key-hint").textContent, /显示/);
  assert.equal(button.getAttribute("aria-label"), "切换 API Key 可见性");
  f.click("toggle-api-key-btn");
  assert.equal(f.get("api-key-input").type, "password");
  assert.equal(button.getAttribute("aria-pressed"), "false");
  assert.equal(button.dataset.icon, "eye");
  f.click("toggle-api-key-btn");
  f.controller.close();
  await f.controller.open("ai");
  assert.equal(f.get("api-key-input").type, "password");
});

test("responsive orientation updates and disposal removes every listener and pending UI work", async t => {
  let finish;
  const f = fixture(t, { desktop: { getAppSettings() { return new Promise(resolve => { finish = resolve; }); } } });
  assert.equal(f.get("settings-nav").getAttribute("aria-orientation"), "vertical");
  f.media.matches = false;
  f.media.dispatch("change");
  assert.equal(f.get("settings-nav").getAttribute("aria-orientation"), "horizontal");
  const reading = f.controller.refresh();
  f.controller.dispose();
  finish({ ...snapshot(), autoStart: { available: true, enabled: true } });
  await reading;
  assert.equal(f.get("auto-start-input").checked, false);
  for (const node of [...f.nodes.values(), f.media]) {
    assert.ok([...node.listeners.values()].every(listeners => listeners.size === 0), node.id);
  }
  f.click("global-settings-btn");
  f.controller.open("general");
  assert.equal(f.get("settings-modal").open, false);
});
