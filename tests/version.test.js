const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const pkg = require("../package.json");
const { formatDisplayVersion } = require("../renderer/ui-appearance.js");

const root = path.resolve(__dirname, "..");

test("package and visible V1.2.2 versions agree", () => {
  assert.equal(pkg.version, "1.2.2");
  assert.equal(formatDisplayVersion(pkg.version), "1.2.2");
  assert.equal(formatDisplayVersion("v1.2.8"), "1.2.8");
  assert.equal(formatDisplayVersion("invalid"), "1.2.2");

  for (const file of ["renderer/index.html", "renderer/widget.html"]) {
    assert.match(fs.readFileSync(path.join(root, file), "utf8"), /V1\.2\.2/);
  }
});

test("runtime fallbacks no longer reference V1.0.7", () => {
  for (const file of ["preload.js", "renderer/index.html", "renderer/app.js"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), "utf8"), /1\.0\.7/);
  }
});
