const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "renderer/index.html"), "utf8");
const appSource = fs.readFileSync(path.join(root, "renderer/app.js"), "utf8");
const mainSource = fs.readFileSync(path.join(root, "main.js"), "utf8");
const entryCss = fs.readFileSync(path.join(root, "renderer/style.css"), "utf8");
const componentsCss = fs.readFileSync(path.join(root, "renderer/styles/components.css"), "utf8");
const motionCss = fs.readFileSync(path.join(root, "renderer/styles/motion.css"), "utf8");
const layoutCss = fs.readFileSync(path.join(root, "renderer/styles/layout.css"), "utf8");
const settingsHtml = html.match(/<dialog id="settings-modal"[\s\S]*?<\/dialog>/)?.[0] || "";

test("settings center exposes one selected module with reciprocal tab-panel labels", () => {
  assert.match(settingsHtml, /aria-labelledby="settings-heading"/);
  assert.match(settingsHtml, /<h3 id="settings-heading">设置<\/h3>/);
  assert.match(settingsHtml, /class="[^"]*settings-center/);
  assert.equal([...settingsHtml.matchAll(/role="tablist"/g)].length, 1);
  const tabs = [...settingsHtml.matchAll(/<button\b[^>]*role="tab"[^>]*>/g)].map(match => match[0]);
  const panels = [...settingsHtml.matchAll(/<section\b[^>]*role="tabpanel"[^>]*>/g)].map(match => match[0]);
  assert.equal(tabs.length, 3);
  assert.equal(panels.length, 3);
  assert.equal(tabs.filter(tab => /aria-selected="true"/.test(tab)).length, 1);
  assert.equal(panels.filter(panel => !/\bhidden\b/.test(panel)).length, 1);
  for (const [section, label] of [["general", "通用"], ["ai", "AI 服务"], ["storage", "数据存储"]]) {
    const tab = tabs.find(value => value.includes(`data-settings-section="${section}"`));
    const panel = panels.find(value => value.includes(`data-settings-section="${section}"`));
    assert.ok(tab && panel, section);
    assert.match(tab, new RegExp(`id="settings-tab-${section}"`));
    assert.match(tab, new RegExp(`aria-controls="settings-panel-${section}"`));
    assert.match(panel, new RegExp(`id="settings-panel-${section}"`));
    assert.match(panel, new RegExp(`aria-labelledby="settings-tab-${section}"`));
    assert.match(settingsHtml, new RegExp(`>${label}</span>`));
  }
  assert.match(tabs[0], /aria-selected="true"[^>]*tabindex="0"/);
  assert.ok(tabs.slice(1).every(tab => /aria-selected="false"[^>]*tabindex="-1"/.test(tab)));
  assert.match(settingsHtml, /data-close-modal[^>]*aria-label="关闭设置"/);
});

test("settings startup switch and API visibility retain stable accessible control hooks", () => {
  assert.match(settingsHtml, /<input id="auto-start-input"[^>]*type="checkbox"[^>]*aria-labelledby="auto-start-label"/);
  assert.match(settingsHtml, /id="auto-start-label"[^>]*>开机自启动</);
  for (const id of ["provider-select", "base-url-input", "model-input", "api-key-input", "save-key-btn", "data-path-hint"]) {
    assert.match(settingsHtml, new RegExp(`id="${id}"`));
  }
  assert.match(settingsHtml, /id="api-key-input"[^>]*type="password"/);
  assert.match(settingsHtml, /id="toggle-api-key-btn"[^>]*aria-label="切换 API Key 可见性"[^>]*aria-pressed="false"/);
  assert.match(settingsHtml, /id="toggle-api-key-btn"[^>]*aria-controls="api-key-input"/);
});

test("storage paths and migration consequences are visible within the owning panel", () => {
  const panels = [...settingsHtml.matchAll(/<section\b[^>]*role="tabpanel"[\s\S]*?<\/section>/g)].map(match => match[0]);
  const ai = panels.find(panel => panel.includes('data-settings-section="ai"')) || "";
  const storage = panels.find(panel => panel.includes('data-settings-section="storage"')) || "";
  assert.match(ai, /id="save-key-btn"[^>]*>保存 AI 配置</);
  assert.doesNotMatch(storage, /id="save-key-btn"/);
  for (const id of ["data-current-path", "data-selected-path", "choose-data-directory-btn", "migrate-data-btn", "storage-status"]) {
    assert.match(storage, new RegExp(`id="${id}"`));
  }
  assert.match(storage, /id="migration-warning"[^>]*>[\s\S]*?重启[\s\S]*?迁移[\s\S]*?备份/);
  assert.doesNotMatch(storage.match(/<[^>]+id="migration-warning"[^>]*>/)?.[0] || "", /title=|\bhidden\b/);
  assert.match(storage, /id="migrate-data-btn"[^>]*aria-describedby="migration-warning"[^>]*disabled/);
  assert.match(storage, /id="storage-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(settingsHtml, /未选择新目录/);
});

test("settings ledger keeps the fixed header, wraps paths and reflows navigation below 640px", () => {
  assert.match(layoutCss, /\.settings-center\s*\{[^}]*grid-template-columns:\s*172px minmax\(0, 1fr\)/s);
  assert.match(layoutCss, /\.settings-center__content\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(layoutCss, /@media \(max-width: 639px\)[\s\S]*?\.settings-center\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(layoutCss, /@media \(max-width: 639px\)[\s\S]*?\.settings-nav\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(componentsCss, /\.settings-path\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(componentsCss, /\.settings-center-dialog\s*\{[^}]*width:\s*min\(820px, calc\(100vw - 32px\)\)/s);
  assert.match(componentsCss, /\.settings-switch input:focus-visible/);
  assert.match(componentsCss, /\.settings-center \.btn-primary\s*\{[^}]*color:\s*var\(--surface-raised\)[^}]*background:\s*var\(--accent-strong\)/s);
  assert.match(motionCss, /@keyframes settings-section-enter/);
  const motion = motionCss.match(/@keyframes settings-section-enter\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(motion, /filter:|height:|width:|padding:|margin:/);
  assert.match(motionCss, /prefers-reduced-motion: reduce/);
});

test("V1.2 shell preserves behavioral IDs and adds semantic regions", () => {
  for (const id of [
    "task-form", "task-title", "task-desc", "task-time", "task-priority", "task-type",
    "task-recurrence", "task-reminder-error", "task-parent", "task-list", "chat-box", "user-input", "send-btn", "settings-modal",
    "task-note-dialog", "confirm-dialog", "brightness-slider", "theme-toggle"
  ]) assert.match(html, new RegExp(`id=["']${id}["']`), id);
  assert.match(html, /class="[^"]*task-workbench/);
  assert.match(html, /class="[^"]*ai-sidecar/);
});

test("runtime scripts and styles are local", () => {
  assert.doesNotMatch(html, /<(script|link)[^>]+(src|href)=["']https?:\/\//i);
  assert.ok(html.indexOf("icon-utils.js") < html.indexOf("app.js"));
  const recurrenceScript = html.indexOf('src="recurrence-model.js"');
  assert.ok(recurrenceScript >= 0, "recurrence model script should be loaded");
  assert.ok(recurrenceScript < html.indexOf('src="task-model.js"'));
  for (const file of ["tokens", "base", "layout", "components", "motion"]) {
    assert.match(entryCss, new RegExp(`@import url\\(["']styles/${file}\\.css["']\\)`));
  }
});

test("primary interface no longer uses emoji as controls", () => {
  assert.doesNotMatch(html, /[🌙☀️📋🤖🆕🧹⚙️📎🧠📝]/u);
});

test("task workbench exposes progressive composition and labelled filters", () => {
  assert.match(html, /class="[^"]*task-composer/);
  assert.match(html, /id="task-time"[^>]+aria-describedby="task-reminder-error"/);
  assert.match(html, /id="task-reminder-error"[^>]+role="alert"[^>]+aria-live="polite"/);
  assert.match(html, /id="task-recurrence"[\s\S]*?<option value="none" selected>不重复<\/option>/);
  assert.match(html, /aria-label="任务筛选"/);
  assert.match(html, /data-filter="attention"/);
  assert.match(html, /data-filter="active"/);
  assert.match(html, /data-filter="completed"/);
});

test("recurring task submission requires a reminder and stores a normalized recurrence", () => {
  assert.match(appSource, /function setReminderValidation\(/);
  assert.match(appSource, /function syncRecurrenceAvailability\(/);
  assert.match(appSource, /recurrenceModel\.createRecurrence\(recurrenceType, remindTime\)/);
  assert.match(appSource, /重复任务需要设置首次提醒时间/);
});

test("recurring runtime persists reminder fingerprints and schedules the next 04:00 boundary", () => {
  assert.match(appSource, /reminderFingerprints:\s*"smart_reminder_fingerprints"/);
  assert.match(appSource, /let recurrenceTimer = null/);
  assert.match(appSource, /function scheduleNextRecurrenceBoundary\(/);
  assert.match(appSource, /recurrenceModel\.getNextDailyBoundary\(new Date\(\)\)/);
  assert.match(appSource, /recurrenceTimer\s*=\s*setTimeout\(/);
  assert.match(appSource, /function applyRecurringTaskRollovers\(/);
  assert.match(appSource, /document\.addEventListener\("visibilitychange"[\s\S]*?applyRecurringTaskRollovers\(\)/);
  assert.match(appSource, /recurrenceModel\.getReminderFingerprint\(task\)/);
  assert.match(appSource, /function saveReminderFingerprints\(/);
});

test("native reminder delivery contains asynchronous bridge failures", () => {
  const body = appSource.match(/async function fireReminder\(task\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(body, /await window\.desktop\.notify\(title, body\)/);
  assert.match(body, /catch \(e\)/);
});

test("carryover attachments resolve through their source task without deleting source files", () => {
  assert.match(appSource, /taskModel\.getAttachmentOwnerId\(task, attachment\)/);
  assert.match(appSource, /taskId:\s*actionElement\.dataset\.taskId/);
  assert.match(appSource, /const localRemovedAttachments = draft\.removedAttachments/);
  assert.match(appSource, /filter\(attachment => !attachment\.sourceTaskId\)/);
  assert.match(appSource, /taskModel\.buildAttachmentReferences\(tasks\)/);
});

test("motion dependencies load before application code", () => {
  assert.ok(html.indexOf("vendor/gsap.min.js") < html.indexOf("motion.js"));
  assert.ok(html.indexOf("motion.js") < html.indexOf("app.js"));
});

test("dialogs use the shared sheet anatomy", () => {
  assert.match(html, /class="[^"]*dialog-sheet__head/);
  assert.match(html, /class="[^"]*dialog-sheet__body/);
  assert.match(html, /class="[^"]*dialog-sheet__foot/);
});

test("semantic outline and task rows avoid decorative-only structure", () => {
  assert.match(html, /<div id="empty-tip"[\s\S]*?<h2>从一件要紧的事开始<\/h2>/);
  assert.match(componentsCss, /\.empty-state h2\s*\{/);
  assert.doesNotMatch(componentsCss, /\.task-row__rail\s*\{/);
});

test("motion stylesheet only transitions composited visual properties", () => {
  assert.doesNotMatch(motionCss, /transition:\s*min-height/);
});

test("reminder editing guards native double-click repaint failures", () => {
  const guard = appSource.match(/function guardReminderTimeDoubleClick[\s\S]*?\n\}/)?.[0] || "";
  assert.match(guard, /event\.detail\s*>\s*1/);
  assert.match(guard, /event\.preventDefault\(\)/);
  assert.match(appSource, /els\.time\.addEventListener\("mousedown", guardReminderTimeDoubleClick\)/);

  const disableHardwareAcceleration = mainSource.indexOf("app.disableHardwareAcceleration()");
  assert.ok(disableHardwareAcceleration >= 0, "production should opt into stable software composition");
  assert.ok(disableHardwareAcceleration < mainSource.indexOf("app.whenReady()"));
});

test("brightness popover keeps a continuous hover path to the slider", () => {
  assert.match(componentsCss, /\.brightness-control::before\s*\{[\s\S]*?top:\s*100%[\s\S]*?height:\s*\d+px/);
  assert.match(componentsCss, /\.brightness-control:(?:hover|focus-within)[\s\S]*?\.brightness-control\.is-open/);
});

test("brightness percentage reserves one line for three digits", () => {
  const rule = [...componentsCss.matchAll(/\.brightness-control output\s*\{[^}]*\}/gs)]
    .map(match => match[0])
    .find(value => /white-space:\s*nowrap/.test(value)) || "";
  assert.match(rule, /white-space:\s*nowrap/);
  assert.match(rule, /min-width:\s*4ch/);
  assert.match(rule, /text-align:\s*right/);
  assert.match(rule, /font-variant-numeric:\s*tabular-nums/);
});

test("interactive controls expose restrained press and selection feedback", () => {
  assert.match(motionCss, /transition:[^;]*transform/);
  assert.match(componentsCss, /:active:not\(:disabled\)[\s\S]*?transform:/);
  assert.match(html, /data-filter="active"[^>]+aria-pressed="true"/);
  assert.match(appSource, /setAttribute\("aria-pressed", String\(b === btn\)\)/);
});

test("header, task controls, and chat messages use natural flow without corrective offsets", () => {
  const rule = selector => componentsCss.match(new RegExp(`${selector}\\s*\\{[^}]*\\}`, "s"))?.[0] || "";
  assert.doesNotMatch(rule("\\.brand-principle"), /transform\s*:/);
  assert.doesNotMatch(rule("\\.task-btn\\.subtask"), /transform\s*:/);
  assert.doesNotMatch(rule("\\.msg\\.user"), /transform\s*:/);
  assert.doesNotMatch(rule("\\.chat-box > \\.msg\\.ai:first-child"), /transform\s*:/);
  assert.doesNotMatch(rule("\\.chat-box > \\.msg\\.ai:not\\(:first-child\\)"), /(?:transform\s*:|margin-top\s*:\s*-)/);
});
