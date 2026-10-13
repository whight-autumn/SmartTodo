const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const modulePath = path.join(__dirname, "..", "login-startup.js");
const adapters = fs.existsSync(modulePath) ? require(modulePath) : {};
const execPath = "C:\\SmartTodo\\SmartTodo.exe";

function fakeApp(actualEnabled) {
  const reads = [];
  const writes = [];
  return {
    reads, writes,
    getLoginItemSettings(options) {
      reads.push(options);
      return { openAtLogin: actualEnabled };
    },
    setLoginItemSettings(options) { writes.push(options); }
  };
}

test("Windows startup reads the executable and hidden-argument registration", () => {
  assert.equal(typeof adapters.readAutoStartState, "function");
  const app = fakeApp(true);
  assert.deepEqual(adapters.readAutoStartState({ app, platform: "win32", execPath }), {
    available: true, enabled: true
  });
  assert.deepEqual(app.reads, [{ path: execPath, args: ["--hidden"] }]);
});

for (const enabled of [true, false]) {
  test(`Windows startup writes openAtLogin=${enabled} with the hidden launch arguments`, () => {
    assert.equal(typeof adapters.writeAutoStartState, "function");
    const app = fakeApp(enabled);
    assert.deepEqual(adapters.writeAutoStartState({ app, platform: "win32", execPath, enabled }), {
      available: true, enabled
    });
    assert.deepEqual(app.writes, [{ openAtLogin: enabled, path: execPath, args: ["--hidden"] }]);
    assert.deepEqual(app.reads, [{ path: execPath, args: ["--hidden"] }]);
  });
}

test("Windows startup returns the OS readback when it rejects the requested value", () => {
  assert.equal(typeof adapters.writeAutoStartState, "function");
  const app = fakeApp(false);
  assert.deepEqual(adapters.writeAutoStartState({ app, platform: "win32", execPath, enabled: true }), {
    available: true, enabled: false
  });
});

for (const platform of ["darwin", "linux"]) {
  test(`${platform} startup is unavailable without invoking Electron login APIs`, () => {
    assert.equal(typeof adapters.readAutoStartState, "function");
    assert.equal(typeof adapters.writeAutoStartState, "function");
    const app = fakeApp(true);
    const options = { app, platform, execPath, enabled: true };
    assert.deepEqual(adapters.readAutoStartState(options), { available: false, enabled: false });
    assert.deepEqual(adapters.writeAutoStartState(options), { available: false, enabled: false });
    assert.deepEqual(app.reads, []);
    assert.deepEqual(app.writes, []);
  });
}
