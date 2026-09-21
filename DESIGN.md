---
name: SmartTodo V1.2
description: 以宣纸、墨色与克制玉色构成的现代新中式桌面任务工作台
colors:
  paper: "#f5f1e8"
  paper-muted: "#ede7dc"
  paper-raised: "#faf7f0"
  ink: "#17211e"
  ink-secondary: "#35423d"
  ink-muted: "#69736e"
  jade-deep: "#24483f"
  jade: "#478268"
  jade-muted: "#789487"
  cinnabar: "#9c473b"
  amber: "#a67d3d"
  on-accent: "#ffffff"
  lacquer: "#111815"
  lacquer-raised: "#18211d"
  moonlight: "#ebe6dc"
typography:
  headline:
    fontFamily: '"Noto Serif SC Local", "Songti SC", SimSun, serif'
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.55
    letterSpacing: "0.02em"
  title:
    fontFamily: '"Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", sans-serif'
    fontSize: "0.88rem"
    fontWeight: 800
    lineHeight: 1.55
    letterSpacing: "normal"
  body:
    fontFamily: '"Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: '"Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", sans-serif'
    fontSize: "0.78rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.01em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  pill: "999px"
spacing:
  micro: "4px"
  compact: "8px"
  control: "12px"
  panel: "clamp(16px, 1.5vw, 22px)"
components:
  button-primary:
    backgroundColor: "{colors.jade}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    padding: "9px 15px"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    padding: "9px 15px"
    height: "40px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "9px 12px"
    height: "40px"
  panel:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "{spacing.panel}"
  filter-active:
    backgroundColor: "{colors.jade}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.pill}"
    padding: "5px 14px"
    height: "32px"
---

# Design System: SmartTodo V1.2

## Overview

**Creative North Star: "案头清供"**

SmartTodo 把长期停驻的 Windows 工作台处理成一张安静、清楚的现代案纸：宣纸暖白承载内容，近墨文字建立秩序，玉色只在行动与状态上出现。细腻和低调的奢华来自比例、留白、字形与触感，而不是堆叠装饰。

界面采用现代新中式语汇，但所有文化表达都服务于日常任务流。竹叶与流萤标识、宋体标题、细分隔线和低饱和色共同构成品牌世界；紧凑正文、渐进式表单与清晰状态保证它仍是一件企业级生产力工具。

**Key Characteristics:**

- 暖宣纸与深漆色双主题
- 宋体标题配合清晰无衬线正文
- 细线、轻层级、稀疏玉色的克制表达
- 桌面主工作台与半透明任务笺共享同一品牌节奏
- 响应式重排优先于缩小和裁切

## Colors

色彩以暖纸、近墨和低饱和玉色为骨架，朱砂只标示错误或逾期，琥珀只用于焦点和谨慎提醒。

### Primary

- **沉玉绿**：主操作、活动筛选、完成状态与关键交互反馈。
- **深玉墨**：强调文字和主色悬停状态；避免大面积铺陈。

### Secondary

- **朱砂**：逾期、危险操作和失败反馈，必须同时配有文字或图标语义。
- **陈金**：键盘焦点、置顶和需要克制关注的状态。

### Neutral

- **宣纸**：浅色主题的页面底色。
- **抬纸**：面板、卡片和对话容器。
- **近墨／次墨／淡墨**：正文、辅助正文和元数据的三级文字。
- **乌漆／抬漆／月白**：深色主题的地面、面板和正文。

### Named Rules

**The 稀玉 Rule.** 玉色只为行动、选择和完成服务；单屏大面积填色会稀释它的价值。

**The 状态双证 Rule.** 朱砂、琥珀与玉色不能单独承担含义，必须与可读标签、图标或位置结构共同表达。

## Typography

**Display Font:** Noto Serif SC Local，回退至 Songti SC 与 SimSun<br>
**Body Font:** Microsoft YaHei UI，回退至 PingFang SC 与 Noto Sans CJK SC

**Character:** 宋体承担页面标题与安静的文化气质，无衬线体承担高密度任务和交互。品牌英文 SmartTodo 是独立字标处理，不扩展为通用页面标题规范。

### Hierarchy

- **Headline**（600，2rem，1.55）：主工作区与关键对话标题；窄屏按组件规则缩减。
- **Title**（800，0.88rem，1.55）：任务标题与需要快速扫描的内容焦点。
- **Body**（400，1rem，1.55）：输入、正文与对话内容。
- **Label**（600，0.78rem，1.2）：筛选、字段、状态和紧凑工具文字。
- **Widget Functional Floor**（11px）：桌面任务笺在 100%／125%／150% 缩放下的功能文字下限。

### Named Rules

**The 双声部 Rule.** 宋体只建立方向，无衬线体完成工作；不要用更多字体制造层级。

## Layout

主界面以 20px 水平外边距、10px 工作区间距和弹性面板内边距组成。1024px 及以上采用约 1.36:1 的任务／助手双栏；1023px 及以下改为单列，720px 以下收紧页边距和工具栏，639px 以下表单字段单列，460px 以下隐藏非关键说明并缩小品牌标识。

任务层级依靠 30px／56px／82px 的递进缩进；长标题、备注、链接和文件名允许断行，不得把操作推离可视区域。桌面任务笺固定为 320×440 的紧凑比例，在小尺寸或高缩放下进入压缩布局，但保留五项任务、顶部窗口工具和底部主操作。

**The 重排优先 Rule.** 宽度不足时先换列、换行或隐藏次要说明，禁止按比例挤压整个界面。

## Elevation & Depth

系统默认扁平，主要依靠纸色层次、1px 细线和局部明度区分容器。常规主面板无投影；浮层使用柔和环境阴影，桌面任务笺通过半透明、模糊和低对比内高光与桌面分离。

### Shadow Vocabulary

- **Ambient Low** (`0 12px 32px rgba(37, 43, 39, .08)`)：亮度浮层与轻提示。
- **Dialog** (`0 24px 64px rgba(34, 40, 36, .2)`)：模态对话框。
- **Widget Float** (`0 18px 46px rgba(13, 21, 18, .22)`)：桌面任务笺；不得移植到普通任务卡片。

**The Flat-by-Default Rule.** 静态内容面板使用边线和色差；阴影只属于真正浮起的层级。

## Shapes

小控件采用 6px 圆角，任务与消息容器采用 10px，主面板和对话框采用 14px；筛选与计数允许 999px 胶囊。桌面任务笺外轮廓为 17px，内部任务改用连续细线而非重复卡片。复选框保持近方形，避免所有元素都成为药丸。

## Components

### Buttons

- **Shape:** 轻微圆角（6px），主按钮最小高度 40px。
- **Primary:** 沉玉绿底、白字、9px 15px 内边距；悬停转深玉墨。
- **Secondary:** 纸色底与强分隔线；幽灵图标按钮仅在悬停时出现淡玉底。
- **Focus:** 全局使用 2px 陈金轮廓和 3px 外偏移。

### Chips

- **Style:** 筛选条使用 10px 外框，激活项使用玉色胶囊；状态标签使用浅色底、细边框与文字语义。
- **State:** 选中状态需要文字、数值和填色共同成立。

### Cards / Containers

- **Corner Style:** 主面板 14px，任务行 10px。
- **Background:** 亮色为抬纸，深色为抬漆。
- **Shadow Strategy:** 常规卡片无阴影，以 1px 分隔线建立秩序。
- **Internal Padding:** 主面板采用 16px–22px 弹性留白，任务行采用 12px 10px。

### Inputs / Fields

- **Style:** 纸色背景、1px 强分隔线、6px 圆角；普通字段高度 40px，任务编排器压缩至 34px。
- **Focus:** 边框转玉色，并出现 3px 淡玉焦点环。
- **Disabled:** 保持结构，透明度降为 0.52。

### Task Row

主任务使用复选框、正文和操作三列；子任务通过递进缩进表达，不使用装饰性侧边色条。优先级通过文字标签和语义色表达，长内容可断行，操作区可换行。

### Desktop Task Note

任务笺顶部包含品牌、版本和打开／收起工具；“今日要务”与数量形成独立标题行；中部最多五项任务，以细线分隔并显示子任务枝线；底部只保留一个打开 SmartTodo 的主操作。窗口半透明但不置顶、不抢焦点。

## Do's and Don'ts

### Do:

- **Do** 使用宋体标题、无衬线正文和细线层级保持案头秩序。
- **Do** 在新尺寸上验证 100%／125%／150% 缩放、长中文和键盘焦点。
- **Do** 让状态同时具备颜色之外的文字或结构证据。
- **Do** 让动画集中于 opacity、transform、颜色和阴影，并尊重 reduced motion。

### Don't:

- **Don't** 用重复侧边色条、硬偏移阴影、渐变文字或过量胶囊制造“高级感”。
- **Don't** 在普通面板上复用桌面任务笺的强浮动阴影与模糊。
- **Don't** 让 AI、网络或装饰性资产成为任务管理可用性的前提。
- **Don't** 通过缩小至不可读字号来解决响应式空间问题。
