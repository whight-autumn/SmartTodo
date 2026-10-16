# DS-001 SmartTodo 项目结构治理（设计文档）

最后更新: 2026-10-16 | 对应版本: v1.5.0 | 状态: 已完成（DS-001 v1.1） | 级别: L1

## 1. 目标与范围

### 1.1 目标

在不改变 SmartTodo 现有功能、接口、数据格式与兼容行为的前提下，完成项目目录更名、源码职责归位、历史资料归档、可再生产物清理和工程文档补齐，使仓库根目录清晰、源码边界明确、历史资料可追溯、后续 Agent 能按工程宪章继续维护。

### 1.2 交付范围

- 将本地项目目录由 `智能任务管理器/` 更名为 `SmartTodo/`。
- 保留根入口 `main.js`，将散落在根目录的主进程支持模块按职责迁入 `src/main/`。
- 将两个 preload 文件迁入 `src/preload/`，同步固定路径和测试引用。
- 保持 `renderer/`、`tests/`、`assets/`、`scripts/` 中现有文件内容和职责不变；测试仅同步被移动模块的引用路径。
- 按工程宪章 v1.4.0 引入根级规则和说明文档。
- 把仍有长期解释价值的旧设计、计划和 UI 证据归入 `docs/99_archive/`。
- 删除可重新生成、已由 GitHub Release 保存或没有长期价值的构建产物、本地旧 EXE、缓存和重复过程文件。
- 更新 `README.md`、`CHANGELOG.md`、`PROJECT_TREE.md`、`docs/reference/文件说明.md` 和 `.gitignore`。
- 运行单元测试与 Electron UI 测试，证明结构调整没有改变程序行为。
- 按 EC-3.7 在 `_build_aux/smoke/` 建立一次性结构冒烟脚本，验收后归档到 `docs/99_archive/smoke/2026-10-16-v1.5.0/`。

### 1.3 明确不做的事（Explicitly Out of Scope）

- 不新增、删除或改变任何用户功能。
- 不改变 IPC 通道、preload 暴露接口、任务模型、附件事务、周期任务、提醒、AI、设置、迁移或任务笺行为。
- 不改变 `localStorage` 键、运行数据目录、附件结构、引导文件或历史数据迁移顺序。
- 不拆分或重写 `renderer/app.js`、`tests/ui-smoke.cjs` 等超长文件；本轮不以行数为理由调整源码。
- 不升级、安装或卸载 npm 依赖。
- 不修改历史版本说明中当时真实使用的旧名称。
- 不删除兼容迁移所需的 `%APPDATA%\智能任务管家\运行数据` 与 `%APPDATA%\smart-assistant` 引用。
- 不创建、推送或修改 GitHub Release，不执行远端写操作。
- 不清理用户运行数据、系统配置、注册表或项目外文件。
- 不整理同级的 `无水印下载器` 项目。

## 2. 现状分析

### 2.1 仓库与基线

- 当前本地目录：`C:\Users\hazyl\Desktop\Work\project\js_test\智能任务管理器`。
- Git 远端：`https://github.com/whight-autumn/SmartTodo.git`。
- 当前分支：`main`，与 `origin/main` 同步。
- 当前源码版本：`1.5.0`。
- 审计时工作区仅有未跟踪的 `.codex/`；没有已跟踪源码改动。
- 基线命令：`npm test`。
- 基线结果：312 项，310 通过，0 失败，2 项因当前 Windows 环境不支持测试用文件符号链接而跳过。

### 2.2 当前主要问题与证据

| 问题 | 证据 | 影响 |
|---|---|---|
| 本地目录仍使用旧中文名 | 外层目录为 `智能任务管理器/`，但 `package.json`、应用界面、README 和 GitHub 已使用 SmartTodo | 本地路径、工具缓存和交接描述与当前品牌不一致 |
| 主进程模块散落根目录 | 根目录存在 `app-settings-ipc.js`、`runtime-data-manager.js`、`task-attachment-store.js`、`widget-ipc.js` 等多个职责模块 | 根目录难以扫描，职责层级不明显 |
| 工程宪章尚未导入 | 根目录缺少 `ENGINEERING_CHARTER.md`、项目版 `AGENTS.md`、`PROJECT_TREE.md` | 后续任务缺少统一入口、结构说明和治理门禁 |
| 历史设计资料位置分散 | `docs/superpowers/`、`.superpowers/`、`.impeccable/` 同时保存设计、计划、执行报告和评审图片 | 当前资料与历史过程产物混放，重复图像较多 |
| 大量可再生产物占用空间 | `dist/` 约 831 MB；旧 EXE 约 421 MB；空 `.worktrees/` 与工具缓存仍在 | 占用空间，且干扰项目内容判断 |
| `.impeccable/` 含失效绝对路径 | 多个 report/state 文件仍指向已不存在的 `.worktrees/v1-2-modern-chinese-redesign` | 无法直接复用，属于过期过程状态 |
| 项目树文档缺失 | 没有 `PROJECT_TREE.md`；现有 `docs/文件说明.md` 仅覆盖部分职责与调用关系 | 二次开发缺少宪章要求的九板块入口 |

### 2.3 当前关键调用链

```text
package.json.main
  -> main.js
     -> main-paths.js <-> runtime-data-manager.js
     -> app-launch-spec.js -> login-startup.js
     -> app-settings-ipc.js
     -> task-attachment-ipc.js -> task-attachment-store.js
     -> widget-controller.js -> widget-window-state.js
     -> widget-ipc.js
     -> preload.js -> renderer/index.html
     -> widget-preload.js -> renderer/widget.html

renderer/index.html
  -> recurrence-model.js / task-model.js / widget-model.js
  -> draft-store.js / ai-provider.js / ui-appearance.js
  -> note-utils.js / icon-utils.js / motion.js
  -> settings-controller.js
  -> app.js
```

### 2.4 现有数据与接口

- 用户任务、会话、AI 配置和界面设置继续由 Chromium 运行目录保存。
- 默认运行目录继续为 `%APPDATA%\SmartTodo\运行数据`。
- 历史迁移目录继续为 `%APPDATA%\智能任务管家\运行数据` 与 `%APPDATA%\smart-assistant`。
- 主界面与任务笺继续通过固定 IPC 和受限 preload 桥接通信。
- `package.json` 继续以 `main.js` 作为 Electron 入口。
- 本次仅改变源码文件的磁盘位置与对应引用，不改变模块导出的名称、参数或返回值。

## 3. 方案选型

| 方案 | 做法 | 优点 | 缺点 | 影响范围 | 可逆性 | 工作量 | 结论 |
|---|---|---|---|---|---|---|---|
| A1 安全分层治理 | 根入口保留；主进程支持模块与 preload 按职责迁入 `src/`；整理文档与历史资料；清理可再生产物 | 根目录显著简化；职责明确；不触碰业务实现；现有测试可覆盖路径调整 | 需要同步较多 `require()`、测试和打包路径 | 源码路径、测试引用、文档、构建清单、本地产物 | 高，可用 Git 恢复跟踪文件，目录可改回 | 中 | 推荐并已获会话预确认 |
| B 深度源码重构 | 同时拆分 `renderer/app.js`、大测试和现有模块内部职责 | 分层最彻底，可降低大文件复杂度 | 行为回归风险高；违背本轮“不因行数修改”裁定 | 几乎全部运行链路 | 中 | 高 | 不采用 |
| C 仅删除产物 | 只改目录名、删除 `dist/` 和旧 EXE | 风险最低、释放空间最快 | 根目录和历史资料仍然松散，无法完成完整治理目标 | 本地产物和少量文档 | 高 | 低 | 不采用 |

**推荐方案与理由**：采用 A1。它直接解决“文件位置松散”和“历史产物杂乱”的根因，同时把源码修改限制为文件移动、导入路径、资源路径、测试路径及构建清单更新，不改变业务实现。

**为什么不选其它方案**：B 会引入与本次目标无关的逻辑重构；C 无法完成职责分层与交接文档建设。

## 4. 目标架构与目录结构

```text
SmartTodo/                                      # 更名后的项目根
├─ AGENTS.md                                    # Agent 入口与宪章摘要（新增）
├─ ENGINEERING_CHARTER.md                       # 工程宪章 v1.4.0（新增）
├─ README.md                                    # 用户与开发者入口（更新）
├─ CHANGELOG.md                                 # 版本、决策、验证和清理记录（更新）
├─ PROJECT_TREE.md                              # 九板块项目树（新增）
├─ PRODUCT.md                                   # 产品边界（保留）
├─ DESIGN.md                                    # 当前有效设计系统（保留）
├─ package.json / package-lock.json             # 入口和打包清单（更新）
├─ main.js                                      # 唯一 Electron 根入口（修改路径引用，不改行为）
├─ src/                                         # 正式主进程与 preload 源码（新增）
│  ├─ main/
│  │  ├─ paths/
│  │  │  └─ main-paths.js                       # 运行目录和附件路径
│  │  ├─ runtime/
│  │  │  └─ runtime-data-manager.js             # 运行目录迁移事务
│  │  ├─ startup/
│  │  │  ├─ app-launch-spec.js                  # 启动参数契约
│  │  │  └─ login-startup.js                    # OS 自启动状态
│  │  ├─ settings/
│  │  │  └─ app-settings-ipc.js                 # 设置 IPC
│  │  ├─ attachments/
│  │  │  ├─ task-attachment-store.js            # 附件存储事务
│  │  │  └─ task-attachment-ipc.js              # 附件 IPC
│  │  └─ widget/
│  │     ├─ widget-controller.js                # 任务笺窗口控制
│  │     ├─ widget-window-state.js              # 任务笺位置状态
│  │     └─ widget-ipc.js                       # 任务笺 IPC
│  └─ preload/
│     ├─ main-preload.js                        # 主窗口最小桥接
│     └─ widget-preload.js                      # 任务笺最小桥接
├─ renderer/                                    # 现有渲染器，原位保留
├─ assets/                                      # 正式品牌和字体资产，原位保留
├─ tests/                                       # 正式测试，内容原位保留并同步路径
├─ scripts/                                     # 正式可复用脚本，原位保留
├─ release/                                     # 只保留文本发布说明；不保留本地 EXE
└─ docs/
   ├─ 01_design/
   │  └─ DS-001-SmartTodo项目结构治理.md
   ├─ 02_plan/
   │  └─ PL-001-SmartTodo项目结构治理.md         # GATE-1 通过后创建
   ├─ reference/
   │  └─ 文件说明.md                             # 从 docs/文件说明.md 迁入并更新
   ├─ images/                                   # 当前 README 截图，保留
   └─ 99_archive/
      ├─ design-history/
      │  ├─ specs/                              # 原 docs/superpowers/specs
      │  └─ plans/                              # 原 docs/superpowers/plans
      ├─ implementation-reports/                # 有长期价值的执行报告
      └─ ui-evidence/v1.2/                      # 精简后的批准稿与最终评审证据
```

## 5. 数据与接口契约

| 接口/结构 | 当前签名或格式 | 本次处理 | 错误情形与保护 |
|---|---|---|---|
| Electron 入口 | `package.json.main = "main.js"` | 保持不变 | 入口不存在时版本测试和启动失败 |
| 主进程模块导出 | 各 CommonJS `module.exports` | 名称、参数、返回值保持不变，只更新加载路径 | 任一引用遗漏由单元测试或启动测试捕获 |
| 主窗口 preload | 当前 `preload.js` 暴露的固定 `window.desktop` | 文件迁为 `src/preload/main-preload.js`，API 不变 | preload 路径或 API 改变由 preload 测试与 UI 测试捕获 |
| 任务笺 preload | 当前 `widget-preload.js` 暴露的固定 `window.taskWidget` | 文件迁为 `src/preload/widget-preload.js`，API 不变 | 固定通道测试与双窗口 UI 测试捕获 |
| renderer 文件 | `renderer/index.html`、`renderer/widget.html` 及脚本 | 全部原位保留 | 不涉及资源相对路径迁移 |
| 用户数据 | `%APPDATA%\SmartTodo\运行数据` | 不变 | 不执行真实用户数据迁移或清理 |
| 历史兼容路径 | `%APPDATA%\智能任务管家\运行数据`、`%APPDATA%\smart-assistant` | 必须原样保留 | 删除会破坏旧用户升级兼容，测试必须覆盖 |
| 发布资产 | GitHub Releases + 文本版本说明中的大小和 SHA-256 | 删除本地被忽略 EXE，保留文本记录和远端发布 | 删除前核对 EXE 均被 Git 忽略且已有对应发布说明 |

## 6. 改动清单（文件级）

### 6.1 新增

| 文件/目录 | 动作 | 说明 |
|---|---|---|
| `AGENTS.md` | 新增 | 项目版入口指针与宪章摘要 |
| `ENGINEERING_CHARTER.md` | 新增 | 从使用者提供的 v1.4.0 母版导入，不复制母版 `_versions/` |
| `PROJECT_TREE.md` | 新增 | 按 T3 建立目录、模块、链路、数据、契约、配置、工具、技术债和二次开发入口 |
| `src/main/**` | 新增目录/移动文件 | 主进程支持模块按职责归位 |
| `src/preload/**` | 新增目录/移动文件 | 两个隔离 preload 归位 |
| `docs/01_design/` | 新增 | GATE-1 文档目录 |
| `docs/02_plan/` | 新增 | GATE-2 文档目录 |
| `docs/reference/` | 新增 | 当前有效开发说明 |
| `docs/99_archive/**` | 新增 | 历史设计、计划、报告和 UI 证据归档 |

### 6.2 移动并同步引用

| 原路径 | 目标路径 |
|---|---|
| `main-paths.js` | `src/main/paths/main-paths.js` |
| `runtime-data-manager.js` | `src/main/runtime/runtime-data-manager.js` |
| `app-launch-spec.js` | `src/main/startup/app-launch-spec.js` |
| `login-startup.js` | `src/main/startup/login-startup.js` |
| `app-settings-ipc.js` | `src/main/settings/app-settings-ipc.js` |
| `task-attachment-store.js` | `src/main/attachments/task-attachment-store.js` |
| `task-attachment-ipc.js` | `src/main/attachments/task-attachment-ipc.js` |
| `widget-controller.js` | `src/main/widget/widget-controller.js` |
| `widget-window-state.js` | `src/main/widget/widget-window-state.js` |
| `widget-ipc.js` | `src/main/widget/widget-ipc.js` |
| `preload.js` | `src/preload/main-preload.js` |
| `widget-preload.js` | `src/preload/widget-preload.js` |
| `docs/文件说明.md` | `docs/reference/文件说明.md` |
| `docs/superpowers/specs/*` | `docs/99_archive/design-history/specs/*` |
| `docs/superpowers/plans/*` | `docs/99_archive/design-history/plans/*` |
| `.superpowers/sdd/.../task-1-report.md` | `docs/99_archive/implementation-reports/...` |

### 6.3 修改

| 文件 | 说明 |
|---|---|
| `main.js` | 仅更新被移动模块及 preload 的路径 |
| `src/main/**/*.js` | 仅更新模块间相对引用 |
| `package.json` | 更新显式打包文件清单；版本号和依赖不变 |
| `tests/*.test.js`、`tests/*.cjs` | 仅同步被移动模块/preload 的路径及路径断言 |
| `.gitignore` | 增加 `_build_aux/`、`.codex/` 和明确工具缓存规则 |
| `README.md` | 更新开发目录、验证方式和文档入口 |
| `CHANGELOG.md` | 记录 L1 治理、使用者裁定、验证、清理体积和回滚方法 |
| `PRODUCT.md` | 仅在目录/文档入口说明确有需要时同步，不改产品能力 |
| `docs/reference/文件说明.md` | 更新新路径、模块职责和调用链 |
| 本设计文档 | 收尾时标记完成并记录实际偏差 |

### 6.4 归档与精简

`.impeccable/` 的长期价值内容迁入 `docs/99_archive/ui-evidence/v1.2/`：

- `config.json`、`design.json`；
- 已批准的桌面与任务笺效果图及对应 prompt；
- `finish-review.md`、`finish-verdict.md`；
- 为理解最终决策确有必要的少量最终截图。

以下内容在确认已无独有信息后删除：

- `.impeccable/build/` 中可重建的网格、状态、区域切图和 scaffold；
- `.impeccable/review/diff/` 中重复的 desktop/hero/final 差异切图与失效绝对路径报告；
- 未采用方案的重复过程图，若其取舍已由设计文档和最终评审充分记录；
- `.impeccable/hook.cache.json`；
- `.superpowers/` 中被忽略的执行进度缓存；
- 空 `.worktrees/`。

### 6.5 删除的可再生产物

- `dist/` 全部内容（约 831 MB，可由 `npm run dist` 重建）。
- `release/` 各历史版本目录中被 `.gitignore` 排除的本地 EXE（合计约 421 MB）；保留所有 `版本说明.txt` 与校验信息。
- 其他明确属于缓存、日志或临时状态且不含唯一用户数据的文件。

保留：

- `node_modules/`（约 552 MB），因为它是当前本地测试和构建环境；本轮不安装依赖。
- `release/` 中全部文本发布说明。
- `docs/images/` 当前 README 使用的正式截图。
- Git 历史、标签与 GitHub Releases。

## 7. 风险与回滚

### 7.1 风险

| 风险 | 概率 | 影响 | 控制措施 |
|---|---|---|---|
| 模块移动后相对 `require()` 路径遗漏 | 中 | 应用启动或测试失败 | 逐模块迁移；运行完整单元测试；使用 `rg` 检查旧路径 |
| preload 新路径未进入打包清单 | 中 | 开发模式可用但打包后窗口 API 缺失 | 更新 `package.json.build.files`；运行版本/打包清单测试；必要时只做构建配置静态核验 |
| 测试中的源码路径断言过期 | 高 | 测试失败但不代表业务失败 | 只更新路径断言，不改变行为断言 |
| 删除本地 EXE 后无法离线取得旧包 | 低 | 本地历史发布包缺失 | 删除前核对 GitHub Release、版本说明、大小与 SHA-256；如无法核对则停止删除该文件 |
| 精简 `.impeccable/` 时丢失设计依据 | 中 | UI 设计追溯能力下降 | 先归档批准稿、配置和最终结论；逐项确认其余内容是重复或可再生 |
| 外层目录更名导致当前终端路径失效 | 高 | 后续命令需切换工作目录 | 把目录更名安排在独立任务边界；更名后重新解析绝对路径与 Git 状态 |
| 工具缓存含硬编码旧路径 | 高 | 本机工具可能引用旧目录 | 删除可再生缓存；重新生成的状态使用新路径 |

### 7.2 回滚方案

- 跟踪文件移动和修改：使用本次任务提交的父提交，通过 `git revert <治理提交>` 恢复；禁止使用 `git reset --hard`。
- 外层目录：将 `SmartTodo/` 改回 `智能任务管理器/`，再从父目录重新进入仓库。
- `dist/`：运行 `npm run dist` 重新生成；不把生成物提交到 Git。
- 历史 EXE：从对应 GitHub Release 重新下载，并用保留的 `版本说明.txt` SHA-256 校验。
- 工具缓存：由对应工具在新路径下重新生成。
- 若结构迁移后完整测试失败且两次修复仍未通过，停止执行并回到设计门，不继续堆叠路径补丁。

### 7.3 不可逆操作

- 删除未纳入 Git 的本地 `dist/`、历史 EXE 和缓存。其恢复依赖重新构建或 GitHub Release。
- 因此任务流程必须逐条列明删除目标，并在删除前再次核对绝对路径、Git 忽略状态和可恢复来源。

## 8. 验收标准

### 8.1 结构

- [x] 项目目录名为 `SmartTodo`，Git 远端仍为 `whight-autumn/SmartTodo.git`。
- [x] 根目录只保留入口、配置、产品文档和顶层工程文档；主进程支持模块位于 `src/main/`。
- [x] preload 位于 `src/preload/`；renderer、tests、assets 与 scripts 保持原职责。
- [x] `docs/` 具备 `01_design`、`02_plan`、`reference`、`images`、`99_archive` 分层。
- [x] 没有空 `.worktrees/`、无主缓存或失效的绝对路径状态文件。

### 8.2 功能与回归

- [x] `npm test` 结果不低于基线：0 失败；仅允许两项已知 Windows 符号链接用例跳过。
- [x] `npm run test:ui` 三套 Electron 流水线全部通过。
- [x] `_build_aux/smoke/smoke_structure_paths.py` 输出 `PASS`，随后归档且 `_build_aux/` 清空。
- [x] `package.json` 仍为 v1.5.0，产品名、appId、便携包名和入口契约不变。
- [x] 固定 IPC、preload API、数据目录、历史迁移目录和用户数据格式不变。
- [x] 使用 `rg` 确认旧根模块路径只存在于明确归档的历史文档，不存在于当前运行代码和测试引用中。

### 8.3 文档

- [x] `README.md`、`CHANGELOG.md`、`PROJECT_TREE.md` 与实际结构一致。
- [x] `PROJECT_TREE.md` 包含宪章要求的九个板块。
- [x] `docs/reference/文件说明.md` 覆盖所有当前正式源码职责和关键调用链。
- [x] 本设计文档状态更新为已完成，并记录实际执行与设计差异。
- [x] 历史旧名称在兼容代码与历史发布记录中保留，并在项目树中解释其必要性。

### 8.4 清理

- [x] `dist/` 已删除且不在 Git 中。
- [x] `release/` 仅保留文本说明，不含本地 EXE。
- [x] `.impeccable/` 的长期价值资料已归档，重复/可再生过程产物已清除。
- [x] 清理前后体积差写入 `CHANGELOG.md`，预计释放约 1.25 GB。
- [x] `node_modules/` 保留，依赖版本未发生变化。

## 9. 假设与决策

| # | 假设/决策 | 来源 | 依据 | 风险 | 状态 |
|---|---|---|---|---|---|
| D-1 | 仅治理 `智能任务管理器`，不触碰同级项目 | 使用者确认 | 使用者回复“确认B” | 无 | 已确认 |
| D-2 | 项目本地目录更名为 `SmartTodo` | 使用者确认 | GitHub 与产品品牌已使用新名称 | 终端和缓存路径需同步 | 已确认 |
| D-3 | 本轮不因 1000 行建议上限拆分或修改文件 | 使用者确认 | 使用者明确要求“此次不修改，保持文件原样” | 大文件技术债继续存在 | 已确认 |
| D-4 | 允许有价值且不改变功能的源码调整 | 使用者确认 | 使用者明确批准修改源码 | 路径迁移仍需完整回归 | 已确认 |
| D-5 | 采用 A1：移动支持模块和 preload，不重写逻辑 | 使用者确认 | 使用者回复“确认A1” | 路径引用可能遗漏 | 已确认 |
| D-6 | 保留 `node_modules/`，不执行依赖安装 | 使用者确认 | 使用者回复“Q1 选 A” | 仍占用约 552 MB | 已确认 |
| D-7 | 删除本地旧 EXE，保留 GitHub Release 与文本校验记录 | 使用者确认 | 使用者回复“Q2 选 A” | 离线历史包不再本地可用 | 已确认 |
| D-8 | 仅创建本地 Git 提交，使用者验收前不推送 GitHub | 使用者确认 | 使用者回复“远端github仓库先不提交” | 远端暂不包含本轮整理 | 已确认 |
| D-9 | 用 Python 标准库编写一次性目录结构冒烟脚本，归档后不成为 SmartTodo 运行依赖 | 使用者确认 | 使用者确认 DS-001 v1.1 / PL-001 v1.1 | 验证环境需可运行 Python；不影响产品 | 已确认 |

## 10. 待确认项（已关闭）

| Q# | 问题 | 选项 | 我的建议 |
|---|---|---|---|
| Q-1 | 是否确认保留 `node_modules/`，不把依赖缓存纳入本次清理？ | A 保留 | 已确认 A |
| Q-2 | 是否确认删除 `release/` 中所有本地旧 EXE，仅保留文本说明和 GitHub Releases？ | A 删除 | 已确认 A |

## 11. 实施结果与设计偏差

- T1-T7 均已按 A1 方案完成；项目目录已更名为 `SmartTodo`，主进程支持层和 preload 已归位，产品接口、数据格式和兼容路径未改变。
- 实际清理 88 个忽略文件，共 1,311,914,080 字节（1,251.14 MiB，1.222 GiB）；`node_modules/` 保留，依赖与 lockfile 未变。
- 结构冒烟、312 项 Node 测试及三套 Electron UI 流水线通过。UI 首次全量运行出现一次深色面板取色仍为浅色的瞬态断言失败；未修改代码，单项立即复跑和随后全量复跑均通过，未能稳定复现，因此作为验证波动留痕而非产品缺陷结论。
- 与设计的唯一执行性差异：冒烟脚本归档后改为向上发现含 `package.json` 与 `ENGINEERING_CHARTER.md` 的项目根，使归档副本可直接复验；检查内容未变。
- 本轮本地提交从 `e6c9dc6` 至最终 T7 交接提交；远端未推送，等待使用者验收批准。
