const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { randomUUID, createHash } = require("node:crypto");
const { buildManagedUserDataPath } = require("../paths/main-paths.js");

const SCHEMA_VERSION = 1;
const REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/;
const FAILURE_SUMMARIES = {
  configuration: "The runtime data configuration is invalid or unreadable. The default directory is being used.",
  interrupted: "The migration was interrupted. Existing original runtime data was recovered; the copied target was not activated.",
  validation: "The migration paths are unavailable, unsafe, or the target is not empty.",
  copy: "Runtime data could not be copied safely. The original directory is still active.",
  verification: "Runtime data verification failed. The original directory is still active.",
  promotion: "The target directory could not be activated. The original directory is still active.",
  backup: "The timestamped backup could not be created. The original directory is still active; the verified target was retained.",
  journal: "The recovery journal could not be saved. The original directory was not moved; the verified target was retained.",
  bootstrap: "The new runtime path could not be saved. The original directory is still active; the verified target was retained."
};
const WARNING_CODES = ["rollback-backup", "staging-retained", "result-unsaved"];
const WARNING_SUMMARIES = {
  "rollback-backup": "The original data remains in its timestamped backup because the source directory could not be restored.",
  "staging-retained": "The request staging directory could not be safely removed and was retained.",
  "result-unsaved": "The migration result could not be saved. Original data was retained."
};

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

function resolveApplicationDirectory(appPath) {
  const application = normalizeAbsolutePath(appPath);
  try {
    return fs.lstatSync(application).isDirectory() ? application : path.dirname(application);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return path.extname(application).toLowerCase() === ".asar" ? path.dirname(application) : application;
  }
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
    const application = resolveApplicationDirectory(appPath);
    if (containsPath(target, application) || containsPath(application, target) ||
        containsPath(source, application) || containsPath(application, source)) {
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
  const request = {
    requestId: value.requestId,
    sourcePath: safeRuntimePath(value.sourcePath, os.homedir(), false),
    targetPath: safeRuntimePath(value.targetPath, os.homedir(), false),
    createdAt: value.createdAt
  };
  if (value.phase !== undefined || value.recoveryPath !== undefined || value.recoveryManifestSha256 !== undefined) {
    const recoveryPath = normalizeAbsolutePath(value.recoveryPath);
    const prefix = `${path.basename(request.sourcePath)}.backup-`;
    if (value.phase !== "backup-planned" || recoveryPath.length > 4096 ||
        path.dirname(recoveryPath) !== path.dirname(request.sourcePath) ||
        !path.basename(recoveryPath).startsWith(prefix) ||
        !/^\d{8}-\d{6}$/.test(path.basename(recoveryPath).slice(prefix.length)) ||
        typeof value.recoveryManifestSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.recoveryManifestSha256)) {
      throw new Error("The migration recovery journal is invalid.");
    }
    Object.assign(request, { phase: "backup-planned", recoveryPath, recoveryManifestSha256: value.recoveryManifestSha256 });
  }
  return request;
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
  if (value.failureCode !== undefined) {
    if (typeof value.failureCode !== "string" || !Object.hasOwn(FAILURE_SUMMARIES, value.failureCode)) throw new Error("Invalid failure category.");
    result.failureCode = value.failureCode;
  } else {
    const code = Object.keys(FAILURE_SUMMARIES).find(code => value.error === FAILURE_SUMMARIES[code]);
    if (code) result.failureCode = code;
  }
  if (value.warningCodes !== undefined) {
    if (!Array.isArray(value.warningCodes) || value.warningCodes.length > WARNING_CODES.length ||
        value.warningCodes.some(code => !WARNING_CODES.includes(code)) || new Set(value.warningCodes).size !== value.warningCodes.length) {
      throw new Error("Invalid warning categories.");
    }
    result.warningCodes = [...value.warningCodes];
  } else if (typeof value.warning === "string") {
    const warnings = Object.keys(WARNING_SUMMARIES).filter(code => value.warning === WARNING_SUMMARIES[code] ||
      (code !== "result-unsaved" && value.warning === `${WARNING_SUMMARIES[code]} ${WARNING_SUMMARIES["result-unsaved"]}`));
    if (warnings.length) {
      if (value.warning !== WARNING_SUMMARIES[warnings[0]] && !warnings.includes("result-unsaved")) warnings.push("result-unsaved");
      result.warningCodes = warnings;
    }
  }
  for (const key of ["error", "warning"]) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== "string" || value[key].length > 300) throw new Error("The migration result is invalid.");
      result[key] = value[key];
    }
  }
  return result;
}

function defaultState(defaultRuntimePath) {
  return { schemaVersion: SCHEMA_VERSION, activeRuntimePath: safeRuntimePath(defaultRuntimePath, os.homedir(), false), pendingMigration: null, migrationResult: null };
}

function readBootstrapState({ appDataPath, defaultRuntimePath = buildManagedUserDataPath(appDataPath) }) {
  function validatedFallback() {
    try {
      const fallback = defaultState(defaultRuntimePath);
      safeRuntimePath(fallback.activeRuntimePath);
      return fallback;
    } catch { throw unavailableRuntimeError(); }
  }
  const bootstrapPath = buildBootstrapPath(appDataPath);
  try {
    assertDirectoryPathWithoutLinks(path.dirname(bootstrapPath));
    if (!fs.existsSync(bootstrapPath)) {
      return validatedFallback();
    }
    const stat = fs.lstatSync(bootstrapPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) throw new Error("Invalid bootstrap file.");
    const value = JSON.parse(fs.readFileSync(bootstrapPath, "utf8"));
    if (!isPlainObject(value) || value.schemaVersion !== SCHEMA_VERSION) throw new Error("Invalid bootstrap state.");
    const pendingMigration = value.pendingMigration == null ? null : normalizeRequest(value.pendingMigration);
    const normalizedActivePath = normalizeAbsolutePath(value.activeRuntimePath);
    const normalizedDefaultPath = safeRuntimePath(defaultRuntimePath, os.homedir(), false);
    const customWithoutRecovery = !pendingMigration && path.relative(normalizedDefaultPath, normalizedActivePath) !== "";
    let activeRuntimePath;
    try {
      activeRuntimePath = safeRuntimePath(normalizedActivePath, os.homedir(), !pendingMigration?.phase);
    } catch (error) {
      if (customWithoutRecovery) throw unavailableRuntimeError();
      throw error;
    }
    if (customWithoutRecovery && !fs.existsSync(activeRuntimePath)) throw unavailableRuntimeError();
    if (pendingMigration && path.relative(activeRuntimePath, pendingMigration.sourcePath) !== "") throw new Error("Invalid migration source.");
    return { schemaVersion: SCHEMA_VERSION, activeRuntimePath, pendingMigration, migrationResult: normalizeResult(value.migrationResult) };
  } catch (error) {
    if (error?.code === "ERR_RUNTIME_DATA_UNAVAILABLE") throw error;
    return { ...validatedFallback(), migrationResult: {
      status: "failure", requestId: null, sourcePath: null, targetPath: null, completedAt: null,
      failureCode: "configuration", error: FAILURE_SUMMARIES.configuration
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

function hashManifest(manifest) {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

function unavailableRuntimeError() {
  const error = new Error("Original runtime data could not be selected safely. Startup was stopped to prevent an empty or inconsistent profile.");
  error.code = "ERR_RUNTIME_DATA_UNAVAILABLE";
  return error;
}

function isUsableRuntime(directoryPath, { homePath, appPath } = {}) {
  try {
    const normalized = safeRuntimePath(directoryPath, homePath);
    if (appPath) {
      const application = resolveApplicationDirectory(appPath);
      if (containsPath(normalized, application) || containsPath(application, normalized)) return false;
    }
    return fs.lstatSync(normalized).isDirectory();
  } catch { return false; }
}

function recoverJournaledMigration({ appDataPath, state, homePath, appPath, completedAt }) {
  const pending = state.pendingMigration;
  const runtimePath = [pending.sourcePath, pending.recoveryPath].find(candidate => {
    if (!isUsableRuntime(candidate, { homePath, appPath })) return false;
    try {
      return hashManifest(buildFileManifest(candidate)) === pending.recoveryManifestSha256;
    } catch { return false; }
  });
  if (!runtimePath) throw unavailableRuntimeError();
  assertBootstrapOutsideRuntime(appDataPath, { sourcePath: runtimePath, targetPath: pending.targetPath });
  const migrationResult = {
    status: "failure", requestId: pending.requestId, sourcePath: pending.sourcePath,
    targetPath: pending.targetPath, completedAt,
    failureCode: "interrupted", error: FAILURE_SUMMARIES.interrupted
  };
  if (runtimePath === pending.recoveryPath) migrationResult.backupPath = runtimePath;
  try {
    writeBootstrapState(appDataPath, { ...state, activeRuntimePath: runtimePath, pendingMigration: null, migrationResult }, pending.requestId);
  } catch {
    // Opening the selected profile while its original digest remains journaled
    // would make legitimate Chromium writes indistinguishable from corruption.
    throw unavailableRuntimeError();
  }
  return { runtimePath, migrationResult };
}

function performPendingMigration({ appDataPath, defaultRuntimePath = buildManagedUserDataPath(appDataPath), homePath, appPath, now = new Date() }) {
  const state = readBootstrapState({ appDataPath, defaultRuntimePath });
  const pending = state.pendingMigration;
  if (!pending) return { runtimePath: state.activeRuntimePath, migrationResult: state.migrationResult };

  let stagingPath;
  let ownedStat;
  let parentPath;
  let backupPath;
  let backupCreated = false;
  let journalCommitted = false;
  let phase = "validation";
  const date = new Date(typeof now === "function" ? now() : now);
  const completedAt = Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
  if (pending.phase === "backup-planned") return recoverJournaledMigration({ appDataPath, state, homePath, appPath, completedAt });
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

    phase = "backup";
    const stamp = completedAt.slice(0, 10).replace(/-/g, "") + "-" + completedAt.slice(11, 19).replace(/:/g, "");
    backupPath = path.join(path.dirname(sourcePath), `${path.basename(sourcePath)}.backup-${stamp}`);
    assertDirectoryPathWithoutLinks(sourcePath);
    // lstat also recognizes a dangling link; no existing backup entry may be replaced.
    let backupExists = false;
    try { fs.lstatSync(backupPath); backupExists = true; } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (backupExists) throw new Error("The backup name is already in use.");
    phase = "journal";
    const journaledPending = normalizeRequest({
      ...pending, phase: "backup-planned", recoveryPath: backupPath,
      recoveryManifestSha256: hashManifest(sourceManifest)
    });
    writeBootstrapState(appDataPath, { ...state, pendingMigration: journaledPending }, pending.requestId);
    journalCommitted = true;
    phase = "backup";
    fs.renameSync(sourcePath, backupPath);
    backupCreated = true;

    phase = "bootstrap";
    const migrationResult = { status: "success", ...baseResult, backupPath };
    const nextState = { ...state, activeRuntimePath: targetPath, pendingMigration: null, migrationResult };
    writeBootstrapState(appDataPath, nextState, pending.requestId);
    return { runtimePath: targetPath, migrationResult };
  } catch {
    const migrationResult = { status: "failure", ...baseResult, failureCode: phase, error: FAILURE_SUMMARIES[phase] };
    function addWarning(code) { (migrationResult.warningCodes ||= []).push(code); }
    let runtimePath = state.activeRuntimePath;
    if (backupCreated) {
      try {
        assertDirectoryPathWithoutLinks(path.dirname(pending.sourcePath));
        assertDirectoryPathWithoutLinks(backupPath);
        let sourceExists = false;
        try { fs.lstatSync(pending.sourcePath); sourceExists = true; } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        if (sourceExists) throw new Error("The original source path is occupied.");
        fs.renameSync(backupPath, pending.sourcePath);
      } catch {
        // The backup still holds the original data. Never activate the target or
        // replace an unrelated entry to force a rollback into the old pathname.
        runtimePath = backupPath;
        migrationResult.backupPath = backupPath;
        migrationResult.warning = WARNING_SUMMARIES["rollback-backup"];
        addWarning("rollback-backup");
      }
    }
    try { cleanupOwnedStaging(stagingPath, parentPath, ownedStat); } catch {
      migrationResult.warning = WARNING_SUMMARIES["staging-retained"];
      addWarning("staging-retained");
    }
    if (!isUsableRuntime(runtimePath, { homePath, appPath })) throw unavailableRuntimeError();
    try { writeBootstrapState(appDataPath, { ...state, activeRuntimePath: runtimePath, pendingMigration: null, migrationResult }, pending.requestId); } catch {
      if (journalCommitted) throw unavailableRuntimeError();
      migrationResult.warning = `${migrationResult.warning || ""} ${WARNING_SUMMARIES["result-unsaved"]}`.trim();
      addWarning("result-unsaved");
    }
    return { runtimePath, migrationResult };
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
