const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const testDataPath = path.join(os.tmpdir(), `smart-task-ui-layout-${process.pid}`);
const captures = {
  desktopLight: path.join(os.tmpdir(), "smart-task-layout-1440-light.png"),
  desktopDark: path.join(os.tmpdir(), "smart-task-layout-1440-dark.png"),
  narrowLight: path.join(os.tmpdir(), "smart-task-layout-900-light.png")
};

const viewports = [
  { width: 1366, height: 768, zoom: 1 },
  { width: 1440, height: 900, zoom: 1 },
  { width: 1920, height: 1080, zoom: 1 },
  { width: 2560, height: 1440, zoom: 1 },
  { width: 1024, height: 768, zoom: 1 },
  { width: 900, height: 700, zoom: 1 },
  { width: 1200, height: 800, zoom: 1.25 },
  { width: 1200, height: 800, zoom: 1.5 }
];
const narrowSettingsViewports = [
  { width: 640, height: 700, zoom: 1 },
  { width: 639, height: 700, zoom: 1 },
  { width: 480, height: 700, zoom: 1 }
];
const settingsBridgeScript = `(() => {
  const longPath = "D:/任务管理器资料/" + "长期项目与附件归档目录/".repeat(24) + "迁移目标";
  window.desktop = {
    getAppSettings: async () => ({ autoStart: { available: true, enabled: false },
      storage: { currentPath: longPath, isDefault: false }, migrationResult: null }),
    setAutoStart: async enabled => ({ available: true, enabled }),
    chooseDataDirectory: async () => ({ canceled: false, path: longPath,
      selectionId: "00000000-0000-4000-8000-000000000006" }),
    requestDataMigration: async () => ({ queued: true }),
    consumeMigrationResult: async () => null
  };
})();`;
const matchesFocusedViewport = viewport => !process.env.SMARTTODO_UI_VIEWPORT ||
  process.env.SMARTTODO_UI_VIEWPORT === `${viewport.width}x${viewport.height}@${viewport.zoom}`;

async function verifySettingsLayout(window, viewport, theme) {
  const result = await window.webContents.executeJavaScript(`(async () => {
    const byId = id => document.getElementById(id);
    const settle = async () => {
      await new Promise(resolve => requestAnimationFrame(resolve));
      await document.fonts.ready;
      await Promise.all(byId("settings-modal").getAnimations({ subtree: true })
        .filter(animation => animation.playState === "running").map(animation => animation.finished));
      await new Promise(resolve => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), 240));
    };
    if (document.documentElement.dataset.theme !== ${JSON.stringify(theme)}) byId("theme-toggle").click();
    byId("global-settings-btn").click(); await settle();
    const modal = byId("settings-modal"), nav = modal.querySelector('[role="tablist"]');
    const body = modal.querySelector(".settings-center__content");
    const rect = node => {
      const r = node.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const intersects = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > .5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > .5;
    const inside = (a, b) => a.width > 0 && a.height > 0 && a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
    const initialHeader = rect(modal.querySelector(".dialog-sheet__head"));
    const tabs = [...nav.querySelectorAll('[role="tab"]')];
    const tabRects = tabs.map(rect);
    const viewportRect = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const modules = [];
    for (const tab of tabs) {
      tab.click(); body.scrollTop = 0; await settle();
      const panel = byId(tab.getAttribute("aria-controls"));
      if (tab.dataset.settingsSection === "storage") { byId("choose-data-directory-btn").click(); await settle(); }
      const controls = [...panel.querySelectorAll('button,input,select')];
      const reached = [];
      let overlap = false;
      for (const control of controls) {
        control.scrollIntoView({ block: "center" }); await settle();
        reached.push({ id: control.id, reachable: inside(rect(control), rect(body)) && inside(rect(control), viewportRect) });
        const visible = controls.map(rect).filter(r => inside(r, rect(body)));
        const compared = [...tabRects, rect(modal.querySelector('[data-close-modal]')), ...visible];
        overlap ||= compared.some((r, index) => compared.slice(index + 1).some(other => intersects(r, other)));
      }
      let warningReachable = null, actionReachable = null;
      if (tab.dataset.settingsSection === "storage") {
        byId("migration-warning").scrollIntoView({ block: "center" }); await settle();
        warningReachable = inside(rect(byId("migration-warning")), rect(body));
        byId("migrate-data-btn").scrollIntoView({ block: "center" }); await settle();
        actionReachable = inside(rect(byId("migrate-data-btn")), rect(body)) && !byId("migrate-data-btn").disabled;
      }
      modules.push({ section: tab.dataset.settingsSection, selected: tab.getAttribute("aria-selected"),
        panelHidden: panel.hidden, focused: document.activeElement.id, reached, overlap,
        bodyOverflow: body.scrollWidth - body.clientWidth,
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        warningReachable, actionReachable, scrollTop: body.scrollTop,
        headerMoved: Math.abs(rect(modal.querySelector(".dialog-sheet__head")).top - initialHeader.top) > 1,
        headerTop: rect(modal.querySelector(".dialog-sheet__head")).top, initialHeaderTop: initialHeader.top,
        outerScrollTop: modal.scrollTop, outerHeight: modal.clientHeight, outerScrollHeight: modal.scrollHeight,
        outerMaxHeight: getComputedStyle(modal).maxHeight });
    }
    const snapshot = { viewport: innerWidth, theme: document.documentElement.dataset.theme,
      navWidth: parseFloat(getComputedStyle(nav).width), orientation: nav.getAttribute("aria-orientation"),
      tabsReachable: tabRects.every(r => inside(r, rect(nav)) && inside(r, viewportRect)),
      tabsOverlap: tabRects.some((r, index) => tabRects.slice(index + 1).some(other => intersects(r, other))),
      longPathPresent: byId("data-selected-path").textContent.includes("长期项目与附件归档目录/".repeat(24)), modules };
    modal.querySelector('[data-close-modal]').click(); await settle();
    return snapshot;
  })()`);
  const label = `${viewport.width}x${viewport.height}@${viewport.zoom} ${theme}`;
  if (result.modules.some(module => module.headerMoved)) process.stdout.write(JSON.stringify({ label, modules: result.modules }) + "\n");
  assert.equal(result.theme, theme, label);
  assert.equal(result.tabsReachable, true, `${label} all three tabs remain reachable`);
  assert.equal(result.tabsOverlap, false, `${label} tabs overlap`);
  assert.equal(result.longPathPresent, true, `${label} long Chinese destination fixture`);
  assert.equal(result.orientation, result.viewport <= 639 ? "horizontal" : "vertical", `${label} navigation orientation`);
  if (result.viewport >= 640) assert.equal(result.navWidth, 172, `${label} desktop navigation width`);
  for (const module of result.modules) {
    assert.equal(module.selected, "true", `${label} ${module.section} tab selects panel`);
    assert.equal(module.panelHidden, false, `${label} ${module.section} panel visible`);
    assert.equal(module.overlap, false, `${label} ${module.section} controls/tabs overlap`);
    assert.ok(module.bodyOverflow <= 1, `${label} ${module.section} settings body overflow ${module.bodyOverflow}`);
    assert.ok(module.documentOverflow <= 1, `${label} ${module.section} document overflow ${module.documentOverflow}`);
    assert.equal(module.headerMoved, false, `${label} fixed settings header`);
    assert.equal(module.outerScrollTop, 0, `${label} only the settings body scrolls`);
    assert.ok(module.outerScrollHeight - module.outerHeight <= 1, `${label} outer dialog must fit the sheet`);
    for (const control of module.reached) assert.equal(control.reachable, true, `${label} ${control.id} reachable after body scrolling`);
    if (module.section === "storage") {
      assert.equal(module.warningReachable, true, `${label} migration warning reachable after body scrolling`);
      assert.equal(module.actionReachable, true, `${label} migration action reachable after body scrolling`);
      assert.ok(module.scrollTop > 0, `${label} long path requires settings body scrolling`);
    }
  }
  return { ...viewport, ...result };
}

function writeCapture(filePath, image) {
  fs.writeFileSync(filePath, image.toPNG());
  assert.ok(fs.statSync(filePath).size > 10 * 1024, `${path.basename(filePath)} is unexpectedly small`);
}

async function settleVisualState(window, { clearToasts = false } = {}) {
  await window.webContents.executeJavaScript(`
    new Promise(resolve => setTimeout(() => {
      ${clearToasts ? 'document.getElementById("toast-container")?.replaceChildren();' : ""}
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }, 240))
  `);
}

app.setPath("userData", testDataPath);
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("force-device-scale-factor", "1");

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: true,
    opacity: 0,
    skipTaskbar: true,
    frame: false,
    width: 1400,
    height: 900,
    useContentSize: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  const rendererErrors = [], securityWarnings = [];
  window.webContents.on("console-message", (_event, level, message) => {
    if (level >= 3) rendererErrors.push(message);
    if (/Electron Security Warning/i.test(message)) securityWarnings.push(message);
  });

  try {
    await window.loadFile(path.join(projectRoot, "renderer", "index.html"));
    window.webContents.debugger.attach("1.3");
    await window.webContents.debugger.sendCommand("Page.enable");
    await window.webContents.debugger.sendCommand("Page.addScriptToEvaluateOnNewDocument", { source: settingsBridgeScript });
    const reloaded = once(window.webContents, "did-finish-load");
    await window.webContents.executeJavaScript(`
      localStorage.clear();
      localStorage.setItem("smart_theme", "light");
      localStorage.setItem("smart_tasks", JSON.stringify([{
        id: "long-content",
        title: "用于验证不同设备屏幕尺寸下任务标题不会因为窗口拉伸而重叠或撕裂的超长中文任务名称",
        remarks: "https://example.com/" + "very-long-segment-".repeat(12),
        remindTime: null,
        priority: "high",
        parentId: null,
        done: false,
        completedAt: null,
        pinned: false,
        createdAt: new Date(2026, 8, 14, 6, 30).getTime(),
        recurrence: {
          type: "weekly",
          anchorAt: "2026-09-21T09:00:00.000Z",
          activeCycleKey: "W:2026-09-21",
          lastRolledAt: null
        },
        attachments: [{
          id: "long-file",
          name: "项目验收与不同缩放比例兼容性验证材料最终修订版本.pdf",
          storageName: "long-file.pdf",
          mimeType: "application/pdf",
          size: 4096,
          addedAt: 1800000000000
        }]
      }, {
        id: "layout-child",
        title: "用于验证父任务操作区自然换行的子任务",
        remarks: "",
        remindTime: null,
        priority: "medium",
        parentId: "long-content",
        done: false,
        completedAt: null,
        pinned: false,
        createdAt: new Date(2026, 8, 14, 6, 35).getTime(),
        attachments: [],
        systemMeta: {
          role: "recurrence-carryover",
          sourceTaskId: "long-content",
          sourceCycleKey: "W:2026-09-07",
          sourceCycleEndKey: "W:2026-09-14",
          missedCount: 2
        }
      }]));
      localStorage.setItem("deepseek_chat_state", JSON.stringify({
        activeSessionId: "layout-chat",
        sessions: [{
          id: "layout-chat",
          title: "布局验证",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [
            { role: "assistant", content: "随时说～" },
            { role: "user", content: "根据我的任务列表梳理上周任务完成情况" },
            { role: "assistant", content: "我会按已完成、进行中和需要关注三个层级整理。" }
          ]
        }]
      }));
      location.reload();
    `);
    await reloaded;

    const results = [];
    const settingsResults = [];
    for (const viewport of viewports.filter(matchesFocusedViewport)) {
      window.setSize(viewport.width, viewport.height);
      window.webContents.setZoomFactor(viewport.zoom);
      await new Promise(resolve => setTimeout(resolve, 80));
      const actualZoom = window.webContents.getZoomFactor();
      assert.ok(Math.abs(actualZoom - viewport.zoom) < 0.01,
        `${viewport.width}x${viewport.height} requested zoom ${viewport.zoom}, got ${actualZoom}`);
      const geometry = await window.webContents.executeJavaScript(`
        new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
          const workspace = document.querySelector(".workspace");
          const taskWorkbench = document.querySelector(".task-workbench");
          const longTask = document.querySelector('[data-id="long-content"]');
          const aiSidecar = document.querySelector(".ai-sidecar");
          const actionRects = [...longTask.querySelectorAll('.task-row__actions > *')]
            .map(node => node.getBoundingClientRect());
          const actionOverlap = actionRects.some((rect, index) => actionRects.slice(index + 1).some(other =>
            Math.min(rect.right, other.right) - Math.max(rect.left, other.left) > .5
            && Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top) > .5
          ));
          const messages = [...document.querySelectorAll('.chat-box > .msg')]
            .map(node => node.getBoundingClientRect());
          const messageOverlap = messages.some((rect, index) => index > 0 && rect.top < messages[index - 1].bottom - .5);
          const visibleHeaderItems = [...document.querySelectorAll('.brand-tools > *')]
            .filter(node => getComputedStyle(node).display !== 'none')
            .map(node => node.getBoundingClientRect());
          const headerCenters = visibleHeaderItems.map(rect => rect.top + rect.height / 2);
          resolve({
            viewport: document.documentElement.clientWidth,
            bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            workspaceOverflow: workspace.scrollWidth - workspace.clientWidth,
            taskOverflow: taskWorkbench.scrollWidth - taskWorkbench.clientWidth,
            longTaskOverflow: longTask.scrollWidth - longTask.clientWidth,
            actionOverlap,
            messageOverlap,
            recurrenceLabel: longTask.querySelector('.task-recurrence-tag')?.textContent || '',
            carryoverLabel: document.querySelector('[data-id="layout-child"] .task-carryover-tag')?.textContent || '',
            headerCenterDelta: Math.max(...headerCenters) - Math.min(...headerCenters),
            columns: getComputedStyle(workspace).gridTemplateColumns,
            aiTop: aiSidecar.getBoundingClientRect().top,
            taskBottom: taskWorkbench.getBoundingClientRect().bottom
          });
        })))
      `);
      const label = `${viewport.width}x${viewport.height}@${viewport.zoom}`;
      for (const key of ["bodyOverflow", "workspaceOverflow", "taskOverflow", "longTaskOverflow"]) {
        assert.ok(geometry[key] <= 1, `${label} ${key}: ${geometry[key]}`);
      }
      assert.equal(geometry.actionOverlap, false, `${label} task actions overlap`);
      assert.equal(geometry.messageOverlap, false, `${label} chat messages overlap`);
      assert.match(geometry.recurrenceLabel, /^每周/, `${label} recurrence label`);
      assert.equal(geometry.carryoverLabel, "连续 2 期未完成", `${label} carryover label`);
      assert.ok(geometry.headerCenterDelta <= 1.5, `${label} header center delta: ${geometry.headerCenterDelta}`);
      if (geometry.viewport < 1024) {
        assert.ok(geometry.aiTop >= geometry.taskBottom - 1,
          `${label} should stack: aiTop ${geometry.aiTop}, taskBottom ${geometry.taskBottom}`);
      } else {
        assert.ok(geometry.columns.trim().split(/\s+/).length >= 2,
          `${label} should retain two tracks: ${geometry.columns}`);
      }
      results.push({ ...viewport, actualZoom, ...geometry });

      if (viewport.width === 1440 && viewport.height === 900 && viewport.zoom === 1) {
        await settleVisualState(window, { clearToasts: true });
        writeCapture(captures.desktopLight, await window.webContents.capturePage());
        await window.webContents.executeJavaScript('document.getElementById("theme-toggle").click()');
        await settleVisualState(window, { clearToasts: true });
        writeCapture(captures.desktopDark, await window.webContents.capturePage());
        await window.webContents.executeJavaScript('document.getElementById("theme-toggle").click()');
        await settleVisualState(window, { clearToasts: true });
      }
      if (viewport.width === 900 && viewport.height === 700 && viewport.zoom === 1) {
        await settleVisualState(window, { clearToasts: true });
        writeCapture(captures.narrowLight, await window.webContents.capturePage());
      }
      for (const theme of ["light", "dark"]) settingsResults.push(await verifySettingsLayout(window, viewport, theme));
      await window.webContents.executeJavaScript('if (document.documentElement.dataset.theme !== "light") document.getElementById("theme-toggle").click()');
    }

    for (const viewport of narrowSettingsViewports.filter(matchesFocusedViewport)) {
      window.setSize(viewport.width, viewport.height);
      window.webContents.setZoomFactor(viewport.zoom);
      await new Promise(resolve => setTimeout(resolve, 80));
      for (const theme of ["light", "dark"]) settingsResults.push(await verifySettingsLayout(window, viewport, theme));
    }
    assert.deepEqual(rendererErrors, [], "no unhandled renderer errors");
    // Existing development CSP warning is retained in the report, not suppressed.
    assert.ok(securityWarnings.every(message => /Insecure Content-Security-Policy/.test(message)), "unexpected Electron security warning");

    process.stdout.write(JSON.stringify({ results, settingsResults, captures, rendererErrors,
      securityWarnings: { count: securityWarnings.length, messages: [...new Set(securityWarnings)] } }, null, 2) + "\n");
  } finally {
    window.destroy();
    try {
      fs.rmSync(testDataPath, { recursive: true, force: true });
    } catch {}
    app.quit();
  }
}).catch(error => {
  console.error(error);
  app.exit(1);
});
