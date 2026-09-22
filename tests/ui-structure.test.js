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
