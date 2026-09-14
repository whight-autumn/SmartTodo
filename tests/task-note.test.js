const test = require("node:test");
const assert = require("node:assert/strict");
const taskModel = require("../renderer/task-model");

test("normalizes legacy tasks without changing historical timestamps", () => {
  const createdAt = 1000;
  const completedAt = 2000;
  const [task] = taskModel.normalizeTasks([{ id: "done", title: "旧任务", done: true, createdAt, completedAt }]);
  assert.equal(task.createdAt, createdAt);
  assert.equal(task.completedAt, completedAt);
  assert.equal(task.updatedAt, null);
  assert.deepEqual(task.attachments, []);
});

test("valid attachment metadata survives task normalization", () => {
  const attachment = {
    id: "file_1",
    name: "需求说明.pdf",
    storageName: "file_1.pdf",
    mimeType: "application/pdf",
    size: 4096,
    addedAt: 3000
  };

  const [task] = taskModel.normalizeTasks([{ id: "task", title: "任务", attachments: [attachment] }]);

  assert.deepEqual(task.attachments, [attachment]);
});

test("rejects malformed attachment metadata", () => {
  const valid = {
    id: "file_1",
    name: "notes.txt",
    storageName: "file_1.txt",
    mimeType: "text/plain",
    size: 12,
    addedAt: 3000
  };
  const malformed = [
    { label: "missing metadata", value: null },
    { label: "unsafe id", value: { ...valid, id: "../file" } },
    { label: "unsafe storage name", value: { ...valid, storageName: "../file.txt" } },
    { label: "blank display name", value: { ...valid, name: "   " } },
    { label: "negative size", value: { ...valid, size: -1 } },
    { label: "oversized file", value: { ...valid, size: 20 * 1024 * 1024 + 1 } },
    { label: "missing addedAt", value: { ...valid, addedAt: undefined } },
    { label: "non-finite addedAt", value: { ...valid, addedAt: Infinity } },
    { label: "non-positive addedAt", value: { ...valid, addedAt: 0 } }
  ];

  malformed.forEach(({ label, value }) => {
    assert.equal(taskModel.normalizeAttachment(value), null, label);
  });
});

test("a real note edit records updatedAt and preserves createdAt and completedAt", () => {
  const original = {
    id: "done", title: "任务", remarks: "旧备注", attachments: [],
    createdAt: 1000, completedAt: 2000, updatedAt: null
  };
  const result = taskModel.applyTaskNoteEdit(original, { remarks: "新备注", attachments: [] }, 3000);
  assert.equal(result.changed, true);
  assert.equal(result.task.createdAt, 1000);
  assert.equal(result.task.completedAt, 2000);
  assert.equal(result.task.updatedAt, 3000);
});

test("saving an unchanged draft does not update updatedAt", () => {
  const original = { id: "task", title: "任务", remarks: "相同", attachments: [], createdAt: 1000, updatedAt: 1500 };
  const result = taskModel.applyTaskNoteEdit(original, { remarks: "相同", attachments: [] }, 3000);
  assert.equal(result.changed, false);
  assert.equal(result.task.updatedAt, 1500);
});

test("applying a note edit does not mutate task or attachment inputs", () => {
  const originalAttachment = {
    id: "old_1", name: "old.txt", storageName: "old_1.txt",
    mimeType: "text/plain", size: 10, addedAt: 1000
  };
  const editedAttachment = {
    id: "new_1", name: "new.txt", storageName: "new_1.txt",
    mimeType: "text/plain", size: 20, addedAt: 2000
  };
  const original = { id: "task", title: "任务", remarks: "旧", attachments: [originalAttachment], updatedAt: null };
  const edit = { remarks: "新", attachments: [editedAttachment] };
  const originalSnapshot = structuredClone(original);
  const editSnapshot = structuredClone(edit);

  const result = taskModel.applyTaskNoteEdit(original, edit, 3000);

  assert.deepEqual(original, originalSnapshot);
  assert.deepEqual(edit, editSnapshot);
  assert.notStrictEqual(result.task, original);
  assert.notStrictEqual(result.task.attachments, edit.attachments);
});

test("linkifies only safe web URLs and trims Chinese punctuation", () => {
  const noteUtils = require("../renderer/note-utils");
  const html = noteUtils.linkifyNote("资料：https://example.com/a?x=1。 javascript:alert(1) <b>危险</b>");
  assert.match(html, /data-url="https:\/\/example\.com\/a\?x=1"/);
  assert.doesNotMatch(html, /data-url="javascript:/);
  assert.match(html, /&lt;b&gt;危险&lt;\/b&gt;/);
  assert.match(html, /<\/button>。/);
});

test("renders HTTP and HTTPS note links with escaped attributes and line breaks", () => {
  const noteUtils = require("../renderer/note-utils");
  const html = noteUtils.linkifyNote("http://example.com/?a=1&b=2,\nhttps://example.org/path");

  assert.match(html, /data-url="http:\/\/example\.com\/\?a=1&amp;b=2"/);
  assert.match(html, /<\/button>,<br><button/);
  assert.match(html, /data-url="https:\/\/example\.org\/path"/);
});

test("leaves invalid URL candidates as escaped text", () => {
  const noteUtils = require("../renderer/note-utils");
  const html = noteUtils.linkifyNote("坏链接 https:// <script>alert(1)</script>");

  assert.doesNotMatch(html, /class="note-link"/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});
