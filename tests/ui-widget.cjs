const { app, BrowserWindow, ipcMain, screen } = require("electron");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const WidgetModel = require("../renderer/widget-model.js");
const { registerWidgetIpc } = require("../widget-ipc.js");
const { createWidgetController } = require("../widget-controller.js");
const { clampWidgetBounds } = require("../widget-window-state.js");

const projectRoot = path.resolve(__dirname, "..");
const testDataPath = path.join(os.tmpdir(), `smarttodo-widget-${process.pid}`);
const widgetCapturePath = path.join(os.tmpdir(), "smarttodo-widget-glass.png");

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(window, expression, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await wait(50);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

function assertStaticSurface() {
  const html = fs.readFileSync(path.join(projectRoot, "renderer", "widget.html"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "renderer", "widget.css"), "utf8");
  const js = fs.readFileSync(path.join(projectRoot, "renderer", "widget.js"), "utf8");
  for (const id of [
    "widget-shell", "widget-drag-region", "widget-header-hide",
    "widget-heading", "widget-date", "widget-count", "widget-list", "widget-open-main"
  ]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.doesNotMatch(`${html}\n${js}`, /widget-header-open|headerOpen/);
  assert.match(html, /<span class="widget-version">V1\.3\.0<\/span>/);
  assert.match(html, /<h1 id="widget-heading">今日要务<\/h1>/);
  assert.match(html, /<footer class="widget-footer">[\s\S]*id="widget-open-main"[\s\S]*<\/footer>/);
  assert.doesNotMatch(html, /id="widget-hide"/);
  assert.match(html, /id="widget-status"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.ok(html.indexOf('src="recurrence-model.js"') < html.indexOf('src="widget-model.js"'));
  assert.doesNotMatch(`${html}\n${js}`, /data-action="(?:edit|delete|attachment|ai|create)"/i);
  assert.match(css, /button,\s*input,\s*a,\s*\[role="button"\]\s*\{[^}]*-webkit-app-region:\s*no-drag/s);
  assert.match(css, /\.widget-task__title\s*\{[^}]*min-width:\s*0[^}]*-webkit-line-clamp:\s*2/s);
  assert.match(css, /\.widget-task\s*\{[^}]*border-bottom:\s*1px solid var\(--line\)/s);
  assert.doesNotMatch(css.match(/\.widget-task\s*\{[^}]*\}/s)?.[0] || "", /border-radius/);
  assert.match(js, /row\.classList\.add\("is-child"\)/);
  assert.match(js, /label\.textContent = text/);
  assert.match(js, /widget-task__recurrence/);
  assert.match(js, /widget-task__carryover/);
  assert.match(css, /\.widget-task\.is-child\s*\{[^}]*padding-inline-start:/s);
  const shellRule = css.match(/\.widget-shell\s*\{[^}]*\}/s)?.[0] || "";
  assert.match(shellRule, /color-mix\([\s\S]*?transparent/);
  assert.doesNotMatch(shellRule, /,\s*var\(--surface\)\s*;/);
  assert.match(css, /\.no-transparency \.widget-shell\s*\{[^}]*background:\s*var\(--surface-raised\)/s);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*transition-duration:\s*1ms\s*!important[\s\S]*transform:\s*none\s*!important/);
  assert.doesNotMatch(`${html}\n${css}\n${js}`, /\p{Extended_Pictographic}/u);
}

app.setPath("userData", testDataPath);
app.commandLine.appendSwitch("disable-gpu");

app.whenReady().then(async () => {
  let mainWindow;
  let controller;
  let registration;
  let failure = null;
  try {
    assertStaticSurface();
    mainWindow = new BrowserWindow({
      show: true,
      opacity: 0,
      skipTaskbar: true,
      width: 1000,
      height: 720,
      webPreferences: {
        preload: path.join(projectRoot, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    });
    mainWindow.webContents.on("console-message", (_event, level, message, line, source) => {
      if (level >= 2) console.error("main renderer:", message, line, source);
    });

    controller = createWidgetController({
      BrowserWindow,
      screen,
      fs,
      path,
      userDataPath: testDataPath,
      preloadPath: path.join(projectRoot, "widget-preload.js"),
      htmlPath: path.join(projectRoot, "renderer", "widget.html"),
      onVisibilityChanged(visible) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("widget:visibility", { visible });
        }
      },
      isQuitting: () => false
    });
    registration = registerWidgetIpc({
      ipcMain,
      getMainWindow: () => mainWindow,
      getWidgetWindow: controller.getWindow,
      setWidgetVisible: controller.setVisible,
      isWidgetVisible: controller.isVisible,
      showMainWindow() {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.focus();
        return true;
      },
      normalizeSnapshot: WidgetModel.normalizeWidgetSnapshot
    });

    await mainWindow.loadFile(path.join(projectRoot, "renderer", "index.html"));
    const reloadFinished = once(mainWindow.webContents, "did-finish-load");
    await mainWindow.webContents.executeJavaScript(`(() => {
      const now = Date.now();
      localStorage.clear();
      localStorage.setItem("smart_theme", "light");
      localStorage.setItem("smart_ui_brightness", "100");
      localStorage.setItem("smart_tasks", JSON.stringify([
        { id: "overdue", title: "核对逾期交付", remarks: "private", remindTime: new Date(now - 3600000).toISOString(), priority: "medium", parentId: null, done: false, completedAt: null, pinned: false, createdAt: now - 7000 },
        { id: "child-soon", title: "整理季度材料", remarks: "", remindTime: new Date(now + 1800000).toISOString(), priority: "medium", parentId: "parent", done: false, completedAt: null, pinned: false, createdAt: now - 6000, systemMeta: { role: "recurrence-carryover", sourceTaskId: "parent", sourceCycleKey: "W:2026-09-14", sourceCycleEndKey: "W:2026-09-14", missedCount: 1 } },
        { id: "parent", title: "年度计划", remarks: "", remindTime: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(), priority: "medium", parentId: null, done: false, completedAt: null, pinned: true, createdAt: now - 5000, recurrence: { type: "weekly", anchorAt: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(), activeCycleKey: RecurrenceModel.getCycleKey("weekly", new Date(now)), lastRolledAt: null } },
        { id: "high-long", title: "完成跨设备窗口缩放与超长中文标题在两行以内稳定呈现的企业级兼容性验收", remarks: "", remindTime: null, priority: "high", parentId: null, done: false, completedAt: null, pinned: false, createdAt: now - 4000 },
        { id: "normal", title: "复盘今日工作", remarks: "", remindTime: null, priority: "medium", parentId: null, done: false, completedAt: null, pinned: false, createdAt: now - 3000 },
        { id: "reserve", title: "准备明日清单", remarks: "", remindTime: null, priority: "low", parentId: null, done: false, completedAt: null, pinned: false, createdAt: now - 2000 },
        { id: "done", title: "已完成事项", remarks: "", remindTime: null, priority: "high", parentId: null, done: true, completedAt: now, pinned: false, createdAt: now - 1000 }
      ]));
      location.reload();
    })()`);
    await reloadFinished;
    await wait(350);

    mainWindow.show();
    mainWindow.focus();
    const widgetWindow = controller.create();
    widgetWindow.webContents.on("console-message", (_event, level, message, line, source) => {
      if (level >= 2) console.error("widget renderer:", message, line, source);
    });
    await once(widgetWindow.webContents, "did-finish-load");
    await waitFor(widgetWindow, "document.querySelectorAll('.widget-task').length === 5");

    assert.equal(widgetWindow.isAlwaysOnTop(), false);
    assert.equal(widgetWindow.isVisible(), true);
    assert.notEqual(BrowserWindow.getFocusedWindow()?.id, widgetWindow.id);
    await waitFor(mainWindow, `document.getElementById("task-widget-toggle").getAttribute("aria-pressed") === "true"`);

    await mainWindow.webContents.executeJavaScript(`document.getElementById("task-widget-toggle").click()`);
    await waitFor(mainWindow, `document.getElementById("task-widget-toggle").getAttribute("aria-pressed") === "false"`);
    assert.equal(widgetWindow.isVisible(), false);
    await mainWindow.webContents.executeJavaScript(`document.getElementById("task-widget-toggle").click()`);
    await waitFor(mainWindow, `document.getElementById("task-widget-toggle").getAttribute("aria-pressed") === "true"`);
    assert.equal(widgetWindow.isVisible(), true);

    const initial = await widgetWindow.webContents.executeJavaScript(`(() => {
      const title = document.querySelector('[data-task-id="high-long"] .widget-task__title');
      const style = getComputedStyle(title);
      return {
        order: [...document.querySelectorAll('.widget-task')].map(row => row.dataset.taskId),
        parent: document.querySelector('[data-task-id="child-soon"] .widget-task__parent')?.textContent,
        recurrence: document.querySelector('[data-task-id="parent"] .widget-task__recurrence')?.textContent,
        carryover: document.querySelector('[data-task-id="child-soon"] .widget-task__carryover')?.textContent,
        titleHeight: title.getBoundingClientRect().height,
        lineHeight: parseFloat(style.lineHeight),
        theme: document.documentElement.dataset.theme,
        brightness: document.documentElement.style.getPropertyValue('--widget-brightness')
      };
    })()`);
    assert.deepEqual(initial.order, ["overdue", "child-soon", "parent", "high-long", "normal"]);
    assert.equal(initial.parent, "归属 · 年度计划");
    assert.match(initial.recurrence, /^每周/);
    assert.equal(initial.carryover, "上期未完成");
    assert.ok(initial.titleHeight <= initial.lineHeight * 2 + 2);
    assert.equal(initial.theme, "light");
    fs.writeFileSync(widgetCapturePath, (await widgetWindow.webContents.capturePage()).toPNG());
    assert.ok(fs.statSync(widgetCapturePath).size > 8 * 1024);

    await mainWindow.webContents.executeJavaScript(`(() => {
      document.getElementById("theme-toggle").click();
      const slider = document.getElementById("brightness-slider");
      slider.value = "95";
      slider.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
    await waitFor(widgetWindow, "document.documentElement.dataset.theme === 'dark' && document.documentElement.style.getPropertyValue('--widget-brightness') === '95%'");

    await widgetWindow.webContents.executeJavaScript(`document.querySelector('[data-task-id="overdue"] input').click()`);
    await waitFor(widgetWindow, `!document.querySelector('[data-task-id="overdue"]') && !!document.querySelector('[data-task-id="reserve"]')`);
    const completed = await mainWindow.webContents.executeJavaScript(`JSON.parse(localStorage.getItem("smart_tasks")).find(task => task.id === "overdue").done`);
    assert.equal(completed, true);

    await mainWindow.webContents.executeJavaScript(`(() => {
      const original = Storage.prototype.setItem;
      let failNext = true;
      Storage.prototype.setItem = function(key, value) {
        if (failNext && key === "smart_tasks") {
          failNext = false;
          Storage.prototype.setItem = original;
          throw new Error("mock write failure");
        }
        return original.call(this, key, value);
      };
    })()`);
    await widgetWindow.webContents.executeJavaScript(`document.querySelector('[data-task-id="child-soon"] input').click()`);
    await waitFor(widgetWindow, "document.getElementById('widget-status').textContent.includes('任务保存失败')");
    const failedState = await widgetWindow.webContents.executeJavaScript(`({
      checked: document.querySelector('[data-task-id="child-soon"] input').checked,
      exists: !!document.querySelector('[data-task-id="child-soon"]')
    })`);
    assert.deepEqual(failedState, { checked: false, exists: true });

    for (const zoom of [1, 1.25, 1.5]) {
      widgetWindow.webContents.setZoomFactor(zoom);
      await wait(160);
      const actualZoom = await widgetWindow.webContents.getZoomFactor();
      const geometry = await widgetWindow.webContents.executeJavaScript(`(() => {
        const viewport = { width: innerWidth, height: innerHeight };
        const nodes = [...document.querySelectorAll('.widget-task, .widget-footer')];
        const readableNodes = [...document.querySelectorAll('.widget-brand__copy strong, .widget-version, .widget-tool, #widget-date, #widget-count, #widget-heading, .widget-task__title, .widget-task__meta, .widget-task__recurrence, .widget-task__carryover, .widget-action')];
        return {
          documentOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
          shellOverflow: Math.max(0, document.getElementById('widget-shell').scrollWidth - document.getElementById('widget-shell').clientWidth),
          minFontSize: Math.min(...readableNodes.map(node => parseFloat(getComputedStyle(node).fontSize))),
          contained: nodes.every(node => {
            const rect = node.getBoundingClientRect();
            return rect.left >= -1 && rect.right <= viewport.width + 1 && rect.top >= -1 && rect.bottom <= viewport.height + 1;
          })
        };
      })()`);
      assert.ok(Math.abs(actualZoom - zoom) < 0.02, JSON.stringify({ actualZoom, ...geometry }));
      assert.ok(geometry.documentOverflow <= 1, JSON.stringify(geometry));
      assert.ok(geometry.shellOverflow <= 1, JSON.stringify(geometry));
      assert.ok(geometry.minFontSize >= 11, JSON.stringify(geometry));
      assert.equal(geometry.contained, true, JSON.stringify(geometry));
    }
    widgetWindow.webContents.setZoomFactor(1);

    await widgetWindow.webContents.executeJavaScript(`document.getElementById("widget-open-main").click()`);
    await wait(180);
    assert.equal(BrowserWindow.getFocusedWindow()?.id, mainWindow.id);
    await widgetWindow.webContents.executeJavaScript(`document.getElementById("widget-header-hide").click()`);
    await wait(100);
    assert.equal(widgetWindow.isVisible(), false);

    const primary = screen.getPrimaryDisplay();
    const corrected = clampWidgetBounds(
      { x: 99999, y: 99999, width: 320, height: 440, displayId: -999 },
      screen.getAllDisplays(),
      primary
    );
    assert.ok(corrected.x >= primary.workArea.x);
    assert.ok(corrected.x + corrected.width <= primary.workArea.x + primary.workArea.width);
    assert.ok(corrected.y >= primary.workArea.y);
    assert.ok(corrected.y + corrected.height <= primary.workArea.y + primary.workArea.height);

    console.log(`Widget UI smoke passed: ${widgetCapturePath}`);
  } catch (error) {
    console.error(error);
    failure = error;
  } finally {
    registration?.dispose();
    controller?.dispose();
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    if (failure) app.exit(1);
    else app.quit();
  }
});
