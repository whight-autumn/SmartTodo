const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeBrightness,
  resolveBrightness,
  loadBrightness,
  saveBrightness,
  formatTaskTimestamp
} = require("../renderer/ui-appearance.js");

test("brightness is constrained to the supported working range", () => {
  assert.equal(normalizeBrightness("60"), 75);
  assert.equal(normalizeBrightness("112"), 110);
  assert.equal(normalizeBrightness("140"), 125);
  assert.equal(normalizeBrightness("not-a-number"), 100);
});

test("brightness resolves to a neutral color mix around 100 percent", () => {
  assert.deepEqual(resolveBrightness(85), {
    value: 85,
    tint: "#000000",
    mix: "15%"
  });
  assert.deepEqual(resolveBrightness(100), {
    value: 100,
    tint: "#ffffff",
    mix: "0%"
  });
  assert.deepEqual(resolveBrightness(120), {
    value: 120,
    tint: "#ffffff",
    mix: "20%"
  });
});

test("brightness survives a storage round trip", () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };

  assert.equal(loadBrightness(storage), 100);
  assert.equal(saveBrightness(storage, 125), 125);
  assert.equal(loadBrightness(storage), 125);
});

test("task timestamps include a complete local date and minute", () => {
  const timestamp = new Date(2026, 8, 14, 9, 5).getTime();
  assert.equal(formatTaskTimestamp(timestamp), "2026-09-14 09:05");
  assert.equal(formatTaskTimestamp(null), "");
  assert.equal(formatTaskTimestamp("invalid"), "");
});
