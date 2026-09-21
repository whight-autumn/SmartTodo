(function exposeIconUtils(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IconUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createIconUtils() {
  const ICON_NAMES = new Set([
    "theme", "add", "pin", "subtask", "note", "delete", "collapse",
    "undo", "new-session", "clear", "settings", "upload", "analyze",
    "send", "close", "file", "image", "warning", "check"
  ]);

  const escapeAttribute = value => String(value).replace(/[&"<>]/g, char => ({
    "&": "&amp;", "\"": "&quot;", "<": "&lt;", ">": "&gt;"
  })[char]);

  function iconMarkup(name, { label = "", className = "ui-icon" } = {}) {
    if (!ICON_NAMES.has(name)) throw new Error(`未知图标：${name}`);
    const accessibility = label
      ? `role="img" aria-label="${escapeAttribute(label)}"`
      : 'aria-hidden="true"';
    return `<svg class="${escapeAttribute(className)}" ${accessibility} focusable="false">`
      + `<use href="icons.svg#icon-${name}"></use></svg>`;
  }

  function mountIcons(root = document) {
    root.querySelectorAll("[data-icon]").forEach(node => {
      node.innerHTML = iconMarkup(node.dataset.icon);
    });
  }

  return { ICON_NAMES, iconMarkup, mountIcons };
});
