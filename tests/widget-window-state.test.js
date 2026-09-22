const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_WIDGET_SIZE,
  sanitizeWidgetPreferences,
  getDefaultWidgetBounds,
  clampWidgetBounds
} = require("../widget-window-state.js");
const { EventEmitter } = require("node:events");
const { createWidgetController } = require("../widget-controller.js");

const primary = { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };

test("places a first-run widget at the right side of the work area", () => {
  assert.deepEqual(getDefaultWidgetBounds(primary.workArea), {
    x: 1582, y: 24, width: 320, height: 440
  });
  assert.deepEqual(DEFAULT_WIDGET_SIZE, { width: 320, height: 440 });
});

test("sanitizes damaged preferences to visible defaults", () => {
  assert.deepEqual(sanitizeWidgetPreferences({ visible: "no", bounds: { x: NaN } }), {
    visible: true, displayId: null, bounds: null
  });
});

test("moves bounds from a disconnected display back to the primary work area", () => {
  const result = clampWidgetBounds(
    { x: 2600, y: 120, width: 320, height: 440, displayId: 2 },
    [primary],
    primary
  );
  assert.deepEqual(result, { x: 1582, y: 24, width: 320, height: 440, displayId: 1 });
});

test("keeps every edge visible inside a negative-coordinate display", () => {
  const left = { id: 3, workArea: { x: -1600, y: 0, width: 1600, height: 900 } };
  const result = clampWidgetBounds(
    { x: -1700, y: 800, width: 320, height: 440, displayId: 3 },
    [left, primary],
    primary
  );
  assert.equal(result.x >= -1600, true);
  assert.equal(result.y + result.height <= 900, true);
});

function createControllerHarness({ saved = null } = {}) {
  const windows = [];
  const writes = [];
  const renames = [];
  const visibility = [];
  let quitting = false;
  let timer = null;

  class FakeBrowserWindow extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height };
      this.visible = false;
      this.destroyed = false;
      this.showCalls = 0;
      this.showInactiveCalls = 0;
      this.focusCalls = 0;
      this.loaded = null;
      this.webContents = { send() {}, isDestroyed: () => false };
      windows.push(this);
    }
    loadFile(value) { this.loaded = value; }
    getBounds() { return { ...this.bounds }; }
    setBounds(value) { this.bounds = { ...value }; }
    isVisible() { return this.visible; }
    isDestroyed() { return this.destroyed; }
    show() { this.showCalls += 1; this.visible = true; }
    showInactive() { this.showInactiveCalls += 1; this.visible = true; this.emit("show"); }
    focus() { this.focusCalls += 1; }
    hide() { this.visible = false; this.emit("hide"); }
    destroy() { this.destroyed = true; this.emit("closed"); }
  }

  const fs = {
    readFileSync() {
      if (saved === null) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return JSON.stringify(saved);
    },
    mkdirSync() {},
    writeFileSync(file, value) { writes.push({ file, value: JSON.parse(value) }); },
    renameSync(from, to) { renames.push({ from, to }); }
  };
  const controller = createWidgetController({
    BrowserWindow: FakeBrowserWindow,
    screen: {
      getAllDisplays: () => [primary],
      getPrimaryDisplay: () => primary,
      getDisplayMatching: () => primary
    },
    fs,
    path: require("node:path"),
    userDataPath: "C:\\profile",
    preloadPath: "C:\\app\\widget-preload.js",
    htmlPath: "C:\\app\\renderer\\widget.html",
    onVisibilityChanged(value) { visibility.push(value); },
    isQuitting: () => quitting,
    setTimeoutFn(callback) { timer = callback; return 7; },
    clearTimeoutFn() { timer = null; }
  });
  return {
    controller, windows, writes, renames, visibility,
    runTimer() { const callback = timer; timer = null; callback?.(); },
    setQuitting(value) { quitting = value; }
  };
}

test("controller creates one safe non-activating transparent widget window", async () => {
  const harness = createControllerHarness();
  const first = harness.controller.create();
  const second = harness.controller.create();
  assert.equal(first, second);
  assert.equal(harness.windows.length, 1);
  assert.deepEqual(first.options, {
    width: 320,
    height: 440,
    x: 1582,
    y: 24,
    frame: false,
    transparent: true,
    show: false,
    alwaysOnTop: false,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: "C:\\app\\widget-preload.js",
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  assert.equal(first.loaded, "C:\\app\\renderer\\widget.html");
  assert.equal(first.showInactiveCalls, 1);
  assert.equal(first.showCalls, 0);
  assert.equal(first.focusCalls, 0);
});

test("controller clamps before show and close hides without destroying", () => {
  const harness = createControllerHarness({
    saved: { visible: false, displayId: 9, bounds: { x: 4000, y: 4000, width: 320, height: 440 } }
  });
  const window = harness.controller.create();
  assert.equal(window.isVisible(), false);
  window.bounds = { x: 4000, y: 4000, width: 320, height: 440 };
  harness.controller.show();
  assert.deepEqual(window.getBounds(), { x: 1582, y: 24, width: 320, height: 440 });
  const event = { prevented: false, preventDefault() { this.prevented = true; } };
  window.emit("close", event);
  assert.equal(event.prevented, true);
  assert.equal(window.isVisible(), false);
  assert.equal(window.isDestroyed(), false);
  assert.deepEqual(harness.visibility, [true, false]);
});

test("controller toggles from the authoritative native visibility state", () => {
  const harness = createControllerHarness();
  const window = harness.controller.create();
  assert.equal(window.isVisible(), true);
  assert.equal(harness.controller.toggle(), false);
  assert.equal(window.isVisible(), false);
  assert.equal(harness.controller.toggle(), true);
  assert.equal(window.isVisible(), true);
  assert.deepEqual(harness.visibility, [true, false, true]);
});

test("controller debounces atomic preference persistence", () => {
  const harness = createControllerHarness({
    saved: { visible: false, displayId: 1, bounds: { x: 1500, y: 30, width: 320, height: 440 } }
  });
  const window = harness.controller.create();
  window.bounds = { x: 1450, y: 70, width: 320, height: 440 };
  window.emit("move");
  window.emit("move");
  assert.equal(harness.writes.length, 0);
  harness.runTimer();
  assert.equal(harness.writes.length, 1);
  assert.equal(harness.writes[0].file, "C:\\profile\\widget-preferences.json.tmp");
  assert.deepEqual(harness.writes[0].value, {
    visible: false,
    displayId: 1,
    bounds: { x: 1450, y: 70, width: 320, height: 440 }
  });
  assert.deepEqual(harness.renames, [{
    from: "C:\\profile\\widget-preferences.json.tmp",
    to: "C:\\profile\\widget-preferences.json"
  }]);
});

test("controller removes listeners and destroys only while the app quits", () => {
  const firstHarness = createControllerHarness({ saved: { visible: false, displayId: null, bounds: null } });
  const first = firstHarness.controller.create();
  firstHarness.controller.dispose();
  assert.equal(first.isDestroyed(), false);
  assert.equal(first.listenerCount("move"), 0);

  const quitHarness = createControllerHarness({ saved: { visible: false, displayId: null, bounds: null } });
  const quittingWindow = quitHarness.controller.create();
  quitHarness.setQuitting(true);
  quitHarness.controller.dispose();
  assert.equal(quittingWindow.isDestroyed(), true);
});
