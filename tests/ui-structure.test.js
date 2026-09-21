const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "renderer/index.html"), "utf8");
const entryCss = fs.readFileSync(path.join(root, "renderer/style.css"), "utf8");
const componentsCss = fs.readFileSync(path.join(root, "renderer/styles/components.css"), "utf8");
const motionCss = fs.readFileSync(path.join(root, "renderer/styles/motion.css"), "utf8");

test("V1.2 shell preserves behavioral IDs and adds semantic regions", () => {
  for (const id of [
    "task-form", "task-title", "task-desc", "task-time", "task-priority", "task-type",
    "task-parent", "task-list", "chat-box", "user-input", "send-btn", "settings-modal",
    "task-note-dialog", "confirm-dialog", "brightness-slider", "theme-toggle"
  ]) assert.match(html, new RegExp(`id=["']${id}["']`), id);
  assert.match(html, /class="[^"]*task-workbench/);
  assert.match(html, /class="[^"]*ai-sidecar/);
});

test("runtime scripts and styles are local", () => {
  assert.doesNotMatch(html, /<(script|link)[^>]+(src|href)=["']https?:\/\//i);
  assert.ok(html.indexOf("icon-utils.js") < html.indexOf("app.js"));
  for (const file of ["tokens", "base", "layout", "components", "motion"]) {
    assert.match(entryCss, new RegExp(`@import url\\(["']styles/${file}\\.css["']\\)`));
  }
});

test("primary interface no longer uses emoji as controls", () => {
  assert.doesNotMatch(html, /[🌙☀️📋🤖🆕🧹⚙️📎🧠📝]/u);
});

test("task workbench exposes progressive composition and labelled filters", () => {
  assert.match(html, /class="[^"]*task-composer/);
  assert.match(html, /aria-label="任务筛选"/);
  assert.match(html, /data-filter="attention"/);
  assert.match(html, /data-filter="active"/);
  assert.match(html, /data-filter="completed"/);
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
