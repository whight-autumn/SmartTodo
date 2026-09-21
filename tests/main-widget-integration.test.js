const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

test("main process wires the widget through fixed controller and IPC seams", () => {
  assert.match(source, /createWidgetController/);
  assert.match(source, /registerWidgetIpc/);
  assert.match(source, /WidgetModel\.normalizeWidgetSnapshot/);
  assert.match(source, /preloadPath:\s*path\.join\(__dirname,\s*"widget-preload\.js"\)/);
  assert.match(source, /htmlPath:\s*path\.join\(__dirname,\s*"renderer",\s*"widget\.html"\)/);
});

test("tray exposes a checked desktop note item and keeps SmartTodo naming", () => {
  assert.match(source, /label:\s*"桌面任务笺"/);
  assert.match(source, /type:\s*"checkbox"/);
  assert.match(source, /checked:\s*widgetController\?\.isVisible\(\)/);
  assert.match(source, /SmartTodo/);
});

test("quit path disposes IPC and flushes then destroys the widget", () => {
  assert.match(source, /widgetIpcRegistration\?\.dispose\(\)/);
  assert.match(source, /widgetController\?\.flush\(\)/);
  assert.match(source, /widgetController\?\.dispose\(\)/);
  assert.doesNotMatch(source, /setAlwaysOnTop/);
});
