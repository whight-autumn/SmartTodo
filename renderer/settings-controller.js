(function exposeSettingsController(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SettingsController = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function settingsControllerModule() {
  "use strict";

  const SECTIONS = ["general", "ai", "storage"];
  const SELECTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const RECOVERY_COPY = {
    configuration: "运行数据配置无法读取，已使用安全的默认目录。请保留原数据并检查目录配置。",
    interrupted: "迁移曾被中断，已恢复原数据。请保留恢复目录和目标副本，确认数据后再迁移。",
    validation: "请重新选择独立、可写的空目录。",
    copy: "复制未能完成，请检查目录权限与磁盘空间后重试。",
    verification: "数据校验未通过，请保留原数据，关闭可能修改数据的程序后重试。",
    promotion: "目标目录无法启用，请检查目录权限后重新选择空目录。",
    backup: "无法创建旧数据备份；已保留验证后的目标副本。请保留两份数据并检查备份目录权限。",
    journal: "无法保存恢复记录；已保留验证后的目标副本。请检查配置目录权限后重试。",
    bootstrap: "无法保存新目录配置；已保留验证后的目标副本。请检查配置目录权限后重试。"
  };
  const WARNING_COPY = {
    "rollback-backup": "旧目录无法恢复，原数据仍保留在时间戳备份目录中。请保留该目录。",
    "staging-retained": "迁移暂存目录已保留。请确认原数据完整后再检查暂存副本。",
    "result-unsaved": "迁移结果未能保存。请保留所有数据副本并检查配置目录权限。"
  };
  const displayPath = value => typeof value === "string" && value.length <= 4096 && !value.includes("\0") &&
    (/^[A-Za-z]:[\\/]/.test(value) || /^\\\\[^\\]+\\[^\\]+/.test(value) || value.startsWith("/")) ? value : null;

  function create({ document, desktop, aiProvider, motion, readAIConfig, writeAIConfig, notify }) {
    const byId = id => document.getElementById(id);
    const modal = byId("settings-modal");
    const nav = modal.querySelector('[role="tablist"]');
    const tabs = SECTIONS.map(section => byId(`settings-tab-${section}`));
    const panels = SECTIONS.map(section => byId(`settings-panel-${section}`));
    const startup = byId("auto-start-input");
    const chooseButton = byId("choose-data-directory-btn");
    const migrateButton = byId("migrate-data-btn");
    const saveButton = byId("save-key-btn");
    const keyInput = byId("api-key-input");
    const visibilityButton = byId("toggle-api-key-btn");
    const cleanups = [];
    let disposed = false;
    let lastSection = "general";
    let previousFocus = null;
    let snapshotRevision = 0;
    let autoStart = { available: false, enabled: false };
    let startupBusy = false;
    let choosing = false;
    let migrationBusy = false;
    let saving = false;
    // Paths are display text in the DOM; the only migration capability retained is this token.
    let selectionId = null;

    function listen(target, type, handler) {
      target.addEventListener(type, handler);
      cleanups.push(() => target.removeEventListener(type, handler));
    }

    function status(id, text, type = "") {
      const node = byId(id);
      node.textContent = text;
      node.dataset.type = type;
    }

    function setBusy(section, busy) {
      byId(`settings-panel-${section}`).setAttribute("aria-busy", String(busy));
    }

    function selectSection(section, focus = true) {
      if (!SECTIONS.includes(section)) section = lastSection;
      lastSection = section;
      SECTIONS.forEach((name, index) => {
        const selected = name === section;
        tabs[index].setAttribute("aria-selected", String(selected));
        tabs[index].setAttribute("tabindex", selected ? "0" : "-1");
        panels[index].hidden = !selected;
      });
      if (focus) tabs[SECTIONS.indexOf(section)].focus({ preventScroll: true });
    }

    function renderStartup(state) {
      autoStart = { available: state?.available === true, enabled: state?.enabled === true };
      startup.checked = autoStart.enabled;
      startup.disabled = startupBusy || !autoStart.available || !desktop?.setAutoStart;
      status("auto-start-status", autoStart.available
        ? "更改后立即生效。"
        : "当前环境无法使用开机自启动；此功能仅支持 Windows。");
    }

    function maskKey(visible) {
      keyInput.type = visible ? "text" : "password";
      visibilityButton.setAttribute("aria-pressed", String(visible));
      visibilityButton.dataset.icon = visible ? "eye-off" : "eye";
      const icon = visibilityButton.querySelector("use");
      if (icon) icon.setAttribute("href", `icons.svg#icon-${visibilityButton.dataset.icon}`);
      visibilityButton.title = visible ? "隐藏 API Key" : "显示 API Key";
      byId("ai-key-hint").textContent = visible
        ? "API Key 当前已显示；配置仅保存在本地运行数据中。"
        : "API Key 当前已隐藏；配置仅保存在本地运行数据中。";
    }

    function renderAI() {
      const config = aiProvider.normalizeProviderConfig(readAIConfig());
      byId("provider-select").value = config.provider;
      byId("base-url-input").value = config.baseUrl;
      byId("model-input").value = config.model;
      keyInput.value = config.apiKey;
    }

    async function refresh() {
      if (disposed) return;
      const revision = ++snapshotRevision;
      renderAI();
      if (!desktop?.getAppSettings) {
        renderStartup(null);
        byId("data-current-path").textContent = "当前环境无法读取数据目录。";
        return;
      }
      try {
        const result = await desktop.getAppSettings();
        if (disposed || revision !== snapshotRevision) return;
        if (result?.ok === false || typeof result?.storage?.currentPath !== "string" || !result.autoStart) {
          throw new Error("Unavailable settings snapshot");
        }
        if (!startupBusy) renderStartup(result.autoStart);
        const path = result.storage.currentPath;
        byId("data-current-path").textContent = `${path}（${result.storage.isDefault ? "默认目录" : "自定义目录"}）`;
        byId("data-path-hint").textContent = `运行数据位置（${result.storage.isDefault ? "默认目录" : "自定义目录"}）：${path}`;
      } catch {
        if (disposed || revision !== snapshotRevision) return;
        if (!startupBusy) {
          renderStartup(null);
          status("auto-start-status", "无法读取应用设置，请关闭设置后重新打开重试。", "error");
        }
        byId("data-current-path").textContent = "无法读取数据目录，请重新打开设置重试。";
      }
    }

    function open(section, trigger) {
      if (disposed) return Promise.resolve();
      if (!modal.open) {
        previousFocus = trigger || document.activeElement;
        maskKey(false);
        modal.showModal();
        motion?.animateDialog?.(modal.querySelector(".dialog-sheet"));
      }
      selectSection(section);
      return refresh();
    }

    function restoreFocus() {
      maskKey(false);
      const target = previousFocus?.isConnected ? previousFocus : byId("task-title");
      previousFocus = null;
      target?.focus({ preventScroll: true });
    }

    function close() {
      if (!disposed && modal.open) modal.close();
    }

    async function toggleStartup() {
      if (disposed || startupBusy || !autoStart.available || !desktop?.setAutoStart) return;
      const enabled = startup.checked;
      const previous = { ...autoStart };
      startupBusy = true;
      ++snapshotRevision;
      startup.disabled = true;
      setBusy("general", true);
      status("auto-start-status", "正在更新开机自启动…", "loading");
      try {
        const result = await desktop.setAutoStart(enabled);
        if (disposed) return;
        if (result?.ok === false || typeof result?.available !== "boolean" || typeof result.enabled !== "boolean") {
          throw new Error("Unavailable auto-start result");
        }
        renderStartup(result);
        if (result.available && result.enabled !== enabled) {
          status("auto-start-status", "Windows 未接受这次更改，已显示系统实际状态。请检查“启动应用”设置后重试。", "error");
        }
      } catch {
        if (disposed) return;
        renderStartup(previous);
        status("auto-start-status", "无法更改开机自启动，已恢复原设置。请检查系统权限后重试。", "error");
      } finally {
        startupBusy = false;
        // Reject snapshots captured while the OS write was still in flight.
        ++snapshotRevision;
        if (!disposed) {
          startup.disabled = !autoStart.available;
          setBusy("general", false);
        }
      }
    }

    function syncStorageButtons() {
      chooseButton.disabled = choosing || migrationBusy || !desktop?.chooseDataDirectory;
      migrateButton.disabled = choosing || migrationBusy || !selectionId || !desktop?.requestDataMigration;
      setBusy("storage", choosing || migrationBusy);
    }

    async function chooseDirectory() {
      if (disposed || choosing || migrationBusy || !desktop?.chooseDataDirectory) return;
      choosing = true;
      syncStorageButtons();
      try {
        const result = await desktop.chooseDataDirectory();
        if (disposed || result?.canceled === true) return;
        if (result?.ok === false || !SELECTION_ID.test(result?.selectionId || "") ||
            typeof result.path !== "string" || !result.path.trim()) throw new Error("Unavailable selection");
        selectionId = result.selectionId;
        byId("data-selected-path").textContent = result.path;
        status("storage-status", "目录已选择。确认后将迁移并重启。请在五分钟内确认。", "");
      } catch {
        if (!disposed) status("storage-status", "无法选择目录，请重新选择独立、可写的空目录。", "error");
      } finally {
        choosing = false;
        if (!disposed) syncStorageButtons();
      }
    }

    async function migrateData() {
      if (disposed || choosing || migrationBusy || !selectionId || !desktop?.requestDataMigration) return;
      const id = selectionId;
      selectionId = null;
      migrationBusy = true;
      syncStorageButtons();
      status("storage-status", "正在准备迁移并重启…", "loading");
      try {
        const result = await desktop.requestDataMigration({ selectionId: id });
        if (disposed) return;
        if (result?.queued !== true) throw new Error("Migration request was not queued");
        // Keep actions locked: relaunch can terminate the renderer before this point.
      } catch {
        if (disposed) return;
        migrationBusy = false;
        syncStorageButtons();
        status("storage-status", "无法准备迁移。请重新选择独立、可写的空目录后重试。", "error");
      }
    }

    async function saveAI() {
      if (disposed || saving) return;
      const raw = { provider: byId("provider-select").value,
        baseUrl: byId("base-url-input").value.trim(), model: byId("model-input").value.trim(), apiKey: keyInput.value.trim() };
      let validUrl = false;
      try { validUrl = ["http:", "https:"].includes(new URL(raw.baseUrl).protocol); } catch { /* Inline validation below. */ }
      if (!validUrl || !raw.model || !raw.apiKey) {
        status("ai-settings-status", "请输入有效的 HTTP/HTTPS API 地址、模型名称和 API Key。", "error");
        return;
      }
      saving = true;
      saveButton.disabled = true;
      setBusy("ai", true);
      try {
        await writeAIConfig(aiProvider.normalizeProviderConfig(raw));
        if (disposed) return;
        status("ai-settings-status", "AI 配置已保存。", "success");
        notify?.("AI 配置已保存。", "success");
      } catch {
        if (!disposed) status("ai-settings-status", "无法保存 AI 配置，请重试。", "error");
      } finally {
        saving = false;
        if (!disposed) { saveButton.disabled = false; setBusy("ai", false); }
      }
    }

    async function consumeInitialResult() {
      if (disposed || !desktop?.consumeMigrationResult) return;
      try {
        const result = await desktop.consumeMigrationResult();
        if (disposed || !result) return;
        if (result.ok === false || !["success", "failure"].includes(result.status)) throw new Error("Unavailable migration result");
        const success = result.status === "success";
        let currentPath;
        try { currentPath = displayPath((await desktop.getAppSettings?.())?.storage?.currentPath); } catch { /* Result remains available as text below. */ }
        if (disposed) return;
        const backupPath = displayPath(result.backupPath);
        // A failed result only carries backupPath when that original-data
        // backup was committed as active, independent of login API readback.
        const recoveredBackup = !success && Boolean(backupPath);
        const message = success ? "数据迁移成功，已使用新目录。" : recoveredBackup
          ? "数据迁移失败，已从备份目录恢复原数据。"
          : result.failureCode === "configuration" ? "运行数据配置无法读取，已使用安全的默认目录。"
          : "数据迁移失败，仍在使用原目录。";
        const details = [message];
        const activePath = recoveredBackup ? backupPath : currentPath || (success ? displayPath(result.targetPath) : null);
        if (activePath) details.push(`${recoveredBackup ? "当前恢复目录" : "当前数据目录"}：${activePath}`);
        if (success && backupPath) details.push(`旧数据备份目录：${backupPath}`);
        if (!success) details.push(Object.hasOwn(RECOVERY_COPY, result.failureCode)
          ? RECOVERY_COPY[result.failureCode] : "请保留原数据，检查目标目录后重试。");
        if (Array.isArray(result.warningCodes)) {
          for (const code of [...new Set(result.warningCodes)].slice(0, 3)) {
            if (Object.hasOwn(WARNING_COPY, code)) details.push(WARNING_COPY[code]);
          }
        }
        status("storage-status", details.join("\n"), success ? "success" : "error");
        notify?.(message, success ? "success" : "error");
      } catch {
        if (!disposed) {
          const message = "无法确认上次迁移结果，请重新启动应用后重试。";
          status("storage-status", message, "error");
          notify?.(message, "error");
        }
      }
    }

    listen(byId("global-settings-btn"), "click", () => { void open("general", byId("global-settings-btn")); });
    listen(byId("ai-settings-btn"), "click", () => { void open("ai", byId("ai-settings-btn")); });
    modal.querySelectorAll("[data-close-modal]").forEach(button => listen(button, "click", close));
    listen(modal, "close", restoreFocus);
    listen(modal, "cancel", event => { event.preventDefault(); close(); });
    listen(modal, "click", event => {
      if (event.target !== modal) return;
      const bounds = modal.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    });
    tabs.forEach((tab, index) => {
      listen(tab, "click", () => selectSection(SECTIONS[index]));
      listen(tab, "keydown", event => {
        let next;
        if (["ArrowDown", "ArrowRight"].includes(event.key)) next = (index + 1) % tabs.length;
        else if (["ArrowUp", "ArrowLeft"].includes(event.key)) next = (index + tabs.length - 1) % tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        else return;
        event.preventDefault();
        selectSection(SECTIONS[next]);
      });
    });
    listen(startup, "change", () => { void toggleStartup(); });
    listen(byId("provider-select"), "change", () => {
      const preset = aiProvider.PROVIDER_PRESETS[byId("provider-select").value];
      if (!preset) return;
      byId("base-url-input").value = preset.baseUrl;
      byId("model-input").value = preset.model;
    });
    listen(visibilityButton, "click", () => maskKey(keyInput.type === "password"));
    listen(saveButton, "click", () => { void saveAI(); });
    listen(chooseButton, "click", () => { void chooseDirectory(); });
    listen(migrateButton, "click", () => { void migrateData(); });
    const media = document.defaultView?.matchMedia?.("(min-width: 640px)");
    const orient = () => nav.setAttribute("aria-orientation", media && !media.matches ? "horizontal" : "vertical");
    if (media) listen(media, "change", orient);
    orient();
    selectSection(lastSection, false);
    maskKey(false);
    renderStartup(null);
    syncStorageButtons();
    // Once per controller lifetime, independently of every settings snapshot/open.
    void Promise.resolve().then(consumeInitialResult);

    function dispose() {
      if (disposed) return;
      disposed = true;
      ++snapshotRevision;
      selectionId = null;
      previousFocus = null;
      cleanups.splice(0).forEach(cleanup => cleanup());
    }

    return { open, close, refresh, dispose };
  }

  return { create };
});
