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
        },
        {
          id: "boundary",
          title: "十个附件替换边界",
          remarks: "边界原始备注",
          remindTime: null,
          priority: "low",
          parentId: null,
          done: false,
          completedAt: null,
          pinned: false,
          createdAt: new Date(2026, 8, 14, 7, 30).getTime(),
          updatedAt: new Date(2026, 8, 14, 7, 35).getTime(),
          attachments: Array.from({ length: 10 }, (_, index) => ({
            id: "boundary_attachment_" + (index + 1),
            name: "边界附件" + (index + 1) + ".txt",
            storageName: "boundary_" + (index + 1) + ".txt",
            mimeType: "text/plain",
            size: index + 1,
            addedAt: new Date(2026, 8, 14, 7, 40 + index).getTime()
          }))
        },
        {
          id: "import-failure",
          title: "导入失败事务",
          remarks: "导入前备注",
          remindTime: null,
          priority: "low",
          parentId: null,
          done: false,
          completedAt: null,
          pinned: false,
          createdAt: new Date(2026, 8, 14, 7, 20).getTime(),
          updatedAt: new Date(2026, 8, 14, 7, 25).getTime(),
          attachments: []
        },
        {
          id: "pending-save",
          title: "保存期间阻止取消",
          remarks: "挂起前备注",
          remindTime: null,
          priority: "low",
          parentId: null,
          done: false,
          completedAt: null,
          pinned: false,
          createdAt: new Date(2026, 8, 14, 7, 10).getTime(),
          updatedAt: new Date(2026, 8, 14, 7, 15).getTime(),
          attachments: []
        },
        {
          id: "cleanup-parent",
          title: "附件目录清理父任务",
          remarks: "",
          remindTime: null,
          priority: "low",
          parentId: null,
          done: false,
          completedAt: null,
          pinned: false,
          createdAt: new Date(2026, 8, 14, 7, 0).getTime(),
          attachments: []
        },
        {
          id: "cleanup-child",
          title: "附件目录清理子任务",
          remarks: "",
          remindTime: null,
          priority: "low",
          parentId: "cleanup-parent",
          done: false,
          completedAt: null,
          pinned: false,
          createdAt: new Date(2026, 8, 14, 7, 5).getTime(),
          attachments: []
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

    await window.webContents.executeJavaScript(`
      (() => {
        const state = {
          prepareMode: "success",
          failRemovalStorageNames: [],
          failNextTaskSave: false,
          prepares: [],
          commits: [],
          rollbacks: [],
          openedUrls: [],
          cleanupCalls: [],
          unavailableStorageNames: ["file_attachment.pdf"],
          nextAttachmentId: 1,
          nextTransactionId: 1,
          pendingPrepare: null,
          transactions: new Map(),
          createdObjectUrls: [],
          revokedObjectUrls: [],
          managedFiles: {
            done: new Set(["image_attachment.png", "file_attachment.pdf"]),
            boundary: new Set(Array.from({ length: 10 }, (_, index) => "boundary_" + (index + 1) + ".txt"))
          }
        };

        function createImportedAttachments(payload) {
          return payload.files.map(file => {
            const serial = state.nextAttachmentId++;
            const name = file.name || ("附件" + serial);
            const extension = name.match(/\.[a-zA-Z0-9]{1,12}$/)?.[0].toLowerCase() || ".bin";
            return {
              id: "imported_" + serial,
              name,
              storageName: "imported_" + serial + extension,
              mimeType: file.type || "application/octet-stream",
              size: file.size || 0,
              addedAt: 1800000000000 + serial
            };
          });
        }

        function getManagedFiles(taskId) {
          state.managedFiles[taskId] ||= new Set();
          return state.managedFiles[taskId];
        }

        const nativeCreateObjectUrl = URL.createObjectURL.bind(URL);
        const nativeRevokeObjectUrl = URL.revokeObjectURL.bind(URL);
        URL.createObjectURL = value => {
          const objectUrl = nativeCreateObjectUrl(value);
          state.createdObjectUrls.push(objectUrl);
          return objectUrl;
        };
        URL.revokeObjectURL = objectUrl => {
          state.revokedObjectUrls.push(objectUrl);
          nativeRevokeObjectUrl(objectUrl);
        };

        const nativeSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
          if (key === "smart_tasks" && state.failNextTaskSave) {
            state.failNextTaskSave = false;
            throw new Error("mock localStorage failure");
          }
          return nativeSetItem.call(this, key, value);
        };

        window.__desktopMock = state;
        window.__desktopApi = {
          prepareTaskAttachmentChanges(payload) {
            state.prepares.push({
              taskId: payload.taskId,
              files: payload.files.map(file => ({ name: file.name, size: file.size, type: file.type })),
              removeStorageNames: [...payload.removeStorageNames],
              existingCount: payload.existingCount
            });
            if (state.prepareMode === "failure") {
              return Promise.reject(new Error("mock prepare failure"));
            }
            const attachments = createImportedAttachments(payload);
            const transactionId = "00000000-0000-4000-8000-"
              + String(state.nextTransactionId++).padStart(12, "0");
            const files = getManagedFiles(payload.taskId);
            const removedStorageNames = [];
            const failedStorageNames = [];
            for (const storageName of payload.removeStorageNames) {
              if (state.failRemovalStorageNames.includes(storageName) || !files.has(storageName)) {
                failedStorageNames.push(storageName);
              } else {
                files.delete(storageName);
                removedStorageNames.push(storageName);
              }
            }
            attachments.forEach(attachment => files.add(attachment.storageName));
            state.transactions.set(transactionId, {
              taskId: payload.taskId,
              importedStorageNames: attachments.map(attachment => attachment.storageName),
              removedStorageNames
            });
            const result = { transactionId, attachments, removedStorageNames, failedStorageNames };
            if (state.prepareMode === "pending") {
              return new Promise(resolve => {
                state.pendingPrepare = {
                  resolve() {
                    state.pendingPrepare = null;
                    resolve(result);
                  }
                };
              });
            }
            return Promise.resolve(result);
          },
          commitTaskAttachmentChanges(payload) {
            state.commits.push(structuredClone(payload));
            state.transactions.delete(payload.transactionId);
            return Promise.resolve(true);
          },
          rollbackTaskAttachmentChanges(payload) {
            state.rollbacks.push(structuredClone(payload));
            const transaction = state.transactions.get(payload.transactionId);
            if (transaction) {
              const files = getManagedFiles(transaction.taskId);
              transaction.importedStorageNames.forEach(storageName => files.delete(storageName));
              transaction.removedStorageNames.forEach(storageName => files.add(storageName));
              state.transactions.delete(payload.transactionId);
            }
            return Promise.resolve(true);
          },
          removeTaskAttachmentDirectories(taskIds) {
            state.cleanupCalls.push([...taskIds]);
            return Promise.resolve(true);
          },
          getTaskAttachmentUrl(payload) {
            if (state.unavailableStorageNames.includes(payload.storageName)) {
              return Promise.reject(new Error("mock missing attachment"));
            }
            return Promise.resolve("file:///managed/" + payload.storageName);
          },
          openTaskAttachment() {
            return Promise.resolve(true);
          },
          openExternalUrl(url) {
            state.openedUrls.push(url);
            return Promise.resolve(true);
          }
        };
      })()
    `);

    const noteResult = await window.webContents.executeJavaScript(`
      (async () => {
        const frames = () => new Promise(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
        const originalTask = JSON.parse(localStorage.getItem("smart_tasks"))
          .find(task => task.id === "done");
        const originalCard = document.querySelector('[data-id="done"]');
        const originalCreated = originalCard.querySelector(".task-stamp:not(.completed):not(.updated)").innerText;
        const originalCompleted = originalCard.querySelector(".task-stamp.completed").innerText;

        originalCard.querySelector('[data-action="edit-note"]').click();
        document.getElementById("task-note-save").click();
        await frames();
        const unchangedTask = JSON.parse(localStorage.getItem("smart_tasks"))
          .find(task => task.id === "done");
        const unchangedDialogOpen = document.getElementById("task-note-dialog").open;

        const editableCard = document.querySelector('[data-id="done"]');
        editableCard.querySelector('[data-action="edit-note"]').click();
        document.getElementById("task-note-input").value = "更新后的备注 https://example.com/docs";
        document.getElementById("task-note-save").click();
        await frames();
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
        const unavailableStatuses = [...savedCard.querySelectorAll(".task-attachment.is-unavailable .task-attachment-status")]
          .map(item => item.textContent.trim());

        window.desktop = window.__desktopApi;
        savedLink.click();
        await frames();
        document.querySelector('[data-id="done"] [data-action="edit-note"]').click();
        await frames();
        const editorEntries = [...document.querySelectorAll("#task-note-attachment-list .task-note-attachment-entry")];
        const editorDialogOpen = document.getElementById("task-note-dialog").open;
        const editorImage = document.getElementById("task-note-attachment-list").getElementsByTagName("img")[0] || null;
        const editorImageMarkup = editorImage?.outerHTML || "";
        const editorFileText = editorEntries.find(item => item.textContent.includes("需求说明.pdf"))?.innerText || "";
        editorImage?.dispatchEvent(new Event("error"));
        const editorImageUnavailable = editorImage?.closest(".task-note-attachment-entry")
          ?.classList.contains("is-unavailable") || false;
        const editorMissingStatuses = [...document.querySelectorAll("#task-note-attachment-list .is-unavailable .task-attachment-status")]
          .map(item => item.textContent.trim());
        document.getElementById("task-note-input").value = "这次修改应被取消";
        document.querySelector('[data-action="remove-note-attachment"]').click();
        document.getElementById("task-note-cancel").click();
        await frames();
        const afterCancelTask = JSON.parse(localStorage.getItem("smart_tasks"))
          .find(task => task.id === "done");

        const failedRemovalStart = window.__desktopMock.prepares.length;
        window.__desktopMock.failRemovalStorageNames = ["image_attachment.png"];
        document.querySelector('[data-id="done"] [data-action="edit-note"]').click();
        document.querySelector('[data-attachment-id="image_attachment"]').click();
        document.getElementById("task-note-save").click();
        await frames();
        const afterFailedRemovalTask = JSON.parse(localStorage.getItem("smart_tasks"))
          .find(task => task.id === "done");
        const failedRemovalDialogOpen = document.getElementById("task-note-dialog").open;
        const failedRemovalStatus = document.getElementById("task-note-status").textContent;
        const failedRemovalControls = {
          textareaDisabled: document.getElementById("task-note-input").disabled,
          pickerDisabled: document.getElementById("task-note-file-button").disabled,
          removeDisabled: [...document.querySelectorAll("#task-note-attachment-list button")]
            .some(button => button.disabled)
        };
        const failedRemovalCalls = window.__desktopMock.prepares.slice(failedRemovalStart);
        window.__desktopMock.failRemovalStorageNames = [];
        document.getElementById("task-note-cancel").click();
        await frames();

        return {
          originalRemarks: originalTask.remarks,
          unchangedUpdatedAt: unchangedTask.updatedAt,
          unchangedDialogOpen,
          savedRemarks,
          savedLinkUrl: savedLink?.dataset.url || null,
          openedUrls: [...window.__desktopMock.openedUrls],
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
          afterFailedRemovalTask,
          failedRemovalDialogOpen,
          failedRemovalStatus,
          failedRemovalControls,
          failedRemovalCalls,
          attachmentCount,
          imageHasSource: image.hasAttribute("src"),
          imageUnavailable,
          unavailableStatuses,
          editorDialogOpen,
          editorImageMarkup,
          editorImageUnavailable,
          editorFileText,
          editorMissingStatuses
        };
      })()
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

    const highRiskResult = await window.webContents.executeJavaScript(`
      (async () => {
        const frames = () => new Promise(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
        const readTask = taskId => JSON.parse(localStorage.getItem("smart_tasks"))
          .find(task => task.id === taskId);
        const selectFile = (name, contents = "selected file", type = "text/plain") => {
          const transfer = new DataTransfer();
          transfer.items.add(new File([contents], name, {
            type,
            lastModified: 1800000000000
          }));
          const input = document.getElementById("task-note-file-input");
          input.files = transfer.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        };
        const state = window.__desktopMock;

        document.querySelector('[data-filter="active"]').click();
        await frames();

        const importFailureBefore = structuredClone(readTask("import-failure"));
        state.prepareMode = "failure";
        document.querySelector('[data-id="import-failure"] [data-action="edit-note"]').click();
        const pickerButton = document.getElementById("task-note-file-button");
        const pickerInput = document.getElementById("task-note-file-input");
        let pickerClicks = 0;
        pickerInput.addEventListener("click", event => {
          pickerClicks += 1;
          event.preventDefault();
        }, { once: true });
        pickerButton?.click();
        const picker = {
          tagName: pickerButton?.tagName || null,
          type: pickerButton?.type || null,
          pickerClicks
        };
        document.getElementById("task-note-input").value = "不应保存的备注";
        selectFile("import-failure.txt");
        document.getElementById("task-note-save").click();
        await frames();
        const importFailure = {
          task: readTask("import-failure"),
          dialogOpen: document.getElementById("task-note-dialog").open,
          status: document.getElementById("task-note-status").textContent,
          controls: {
            textareaDisabled: document.getElementById("task-note-input").disabled,
            pickerDisabled: pickerButton.disabled,
            removeDisabled: [...document.querySelectorAll("#task-note-attachment-list button")]
              .some(button => button.disabled)
          }
        };
        document.getElementById("task-note-cancel").click();

        const boundaryBefore = structuredClone(readTask("boundary"));
        state.prepareMode = "success";
        state.failRemovalStorageNames = [];
        const boundaryImportStart = state.prepares.length;
        document.querySelector('[data-id="boundary"] [data-action="edit-note"]').click();
        document.querySelector('[data-attachment-id="boundary_attachment_10"]').click();
        selectFile("boundary-replacement.txt");
        const boundaryLimit = {
          task: readTask("boundary"),
          dialogOpen: document.getElementById("task-note-dialog").open,
          status: document.getElementById("task-note-status").textContent,
          imports: state.prepares.slice(boundaryImportStart)
        };
        document.getElementById("task-note-cancel").click();
        await frames();

        state.failRemovalStorageNames = ["boundary_7.txt"];
        const mixedRemovalStart = state.prepares.length;
        document.querySelector('[data-id="boundary"] [data-action="edit-note"]').click();
        document.querySelector('[data-attachment-id="boundary_attachment_2"]').click();
        document.querySelector('[data-attachment-id="boundary_attachment_7"]').click();
        document.getElementById("task-note-input").value = "混合删除后的备注";
        document.getElementById("task-note-save").click();
        await frames();
        const mixedRemoval = {
          task: readTask("boundary"),
          dialogOpen: document.getElementById("task-note-dialog").open,
          status: document.getElementById("task-note-status").textContent,
          controls: {
            textareaDisabled: document.getElementById("task-note-input").disabled,
            pickerDisabled: document.getElementById("task-note-file-button").disabled,
            removeDisabled: [...document.querySelectorAll("#task-note-attachment-list button")]
              .some(button => button.disabled)
          },
          removals: state.prepares.slice(mixedRemovalStart)
        };
        document.getElementById("task-note-cancel").click();
        await frames();

        state.prepareMode = "success";
        state.failRemovalStorageNames = ["file_attachment.pdf"];
        document.querySelector('[data-filter="completed"]').click();
        await frames();
        const persistenceFailureBefore = structuredClone(readTask("done"));
        const diskBeforePersistenceFailure = [...state.managedFiles.done].sort();
        const rollbackStart = state.rollbacks.length;
        const commitStart = state.commits.length;
        document.querySelector('[data-id="done"] [data-action="edit-note"]').click();
        document.querySelector('[data-attachment-id="image_attachment"]').click();
        document.querySelector('[data-attachment-id="file_attachment"]').click();
        selectFile("pending-preview.png", "preview pixels", "image/png");
        await frames();
        const pendingPreview = document.querySelector("#task-note-attachment-list .is-pending img");
        const pendingPreviewState = {
          source: pendingPreview?.getAttribute("src") || "",
          loading: pendingPreview?.getAttribute("loading") || "",
          alt: pendingPreview?.getAttribute("alt") || "",
          text: pendingPreview?.closest(".task-note-attachment-entry")?.innerText || ""
        };
        document.getElementById("task-note-input").value = "本次持久化应失败";
        state.failNextTaskSave = true;
        document.getElementById("task-note-save").click();
        await frames();
        const previewAfterFailure = document.querySelector("#task-note-attachment-list .is-pending img")
          ?.getAttribute("src") || "";
        const persistenceFailure = {
          task: readTask("done"),
          diskFiles: [...state.managedFiles.done].sort(),
          dialogOpen: document.getElementById("task-note-dialog").open,
          status: document.getElementById("task-note-status").textContent,
          controls: {
            textareaDisabled: document.getElementById("task-note-input").disabled,
            pickerDisabled: document.getElementById("task-note-file-button").disabled,
            removeDisabled: [...document.querySelectorAll("#task-note-attachment-list button")]
              .some(button => button.disabled)
          },
          rollbacks: state.rollbacks.slice(rollbackStart),
          commits: state.commits.slice(commitStart),
          previewAfterFailure,
          previewRevokedBeforeCancel: state.revokedObjectUrls.includes(pendingPreviewState.source)
        };
        document.getElementById("task-note-cancel").click();
        await frames();
        persistenceFailure.previewRevokedAfterCancel = state.revokedObjectUrls
          .includes(pendingPreviewState.source);

        document.querySelector('[data-filter="active"]').click();
        await frames();
        state.prepareMode = "pending";
        state.failRemovalStorageNames = [];
        document.querySelector('[data-id="pending-save"] [data-action="edit-note"]').click();
        document.getElementById("task-note-input").value = "挂起保存后的备注";
        selectFile("selected-and-imported.txt", "persist metadata only");
        document.getElementById("task-note-save").click();
        await Promise.resolve();
        const cancelEvent = new Event("cancel", { cancelable: true });
        const cancelDispatchResult = document.getElementById("task-note-dialog").dispatchEvent(cancelEvent);
        const pendingDialogOpen = document.getElementById("task-note-dialog").open;
        const pendingControls = {
          textareaDisabled: document.getElementById("task-note-input").disabled,
          pickerDisabled: document.getElementById("task-note-file-button").disabled,
          removeDisabled: [...document.querySelectorAll("#task-note-attachment-list button")]
            .every(button => button.disabled)
        };
        state.pendingPrepare.resolve();
        await frames();
        const pendingTask = readTask("pending-save");

        document.querySelector('[data-id="cleanup-parent"] [data-action="delete"]').click();
        await Promise.resolve();
        document.getElementById("confirm-accept").click();
        await frames();

        return {
          picker,
          importFailureBefore,
          importFailure,
          boundaryBefore,
          boundaryLimit,
          mixedRemoval,
          persistenceFailureBefore,
          diskBeforePersistenceFailure,
          pendingPreviewState,
          persistenceFailure,
          cancelDefaultPrevented: !cancelDispatchResult && cancelEvent.defaultPrevented,
          pendingDialogOpen,
          pendingControls,
          pendingDialogOpenAfterResolve: document.getElementById("task-note-dialog").open,
          pendingTask,
          cleanupIds: state.cleanupCalls.at(-1) || [],
          cleanupParentExists: !!readTask("cleanup-parent"),
          cleanupChildExists: !!readTask("cleanup-child")
        };
      })()
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
    assert.equal(noteResult.unchangedUpdatedAt, noteResult.originalUpdatedAt);
    assert.equal(noteResult.unchangedDialogOpen, false);
    assert.equal(noteResult.savedRemarks, "更新后的备注 https://example.com/docs");
    assert.equal(noteResult.savedLinkUrl, "https://example.com/docs");
    assert.deepEqual(noteResult.openedUrls, ["https://example.com/docs"]);
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
    assert.deepEqual(noteResult.unavailableStatuses, ["文件已不存在", "文件已不存在"]);
    assert.equal(noteResult.editorDialogOpen, true);
    assert.match(noteResult.editorImageMarkup, /loading="lazy"/);
    assert.equal(noteResult.editorImageUnavailable, true);
    assert.match(noteResult.editorFileText, /application\/pdf/);
    assert.deepEqual(noteResult.editorMissingStatuses, ["文件已不存在", "文件已不存在"]);
    assert.deepEqual(noteResult.afterFailedRemovalTask.attachments, noteResult.afterCancelAttachments);
    assert.equal(noteResult.afterFailedRemovalTask.updatedAt, noteResult.afterCancelUpdatedAt);
    assert.equal(noteResult.failedRemovalDialogOpen, true);
    assert.match(noteResult.failedRemovalStatus, /界面截图\.png.*移除失败/);
    assert.deepEqual(noteResult.failedRemovalControls, {
      textareaDisabled: false,
      pickerDisabled: false,
      removeDisabled: false
    });
    assert.deepEqual(noteResult.failedRemovalCalls, [{
      taskId: "done",
      files: [],
      removeStorageNames: ["image_attachment.png"],
      existingCount: 2
    }]);
    assert.deepEqual(highRiskResult.picker, {
      tagName: "BUTTON",
      type: "button",
      pickerClicks: 1
    });
    assert.deepEqual(highRiskResult.importFailure.task, highRiskResult.importFailureBefore);
    assert.equal(highRiskResult.importFailure.dialogOpen, true);
    assert.match(highRiskResult.importFailure.status, /mock prepare failure/);
    assert.deepEqual(highRiskResult.importFailure.controls, {
      textareaDisabled: false,
      pickerDisabled: false,
      removeDisabled: false
    });
    assert.deepEqual(highRiskResult.boundaryLimit.task, highRiskResult.boundaryBefore);
    assert.equal(highRiskResult.boundaryLimit.dialogOpen, true);
    assert.match(highRiskResult.boundaryLimit.status, /已有 10 个附件.*先保存移除.*重新打开/);
    assert.deepEqual(highRiskResult.boundaryLimit.imports, []);
    assert.equal(highRiskResult.mixedRemoval.dialogOpen, true);
    assert.match(highRiskResult.mixedRemoval.status, /边界附件7\.txt.*移除失败/);
    assert.deepEqual(highRiskResult.mixedRemoval.controls, {
      textareaDisabled: false,
      pickerDisabled: false,
      removeDisabled: false
    });
    assert.deepEqual(highRiskResult.mixedRemoval.removals, [{
      taskId: "boundary",
      files: [],
      removeStorageNames: ["boundary_2.txt", "boundary_7.txt"],
      existingCount: 10
    }]);
    assert.deepEqual(
      highRiskResult.mixedRemoval.task.attachments.map(attachment => attachment.id),
      [
        "boundary_attachment_1",
        "boundary_attachment_3",
        "boundary_attachment_4",
        "boundary_attachment_5",
        "boundary_attachment_6",
        "boundary_attachment_7",
        "boundary_attachment_8",
        "boundary_attachment_9",
        "boundary_attachment_10"
      ]
    );
    assert.ok(highRiskResult.mixedRemoval.task.attachments.length <= 10);
    assert.equal(highRiskResult.mixedRemoval.task.remarks, "混合删除后的备注");
    assert.ok(highRiskResult.mixedRemoval.task.updatedAt > highRiskResult.boundaryBefore.updatedAt);
    assert.match(highRiskResult.pendingPreviewState.source, /^blob:/);
    assert.equal(highRiskResult.pendingPreviewState.loading, "lazy");
    assert.match(highRiskResult.pendingPreviewState.alt, /pending-preview\.png/);
    assert.match(highRiskResult.pendingPreviewState.text, /PNG 文件/);
    assert.deepEqual(highRiskResult.persistenceFailure.task, highRiskResult.persistenceFailureBefore);
    assert.deepEqual(
      highRiskResult.persistenceFailure.diskFiles,
      highRiskResult.diskBeforePersistenceFailure
    );
    assert.equal(highRiskResult.persistenceFailure.dialogOpen, true);
    assert.match(highRiskResult.persistenceFailure.status, /mock localStorage failure/);
    assert.deepEqual(highRiskResult.persistenceFailure.controls, {
      textareaDisabled: false,
      pickerDisabled: false,
      removeDisabled: false
    });
    assert.equal(highRiskResult.persistenceFailure.rollbacks.length, 1);
    assert.deepEqual(highRiskResult.persistenceFailure.commits, []);
    assert.equal(
      highRiskResult.persistenceFailure.previewAfterFailure,
      highRiskResult.pendingPreviewState.source
    );
    assert.equal(highRiskResult.persistenceFailure.previewRevokedBeforeCancel, false);
    assert.equal(highRiskResult.persistenceFailure.previewRevokedAfterCancel, true);
    assert.equal(highRiskResult.cancelDefaultPrevented, true);
    assert.equal(highRiskResult.pendingDialogOpen, true);
    assert.deepEqual(highRiskResult.pendingControls, {
      textareaDisabled: true,
      pickerDisabled: true,
      removeDisabled: true
    });
    assert.equal(highRiskResult.pendingDialogOpenAfterResolve, false);
    assert.equal(highRiskResult.pendingTask.remarks, "挂起保存后的备注");
    assert.equal(highRiskResult.pendingTask.attachments.length, 1);
    assert.equal(highRiskResult.pendingTask.attachments[0].name, "selected-and-imported.txt");
    assert.ok(!("file" in highRiskResult.pendingTask.attachments[0]));
    assert.ok(!("sourcePath" in highRiskResult.pendingTask.attachments[0]));
    assert.deepEqual(highRiskResult.cleanupIds, ["cleanup-parent", "cleanup-child"]);
    assert.equal(highRiskResult.cleanupParentExists, false);
    assert.equal(highRiskResult.cleanupChildExists, false);
    assert.match(filterResult.attentionText, /浅色模式与创建时间/);
    assert.match(filterResult.attentionText, /关注任务的主任务上下文/);
    assert.match(filterResult.attentionText, /需要关注的子任务/);
    assert.doesNotMatch(filterResult.attentionText, /无需关注的兄弟任务/);
    assert.deepEqual(filterResult.counts, { attention: "2", active: "9", completed: "1" });
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
      highRiskResult,
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
