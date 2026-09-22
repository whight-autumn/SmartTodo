<p align="center">
  <img src="assets/icon.png" width="110" height="110" alt="SmartTodo 图标">
</p>

<h1 align="center">SmartTodo</h1>

<p align="center"><b>本地优先的 Windows 桌面任务管理器与可选 AI 助手</b></p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.2.2-315e50" alt="Version 1.2.2">
  <img src="https://img.shields.io/badge/Electron-31-478268?logo=electron&logoColor=white" alt="Electron 31">
  <img src="https://img.shields.io/badge/node:test-122%20tests-9c473b" alt="node:test 122 tests">
  <img src="https://img.shields.io/badge/Platform-Windows%20x64-315e50" alt="Windows x64">
  <img src="https://img.shields.io/badge/License-MIT-69736e" alt="MIT">
</p>

SmartTodo 将任务、备注、附件、会话和配置保存在本机，无需账号或后端服务。V1.2.2 延续“文房案台”现代中式视觉系统，并重点改善 Windows 渲染稳定性与日常操作反馈。

## V1.2.2 亮点

- 现代新中式界面：暖纸、竹青、漆夜与朱砂构成深浅双主题，统一使用重新绘制的竹叶流萤图标。
- 响应式工作台：覆盖 1366×768 至 2560×1440、窄窗口以及 125%／150% 缩放；长标题、长链接和长文件名不会造成横向撕裂。
- 桌面任务笺：默认位于当前桌面右侧，以半透明 320×440 小窗展示最多 5 项未完成任务；优先顺序为“已逾期 → 24 小时内到期 → 置顶 → 高优先级 → 其余任务”。
- 时间输入稳定性：阻断原生分钟分段双击时的异常 GPU 重绘路径，并使用更稳定的软件合成，避免窗口黑屏。
- 操作反馈：按钮按压、输入聚焦、筛选选中和任务勾选均提供克制而清晰的即时反馈；亮度拉条可从图标连续悬停进入。
- 克制动效：本地 GSAP 只服务于状态变化，并完整尊重 `prefers-reduced-motion`；桌面任务笺使用单一 180ms CSS 完成反馈。
- 原有数据兼容：继续使用既有 `localStorage` 键名、任务结构、运行数据目录和附件目录，无需迁移。

## 功能

- 主任务／子任务、提醒、高中低优先级、置顶、折叠、完成与撤销。
- “需关注／进行中／已完成”筛选；完成任务保留 15 天后自动清理。
- 可重复编辑备注；HTTP/HTTPS 安全链接；每项任务最多 10 个附件，单个不超过 20MB。
- DeepSeek、OpenAI 与自定义 OpenAI-compatible 服务；流式对话、会话管理和任务分析。
- 深浅主题、75%–125% 亮度、系统通知、托盘常驻与单实例运行。
- 桌面任务笺支持完成任务、打开主界面与收起；它不置顶、不抢占焦点，也不能编辑、删除或创建任务。

## 快速开始

需要 Node.js 18 或更高版本。

```powershell
npm install
npm start
```

## AI 助手

在“知行助手”中打开设置，选择 DeepSeek、OpenAI 或自定义兼容服务，再填写 API 地址、模型与 API Key。AI 是可选增强能力；未联网或未配置 Key 时，任务管理仍完整可用。

API Key 仅存储在本机运行数据中，不写入仓库或日志。

## 桌面任务笺

- 主界面右上角任务笺按钮可直接显示或收起小窗，并与系统托盘中的“桌面任务笺”开关同步状态。
- 小窗记住可见性与最后位置；显示器断开后会自动回到主显示器可见范围。
- 任务笺始终保持 `alwaysOnTop: false`，不会覆盖其他工作窗口，也不会在出现时抢夺键盘焦点。
- 主界面是 `smart_tasks` 的唯一写入者。小窗完成任务时必须由主界面持久化；保存失败会恢复原状态并提示在主界面重试。

## 项目结构

```text
SmartTodo/
├── main.js                         # 主窗口、任务笺、托盘、通知与生命周期
├── preload.js                      # 主界面最小化桥接
├── widget-controller.js            # 任务笺窗口、位置与可见性
├── widget-window-state.js          # 跨显示器位置修正
├── widget-ipc.js                   # 双窗口固定 IPC 与发送者校验
├── widget-preload.js               # 任务笺最小化桥接
├── task-attachment-store.js        # 受管附件事务
├── task-attachment-ipc.js          # 附件 IPC 安全边界
├── renderer/
│   ├── index.html / app.js         # 主界面与业务逻辑
│   ├── widget.html / widget.js     # 桌面任务笺
│   ├── widget-model.js             # 脱敏快照与五任务选择
│   ├── styles/                     # 令牌、布局、组件与动效
│   └── icons.svg                   # 统一线性图标符号
├── tests/                          # 单元与真实 Electron 窗口测试
├── assets/                         # 品牌源文件、字体与应用图标
└── release/V1.2.2/                 # V1.2.2 版本说明与本地构建产物
```

逐文件职责见 [`docs/文件说明.md`](docs/文件说明.md)。

## 测试

```powershell
# 纯逻辑、IPC、安全边界与静态契约
npm test

# 主界面行为、响应式矩阵、真实双窗口任务笺
npm run test:ui
```

V1.2.2 当前共有 122 项单元测试：120 项通过，2 项因当前 Windows 环境不支持创建符号链接而明确跳过，0 项失败。UI 流水线覆盖真实 Electron 主窗口、提醒时间双击保护、亮度浮层悬停桥、8 组尺寸／缩放组合，以及任务笺在 100%／125%／150% 缩放下的排序、焦点、双向开关、同步、回滚和溢出行为。

## 构建

```powershell
npm run dist
```

该命令生成 Windows x64 便携版到 `dist/`。发布副本位于 `release/V1.2.2/`；EXE 由 `.gitignore` 排除，应通过 GitHub Releases 分发。未签名构建首次运行时可能触发 Windows SmartScreen 提示。

## 数据与升级兼容

运行数据目录：

```text
%APPDATA%\智能任务管家\运行数据
```

任务附件目录：

```text
%APPDATA%\智能任务管家\运行数据\task-attachments\<任务ID>\
```

V1.2.2 兼容 V1.0.7、V1.2.0 与 V1.2.1 的任务、草稿、主题、AI 配置、会话和受管附件。升级前请从托盘完全退出旧版本，并建议备份整个“运行数据”目录。不要分发包含 API Key 的运行数据。

## 安全边界

- 主窗口与任务笺均启用 `contextIsolation: true`、关闭 `nodeIntegration`。
- preload 不暴露 `ipcRenderer`、文件系统、任意通道或任意绝对路径导入能力。
- 任务笺只接收允许展示的任务字段，只能请求完成、隐藏自身或打开主界面。
- 附件使用固定 IPC、随机磁盘名、规范路径校验和单调准备／持久化／提交事务。
- 备注先按纯文本转义，仅允许用户主动通过系统浏览器打开 HTTP/HTTPS 链接。

## License

[MIT](LICENSE) · by 萤火
