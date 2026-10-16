# PROJECT_TREE — SmartTodo

最后更新: 2026-10-16 | 对应版本: v1.5.0 | 遵循宪章: EC v1.4.0 | 维护者: Agent + 使用者

## 1. 目录骨架

```text
SmartTodo/
├─ AGENTS.md                       # Agent 入口与宪章摘要
├─ ENGINEERING_CHARTER.md          # 工程规则正本
├─ main.js                         # Electron 薄入口与模块装配
├─ src/
│  ├─ main/
│  │  ├─ paths/                    # 默认、历史与附件路径
│  │  ├─ runtime/                  # 运行目录迁移事务
│  │  ├─ startup/                  # 启动命令与 OS 自启动
│  │  ├─ settings/                 # 设置 IPC 能力边界
│  │  ├─ attachments/              # 附件存储事务与 IPC
│  │  └─ widget/                   # 任务笺窗口、状态与 IPC
│  └─ preload/                     # 两个最小 contextBridge
├─ renderer/                       # 主界面、任务笺及纯业务模型
│  ├─ styles/                      # 令牌、基础、布局、组件、动效
│  └─ vendor/                      # 本地前端运行时
├─ tests/                          # Node 正式测试与 Electron UI 测试
├─ scripts/                        # 可复用品牌资产构建脚本
├─ assets/                         # 品牌母版、图标和字体
├─ docs/
│  ├─ 01_design/                   # 当前设计门文档
│  ├─ 02_plan/                     # 当前任务门文档
│  ├─ reference/                   # 当前工程参考
│  ├─ images/                      # README 当前截图
│  └─ 99_archive/                  # 历史设计、报告与 UI 证据
├─ release/                        # 版本说明；二进制由 GitHub Releases 分发
├─ package.json                    # 入口、命令、依赖与打包规则
├─ README.md                       # 用户与开发者入口
├─ PRODUCT.md / DESIGN.md          # 产品边界与设计系统
└─ CHANGELOG.md                    # 版本、决策、验证与清理留痕
```

`node_modules/` 为可重建但按本次裁定保留的本地依赖；`dist/`、`_build_aux/`、`.codex/` 为 Git 忽略的本地产物或工具状态，不属于源码。

## 2. 模块清单

| 模块 | 职责（一句话） | 关键文件 | 对外接口 |
|---|---|---|---|
| 主入口 | 在打开 Chromium 配置前确定运行目录，再装配窗口、托盘、通知和 IPC | `main.js` | Electron 生命周期、`notify`、`get-app-version`、`get-data-path`、`window:set-theme` |
| 路径层 | 生成默认/历史/附件路径并委托启动迁移 | `src/main/paths/main-paths.js` | `buildManagedUserDataPath()`、`buildLegacyUserDataPaths()`、`resolveRuntimeDataPath()` |
| 运行目录事务 | 校验、复制、哈希、备份、激活和恢复完整运行目录 | `src/main/runtime/runtime-data-manager.js` | `readBootstrapState()`、`queueMigration()`、`performPendingMigration()` |
| 启动层 | 解析持久启动命令并读写 OS 自启动状态 | `src/main/startup/*.js` | `resolveAppLaunchSpec()`、`readAutoStartState()`、`writeAutoStartState()` |
| 设置边界 | 只允许主窗口通过固定通道操作设置和迁移凭证 | `src/main/settings/app-settings-ipc.js` | `registerAppSettingsIpc()` |
| 附件层 | 管理附件文件身份、限额和单调事务，封装打开边界 | `src/main/attachments/*.js` | `createTaskAttachmentStore()`、`registerTaskAttachmentIpc()` |
| 任务笺主进程层 | 管理独立窗口位置/可见性，并在双窗口间转发白名单快照和动作 | `src/main/widget/*.js` | `createWidgetController()`、`registerWidgetIpc()`、`clampWidgetBounds()` |
| 隔离桥接 | 将固定最小能力暴露为 renderer 全局对象 | `src/preload/*.js` | `window.desktop`、`window.taskWidget` |
| 主渲染器 | 作为任务数据唯一写入者，编排任务、周期、提醒、附件、AI 和界面状态 | `renderer/app.js`、`renderer/settings-controller.js` | DOM 事件、localStorage、固定 preload API |
| 纯业务模型 | 提供任务、周期、任务笺、外观、备注和 AI 配置的可测试逻辑 | `renderer/*-model.js`、`renderer/*-utils.js`、`renderer/ai-provider.js` | UMD/CommonJS API 与浏览器全局 |
| 任务笺渲染器 | 渲染只读快照并请求允许的完成/显示动作 | `renderer/widget.*` | `window.taskWidget` |

## 3. 关键逻辑链路

```text
应用启动
main.js
  → paths.resolveRuntimeDataPath()
  → runtime.performPendingMigration()
  → app.setPath("userData", runtimePath)
  → migrateLegacyUserData()
  → createMainWindow() / widgetController.create()
  → 注册 settings / attachments / widget IPC
```

| 链路名 | 步骤（文件:函数） | 触发条件 | 失败表现 |
|---|---|---|---|
| 安全启动 | `main.js:90 createMainWindow()` 之前由 `src/main/paths/main-paths.js:19 resolveRuntimeDataPath()` 调用 `src/main/runtime/runtime-data-manager.js:395 performPendingMigration()` | 每次进程取得单实例锁 | 无可靠原数据或恢复状态无法保存时停止启动，不打开空配置 |
| 数据目录迁移 | renderer 设置 → `window.desktop.chooseDataDirectory()` → `app-settings-ipc.js:33 registerAppSettingsIpc()` → `queueMigration()` → 可见重启 → `performPendingMigration()` | 用户选择空目录并确认迁移 | 返回固定错误类别；原目录保持活动，可能保留安全副本 |
| 附件保存 | `renderer/app.js` → main preload → `task-attachment-ipc.js:108 registerTaskAttachmentIpc()` → store `prepareChanges/commitChanges/rollbackChanges` | 保存带附件的任务 | 保存失败回滚新导入，不删除旧有效附件 |
| 任务笺同步 | `renderer/app.js` 发布脱敏快照 → `widget-ipc.js:44 registerWidgetIpc()` → widget preload → `renderer/widget.js` | 任务、主题或亮度变化 | 非法发送者/字段被拒绝；完成超时或保存失败恢复原任务状态 |
| 自启动 | 设置中心 → main preload → settings IPC → `login-startup.js:30 writeAutoStartState()` → Electron login item API → 权威回读 | Windows 用户切换开机启动 | OS 拒绝时界面显示实际关闭；非 Windows 显示不可用 |
| 周期刷新 | `renderer/app.js` → `RecurrenceModel` / `TaskModel` → localStorage → 任务笺快照/本地通知 | 启动、04:00 边界或任务变化 | 无效周期降级为一次性；历史任务字段保持兼容 |

## 4. 信息流 / 数据流

| 数据 | 来源 | 经过模块 | 落点（文件/DB/API） | 格式/编码 | 更新频率 |
|---|---|---|---|---|---|
| 任务、草稿、主题、AI 会话/配置 | 主窗口用户输入 | renderer 模型与 `app.js` | 当前 Electron userData 的 Chromium localStorage | JSON / UTF-8；固定键名 | 用户操作及周期刷新 |
| 运行目录选择 | 原生目录选择器 | settings IPC 一次性凭证 → runtime 事务 | `%APPDATA%\SmartTodo\bootstrap.json` | JSON / UTF-8，原子替换 | 用户发起迁移时 |
| 完整运行配置 | 当前活动 userData | 文件清单、大小与 SHA-256 校验 | 用户选择的空目标；旧目录保留时间戳备份 | 原文件字节保持不变 | 数据目录迁移时 |
| 任务附件 | 用户选择的 `File` | webUtils 路径 → preload 校验 → attachment IPC/store | `<运行目录>\task-attachments\<任务ID>\` | 原始二进制，随机存储名 | 附件增删/任务保存时 |
| 任务笺偏好 | 原生窗口移动和显示状态 | widget controller | `<运行目录>\widget-preferences.json` | JSON / UTF-8，原子写入 | 防抖保存、迁移前严格刷新 |
| 任务笺快照 | 主渲染器任务状态 | WidgetModel 白名单 → widget IPC | 仅内存，发送到任务笺 renderer | 克隆后的普通对象 | 任务/外观变化时 |
| AI 请求 | 本地保存的 provider 配置与用户输入 | `ai-provider.js` → renderer fetch | 用户配置的 OpenAI-compatible HTTPS/HTTP 服务 | JSON + SSE | 用户主动发起时 |

localStorage 当前关键键：`smart_tasks`、`deepseek_api_key`、`deepseek_chat_state`、`ai_provider_config`、`smart_tasks_collapsed`、`smart_theme`、`smart_ai_collapsed`、`smart_reminder_fingerprints`。这些键属于兼容契约，不得随意更名。

## 5. 接口与契约

| 名称 | 类型 | 签名或格式 | 错误码/异常 |
|---|---|---|---|
| `window.desktop` | preload API | 固定通知、版本、主题、附件、任务笺和设置方法；参数在 preload 与主进程双重校验 | Promise rejection 或受限结果对象；不暴露 Electron/文件系统 |
| `window.taskWidget` | preload API | `getSnapshot()`、`toggleTask(taskId)`、`setVisible(boolean)`、`showMainWindow()`、快照订阅 | 非法 taskId/payload 拒绝；动作有超时 |
| 设置 IPC | Electron 消息 | `settings:get`、`settings:set-auto-start`、`settings:choose-data-directory`、`settings:request-data-migration`、`settings:consume-migration-result` | 仅当前主窗口；精确字段；选择凭证 5 分钟、一次性、绑定发送者 |
| 附件 IPC | Electron 消息 | prepare/commit/rollback/reconcile/remove/get-url/open/open-external 固定通道 | `TaskAttachmentStoreError` 及安全的固定消息；HTTP/HTTPS 白名单 |
| `bootstrap.json` | 文件 | `{activeRuntimePath, pendingMigration, migrationResult}` 的受限 JSON 状态 | 损坏时仅安全回退；不可靠路径导致启动停止 |
| 任务对象 | localStorage JSON | 兼容既有 id、父子、提醒、周期、附件和完成时间字段 | malformed 字段由模型规范化或拒绝，不改键名 |

## 6. 配置项与环境变量

| 名称 | 默认值 | 作用 | 必填 | 所属文件 |
|---|---|---|---|---|
| `PORTABLE_EXECUTABLE_FILE` | 无 | electron-builder portable 模式的持久外层 EXE | 仅便携运行时 | `src/main/startup/app-launch-spec.js` |
| `npm_package_version` | `1.5.0` 回退 | preload 可见版本字符串 | 否 | `src/preload/main-preload.js` |
| `AI provider/apiUrl/model/apiKey` | DeepSeek 兼容默认配置；Key 为空 | 用户主动配置 AI 服务 | AI 功能需要 | `renderer/ai-provider.js`、localStorage |
| 主题 | `dark` | 深浅主题 | 否 | `renderer/app.js` |
| 亮度 | 100% | 界面亮度约束为 75%–125% | 否 | `renderer/ui-appearance.js` |
| 默认运行目录 | `%APPDATA%\SmartTodo\运行数据` | Electron userData 与附件根 | 自动生成 | `src/main/paths/main-paths.js` |

项目不使用 `.env` 作为运行前提；API Key 位于用户本机 Chromium localStorage，遮蔽不等于加密。

## 7. 辅助工具与 skill 清单

| 名称 | 类型 | 用途 | 调用方式 |
|---|---|---|---|
| Node 正式测试 | 命令 | 逻辑、IPC、安全边界、文件事务与静态契约 | `npm test` |
| Electron UI 流水线 | 命令 | 主界面行为、响应式矩阵、真实双窗口任务笺 | `npm run test:ui` |
| 开发启动 | 命令 | 使用本地依赖运行 Electron | `npm start` |
| 便携构建 | 命令 | 生成 Windows x64 portable 包 | `npm run dist`；产物进入 Git 忽略目录 |
| 品牌资产构建 | 正式脚本 | 从品牌母版再生图标资产 | `node scripts/build-brand-assets.cjs` |
| 工程宪章流程 | 文档化流程 | L1 双门禁、逐任务验证、清理与交接 | `AGENTS.md` → `ENGINEERING_CHARTER.md` → `docs/01_design/` / `docs/02_plan/` |
| 文件职责索引 | 参考文档 | 精确定位正式文件与测试分组 | `docs/reference/文件说明.md` |
| 结构治理冒烟 | 归档验证脚本 | 复验新路径、旧根文件清零与本地产物清理结果 | `python docs/99_archive/smoke/2026-10-16-v1.5.0/smoke_structure_paths.py` |

## 8. 已知问题与技术债

| # | 现象 | 影响 | 临时规避 | 计划 | 关联任务 |
|---|---|---|---|---|---|
| TD-1 | `renderer/app.js` 与部分 UI 测试文件体量较大 | 修改时理解和评审成本较高 | 依赖正式测试与明确模块边界，小范围修改 | 本轮按使用者裁定保持原样；未来单独设计拆分 | DS-001 D-3 |
| TD-2 | Windows 当前环境无法创建测试用文件符号链接 | 两项附件链接安全用例跳过 | 其他路径/普通文件/junction 用例持续覆盖 | 在具备 Developer Mode 或相应权限的环境补跑 | T3/T7 验证 |
| TD-3 | UI 测试存在已记录的开发 CSP 警告和 fixture IPC 缺项 | 不能宣称无警告二进制或完整辅助技术认证 | 以退出码、断言和已知日志边界验收 | 后续独立测试基础设施任务处理 | V1.5.0 测试记录 |
| TD-4 | 历史目录名仍存在于兼容迁移逻辑 | 文本检索会看到旧品牌 | 仅保留在迁移代码、测试和历史归档 | 有明确数据迁移退场策略后再删除 | V1.3.1 兼容契约 |
| TD-5 | Windows 发布包未商业签名 | 首次运行可能触发 SmartScreen | 发布页提供 SHA-256，用户手动核验 | 如引入签名服务需另走 L1 与成本确认 | 发布说明 |

## 9. 二次开发入口

最常改的 3 个文件：`renderer/app.js`（任务与界面编排）、`renderer/settings-controller.js`（设置交互）、`main.js`（仅主进程装配）。修改前先确认是否能落在对应纯模型或 `src/main/` 职责模块，避免继续扩大入口文件。

| 我想改… | 应该动这里 | 注意事项 |
|---|---|---|
| 任务字段、排序、周期或提醒 | `renderer/task-model.js`、`renderer/recurrence-model.js`，再由 `renderer/app.js` 接入 | 保留 localStorage 键和历史任务规范化；更新模型测试 |
| AI provider 或 SSE 解析 | `renderer/ai-provider.js`、`renderer/settings-controller.js` | 不记录或上传 Key；离线任务能力必须独立 |
| 设置项或数据迁移入口 | `renderer/settings-controller.js`、`src/preload/main-preload.js`、`src/main/settings/app-settings-ipc.js` | 新 IPC/字段属于接口变更，必须走 L1；保持发送者和精确 payload 校验 |
| 运行目录安全规则 | `src/main/runtime/runtime-data-manager.js`、`src/main/paths/main-paths.js` | 失败必须保留可验证原数据；不可用时宁可停止启动 |
| 附件能力 | `src/main/attachments/` 与 renderer 附件调用 | 保持受管根、随机磁盘名、数量/大小限制和事务顺序 |
| 任务笺排序/显示 | `renderer/widget-model.js`、`renderer/widget.*` | 主窗口仍是唯一任务写入者；任务笺只接收白名单快照 |
| 窗口、托盘、通知装配 | `main.js`，具体能力下沉到 `src/main/` | `main.js` 保持薄；不要把业务逻辑重新放回根入口 |
| 样式或主题 | `renderer/styles/`、`DESIGN.md` | 同时验证深浅主题、窄窗、125%/150% 缩放与 reduced motion |
| 发布版本 | `package.json`、`package-lock.json`、README、CHANGELOG、release 说明和版本测试 | 构建、校验值、标签与 GitHub 写操作必须单独获批 |
