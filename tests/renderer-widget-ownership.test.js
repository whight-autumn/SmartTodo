const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appSource = fs.readFileSync(path.join(__dirname, "..", "renderer", "app.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(__dirname, "..", "renderer", "index.html"), "utf8");

test("main renderer loads the widget model and provides one accessible entry", () => {
  assert.ok(htmlSource.indexOf('src="widget-model.js"') < htmlSource.indexOf('src="app.js"'));
  assert.match(htmlSource, /id="task-widget-toggle"[^>]+aria-label="显示桌面任务笺"/);
  assert.match(appSource, /const widgetModel = window\.WidgetModel/);
});

test("only a successful task save publishes a sanitized widget snapshot", () => {
  assert.match(appSource, /function publishTaskWidgetSnapshot\(\)/);
  assert.match(appSource, /widgetModel\.createWidgetSnapshot\(taskModel\.sortTasks\(tasks\)/);
  const saveBody = appSource.match(/function saveTasks\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.ok(saveBody.indexOf("saveJSON(STORAGE_KEYS.tasks, tasks)") < saveBody.indexOf("publishTaskWidgetSnapshot"));
});

test("widget completion is allowlisted and rolls back on persistence failure", () => {
  assert.match(appSource, /async function handleTaskWidgetAction\(action\)/);
  assert.match(appSource, /action\.type !== "toggle-complete"/);
  assert.match(appSource, /task\.done/);
  assert.match(appSource, /previousStates/);
  assert.match(appSource, /任务保存失败，请在主界面重试/);
  assert.match(appSource, /completeTaskWidgetAction/);
});

test("theme and persisted brightness changes republish appearance", () => {
  assert.match(appSource, /localStorage\.setItem\(STORAGE_KEYS\.theme, next\);[\s\S]{0,500}publishTaskWidgetSnapshot/);
  assert.match(appSource, /if \(persist\)[\s\S]{0,300}publishTaskWidgetSnapshot/);
  assert.match(appSource, /onTaskWidgetVisibility/);
});
