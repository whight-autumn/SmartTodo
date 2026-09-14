const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const testDataPath = path.join(os.tmpdir(), `smart-task-ui-smoke-${process.pid}`);
const lightScreenshot = path.join(os.tmpdir(), "smart-task-ui-light.png");
const darkScreenshot = path.join(os.tmpdir(), "smart-task-ui-dark.png");

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
          id: "context-parent",
          title: "关注任务的主任务上下文",
          remarks: "",
          remindTime: null,
          priority: "medium",
          parentId: null,
          done: false,
          completedAt: null,
          pinned: false,
          createdAt: new Date(2026, 8, 14, 8, 30).getTime()
        },
        {
          id: "focused-child",
          title: "需要关注的子任务",
          remarks: "",
          remindTime: null,
          priority: "high",
          parentId: "context-parent",
          done: false,
          completedAt: null,
          pinned: false,
          createdAt: new Date(2026, 8, 14, 8, 40).getTime()
        },
        {
          id: "other-child",
          title: "无需关注的兄弟任务",
          remarks: "",
          remindTime: null,
          priority: "medium",
          parentId: "context-parent",
          done: false,
          completedAt: null,
          pinned: false,
          createdAt: new Date(2026, 8, 14, 8, 35).getTime()
        },
        {
          id: "done",
          title: "完成时间记录",
          remarks: "原始备注 https://example.com/old",
          remindTime: null,
          priority: "medium",
          parentId: null,
          done: true,
          completedAt: new Date(2026, 8, 14, 10, 45).getTime(),
          pinned: false,
          createdAt: new Date(2026, 8, 13, 16, 20).getTime(),
          updatedAt: new Date(2026, 8, 13, 17, 0).getTime(),
          attachments: [
            {
              id: "image_attachment",
              name: "界面截图.png",
              storageName: "image_attachment.png",
              mimeType: "image/png",
              size: 1024,
              addedAt: new Date(2026, 8, 14, 11, 1).getTime()
            },
            {
              id: "file_attachment",
              name: "需求说明.pdf",
              storageName: "file_attachment.pdf",
              mimeType: "application/pdf",
              size: 2048,
              addedAt: new Date(2026, 8, 14, 11, 2).getTime()
            }
          ]
        }
      ]));
      location.reload();
    `);
    await reloaded;
    await new Promise(resolve => setTimeout(resolve, 500));

    const result = await window.webContents.executeJavaScript(`
      new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const initialFilter = document.querySelector(".filter-btn.active")?.dataset.filter;
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
              initialFilter,
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

    const noteResult = await window.webContents.executeJavaScript(`
      new Promise(resolve => {
        const originalTask = JSON.parse(localStorage.getItem("smart_tasks"))
          .find(task => task.id === "done");
        const originalCard = document.querySelector('[data-id="done"]');
        const originalCreated = originalCard.querySelector(".task-stamp:not(.completed):not(.updated)").innerText;
        const originalCompleted = originalCard.querySelector(".task-stamp.completed").innerText;

        originalCard.querySelector('[data-action="edit-note"]').click();
        document.getElementById("task-note-input").value = "更新后的备注 https://example.com/docs";
        document.getElementById("task-note-save").click();

        requestAnimationFrame(() => requestAnimationFrame(() => {
          const savedTask = JSON.parse(localStorage.getItem("smart_tasks"))
            .find(task => task.id === "done");
          const savedCard = document.querySelector('[data-id="done"]');
          const savedRemarks = savedCard.querySelector(".task-note-preview").innerText;
          const savedLink = savedCard.querySelector('.note-link[data-url="https://example.com/docs"]');
          const savedCreated = savedCard.querySelector(".task-stamp:not(.completed):not(.updated)").innerText;
          const savedCompleted = savedCard.querySelector(".task-stamp.completed").innerText;
          const savedUpdated = savedCard.querySelector(".task-stamp.updated").innerText;
          const attachmentCount = savedCard.querySelectorAll(".task-attachment").length;
          const image = savedCard.querySelector(".task-attachment-thumb");
          const imageUnavailable = image.closest(".task-attachment").classList.contains("is-unavailable");

          savedCard.querySelector('[data-action="edit-note"]').click();
          document.getElementById("task-note-input").value = "这次修改应被取消";
          document.querySelector('[data-action="remove-note-attachment"]').click();
          document.getElementById("task-note-cancel").click();

          requestAnimationFrame(() => requestAnimationFrame(() => {
            const afterCancelTask = JSON.parse(localStorage.getItem("smart_tasks"))
              .find(task => task.id === "done");
            resolve({
              originalRemarks: originalTask.remarks,
              savedRemarks,
              savedLinkUrl: savedLink?.dataset.url || null,
              originalCreated,
              savedCreated,
              originalCompleted,
              savedCompleted,
              originalUpdatedAt: originalTask.updatedAt,
              savedUpdatedAt: savedTask.updatedAt,
              savedUpdated,
              afterCancelRemarks: afterCancelTask.remarks,
              afterCancelUpdatedAt: afterCancelTask.updatedAt,
              afterCancelAttachments: afterCancelTask.attachments,
              attachmentCount,
              imageHasSource: image.hasAttribute("src"),
              imageUnavailable
            });
          }));
        }));
      });
    `);

    const filterResult = await window.webContents.executeJavaScript(`
      new Promise(resolve => {
        const attentionTab = document.querySelector('[data-filter="attention"]');
        attentionTab.click();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const counts = Object.fromEntries(
            [...document.querySelectorAll("[data-filter-count]")]
              .map(item => [item.dataset.filterCount, item.textContent.trim()])
          );
          resolve({
            attentionText: document.querySelector(".task-list").innerText,
            counts
          });
        }));
      });
    `);

    await window.webContents.executeJavaScript(`
      document.querySelector('[data-filter="active"]').click();
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
    assert.equal(result.initialFilter, "active");
    assert.equal(noteResult.originalRemarks, "原始备注 https://example.com/old");
    assert.equal(noteResult.savedRemarks, "更新后的备注 https://example.com/docs");
    assert.equal(noteResult.savedLinkUrl, "https://example.com/docs");
    assert.equal(noteResult.savedCreated, noteResult.originalCreated);
    assert.equal(noteResult.savedCompleted, noteResult.originalCompleted);
    assert.ok(noteResult.savedUpdatedAt > noteResult.originalUpdatedAt);
    assert.match(noteResult.savedUpdated, /编辑\s+\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    assert.equal(noteResult.afterCancelRemarks, noteResult.savedRemarks);
    assert.equal(noteResult.afterCancelUpdatedAt, noteResult.savedUpdatedAt);
    assert.equal(noteResult.afterCancelAttachments.length, 2);
    assert.ok(noteResult.afterCancelAttachments.every(attachment => (
      !("file" in attachment) && !("sourcePath" in attachment)
    )));
    assert.equal(noteResult.attachmentCount, 2);
    assert.equal(noteResult.imageHasSource, false);
    assert.equal(noteResult.imageUnavailable, true);
    assert.match(filterResult.attentionText, /浅色模式与创建时间/);
    assert.match(filterResult.attentionText, /关注任务的主任务上下文/);
    assert.match(filterResult.attentionText, /需要关注的子任务/);
    assert.doesNotMatch(filterResult.attentionText, /无需关注的兄弟任务/);
    assert.deepEqual(filterResult.counts, { attention: "2", active: "4", completed: "1" });
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
      noteResult,
      filterResult,
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
