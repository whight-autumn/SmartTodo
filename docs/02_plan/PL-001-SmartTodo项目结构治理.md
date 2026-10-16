# PL-001 SmartTodo 项目结构治理（任务流程）

最后更新: 2026-10-16 | 对应设计: DS-001 v1.1 | 状态: 已确认，执行中（2026-10-16 11:44:14 +08:00） | 级别: L1

> **执行者要求：**执行本计划时必须使用 `superpowers:executing-plans`，逐任务推进并在每个任务结束后按 EC-8.2 回报。当前会话不得自行派生子代理。

**目标：**在不改变 SmartTodo 现有功能、接口和数据兼容行为的前提下，完成目录更名、主进程源码归位、历史资料归档、可再生产物清理和宪章文档建设。

**架构：**保留根入口 `main.js` 和现有 `renderer/`，将主进程支持模块按 paths、runtime、startup、settings、attachments、widget 六类迁入 `src/main/`，将两个 preload 迁入 `src/preload/`。历史设计与执行材料进入 `docs/99_archive/`，当前工程说明进入根文档与 `docs/reference/`。

**技术栈：**Electron 31、CommonJS、Node.js `node:test`、原生 HTML/CSS/JavaScript、electron-builder、PowerShell、Git。

**设计依据：**`docs/01_design/DS-001-SmartTodo项目结构治理.md`

## 全局约束

- 产品版本保持 `1.5.0`，依赖版本和 lockfile 内容保持不变。
- 不新增、删除或改变用户功能、IPC 通道、preload API、数据格式或迁移顺序。
- 不拆分或重写 `renderer/app.js`、`tests/ui-smoke.cjs` 等现有文件。
- 兼容路径 `%APPDATA%\智能任务管家\运行数据` 与 `%APPDATA%\smart-assistant` 必须保留。
- `node_modules/` 保留；禁止执行 `npm install`、`npm update` 或依赖卸载。
- `dist/` 和 `release/` 下本地 EXE 经删除前校验后删除；发布文本与 GitHub Releases 保留。
- 任何新增范围、第三方依赖、接口变化或业务逻辑变化必须停止并重新走设计门。
- 所有文本文件使用 UTF-8；不得批量格式化与目标无关的文件。
- 不执行 `git reset --hard`、`git clean -fd`、`git push --force` 或任何远端写操作。

## 评审重点

1. 移动后的 CommonJS 相对路径必须保持闭环，特别是 `main-paths` 与 `runtime-data-manager` 的既有延迟依赖。
2. 两个 preload 的真实路径必须同时被 `main.js`、测试和 electron-builder 打包清单引用。
3. 历史旧名称只能留在兼容代码与历史归档中，不得重新成为当前品牌或当前路径。
4. 删除的本地 EXE 必须全部被 Git 忽略，并且每个版本仍有文本说明；条件不满足即停止对应删除。
5. 外层目录更名后，Git 根、node_modules、测试和所有当前文档链接必须从新路径正常工作。

## 执行顺序（WBS）

| 任务号 | 目标 | 输入 | 产出 | 涉及文件 | 验收标准 | 依赖 |
|---|---|---|---|---|---|---|
| T1 | 固化治理规则和门禁记录 | 宪章母版、已确认 DS-001/PL-001 | 根级宪章入口、忽略规则、首个治理提交 | `AGENTS.md`、`ENGINEERING_CHARTER.md`、`.gitignore`、`docs/01_design/**`、`docs/02_plan/**` | 宪章版本一致；`git diff --check` 通过；无源码变化 | — |
| T2 | 归档历史设计与工具证据 | `docs/superpowers/`、`.superpowers/`、`.impeccable/` | 分层历史归档；冗余过程产物清除 | `docs/99_archive/**`、原三处历史目录 | 长期价值资料均可定位；无失效绝对路径状态文件；Git 可追溯 | T1 |
| T3 | 将主进程支持模块与 preload 归位 | DS-001 移动表、现有测试 | `src/main/**`、`src/preload/**`、同步后的引用与打包清单 | `main.js`、移动模块、`package.json`、相关测试 | `npm test` 0 失败；接口和版本断言不变；旧当前路径引用清零 | T2 |
| T4 | 构建当前工程说明文档 | 新目录结构、现有 README/PRODUCT/文件说明 | 完整 `PROJECT_TREE.md` 与同步文档 | `README.md`、`PRODUCT.md`（仅必要时）、`PROJECT_TREE.md`、`docs/reference/文件说明.md` | 九板块齐全；目录、调用链、数据流、配置与测试命令一致 | T3 |
| T5 | 清理本地生成物和旧发布二进制 | 删除前清单、Git 忽略结果、发布说明 | 删除 `dist/`、旧 EXE、缓存和空目录；精确空间记录 | 未跟踪/忽略文件、`CHANGELOG.md` | 目标绝对路径已校验；文本说明保留；释放空间有证据 | T4 |
| T6 | 将本地项目目录更名为 SmartTodo | 已通过 T1-T5 的仓库 | `...\js_test\SmartTodo` | 外层目录 | 新路径存在、旧路径不存在、Git 状态与远端正常 | T5 |
| T7 | 完整回归、关闭文档并提交交接点 | 新路径项目、全部改动 | 单元/UI 验证证据、完成状态、最终提交 | DS、PL、README、CHANGELOG、PROJECT_TREE | 单元测试 0 失败；三套 UI 测试通过；diff/文档/清理自检通过 | T6 |

## 每任务执行协议

1. 开始前复述唯一目标、本任务不做什么和成功证据。
2. 执行下列已授权的最小操作，不扩展范围。
3. 先完成文件级检查，再运行任务指定验证。
4. 验证失败时立即停止回报；同一点第二次修补前给出根因分析，第三次返回设计门。
5. 验证通过后按 EC-8.2 回报，并完成本任务列明的本地 Git 提交；不推送远端。

---

### Task T1：固化治理规则和门禁记录

**唯一目的：**让仓库在任何结构改动前具备工程宪章、确认记录与明确忽略规则。

**本任务不做：**不移动源码、不删除产物、不更名外层目录。

**文件：**

- Create: `AGENTS.md`
- Create: `ENGINEERING_CHARTER.md`
- Modify: `.gitignore`
- Modify: `docs/01_design/DS-001-SmartTodo项目结构治理.md`
- Create: `docs/02_plan/PL-001-SmartTodo项目结构治理.md`

**接口：**

- Consumes: 使用者提供的工程宪章 v1.4.0 及本会话 GATE 确认。
- Produces: 后续任务必须遵循的规则入口、设计与计划基线。

- [ ] **Step 1：复制宪章正本并建立项目版入口**

  使用 `apply_patch` 创建项目版 `AGENTS.md`；使用 `Copy-Item -LiteralPath` 从已提供的母版复制 `ENGINEERING_CHARTER.md`，不复制母版 `_versions/`。

- [ ] **Step 2：补齐忽略规则**

  使用 `apply_patch` 在 `.gitignore` 增加 `_build_aux/`、`.codex/`、工具 hook cache 和通用缓存规则，不改变已跟踪 `.impeccable/` 历史资产的可见性。

- [ ] **Step 3：验证治理文件**

  Run: `rg -n "version: 1.4.0|\[EC v1.4.0 loaded\]" ENGINEERING_CHARTER.md AGENTS.md`

  Expected: 两个文件都指向 EC v1.4.0；项目根无 `_versions/`。

  Run: `git diff --check; git status --short`

  Expected: 无空白错误；仅出现本任务预期文档与 `.gitignore`。

- [ ] **Step 4：提交治理基线**

  Run: `git add AGENTS.md ENGINEERING_CHARTER.md .gitignore docs/01_design docs/02_plan`

  Run: `git commit -m "docs[T1] establish engineering governance"`

  Expected: 提交成功，不包含源码或本机缓存。

---

### Task T2：归档历史设计与工具证据

**唯一目的：**把仍有价值的历史资料集中归档，并删除重复、可再生或带失效路径的过程产物。

**本任务不做：**不修改历史文档叙述，不更新当前源码引用，不删除当前 README 截图。

**文件：**

- Move: `docs/superpowers/specs/*` -> `docs/99_archive/design-history/specs/`
- Move: `docs/superpowers/plans/*` -> `docs/99_archive/design-history/plans/`
- Move: `.superpowers/sdd/2026-09-14-v1.0.6-task-notes-attachments/task-1-report.md` -> `docs/99_archive/implementation-reports/v1.0.6-task-notes-attachments.md`
- Move selected: `.impeccable/config.json`, `.impeccable/design.json`, approved desktop/widget mocks and prompts, final review/verdict -> `docs/99_archive/ui-evidence/v1.2/`
- Delete tracked redundant process artifacts under the remaining `.impeccable/`
- Delete ignored `.impeccable/hook.cache.json` and `.superpowers/sdd/2026-09-22-v1.3-recurring-tasks/progress.md`

**接口：**

- Consumes: 历史 spec、plan、执行报告、批准稿和评审结论。
- Produces: 只读历史归档，不被运行代码或打包流程依赖。

- [ ] **Step 1：创建归档目录并用 `git mv` 移动跟踪文件**

  使用 `New-Item -ItemType Directory` 创建设计历史、执行报告与 UI 证据目录；使用 `git mv` 执行本任务文件表中的移动。

- [ ] **Step 2：核对 `.impeccable/` 独有信息**

  Run: `git ls-files .impeccable; rg -n "approved|resolved|contradicted|decision" .impeccable docs/99_archive/ui-evidence/v1.2`

  Expected: 批准稿、配置、设计定义、最终评审与裁定均已归档；其余只剩重复切图、构建中间态或失效路径状态。

- [ ] **Step 3：删除冗余跟踪产物和本机缓存**

  对经 Step 2 证明无独有信息的 `.impeccable/build/`、`.impeccable/review/diff/`、未采用 options 与剩余过程截图使用明确路径的 `git rm -r -- <path>`；对两个忽略缓存使用经绝对路径校验后的 `Remove-Item -LiteralPath`。不得对项目根、workspace 根或通配目录执行递归删除。

- [ ] **Step 4：验证归档完整性**

  Run: `rg --files docs/99_archive | Sort-Object`

  Expected: 所有历史 spec/plan、执行报告、批准稿与最终评审可定位。

  Run: `rg -n "C:/Users/hazyl/Desktop/Work/project/js_test/智能任务管理器/.worktrees" docs/99_archive/ui-evidence/v1.2`

  Expected: 无当前有效文档依赖该失效路径；历史 prompt 中如仅作为原始记录出现则保持原文并在归档索引说明。

- [ ] **Step 5：提交归档整理**

  Run: `git add -A docs .impeccable .superpowers`

  Run: `git commit -m "chore[T2] archive historical design artifacts"`

  Expected: 提交仅包含历史资料移动、归档索引和冗余过程产物删除。

---

### Task T3：主进程支持模块与 preload 归位

**唯一目的：**在不改实现逻辑的情况下，把根目录支持模块迁入职责目录，并保持全部接口与行为不变。

**本任务不做：**不拆分函数、不重命名导出、不格式化文件、不改变错误消息、IPC 通道或业务逻辑。

**文件：**

- Move: 设计文档 6.2 表中的 12 个源码文件
- Modify: `main.js`
- Modify: moved files with relative internal dependencies
- Modify: `package.json`
- Modify: affected `tests/*.test.js` and `tests/*.cjs`

**接口：**

- Consumes: 原 CommonJS 导出、`main.js` 根入口、renderer 固定路径。
- Produces: 相同导出签名；`main.js` 仍为 package 入口；两个 preload 全局 API 不变。

- [ ] **Step 1：记录迁移前路径契约**

  Run: `rg -n "require\(|preloadPath|preload:|build\.files|preload\.js|widget-preload\.js" main.js *.js tests package.json`

  Expected: 保存所有当前引用点，作为迁移后清零清单。

- [ ] **Step 2：创建职责目录并移动源码**

  使用 `New-Item -ItemType Directory` 创建 `src/main/{paths,runtime,startup,settings,attachments,widget}` 与 `src/preload`；使用逐文件 `git mv` 完成 DS-001 6.2 的精确映射。

- [ ] **Step 3：只更新生产引用**

  使用 `apply_patch` 完成以下固定映射：

  - `main.js` 加载 `./src/main/...`；preload 使用 `src/preload/main-preload.js` 与 `src/preload/widget-preload.js`。
  - `src/main/paths/main-paths.js` 延迟加载 `../runtime/runtime-data-manager.js`。
  - `src/main/runtime/runtime-data-manager.js` 加载 `../paths/main-paths.js`。
  - `src/main/settings/app-settings-ipc.js` 分别加载 `../paths/`、`../runtime/`、`../startup/` 下模块。
  - `src/main/startup/login-startup.js` 继续加载同目录 `./app-launch-spec.js`。
  - `src/main/widget/widget-controller.js` 继续加载同目录 `./widget-window-state.js`。
  - `package.json.build.files` 用 `src/**/*` 取代已移动的根文件清单；`main.js`、`renderer/**/*`、`assets/**/*` 保持显式包含。

- [ ] **Step 4：只更新测试路径与路径断言**

  使用 `apply_patch` 更新由 Step 1 找出的测试引用、VM require 映射和路径正则。断言的接口、值、错误行为和测试数据保持不变。

- [ ] **Step 5：检查旧当前路径引用**

  Run: `rg -n "\.\./(app-launch-spec|app-settings-ipc|login-startup|main-paths|preload|runtime-data-manager|task-attachment|widget-(controller|ipc|preload|window-state))|\./(app-launch-spec|app-settings-ipc|login-startup|main-paths|runtime-data-manager|task-attachment|widget-(controller|ipc|preload|window-state))" main.js src tests package.json`

  Expected: 无指向已删除根文件的当前引用；历史归档不在本检查范围。

- [ ] **Step 6：运行单元测试**

  Run: `npm test`

  Expected: 312 项，0 失败；允许仅两项既有 Windows 符号链接测试跳过。

- [ ] **Step 7：提交源码归位**

  Run: `git add main.js src package.json tests`

  Run: `git commit -m "refactor[T3] organize main process modules"`

  Expected: Git 把绝大多数文件识别为 rename；diff 不出现业务实现变化。

---

### Task T4：构建当前工程说明

**唯一目的：**让当前目录、模块、调用链、数据流、契约和二次开发入口具备唯一且可验证的说明。

**本任务不做：**不修改产品功能或历史归档正文。

**文件：**

- Move/Modify: `docs/文件说明.md` -> `docs/reference/文件说明.md`
- Create: `PROJECT_TREE.md`
- Modify: `README.md`
- Modify if needed: `PRODUCT.md`
- Modify: `CHANGELOG.md`

**接口：**

- Consumes: T3 的实际结构和现有产品/设计说明。
- Produces: 当前工程的入口文档、九板块项目树和文件职责索引。

- [ ] **Step 1：迁移当前文件说明并更新路径**

  使用 `git mv` 将 `docs/文件说明.md` 移入 `docs/reference/`；使用 `apply_patch` 更新每个正式源码文件职责、测试分组和关键调用关系。

- [ ] **Step 2：创建九板块 PROJECT_TREE**

  使用 `apply_patch` 创建 `PROJECT_TREE.md`，完整覆盖：目录骨架、模块清单、关键链路、信息流、接口契约、配置项、工具/skill、已知技术债、二次开发入口。

- [ ] **Step 3：同步 README/PRODUCT/CHANGELOG**

  README 增加当前源码结构、宪章入口和开发验证命令；PRODUCT 仅在文档入口确有需要时调整；CHANGELOG 先记录已确认设计、任务范围和决策，最终体积与验证结果留到 T5/T7 填入。

- [ ] **Step 4：验证文档链接和路径**

  Run: `rg -n "main-paths\.js|runtime-data-manager\.js|preload\.js|widget-preload\.js|docs/文件说明\.md" README.md PRODUCT.md PROJECT_TREE.md docs/reference/文件说明.md`

  Expected: 所有当前源码引用使用 T3 新路径；旧路径仅作为迁移说明时明确标为历史。

- [ ] **Step 5：提交当前文档**

  Run: `git add README.md PRODUCT.md CHANGELOG.md PROJECT_TREE.md docs/reference`

  Run: `git commit -m "docs[T4] document SmartTodo architecture"`

  Expected: 文档与实际目录一致，无空章节或占位符。

---

### Task T5：清理生成物、旧 EXE 与本机缓存

**唯一目的：**删除已确认可恢复且不属于仓库资产的本地产物，并记录实际释放空间。

**本任务不做：**不删除 `node_modules/`、发布文本、README 图片、用户数据或任何项目外文件。

**文件：**

- Delete ignored: `dist/`
- Delete ignored: `release/V1.0.7/智能任务管家-1.0.7.exe`
- Delete ignored: `release/V1.2/智能任务管家-1.2.0.exe`
- Delete ignored: `release/V1.2.1/智能任务管家-1.2.1.exe`
- Delete ignored: `release/V1.2.2/智能任务管家-1.2.2.exe`
- Delete ignored: `release/V1.3.0/智能任务管家-1.3.0.exe`
- Delete ignored: `release/V1.3.1/SmartTodo-1.3.1.exe`
- Delete if empty: `.worktrees/`
- Modify: `CHANGELOG.md`

**接口：**

- Consumes: GitHub Releases、保留的版本说明与可重建 dist。
- Produces: 无冗余二进制的本地工作区和实际清理记录。

- [ ] **Step 1：解析并校验绝对目标**

  使用 `Resolve-Path` 分别解析项目根、`dist/`、`.worktrees/` 和六个 EXE；验证所有目标都严格位于当前项目根内，项目根自身不在删除列表。

- [ ] **Step 2：核对 Git 状态与恢复来源**

  Run: `git check-ignore dist release/V1.0.7/智能任务管家-1.0.7.exe release/V1.2/智能任务管家-1.2.0.exe release/V1.2.1/智能任务管家-1.2.1.exe release/V1.2.2/智能任务管家-1.2.2.exe release/V1.3.0/智能任务管家-1.3.0.exe release/V1.3.1/SmartTodo-1.3.1.exe`

  Expected: 每个目标都被忽略。

  Run: `Get-ChildItem release -Recurse -Filter 版本说明.txt; Get-ChildItem release -Recurse -Filter *.exe`

  Expected: 六个 EXE 各有对应版本说明；若有额外 EXE 或缺失说明，立即停止并回报。

- [ ] **Step 3：记录删除前体积**

  对已校验目标执行只读 `Measure-Object Length -Sum`，保存总字节数和文件数。

- [ ] **Step 4：执行明确删除**

  使用 PowerShell 原生命令并保持同一 shell：

  - `Remove-Item -LiteralPath <已校验的 dist 绝对路径> -Recurse`
  - 对六个已校验 EXE 分别执行 `Remove-Item -LiteralPath <绝对文件路径>`
  - 仅当 `.worktrees/` 为空时执行 `Remove-Item -LiteralPath <已校验的 .worktrees 绝对路径>`

  禁止使用 `-Force`、通配符、变量拼接后的未解析路径或跨 shell 删除。

- [ ] **Step 5：记录结果并提交清理说明**

  验证目标不存在、`release/**/*.txt` 仍存在、`node_modules/` 仍存在；用 `apply_patch` 把实际文件数和释放字节写入 CHANGELOG。

  Run: `git add CHANGELOG.md; git commit -m "chore[T5] record generated artifact cleanup"`

  Expected: 提交只记录清理事实；忽略产物本身不进入 Git diff。

---

### Task T6：外层目录更名为 SmartTodo

**唯一目的：**让本地项目目录与应用、npm 包和 GitHub 仓库名称一致。

**本任务不做：**不修改 Git 远端、分支、标签或项目内容。

**文件：**

- Move directory: `C:\Users\hazyl\Desktop\Work\project\js_test\智能任务管理器` -> `C:\Users\hazyl\Desktop\Work\project\js_test\SmartTodo`

**接口：**

- Consumes: 完成 T1-T5 的完整 Git 仓库。
- Produces: 同一仓库的新本地绝对路径。

- [ ] **Step 1：验证源、目标与父目录**

  解析父目录和源目录绝对路径；确认源目录位于 `...\js_test\` 内，目标 `...\js_test\SmartTodo` 不存在，源目录 Git 工作区清楚且没有运行中的构建命令。

- [ ] **Step 2：从父目录执行单次移动**

  Run from `C:\Users\hazyl\Desktop\Work\project\js_test`:

  `Move-Item -LiteralPath 'C:\Users\hazyl\Desktop\Work\project\js_test\智能任务管理器' -Destination 'C:\Users\hazyl\Desktop\Work\project\js_test\SmartTodo'`

- [ ] **Step 3：在新路径恢复上下文**

  Run: `git -C 'C:\Users\hazyl\Desktop\Work\project\js_test\SmartTodo' status --short --branch`

  Run: `git -C 'C:\Users\hazyl\Desktop\Work\project\js_test\SmartTodo' remote -v`

  Expected: 仓库正常、远端仍为 SmartTodo、旧目录不存在。

---

### Task T7：完整回归、关闭文档与交接提交

**唯一目的：**在最终路径证明行为未改变，并让全部治理文档与实际结果一致。

**本任务不做：**不打包、不安装依赖、不推送远端、不新增整理范围。

**文件：**

- Create then archive: `_build_aux/smoke/smoke_structure_paths.py` -> `docs/99_archive/smoke/2026-10-16-v1.5.0/smoke_structure_paths.py`
- Modify: `docs/01_design/DS-001-SmartTodo项目结构治理.md`
- Modify: `docs/02_plan/PL-001-SmartTodo项目结构治理.md`
- Modify: `CHANGELOG.md`
- Modify if verification reveals stale descriptions: `README.md`, `PROJECT_TREE.md`, `docs/reference/文件说明.md`

**接口：**

- Consumes: T1-T6 的最终目录和提交。
- Produces: 可交接、可回滚、验证完整的 SmartTodo 工程。

- [ ] **Step 1：运行并归档结构冒烟测试**

  在 `_build_aux/smoke/` 创建仅使用 Python 标准库的 `smoke_structure_paths.py`，检查新源码路径存在、旧根模块不存在、`dist/` 与本地 EXE 已清除、`node_modules/` 保留；脚本必须直接输出 `PASS/FAIL`。

  Run from new path: `python _build_aux/smoke/smoke_structure_paths.py`

  Expected: 输出 `PASS`、退出码 0；随后将脚本移动到 `docs/99_archive/smoke/2026-10-16-v1.5.0/` 并删除空 `_build_aux/`。

- [ ] **Step 2：运行完整单元测试**

  Run from new path: `npm test`

  Expected: 312 项，0 失败；允许仅两项既有 Windows 符号链接用例跳过。

- [ ] **Step 3：运行完整 Electron UI 测试**

  Run: `npm run test:ui`

  Expected: `ui-smoke.cjs`、`ui-layout.cjs`、`ui-widget.cjs` 全部退出码 0；无未处理 renderer error。

- [ ] **Step 4：执行结构、兼容与清理检查**

  Run: `git status --short; git diff --check; rg -n "智能任务管理器|智能任务管家|smart-assistant" . -g '!node_modules/**' -g '!.git/**' -g '!docs/99_archive/**' -g '!release/**'`

  Expected: 当前品牌为 SmartTodo；旧名称只存在于兼容迁移代码/测试或明确历史说明中。

  Run: `Test-Path dist; Get-ChildItem release -Recurse -Filter *.exe; Test-Path node_modules`

  Expected: `dist` 为 False、EXE 列表为空、`node_modules` 为 True。

- [ ] **Step 5：关闭设计、计划与变更记录**

  使用 `apply_patch` 将 DS/PL 标记为已完成，写入实际与设计差异、测试命令与结果、清理体积、提交点和二次开发入口。

- [ ] **Step 6：最终文档一致性检查**

  Run: `rg -n "TBD|TODO|待补|占位" README.md CHANGELOG.md PROJECT_TREE.md docs/01_design docs/02_plan docs/reference`

  Expected: 无未解释占位符；历史归档不作为当前文档扫描对象。

- [ ] **Step 7：提交交接点**

  Run: `git add README.md CHANGELOG.md PROJECT_TREE.md docs/01_design docs/02_plan docs/reference`

  Run: `git commit -m "docs[T7] close SmartTodo structure governance"`

  Expected: 提交成功；随后 `git status --short` 为空（被忽略的 `node_modules/` 除外）。不执行 push。

## GATE-2 写操作与命令授权清单

使用者确认本计划即一次性授权以下操作；授权仅覆盖本计划和所列路径，任务结束失效：

| 类别 | 获授权操作 | 路径范围 |
|---|---|---|
| 文档写入 | `apply_patch`、母版文件 `Copy-Item` | 项目内 `AGENTS.md`、`ENGINEERING_CHARTER.md`、`.gitignore`、README/PRODUCT/CHANGELOG/PROJECT_TREE、`docs/**` |
| 目录创建 | `New-Item -ItemType Directory` | 项目内 `src/**`、`docs/**` |
| 跟踪文件移动 | `git mv` | DS-001/PL-001 列出的源码、preload、历史文档和选定 UI 证据 |
| 跟踪文件删除 | `git rm -r -- <明确路径>` | 仅 T2 核验为重复/可再生的 `.impeccable/` 剩余过程产物 |
| 本机文件删除 | `Remove-Item -LiteralPath`；目录仅允许已校验的 `-Recurse` 且禁止 `-Force` | 仅 T2 两个缓存、T5 `dist/`、六个旧 EXE、确认为空的 `.worktrees/` |
| 外层目录移动 | `Move-Item -LiteralPath` | 仅 `...\js_test\智能任务管理器` -> `...\js_test\SmartTodo` |
| Git 写入 | `git add`、`git commit` | 当前 SmartTodo 仓库；提交信息与任务中列明一致 |
| 测试写入副作用 | `npm test`、`npm run test:ui` 产生的临时文件/缓存 | 测试自身声明的系统临时目录及项目内被忽略测试产物 |

明确不授权：依赖安装/升级/卸载、Git push、历史改写、强制清理、系统设置、注册表、用户运行数据、项目外文件，以及任何未列明的联网写操作。

## 变更记录

| 日期 | 变更 | 原因 | 是否已确认 |
|---|---|---|---|
| 2026-10-16 | 创建 PL-001；按 A1 拆分 T1-T7，并列明全部写、移、删、提交命令 | GATE-1 已确认，需要进入任务门 | 已确认（Q1=A、Q2=A；禁止远端推送） |
| 2026-10-16 | 升为 PL-001 v1.1：同步实际母版 EC v1.4.0，并在 T7 增加一次性结构冒烟脚本及归档步骤 | 消除计划引用旧宪章和漏项 | 已确认（使用者原话：“确认”） |

