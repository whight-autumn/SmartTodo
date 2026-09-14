const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const testDataPath = path.join(os.tmpdir(), `smart-task-v104-smoke-${process.pid}`);
const lightScreenshot = path.join(os.tmpdir(), "smart-task-v104-light.png");
const darkScreenshot = path.join(os.tmpdir(), "smart-task-v104-dark.png");

function contrastRatio(foreground, background) {
  const rgb = value => (value.match(/\d+/g) || []).slice(0, 3).map(Number);
  const luminance = value => {
    const [red, green, blue] = rgb(value).map(channel => {
      const normalized = channel / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

app.setPath("userData", testDataPath);
app.commandLine.appendSwitch("disable-gpu");

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    width: 1400,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try {
    await window.loadFile(path.join(projectRoot, "renderer", "index.html"));
    const reloaded = once(window.webContents, "did-finish-load");
    await window.webContents.executeJavaScript(`
      localStorage.clear();
      localStorage.setItem("smart_theme", "light");
      localStorage.setItem("smart_tasks", JSON.stringify([
        {
          id: "active",
          title: "浅色模式与创建时间",
          remarks: "用于真实界面检查",
          remindTime: "2026-09-15T02:30:00.000Z",
          priority: "high",
          parentId: null,
          done: false,
          completedAt: null,
          pinned: false,
          createdAt: new Date(2026, 8, 14, 9, 5).getTime()
        },
        {
          id: "done",
          title: "完成时间记录",
          remarks: "",
          remindTime: null,
          priority: "medium",
          parentId: null,
          done: true,
          completedAt: new Date(2026, 8, 14, 10, 45).getTime(),
          pinned: false,
          createdAt: new Date(2026, 8, 13, 16, 20).getTime()
        }
      ]));
      location.reload();
    `);
    await reloaded;
    await new Promise(resolve => setTimeout(resolve, 500));

    const result = await window.webContents.executeJavaScript(`
      new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const slider = document.getElementById("brightness-slider");
          slider.value = "120";
          slider.dispatchEvent(new Event("input", { bubbles: true }));
          slider.dispatchEvent(new Event("change", { bubbles: true }));
          const storedBrightness = localStorage.getItem("smart_ui_brightness");
          slider.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
          const typeTag = document.querySelector(".task-type-tag");
          const priorityTag = document.querySelector(".priority-high");
          const typeStyle = getComputedStyle(typeTag);
          const priorityStyle = getComputedStyle(priorityTag);
          const activeText = document.querySelector(".task-meta").innerText;
          const lightTheme = {
            theme: document.documentElement.dataset.theme,
            bodyBackground: getComputedStyle(document.body).backgroundColor,
            primaryText: getComputedStyle(document.body).color,
            typeColor: typeStyle.color,
            typeBackground: typeStyle.backgroundColor,
            priorityColor: priorityStyle.color,
            priorityBackground: priorityStyle.backgroundColor
          };
          document.querySelector('[data-filter="completed"]').click();
          requestAnimationFrame(() => requestAnimationFrame(() => {
            resolve({
              activeText,
              completedText: document.querySelector(".task-meta").innerText,
              storedBrightness,
              resetBrightness: localStorage.getItem("smart_ui_brightness"),
              brightnessOutput: document.getElementById("brightness-value").textContent,
              lightTheme
            });
          }));
        }));
      });
    `);

    await window.webContents.executeJavaScript(`
      document.querySelector('[data-filter="all"]').click();
      new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    `);
    await new Promise(resolve => setTimeout(resolve, 500));
    fs.writeFileSync(lightScreenshot, (await window.webContents.capturePage()).toPNG());

    await window.webContents.executeJavaScript(`
      document.getElementById("theme-toggle").click();
      const slider = document.getElementById("brightness-slider");
      slider.value = "85";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    `);
    await new Promise(resolve => setTimeout(resolve, 500));
    const darkTheme = await window.webContents.executeJavaScript(`
      (() => {
        const typeTag = document.querySelector(".task-type-tag");
        return {
          theme: document.documentElement.dataset.theme,
          bodyBackground: getComputedStyle(document.body).backgroundColor,
          primaryText: getComputedStyle(document.body).color,
          panelBackground: getComputedStyle(document.querySelector(".panel")).backgroundColor,
          typeColor: getComputedStyle(typeTag).color,
          typeBackground: getComputedStyle(typeTag).backgroundColor
        };
      })()
    `);
    assert.match(result.activeText, /创建\s+2026-09-14 09:05/);
    assert.match(result.completedText, /创建\s+2026-09-13 16:20/);
    assert.match(result.completedText, /完成\s+2026-09-14 10:45/);
    assert.equal(result.storedBrightness, "120");
    assert.equal(result.resetBrightness, "100");
    assert.equal(result.brightnessOutput, "100%");
    assert.equal(result.lightTheme.theme, "light");
    assert.equal(darkTheme.theme, "dark");
    assert.ok(
      contrastRatio(result.lightTheme.typeColor, result.lightTheme.typeBackground) >= 4.5,
      "light theme type label must remain readable"
    );
    assert.ok(
      contrastRatio(result.lightTheme.priorityColor, result.lightTheme.priorityBackground) >= 4.5,
      "light theme priority label must remain readable"
    );
    fs.writeFileSync(darkScreenshot, (await window.webContents.capturePage()).toPNG());

    process.stdout.write(JSON.stringify({
      ...result,
      darkTheme,
      lightScreenshot,
      darkScreenshot
    }, null, 2) + "\n");
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
