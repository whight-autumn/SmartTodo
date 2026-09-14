(function exposeDraftStore(root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.DraftStore = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createDraftStore() {
  const KEY = "smart_task_draft";

  function get(storage) {
    return typeof storage.getItem === "function"
      ? storage.getItem(KEY)
      : storage.get(KEY);
  }

  function set(storage, value) {
    if (typeof storage.setItem === "function") {
      storage.setItem(KEY, value);
    } else {
      storage.set(KEY, value);
    }
  }

  function remove(storage) {
    if (typeof storage.removeItem === "function") {
      storage.removeItem(KEY);
    } else {
      storage.delete(KEY);
    }
  }

  function readDraft(storage = globalThis.localStorage) {
    try {
      const raw = get(storage);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeDraft(storage = globalThis.localStorage, draft) {
    if (!draft || ![draft.title, draft.remarks, draft.remindTime, draft.parentId].some(value => String(value || "").trim())) {
      clearDraft(storage);
      return;
    }
    set(storage, JSON.stringify(draft));
  }

  function clearDraft(storage = globalThis.localStorage) {
    remove(storage);
  }

  return { KEY, readDraft, writeDraft, clearDraft };
});
