const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const pkg = require("../package.json");
const lock = require("../package-lock.json");
const { formatDisplayVersion } = require("../renderer/ui-appearance.js");

const root = path.resolve(__dirname, "..");

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("package and lock root identify the V1.4.0 source review", () => {
  assert.equal(pkg.version, "1.4.0");
  assert.equal(lock.version, "1.4.0");
  assert.equal(lock.packages[""].version, "1.4.0");
});

test("visible version and invalid-version fallback agree with V1.4.0", () => {
  assert.equal(formatDisplayVersion(pkg.version), "1.4.0");
  assert.equal(formatDisplayVersion("v1.3.8"), "1.3.8");
  assert.equal(formatDisplayVersion("invalid"), "1.4.0");

  for (const file of ["renderer/index.html", "renderer/widget.html"]) {
    assert.match(read(file), /V1\.4\.0/);
    assert.doesNotMatch(read(file), /1\.3\.1/);
  }
  assert.match(read("renderer/index.html"), /<title>SmartTodo V1\.4\.0/);
  assert.match(read("renderer/index.html"), /id="app-version"[^>]*>V1\.4\.0<\/span>/);
  assert.match(read("renderer/app.js"), /window\.desktop\?\.version \|\| "1\.4\.0"/);
  assert.match(read("preload.js"), /npm_package_version \|\| "1\.4\.0"/);
});

test("README identifies the current source review and packaging approval gate", () => {
  const contents = read("README.md");
  assert.match(contents, /version-1\.4\.0/);
  assert.match(contents, /当前源码版本：V1\.4\.0/);
  assert.match(contents, /用户审阅通过后，才可打包或执行 GitHub 操作/);
});

test("changelog and iteration notes include the V1.4.0 review", () => {
  assert.match(read("CHANGELOG.md"), /## \[1\.4\.0\]/);
  assert.match(read("release/版本迭代说明.md"), /## V1\.4\.0/);
  assert.match(read("release/版本迭代说明.md"), /用户审阅通过后，才可打包或执行 GitHub 操作/);
});

test("V1.4.0 review note keeps every release artifact field pending", () => {
  const notePath = path.join(root, "release/V1.4.0/版本说明.txt");
  assert.ok(fs.existsSync(notePath), "V1.4.0 pre-package review note must exist");
  const contents = read("release/V1.4.0/版本说明.txt");
  assert.match(contents, /打包前源码审阅说明/);
  for (const field of ["可执行文件名", "可执行文件大小", "SHA-256", "代码签名", "GitHub URL", "GitHub 推送", "Release 发布"]) {
    assert.ok(contents.includes(`${field}：待用户批准及打包后确认`), `${field} must remain pending`);
  }
  assert.match(contents, /用户审阅通过后，才可打包或执行 GitHub 操作/);
});

test("Windows portable package uses SmartTodo identity and filename", () => {
  assert.equal(pkg.name, "smarttodo");
  assert.equal(pkg.build.appId, "com.smarttodo.app");
  assert.equal(pkg.build.productName, "SmartTodo");
  assert.equal(pkg.build.win.artifactName, "SmartTodo-${version}.exe");
  assert.equal(pkg.build.portable.artifactName, "SmartTodo-${version}.exe");
});

test("runtime fallbacks no longer reference V1.0.7", () => {
  for (const file of ["preload.js", "renderer/index.html", "renderer/app.js"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), "utf8"), /1\.0\.7/);
  }
});
