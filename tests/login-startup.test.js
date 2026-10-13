const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const modulePath = path.join(__dirname, "..", "login-startup.js");
const adapters = fs.existsSync(modulePath) ? require(modulePath) : {};
const execPath = "C:\\SmartTodo\\SmartTodo.exe";

for (const spec of [
  { name: "portable", env: { PORTABLE_EXECUTABLE_FILE: "D:\\Apps\\SmartTodo.exe" }, packaged: true, wantPath: "D:\\Apps\\SmartTodo.exe", wantArgs: ["--hidden"] },
  { name: "packaged", env: {}, packaged: true, wantPath: execPath, wantArgs: ["--hidden"] },
  { name: "development", env: {}, packaged: false, wantPath: execPath, wantArgs: ["C:\\Source\\SmartTodo", "--hidden"] }
]) {
  test(`${spec.name} startup writes and reads the persistent full launch specification`, () => {
    const app = fakeApp(true, { launchItems: [{ path: spec.wantPath, args: spec.wantArgs, enabled: true }] });
    app.isPackaged = spec.packaged;
    app.getAppPath = () => "C:\\Source\\SmartTodo";
    const options = { app, platform: "win32", execPath, env: spec.env, enabled: true };
    assert.deepEqual(adapters.writeAutoStartState(options), { available: true, enabled: true });
    assert.deepEqual(app.writes, [{ openAtLogin: true, path: spec.wantPath, args: spec.wantArgs }]);
    assert.deepEqual(app.reads, [{ path: spec.wantPath, args: spec.wantArgs }]);
  });
}

test("invalid portable launcher paths cannot register the extracted executable", () => {
  for (const value of ["", "relative.exe", "C:\\Apps\\bad\0.exe"]) {
    const app = fakeApp(true);
    assert.throws(() => adapters.writeAutoStartState({ app, platform: "win32", execPath,
      env: { PORTABLE_EXECUTABLE_FILE: value }, enabled: true }));
    assert.deepEqual(app.writes, []);
  }
});

function fakeApp(actualEnabled, windowsSettings = {}) {
  const reads = [];
  const writes = [];
  return {
    reads, writes,
    getLoginItemSettings(options) {
      reads.push(options);
      return { openAtLogin: actualEnabled, ...windowsSettings };
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

function launchItem({ enabled, path: itemPath = execPath, args = ["--hidden"] }) {
  return { name: "SmartTodo", path: itemPath, args, scope: "user", enabled };
}

test("a retained Run registration disabled by Windows is reported as disabled", () => {
  const app = fakeApp(true, {
    executableWillLaunchAtLogin: false,
    launchItems: [launchItem({ enabled: false })]
  });
  assert.deepEqual(adapters.readAutoStartState({ app, platform: "win32", execPath }), {
    available: true, enabled: false
  });
});

test("an approved matching hidden registration is reported as enabled", () => {
  const app = fakeApp(true, {
    executableWillLaunchAtLogin: true,
    launchItems: [launchItem({ enabled: true, path: "c:/smarttodo/SMARTTODO.exe" })]
  });
  assert.deepEqual(adapters.readAutoStartState({ app, platform: "win32", execPath }), {
    available: true, enabled: true
  });
});

test("an approved hidden registration remains enabled when Electron omits launch item arguments", () => {
  const app = fakeApp(true, {
    executableWillLaunchAtLogin: true,
    launchItems: [launchItem({ enabled: true, args: [] })]
  });
  assert.deepEqual(adapters.readAutoStartState({ app, platform: "win32", execPath }), {
    available: true, enabled: true
  });
});

test("an enabled registration with different arguments cannot mask a disabled hidden registration", () => {
  const app = fakeApp(true, {
    executableWillLaunchAtLogin: true,
    launchItems: [
      launchItem({ enabled: false }),
      launchItem({ enabled: true, args: ["--other"] })
    ]
  });
  assert.deepEqual(adapters.readAutoStartState({ app, platform: "win32", execPath }), {
    available: true, enabled: false
  });
});

test("approval for another executable cannot enable hidden startup", () => {
  const app = fakeApp(true, {
    executableWillLaunchAtLogin: true,
    launchItems: [
      launchItem({ enabled: false }),
      launchItem({ enabled: true, path: "C:\\Other\\Other.exe" })
    ]
  });
  assert.deepEqual(adapters.readAutoStartState({ app, platform: "win32", execPath }), {
    available: true, enabled: false
  });
});

test("Windows executable approval is used when launch item details are unavailable", () => {
  const app = fakeApp(true, { executableWillLaunchAtLogin: false });
  assert.deepEqual(adapters.readAutoStartState({ app, platform: "win32", execPath }), {
    available: true, enabled: false
  });
});

test("disabled matching launch item readback overrides a requested enablement", () => {
  const app = fakeApp(true, { launchItems: [launchItem({ enabled: false })] });
  assert.deepEqual(adapters.writeAutoStartState({ app, platform: "win32", execPath, enabled: true }), {
    available: true, enabled: false
  });
  assert.deepEqual(app.writes, [{ openAtLogin: true, path: execPath, args: ["--hidden"] }]);
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
