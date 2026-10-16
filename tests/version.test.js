const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const pkg = require("../package.json");
const lock = require("../package-lock.json");
const { formatDisplayVersion } = require("../renderer/ui-appearance.js");

const root = path.resolve(__dirname, "..");

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("package and lock root identify the V1.5.0 release", () => {
  assert.equal(pkg.version, "1.5.0");
  assert.equal(lock.version, "1.5.0");
  assert.equal(lock.packages[""].version, "1.5.0");
});

test("visible version and invalid-version fallback agree with V1.5.0", () => {
  assert.equal(formatDisplayVersion(pkg.version), "1.5.0");
  assert.equal(formatDisplayVersion("v1.3.8"), "1.3.8");
  assert.equal(formatDisplayVersion("invalid"), "1.5.0");

  for (const file of ["renderer/index.html", "renderer/widget.html"]) {
    assert.match(read(file), /V1\.5\.0/);
    assert.doesNotMatch(read(file), /1\.3\.1/);
  }
  assert.match(read("renderer/index.html"), /<title>SmartTodo V1\.5\.0/);
  assert.match(read("renderer/index.html"), /id="app-version"[^>]*>V1\.5\.0<\/span>/);
  assert.match(read("renderer/widget.html"), /<span class="widget-version">V1\.5\.0<\/span>/);
  assert.match(read("renderer/app.js"), /window\.desktop\?\.version \|\| "1\.5\.0"/);
  assert.match(read("src/preload/main-preload.js"), /npm_package_version \|\| "1\.5\.0"/);
});

test("README identifies the current V1.5.0 release", () => {
  const contents = read("README.md");
  assert.match(contents, /version-1\.5\.0/);
  assert.match(contents, /当前源码版本：V1\.5\.0/);
  assert.match(contents, /标题栏/);
});

test("changelog and iteration notes include the V1.5.0 release", () => {
  assert.match(read("CHANGELOG.md"), /## \[1\.5\.0\]/);
  assert.match(read("release/版本迭代说明.md"), /## V1\.5\.0/);
});

test("V1.5.0 release note documents the integrated title bar", () => {
  const notePath = path.join(root, "release/V1.5.0/版本说明.txt");
  assert.ok(fs.existsSync(notePath), "V1.5.0 release note must exist");
  const contents = read("release/V1.5.0/版本说明.txt");
  assert.match(contents, /标题栏/);
  assert.match(contents, /SmartTodo-1\.5\.0\.exe/);
});

test("Windows portable package uses SmartTodo identity and filename", () => {
  assert.equal(pkg.name, "smarttodo");
  assert.equal(pkg.build.appId, "com.smarttodo.app");
  assert.equal(pkg.build.productName, "SmartTodo");
  assert.equal(pkg.build.win.artifactName, "SmartTodo-${version}.exe");
  assert.equal(pkg.build.portable.artifactName, "SmartTodo-${version}.exe");
});

test("Windows portable package includes every main-process settings module", () => {
  assert.ok(pkg.build.files.includes("src/**/*"), "src tree must be packaged");
  for (const file of [
    "src/main/startup/app-launch-spec.js",
    "src/main/runtime/runtime-data-manager.js",
    "src/main/startup/login-startup.js",
    "src/main/settings/app-settings-ipc.js"
  ]) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} must exist in the packaged src tree`);
  }
});

test("runtime fallbacks no longer reference V1.0.7", () => {
  for (const file of ["src/preload/main-preload.js", "renderer/index.html", "renderer/app.js"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), "utf8"), /1\.0\.7/);
  }
});
