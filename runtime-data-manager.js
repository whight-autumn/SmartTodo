const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { randomUUID, createHash } = require("node:crypto");
const { buildManagedUserDataPath } = require("./main-paths.js");

const SCHEMA_VERSION = 1;
const REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/;

function buildBootstrapPath(appDataPath) {
  return path.join(normalizeAbsolutePath(appDataPath), "SmartTodo", "bootstrap.json");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function normalizeAbsolutePath(value) {
  if (typeof value !== "string" || !value || value.includes("\0") || !path.isAbsolute(value)) {
    throw new Error("An absolute directory path is required.");
  }
  // Device namespaces bypass ordinary Windows path handling.
  if (/^\\\\[?.]\\/.test(value)) throw new Error("Device paths are not supported.");
  return path.resolve(value);
}

function containsPath(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function assertDirectoryPathWithoutLinks(directoryPath) {
  const root = path.parse(directoryPath).root;
  let current = root;
  for (const segment of ["", ...directoryPath.slice(root.length).split(path.sep).filter(Boolean)]) {
    if (segment) current = path.join(current, segment);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error("Linked directories are not supported.");
    if (!stat.isDirectory()) throw new Error("The path must identify an ordinary directory.");
  }
}

function safeRuntimePath(value, homePath = os.homedir(), inspectFilesystem = true) {
  const normalized = normalizeAbsolutePath(value);
  if (containsPath(normalized, path.parse(normalized).root) || path.relative(normalized, normalizeAbsolutePath(homePath)) === "") {
    throw new Error("The root or home directory cannot store runtime data.");
  }
  if (inspectFilesystem) assertDirectoryPathWithoutLinks(normalized);
  return normalized;
}

function validateMigrationPaths({ sourcePath, targetPath, homePath = os.homedir(), appPath }) {
  const source = safeRuntimePath(sourcePath, homePath);
  const target = safeRuntimePath(targetPath, homePath);
  if (containsPath(source, target) || containsPath(target, source)) {
    throw new Error("Source and target directories must be separate.");
  }
  if (appPath) {
    const application = normalizeAbsolutePath(appPath);
    if (containsPath(target, application) || containsPath(source, application)) {
      throw new Error("The application directory cannot be moved or replaced.");
    }
  }
  if (!fs.existsSync(source)) throw new Error("The source directory is unavailable.");
  if (fs.existsSync(target) && fs.readdirSync(target).length !== 0) {
    throw new Error("The target directory must be empty.");
  }
  fs.accessSync(source, fs.constants.R_OK | fs.constants.X_OK);
  if (fs.existsSync(target)) fs.accessSync(target, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
  let writableParent = path.dirname(target);
  while (!fs.existsSync(writableParent)) writableParent = path.dirname(writableParent);
  fs.accessSync(writableParent, fs.constants.W_OK | fs.constants.X_OK);
  return { sourcePath: source, targetPath: target };
}

function normalizeRequest(value) {
  if (!isPlainObject(value) || !REQUEST_ID.test(value.requestId) || typeof value.requestId !== "string" ||
      typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) {
    throw new Error("The migration request is invalid.");
  }
  return {
    requestId: value.requestId,
    sourcePath: safeRuntimePath(value.sourcePath, os.homedir(), false),
    targetPath: safeRuntimePath(value.targetPath, os.homedir(), false),
    createdAt: value.createdAt
  };
}

function normalizeResult(value) {
  if (value === null || value === undefined) return null;
  if (!isPlainObject(value) || !["success", "failure"].includes(value.status) ||
      !(value.requestId === null || (typeof value.requestId === "string" && REQUEST_ID.test(value.requestId))) ||
      !(value.completedAt === null || (typeof value.completedAt === "string" && Number.isFinite(Date.parse(value.completedAt))))) {
    throw new Error("The migration result is invalid.");
  }
  const result = {
    status: value.status, requestId: value.requestId,
    sourcePath: value.sourcePath === null ? null : safeRuntimePath(value.sourcePath, os.homedir(), false),
    targetPath: value.targetPath === null ? null : safeRuntimePath(value.targetPath, os.homedir(), false),
    completedAt: value.completedAt
  };
  if (value.backupPath !== undefined) result.backupPath = normalizeAbsolutePath(value.backupPath);
  for (const key of ["error", "warning"]) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== "string" || value[key].length > 300) throw new Error("The migration result is invalid.");
      result[key] = value[key];
    }
  }
  return result;
}

function defaultState(defaultRuntimePath) {
  return { schemaVersion: SCHEMA_VERSION, activeRuntimePath: safeRuntimePath(defaultRuntimePath), pendingMigration: null, migrationResult: null };
}

function readBootstrapState({ appDataPath, defaultRuntimePath = buildManagedUserDataPath(appDataPath) }) {
  const fallback = defaultState(defaultRuntimePath);
  const bootstrapPath = buildBootstrapPath(appDataPath);
  try {
    assertDirectoryPathWithoutLinks(path.dirname(bootstrapPath));
    if (!fs.existsSync(bootstrapPath)) return fallback;
    const stat = fs.lstatSync(bootstrapPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) throw new Error("Invalid bootstrap file.");
    const value = JSON.parse(fs.readFileSync(bootstrapPath, "utf8"));
    if (!isPlainObject(value) || value.schemaVersion !== SCHEMA_VERSION) throw new Error("Invalid bootstrap state.");
    const activeRuntimePath = safeRuntimePath(value.activeRuntimePath);
    const pendingMigration = value.pendingMigration == null ? null : normalizeRequest(value.pendingMigration);
    if (pendingMigration && path.relative(activeRuntimePath, pendingMigration.sourcePath) !== "") throw new Error("Invalid migration source.");
    return { schemaVersion: SCHEMA_VERSION, activeRuntimePath, pendingMigration, migrationResult: normalizeResult(value.migrationResult) };
  } catch {
    return { ...fallback, migrationResult: {
      status: "failure", requestId: null, sourcePath: null, targetPath: null, completedAt: null,
      error: "The runtime data configuration is invalid or unreadable. The default directory is being used."
    } };
  }
}

function writeBootstrapState(appDataPath, state, requestId = randomUUID()) {
  if (typeof requestId !== "string" || !REQUEST_ID.test(requestId)) throw new Error("The request ID is invalid.");
  const bootstrapPath = buildBootstrapPath(appDataPath);
  assertDirectoryPathWithoutLinks(path.dirname(bootstrapPath));
  fs.mkdirSync(path.dirname(bootstrapPath), { recursive: true });
  if (fs.existsSync(bootstrapPath) && !fs.lstatSync(bootstrapPath).isFile()) throw new Error("Invalid bootstrap file.");
  const temporaryPath = `${bootstrapPath}.tmp-${requestId}`;
  let descriptor;
  let owned = false;
  try {
    descriptor = fs.openSync(temporaryPath, "wx", 0o600);
    owned = true;
    fs.writeFileSync(descriptor, JSON.stringify(state, null, 2), "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporaryPath, bootstrapPath);
    owned = false;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (owned) fs.unlinkSync(temporaryPath);
  }
}

function assertBootstrapOutsideRuntime(appDataPath, { sourcePath, targetPath }) {
  const bootstrapPath = buildBootstrapPath(appDataPath);
  if (containsPath(sourcePath, bootstrapPath) || containsPath(targetPath, bootstrapPath)) {
    throw new Error("The bootstrap configuration must remain outside runtime data.");
  }
}

function queueMigration({ appDataPath, sourcePath, targetPath, homePath, appPath, requestId = randomUUID(), createdAt = new Date().toISOString() }) {
  const paths = validateMigrationPaths({ sourcePath, targetPath, homePath, appPath });
  assertBootstrapOutsideRuntime(appDataPath, paths);
  const pendingMigration = normalizeRequest({ ...paths, requestId, createdAt });
  const state = readBootstrapState({ appDataPath, defaultRuntimePath: paths.sourcePath });
  if (path.relative(state.activeRuntimePath, paths.sourcePath) !== "") throw new Error("The source must be the active runtime directory.");
  if (state.pendingMigration) throw new Error("A migration is already pending.");
  const nextState = { ...state, pendingMigration, migrationResult: null };
  writeBootstrapState(appDataPath, nextState, requestId);
  return nextState;
}

function walkOrdinaryFiles(rootPath, onFile, onDirectory = () => {}) {
  const root = normalizeAbsolutePath(rootPath);
  assertDirectoryPathWithoutLinks(root);
  if (!fs.existsSync(root)) throw new Error("The runtime directory is unavailable.");
  function walk(directory) {
    assertDirectoryPathWithoutLinks(directory);
    for (const name of fs.readdirSync(directory).sort()) {
      const entryPath = path.join(directory, name);
      if (!containsPath(root, entryPath)) throw new Error("A runtime path escaped the source directory.");
      const relativePath = path.relative(root, entryPath).split(path.sep).join("/");
      const stat = fs.lstatSync(entryPath);
      if (stat.isSymbolicLink()) throw new Error("Linked runtime entries are not supported.");
      if (stat.isDirectory()) {
        onDirectory(entryPath, relativePath);
        walk(entryPath);
      } else if (stat.isFile()) {
        onFile(entryPath, relativePath);
      } else {
        throw new Error("Only ordinary runtime files and directories can be migrated.");
      }
    }
  }
  walk(root);
}

function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size &&
    left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

function buildFileManifest(rootPath) {
  const manifest = [];
  // Bound memory use independently of attachment size.
  const buffer = Buffer.alloc(64 * 1024);
  walkOrdinaryFiles(rootPath, (filePath, relativePath) => {
    const before = fs.lstatSync(filePath);
    const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try {
      const opened = fs.fstatSync(descriptor);
      if (!opened.isFile() || !sameFile(before, opened)) throw new Error("A source file changed while being read.");
      const hash = createHash("sha256");
      let size = 0;
      let bytesRead;
      while ((bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null)) !== 0) {
        hash.update(buffer.subarray(0, bytesRead));
        size += bytesRead;
      }
      if (size !== opened.size || !sameFile(opened, fs.fstatSync(descriptor)) || !sameFile(opened, fs.lstatSync(filePath))) {
        throw new Error("A source file changed while being read.");
      }
      manifest.push({ relativePath, size, sha256: hash.digest("hex") });
    } finally {
      fs.closeSync(descriptor);
    }
  });
  return manifest.sort((a, b) => a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0);
}

function copyRuntimeDirectory(sourcePath, stagingPath) {
  walkOrdinaryFiles(sourcePath, (filePath, relativePath) => {
    const before = fs.lstatSync(filePath);
    fs.copyFileSync(filePath, path.join(stagingPath, ...relativePath.split("/")), fs.constants.COPYFILE_EXCL);
    const after = fs.lstatSync(filePath);
    if (!after.isFile() || !sameFile(before, after)) throw new Error("A source file changed during copying.");
  }, (_directoryPath, relativePath) => {
    fs.mkdirSync(path.join(stagingPath, ...relativePath.split("/")));
  });
}

function cleanupOwnedStaging(stagingPath, parentPath, ownedStat) {
  if (!stagingPath || !ownedStat || !fs.existsSync(stagingPath)) return;
  const normalized = normalizeAbsolutePath(stagingPath);
  const parent = normalizeAbsolutePath(parentPath);
  if (path.dirname(normalized) !== parent || !containsPath(parent, normalized) || normalized === parent) {
    throw new Error("The staging directory could not be safely removed.");
  }
  assertDirectoryPathWithoutLinks(normalized);
  const current = fs.lstatSync(normalized);
  if (current.dev !== ownedStat.dev || current.ino !== ownedStat.ino) throw new Error("The staging directory was replaced.");
  fs.rmSync(normalized, { recursive: true, force: false });
}

function performPendingMigration({ appDataPath, defaultRuntimePath = buildManagedUserDataPath(appDataPath), homePath, appPath, now = new Date() }) {
  const state = readBootstrapState({ appDataPath, defaultRuntimePath });
  const pending = state.pendingMigration;
  if (!pending) return { runtimePath: state.activeRuntimePath, migrationResult: state.migrationResult };

  let stagingPath;
  let ownedStat;
  let parentPath;
  let phase = "validation";
  const date = new Date(typeof now === "function" ? now() : now);
  const completedAt = Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
  const baseResult = {
    requestId: pending.requestId, sourcePath: pending.sourcePath,
    targetPath: pending.targetPath, completedAt
  };
  try {
    const { sourcePath, targetPath } = validateMigrationPaths({ ...pending, homePath, appPath });
    assertBootstrapOutsideRuntime(appDataPath, { sourcePath, targetPath });
    parentPath = path.dirname(targetPath);
    stagingPath = path.join(parentPath, `.${path.basename(targetPath)}.staging-${pending.requestId}`);
    if (stagingPath === sourcePath || !containsPath(parentPath, stagingPath)) throw new Error("Invalid staging directory.");
    const originalManifest = buildFileManifest(sourcePath);
    fs.mkdirSync(parentPath, { recursive: true });
    assertDirectoryPathWithoutLinks(parentPath);
    fs.mkdirSync(stagingPath);
    ownedStat = fs.lstatSync(stagingPath);
    phase = "copy";
    copyRuntimeDirectory(sourcePath, stagingPath);
    phase = "verification";
    const stagingManifest = buildFileManifest(stagingPath);
    // Read the source last so changes during staging verification are detected.
    const sourceManifest = buildFileManifest(sourcePath);
    if (JSON.stringify(originalManifest) !== JSON.stringify(sourceManifest) ||
        JSON.stringify(sourceManifest) !== JSON.stringify(stagingManifest)) {
      throw new Error("The copied runtime data failed verification.");
    }
    phase = "promotion";
    validateMigrationPaths({ ...pending, homePath, appPath });
    if (fs.existsSync(targetPath)) fs.rmdirSync(targetPath);
    fs.renameSync(stagingPath, targetPath);
    ownedStat = undefined;

    phase = "bootstrap";
    const stamp = completedAt.slice(0, 10).replace(/-/g, "") + "-" + completedAt.slice(11, 19).replace(/:/g, "");
    const backupPath = path.join(path.dirname(sourcePath), `${path.basename(sourcePath)}.backup-${stamp}`);
    const migrationResult = { status: "success", ...baseResult };
    const nextState = { ...state, activeRuntimePath: targetPath, pendingMigration: null, migrationResult };
    writeBootstrapState(appDataPath, nextState, pending.requestId);
    try {
      assertDirectoryPathWithoutLinks(sourcePath);
      if (fs.existsSync(backupPath)) throw new Error("The backup name is already in use.");
      fs.renameSync(sourcePath, backupPath);
      migrationResult.backupPath = backupPath;
    } catch {
      migrationResult.warning = "The new directory is active. The original directory was retained because its backup could not be renamed.";
    }
    try { writeBootstrapState(appDataPath, nextState, pending.requestId); } catch {
      migrationResult.warning = "The new directory is active. The backup outcome could not be saved; the original data was retained.";
    }
    return { runtimePath: targetPath, migrationResult };
  } catch {
    const summaries = {
      validation: "The migration paths are unavailable, unsafe, or the target is not empty.",
      copy: "Runtime data could not be copied safely. The original directory is still active.",
      verification: "Runtime data verification failed. The original directory is still active.",
      promotion: "The target directory could not be activated. The original directory is still active.",
      bootstrap: "The new runtime path could not be saved. The original directory is still active; the verified target was retained."
    };
    const migrationResult = { status: "failure", ...baseResult, error: summaries[phase] };
    try { cleanupOwnedStaging(stagingPath, parentPath, ownedStat); } catch {
      migrationResult.warning = "The request staging directory could not be safely removed and was retained.";
    }
    try { writeBootstrapState(appDataPath, { ...state, pendingMigration: null, migrationResult }, pending.requestId); } catch {
      migrationResult.warning = "The migration result could not be saved. The original directory is still active.";
    }
    return { runtimePath: state.activeRuntimePath, migrationResult };
  }
}

function consumeMigrationResult({ appDataPath }) {
  const state = readBootstrapState({ appDataPath });
  if (!state.migrationResult) return null;
  writeBootstrapState(appDataPath, { ...state, migrationResult: null });
  return state.migrationResult;
}

module.exports = {
  buildBootstrapPath, readBootstrapState, queueMigration, performPendingMigration,
  consumeMigrationResult, validateMigrationPaths, buildFileManifest
};
