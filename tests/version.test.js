const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const pkg = require("../package.json");
const lock = require("../package-lock.json");
const { formatDisplayVersion } = require("../renderer/ui-appearance.js");

const root = path.resolve(__dirname, "..");

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("package and lock root identify the V1.4.1 release", () => {
  assert.equal(pkg.version, "1.4.1");
  assert.equal(lock.version, "1.4.1");
  assert.equal(lock.packages[""].version, "1.4.1");
});

test("visible version and invalid-version fallback agree with V1.4.1", () => {
  assert.equal(formatDisplayVersion(pkg.version), "1.4.1");
  assert.equal(formatDisplayVersion("v1.3.8"), "1.3.8");
  assert.equal(formatDisplayVersion("invalid"), "1.4.1");

  for (const file of ["renderer/index.html", "renderer/widget.html"]) {
    assert.match(read(file), /V1\.4\.1/);
    assert.doesNotMatch(read(file), /1\.3\.1/);
  }
  assert.match(read("renderer/index.html"), /<title>SmartTodo V1\.4\.1/);
  assert.match(read("renderer/index.html"), /id="app-version"[^>]*>V1\.4\.1<\/span>/);
  assert.match(read("renderer/widget.html"), /<span class="widget-version">V1\.4\.1<\/span>/);
  assert.match(read("renderer/app.js"), /window\.desktop\?\.version \|\| "1\.4\.1"/);
  assert.match(read("preload.js"), /npm_package_version \|\| "1\.4\.1"/);
});

test("README identifies the current V1.4.1 release", () => {
  const contents = read("README.md");
  assert.match(contents, /version-1\.4\.1/);
  assert.match(contents, /当前版本：V1\.4\.1/);
  assert.match(contents, /点击系统任务提醒会恢复并聚焦主窗口/);
});

test("changelog and iteration notes include the V1.4.1 release", () => {
  assert.match(read("CHANGELOG.md"), /## \[1\.4\.1\]/);
  assert.match(read("release/版本迭代说明.md"), /## V1\.4\.1/);
});

test("V1.4.1 release note documents the notification behavior", () => {
  const notePath = path.join(root, "release/V1.4.1/版本说明.txt");
  assert.ok(fs.existsSync(notePath), "V1.4.1 release note must exist");
  const contents = read("release/V1.4.1/版本说明.txt");
  assert.match(contents, /点击系统任务提醒/);
  assert.match(contents, /SmartTodo-1\.4\.1\.exe/);
});

test("Windows portable package uses SmartTodo identity and filename", () => {
  assert.equal(pkg.name, "smarttodo");
  assert.equal(pkg.build.appId, "com.smarttodo.app");
  assert.equal(pkg.build.productName, "SmartTodo");
  assert.equal(pkg.build.win.artifactName, "SmartTodo-${version}.exe");
  assert.equal(pkg.build.portable.artifactName, "SmartTodo-${version}.exe");
});

test("Windows portable package includes every main-process settings module", () => {
  for (const file of ["app-launch-spec.js", "runtime-data-manager.js", "login-startup.js", "app-settings-ipc.js"]) {
    assert.ok(pkg.build.files.includes(file), `${file} must be packaged`);
  }
});

test("runtime fallbacks no longer reference V1.0.7", () => {
  for (const file of ["preload.js", "renderer/index.html", "renderer/app.js"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), "utf8"), /1\.0\.7/);
  }
});
