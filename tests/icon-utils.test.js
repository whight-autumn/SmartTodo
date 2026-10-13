const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const { ICON_NAMES, iconMarkup } = require("../renderer/icon-utils.js");

test("icon vocabulary covers every V1.2 control", () => {
  for (const name of [
    "theme", "add", "pin", "subtask", "note", "delete", "collapse",
    "undo", "new-session", "clear", "settings", "upload", "analyze",
    "send", "close", "file", "image", "warning", "check"
  ]) assert.equal(ICON_NAMES.has(name), true, name);
});

test("icon markup is decorative by default and rejects unknown names", () => {
  assert.match(iconMarkup("theme"), /aria-hidden="true"/);
  assert.throws(() => iconMarkup("unknown"), /未知图标/);
});

test("labelled icon markup exposes a safe accessible name", () => {
  const markup = iconMarkup("delete", { label: "删除任务" });
  assert.match(markup, /role="img"/);
  assert.match(markup, /aria-label="删除任务"/);
});

test("settings center control icons resolve to authored decorative SVG symbols", () => {
  const svg = fs.readFileSync(path.resolve(__dirname, "../renderer/icons.svg"), "utf8");
  for (const name of ["general", "folder", "eye", "eye-off"]) {
    assert.equal(ICON_NAMES.has(name), true, name);
    assert.match(iconMarkup(name), new RegExp(`href="icons.svg#icon-${name}"`));
    assert.match(iconMarkup(name), /aria-hidden="true"/);
    const symbol = svg.match(new RegExp(`<symbol id="icon-${name}"[^>]*>[\\s\\S]*?<\\/symbol>`))?.[0] || "";
    assert.match(symbol, /stroke="currentColor"/);
    assert.match(symbol, /stroke-width="1\.7"/);
    assert.match(symbol, /<(path|rect|circle)\b/);
  }
});

test("brightness icon renders the authored half-light symbol through the icon system", () => {
  assert.equal(iconMarkup("brightness"), '<svg class="ui-icon" aria-hidden="true" focusable="false"><use href="icons.svg#icon-brightness"></use></svg>');
  const svg = fs.readFileSync(path.resolve(__dirname, "../renderer/icons.svg"), "utf8");
  const symbol = svg.match(/<symbol id="icon-brightness"[^>]*>[\s\S]*?<\/symbol>/)?.[0] || "";
  assert.match(symbol, /viewBox="0 0 24 24"/);
  assert.match(symbol, /stroke="currentColor" stroke-width="1\.7"/);
  assert.match(symbol, /<circle cx="12" cy="12" r="8"\s*\/>/);
  assert.match(symbol, /<path d="M12 4a8 8 0 0 0 0 16Z" fill="currentColor" stroke="none"\s*\/>/);
});

test("brand assets are generated from the V1.2 master", async () => {
  const root = path.resolve(__dirname, "..");
  const svg = fs.readFileSync(path.join(root, "assets/brand/icon-master.svg"), "utf8");
  assert.match(svg, /id="bamboo"/);
  assert.match(svg, /id="firefly"/);
  assert.deepEqual(await sharp(path.join(root, "assets/icon.png")).metadata()
    .then(({ width, height }) => ({ width, height })), { width: 1024, height: 1024 });
  assert.equal(fs.statSync(path.join(root, "assets/icon.ico")).size > 1000, true);
  assert.deepEqual(await sharp(path.join(root, "assets/tray-icon.png")).metadata()
    .then(({ width, height }) => ({ width, height })), { width: 32, height: 32 });
});
