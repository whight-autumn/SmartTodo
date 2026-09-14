const test = require("node:test");
const assert = require("node:assert/strict");
const {
  readDraft,
  writeDraft,
  clearDraft
} = require("../renderer/draft-store.js");

test("draft store round-trips a partially filled task form", () => {
  const storage = new Map();
  const draft = {
    title: "连续输入",
    remarks: "备注",
    remindTime: "",
    priority: "high",
    type: "main",
    parentId: ""
  };
  writeDraft(storage, draft);
  assert.deepEqual(readDraft(storage), draft);
  clearDraft(storage);
  assert.equal(readDraft(storage), null);
});
