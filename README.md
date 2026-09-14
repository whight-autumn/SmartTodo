<p align="center">
  <img src="assets/icon.png" width="110" height="110" alt="智能任务管家图标">
</p>

<h1 align="center">✨ 智能任务管家</h1>

<p align="center"><b>Smart Task Steward · 桌面任务管理 + AI 助手</b></p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-31-blue?logo=electron&logoColor=white" alt="Electron 31">
  <img src="https://img.shields.io/badge/electron--builder-24-green?logo=electronbuilder&logoColor=white" alt="electron-builder">
  <img src="https://img.shields.io/badge/JavaScript-Vanilla%20JS-F7DF1E?logo=javascript&logoColor=black" alt="Vanilla JS">
  <img src="https://img.shields.io/badge/Node--test-52%20tests-brightgreen" alt="node:test 52 tests">
  <img src="https://img.shields.io/badge/Platform-Windows%20x64-0A7EA4" alt="Windows x64">
  <img src="https://img.shields.io/badge/License-MIT-blueviolet" alt="MIT">
</p>

<p align="center">
  <b>📋 任务待办</b> · <b>🤖 AI 对话</b> · <b>🌙 深浅主题</b> · <b>🔔 系统提醒</b> · <b>🌿 竹青流萤</b>
</p>

一款本地优先的桌面任务管理器，集成 AI 智能助手。所有任务、会话与配置均保存在**本机**，开箱即用，无需注册、无需联网即可管理任务。

---

## ✨ 功能特性

- **任务管理**：主任务 / 子任务、提醒时间、高中低优先级、置顶、折叠展开、一键完成与撤销
- **备注与附件**：已创建任务可反复编辑备注，并可添加图片或普通文件；编辑器为已保存图片和待保存图片显示惰性缩略图，普通文件显示 MIME/类型，每个任务最多 **10 个附件**，单个不超过 **20MB**
- **安全链接**：备注中的 HTTP/HTTPS 地址可点击并交由系统默认浏览器打开；其他协议保持普通文本，程序不会自动访问网址
- **重点筛选**：“需关注”自动汇集置顶、高优先级、已逾期及未来 24 小时内提醒的任务，并保留必要的父任务上下文
- **智能归档**：完成任务自动归档，超过 **15 天**自动清理；创建、完成与最近备注编辑时间独立留痕，编辑备注不会改变 `createdAt` / `completedAt`
- **智能排序**：主任务与其子任务分别在层级内按「置顶 → 未完成 → 优先级 → 时间」自动排序
- **AI 智能助手**：接入 DeepSeek / OpenAI / 任意 OpenAI 兼容服务，支持会话管理、流式输出、任务清单分析、附件上传（≤10 个，单个 ≤20MB）
- **界面体验**：深色 / 浅色双主题、75%–125% 亮度调节、可折叠助手面板（任务区自动占满）
- **托盘常驻**：关闭窗口驻留系统托盘，提醒不遗漏；单实例运行

## 🧰 技术栈

```
Electron 31 · Vanilla JavaScript · HTML5 / CSS3 · Node.js 内置 node:test · electron-builder
```

无前端框架、无后端服务，轻量可移植。

## 🚀 快速开始

> 需要 [Node.js](https://nodejs.org) ≥ 18。

```powershell
# 1. 安装依赖
npm install

# 2. 启动应用
npm start
```

## 🤖 配置 AI 助手

1. 点击主界面右上角 **⚙️ 设置**
2. 选择服务商（DeepSeek / OpenAI / 自定义）
3. 填入 API 地址、模型名称与 **API Key**
4. 保存后即可开始对话；也可以点击 **🧠** 让 AI 分析当前任务清单

> 🔒 API Key 仅保存在本机运行数据中，不会上传或写入日志。

## 📁 项目结构

```
智能任务管理器/
├── main.js               # 主进程：窗口 / 托盘 / 通知 / 生命周期
├── main-paths.js         # 运行数据与任务附件目录统一拼接
├── task-attachment-store.js # 任务附件事务、根目录校验、定位与清理
├── task-attachment-ipc.js   # 固定事务 IPC 与外链协议安全校验
├── preload.js            # 用户所选 File 的最小化 contextBridge 桥接
├── package.json          # 项目元数据、脚本与打包配置
├── renderer/
│   ├── index.html        # 界面骨架
│   ├── style.css         # 深浅主题与全部样式
│   ├── app.js            # 渲染主逻辑（任务 / 提醒 / AI 会话）
│   ├── task-model.js     # 任务纯逻辑模块（排序 / 归档 / 关注筛选）
│   ├── draft-store.js    # 表单草稿恢复
│   ├── ai-provider.js    # OpenAI 兼容协议适配（SSE 流式）
│   ├── ui-appearance.js  # 亮度调节与时间戳格式化
│   └── note-utils.js     # 备注转义与安全 HTTP/HTTPS 链接渲染
├── tests/                # 52 项 node:test 用例 + Electron 界面冒烟测试
├── assets/               # 应用图标（png / ico）
├── docs/文件说明.md       # 逐份文件功能说明 📖
└── release/V1.0.6/       # 当前发布版 exe 与版本说明
```

> 📖 完整的逐文件功能说明见 [`docs/文件说明.md`](docs/文件说明.md)

## 🧪 测试

```powershell
# 纯逻辑单元测试（无需 Electron）
npm test

# 真实窗口界面冒烟测试（筛选/主题/时间戳/亮度/对比度）
npm run test:ui
```

当前 `npm test` 覆盖备注编辑、时间戳兼容、preload 显式选择边界、附件事务、受管根目录与固定 IPC 等行为；若运行环境不支持创建符号链接，对应用例会清晰跳过，缺失文件、非普通文件和根目录替换仍有确定性覆盖，其余用例须零失败。

## 📦 构建与发布

```powershell
npm run dist
```

构建 Windows x64 便携版，产物输出到 `dist/`。正式发布的 exe 建议通过 **GitHub Releases** 分发（仓库内不提交二进制文件）。

当前交付：`release/V1.0.6/智能任务管家-1.0.6.exe`（免安装，双击即用）。历史版本建议通过 GitHub Releases 留存，避免二进制文件占用源码仓库空间。

## 💾 运行数据

任务、草稿、主题、亮度、AI 配置与会话统一保存在：

```
%APPDATA%\智能任务管家\运行数据
```

任务附件由程序复制到以下受管目录，不依赖原文件继续存在，也不会把文件内容或原始绝对路径写入任务数据：

```text
%APPDATA%\智能任务管家\运行数据\task-attachments\<任务ID>\
```

升级前请从托盘完全退出程序再备份该目录；**切勿**将包含 API Key 的运行数据随项目分发。

## 🛡️ 隐私与安全

- 全程本地运行，无任何遥测与联网上报
- 渲染进程关闭 `nodeIntegration`，仅通过 `preload` 暴露最小化能力
- API Key 仅存于本机 `localStorage`，错误提示不回显 Key
- 渲染进程只能把文件选择框返回的 `File` 交给 preload；preload 使用 Electron `webUtils.getPathForFile` 在隔离上下文中取得路径并拒绝伪造、非 `File` 或空路径输入，不暴露任意绝对路径导入 API
- 任务附件使用随机磁盘文件名；主进程按受管目录实际状态独立执行 10 个数量限制，不信任界面传入计数，并固定根目录的规范路径与文件身份，通过 `lstat` / `realpath` 拒绝根目录替换、符号链接、非普通文件与目录逃逸
- 卡片和编辑器都会检查附件是否仍为可用普通文件；缺失或不安全时明确显示“文件已不存在”
- 附件保存采用准备/提交/回滚事务：新增文件复制和旧文件暂存后才写任务元数据，`localStorage` 写入失败会删除本次导入并恢复暂存文件；成功持久化后才永久提交删除。导入或部分删除失败时弹窗保持打开、控件恢复可用，磁盘与元数据保持一致
- 备注内容按纯文本转义，仅允许用户主动通过系统浏览器打开经过校验的 HTTP/HTTPS 链接

## 📄 License

[MIT](LICENSE) · Made with 🖤 by 萤火
