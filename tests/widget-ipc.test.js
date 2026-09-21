const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { registerWidgetIpc } = require("../widget-ipc.js");

const HANDLED = [
  "widget:publish-snapshot",
  "widget:get-snapshot",
  "widget:toggle-task",
  "widget:task-action-result",
  "widget:set-visible",
  "widget:show-main"
];

function createWebContents(id) {
  const contents = new EventEmitter();
  contents.id = id;
  contents.sent = [];
  contents.send = function send(channel, payload) {
    this.sent.push({ channel, payload });
  };
  contents.isDestroyed = () => false;
  return contents;
}

function createHarness({ timeout = 50 } = {}) {
  const handlers = new Map();
  const ipcMain = {
    handle(channel, handler) {
      assert.equal(handlers.has(channel), false);
      handlers.set(channel, handler);
    },
    removeHandler(channel) {
      handlers.delete(channel);
    }
  };
  const mainContents = createWebContents(1);
  const widgetContents = createWebContents(2);
  const intruder = createWebContents(3);
  const mainWindow = { webContents: mainContents, isDestroyed: () => false };
  const widgetWindow = { webContents: widgetContents, isDestroyed: () => false };
  const visibility = [];
  let showMainCalls = 0;
  const registration = registerWidgetIpc({
    ipcMain,
    getMainWindow: () => mainWindow,
    getWidgetWindow: () => widgetWindow,
    setWidgetVisible(value) {
      visibility.push(value);
      return value;
    },
    showMainWindow() {
      showMainCalls += 1;
      return true;
    },
    normalizeSnapshot(value) {
      return {
        revision: Number(value?.revision) || 0,
        theme: value?.theme === "light" ? "light" : "dark",
        brightness: 100,
        tasks: []
      };
    },
    actionTimeoutMs: timeout
  });
  const invoke = (channel, sender, payload) => handlers.get(channel)({ sender }, payload);
  return {
    handlers, invoke, registration, mainContents, widgetContents, intruder, visibility,
    getShowMainCalls: () => showMainCalls
  };
}

test("registers only the fixed widget channels", () => {
  const { handlers, registration } = createHarness();
  assert.deepEqual([...handlers.keys()].sort(), [...HANDLED].sort());
  registration.dispose();
  assert.equal(handlers.size, 0);
});

test("main publishes a normalized snapshot and widget reads the latest clone", async () => {
  const harness = createHarness();
  const source = { revision: 3, theme: "light", tasks: [{ remarks: "private" }] };
  const published = await harness.invoke("widget:publish-snapshot", harness.mainContents, source);
  assert.deepEqual(published, { revision: 3, theme: "light", brightness: 100, tasks: [] });
  assert.deepEqual(harness.widgetContents.sent, [{
    channel: "widget:snapshot",
    payload: { revision: 3, theme: "light", brightness: 100, tasks: [] }
  }]);
  source.theme = "dark";
  assert.deepEqual(await harness.invoke("widget:get-snapshot", harness.widgetContents), {
    revision: 3, theme: "light", brightness: 100, tasks: []
  });
});

test("widget toggle forwards a fixed action and resolves only from the main result", async () => {
  const harness = createHarness();
  const pending = harness.invoke("widget:toggle-task", harness.widgetContents, { taskId: "task_1" });
  const action = harness.mainContents.sent.at(-1);
  assert.equal(action.channel, "widget:action");
  assert.match(action.payload.requestId, /^[0-9a-f-]{36}$/i);
  assert.deepEqual({ ...action.payload, requestId: "request" }, {
    requestId: "request", type: "toggle-complete", taskId: "task_1"
  });
  assert.equal(await harness.invoke("widget:task-action-result", harness.mainContents, {
    requestId: action.payload.requestId,
    ok: true,
    message: ""
  }), true);
  assert.deepEqual(await pending, { ok: true, message: "" });
  await assert.rejects(harness.invoke("widget:task-action-result", harness.mainContents, {
    requestId: action.payload.requestId,
    ok: true,
    message: ""
  }), /请求不存在|已完成/);
});

test("unknown and timed-out actions reject safely", async () => {
  const harness = createHarness({ timeout: 5 });
  await assert.rejects(harness.invoke("widget:task-action-result", harness.mainContents, {
    requestId: "00000000-0000-4000-8000-000000000001",
    ok: false,
    message: "late"
  }));
  await assert.rejects(
    harness.invoke("widget:toggle-task", harness.widgetContents, { taskId: "task_2" }),
    /超时/
  );
});

test("sender and payload boundaries reject privilege escalation", async () => {
  const harness = createHarness();
  const invalidCalls = [
    ["widget:publish-snapshot", harness.intruder, {}],
    ["widget:get-snapshot", harness.mainContents, undefined],
    ["widget:toggle-task", harness.mainContents, { taskId: "task_1" }],
    ["widget:toggle-task", harness.widgetContents, { taskId: "../task" }],
    ["widget:toggle-task", harness.widgetContents, { taskId: "task_1", done: true }],
    ["widget:task-action-result", harness.widgetContents, { requestId: "x", ok: true, message: "" }],
    ["widget:set-visible", harness.intruder, { visible: true }],
    ["widget:set-visible", harness.mainContents, { visible: true, focus: true }],
    ["widget:show-main", harness.mainContents, undefined],
    ["widget:show-main", harness.widgetContents, {}]
  ];
  for (const [channel, sender, payload] of invalidCalls) {
    await assert.rejects(async () => harness.invoke(channel, sender, payload));
  }
});

test("main controls visibility while widget may only hide itself and open main", async () => {
  const harness = createHarness();
  assert.equal(await harness.invoke("widget:set-visible", harness.mainContents, { visible: true }), true);
  assert.equal(await harness.invoke("widget:set-visible", harness.widgetContents, { visible: false }), false);
  await assert.rejects(harness.invoke("widget:set-visible", harness.widgetContents, { visible: true }));
  assert.deepEqual(harness.visibility, [true, false]);
  assert.equal(await harness.invoke("widget:show-main", harness.widgetContents), true);
  assert.equal(harness.getShowMainCalls(), 1);
});
