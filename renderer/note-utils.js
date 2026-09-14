(function exposeNoteUtils(root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.NoteUtils = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createNoteUtils() {
  const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
  const TRAILING_PUNCTUATION_PATTERN = /[.,!?;:)\]}，。！？；：、）】》」』]+$/;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function linkifyNote(text) {
    const source = String(text || "");
    let html = "";
    let lastIndex = 0;

    source.replace(URL_PATTERN, (match, offset) => {
      html += escapeHtml(source.slice(lastIndex, offset));

      const trailingPunctuation = match.match(TRAILING_PUNCTUATION_PATTERN)?.[0] || "";
      const candidate = match.slice(0, match.length - trailingPunctuation.length);
      let isSafeWebUrl = false;

      try {
        const url = new URL(candidate);
        isSafeWebUrl = url.protocol === "http:" || url.protocol === "https:";
      } catch {
        isSafeWebUrl = false;
      }

      if (isSafeWebUrl) {
        const escapedUrl = escapeHtml(candidate);
        html += `<button type="button" class="note-link" data-action="open-note-link" data-url="${escapedUrl}">${escapedUrl}</button>`;
      } else {
        html += escapeHtml(candidate);
      }

      html += escapeHtml(trailingPunctuation);
      lastIndex = offset + match.length;
      return match;
    });

    html += escapeHtml(source.slice(lastIndex));
    return html.replace(/\r\n?|\n/g, "<br>");
  }

  return { linkifyNote };
});
