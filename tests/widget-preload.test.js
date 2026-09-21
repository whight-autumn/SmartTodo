const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadWidgetPreload() {
  const source = fs.readFileSync(path.join(__dirname, "..", "widget-preload.js"), "utf8");
  const invokes = [];
  const listeners = new Map();
  const removals = [];
  let api;
  const context = vm.createContext({
    structuredClone: value => JSON.parse(JSON.stringify(value)),
    require(moduleName) {
      assert.equal(moduleName, "electron");
      return {
        contextBridge: {
          exposeInMainWorld(name, value) {
            assert.equal(name, "taskWidget");
            api = value;
          }
        },
        ipcRenderer: {
          invoke(channel, payload) {
            invokes.push({ channel, payload });
            return Promise.resolve({ channel });
          },
          on(channel, listener) {
            listeners.set(channel, listener);
          },
          removeListener(channel, listener) {
            removals.push({ channel, listener });
            if (listeners.get(channel) === listener) listeners.delete(channel);
          }
        }
      };
    }
  });
  new vm.Script(source, { filename: "widget-preload.js" }).runInContext(context);
  return { api, invokes, listeners, removals };
}

test("widget preload exposes exactly the minimal fixed bridge", () => {
  const { api } = loadWidgetPreload();
  assert.deepEqual(Object.keys(api).sort(), [
    "getSnapshot", "onSnapshot", "setVisible", "showMainWindow", "toggleTask"
  ]);
  assert.equal(api.ipcRenderer, undefined);
  assert.equal(api.invoke, undefined);
  assert.equal(api.readFile, undefined);
});

test("widget preload invokes only fixed channels", async () => {
  const { api, invokes } = loadWidgetPreload();
  await api.getSnapshot();
  await api.toggleTask("task_1");
  await api.setVisible(false);
  await api.showMainWindow();
  assert.deepEqual(JSON.parse(JSON.stringify(invokes)), [
    { channel: "widget:get-snapshot" },
    { channel: "widget:toggle-task", payload: { taskId: "task_1" } },
    { channel: "widget:set-visible", payload: { visible: false } },
    { channel: "widget:show-main" }
  ]);
});

test("snapshot callbacks receive clones and cleanup removes the exact listener", () => {
  const { api, listeners, removals } = loadWidgetPreload();
  let received;
  const cleanup = api.onSnapshot(value => { received = value; });
  const payload = { revision: 2, tasks: [{ id: "task_1" }] };
  const listener = listeners.get("widget:snapshot");
  listener({}, payload);
  assert.deepEqual(JSON.parse(JSON.stringify(received)), payload);
  assert.notEqual(received, payload);
  assert.notEqual(received.tasks, payload.tasks);
  cleanup();
  assert.deepEqual(removals, [{ channel: "widget:snapshot", listener }]);
});
