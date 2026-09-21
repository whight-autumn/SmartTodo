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

  try {
    await window.loadFile(path.join(projectRoot, "renderer", "index.html"));
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
        attachments: [{
          id: "long-file",
          name: "项目验收与不同缩放比例兼容性验证材料最终修订版本.pdf",
          storageName: "long-file.pdf",
          mimeType: "application/pdf",
          size: 4096,
          addedAt: 1800000000000
        }]
      }]));
      location.reload();
    `);
    await reloaded;

    const results = [];
    for (const viewport of viewports) {
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
          resolve({
            viewport: document.documentElement.clientWidth,
            bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            workspaceOverflow: workspace.scrollWidth - workspace.clientWidth,
            taskOverflow: taskWorkbench.scrollWidth - taskWorkbench.clientWidth,
            longTaskOverflow: longTask.scrollWidth - longTask.clientWidth,
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
    }

    process.stdout.write(JSON.stringify({ results, captures }, null, 2) + "\n");
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
