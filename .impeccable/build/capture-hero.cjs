const { app, BrowserWindow } = require("electron");
const { once } = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const userData = path.join(os.tmpdir(), `smarttodo-hero-${process.pid}`);
const output = path.join(root, ".impeccable", "review", "hero-repro.png");

app.setPath("userData", userData);
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("force-device-scale-factor", "1");

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    frame: false,
    width: 1440,
    height: 900,
    useContentSize: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  try {
    await window.loadFile(path.join(root, "renderer", "index.html"));
    const reloaded = once(window.webContents, "did-finish-load");
    await window.webContents.executeJavaScript(`
      localStorage.clear();
      localStorage.setItem("smart_theme", "light");
      localStorage.setItem("smart_tasks", JSON.stringify([
        { id: "release", title: "产品发布前准备", remarks: "整理功能清单，确认发布说明与演示素材。", remindTime: "2026-09-21T10:00", priority: "high", parentId: null, done: false, pinned: true, createdAt: 1789952700000 },
        { id: "release-doc", title: "撰写发布说明文档", remarks: "", remindTime: "2026-09-21T06:00", priority: "high", parentId: "release", done: false, pinned: true, createdAt: 1789953000000 },
        { id: "release-demo", title: "准备演示录屏并压缩附件", remarks: "", remindTime: "2026-09-21T08:00", priority: "medium", parentId: "release", done: false, pinned: true, createdAt: 1789953300000 },
        { id: "research", title: "调研竞品 AI 功能体验", remarks: "收集 3-5 款同类产品的 AI 能力，整理差异点与可借鉴设计，输出分析结论。", remindTime: "2025-09-16T10:00", priority: "medium", parentId: null, done: false, pinned: false, createdAt: 1757817000000 },
        { id: "learning", title: "个人学习提升", remarks: "学习大模型相关资料，完成阅读笔记。", remindTime: "2026-09-25T12:00", priority: "low", parentId: null, done: false, pinned: false, createdAt: 1789949400000 }
      ]));
      localStorage.setItem("deepseek_chat_state", JSON.stringify({
        sessions: [{
          id: "hero-session",
          title: "任务优先级分析",
          createdAt: 1789980000000,
          updatedAt: 1789980000000,
          messages: [
            { role: "assistant", content: "你好！我是知行助手，\\n你的智能任务助手。\\n我可以：\\n- 管理主任务 / 子任务和提醒\\n- 分析你的任务给出建议\\n- 回答你的任何问题\\n先在右上角配置 DeepSeek API Key，然后就可以开始对话啦！" },
            { role: "user", content: "帮我分析一下今天的任务，有什么需要优先处理的吗？" },
            { role: "assistant", content: "根据你当前的任务列表，今天需要重点关注：\\n1. **产品发布前准备**（今天 18:00，优先级：高）\\n   建议优先完成发布说明文档和演示录屏，避免影响整体进度。\\n2. **撰写发布说明文档**（今天 14:00，优先级：高）\\n   这是发布前的关键任务，建议尽快完成初稿。\\n3. **准备演示录屏并压缩附件**（今天 16:00，优先级：中）\\n   建议在完成文档后立即进行，确保有足够时间调整。\\n目前没有其他任务设置在今天，合理安排时间应该可以顺利完成！" }
          ]
        }],
        activeSessionId: "hero-session"
      }));
      location.reload();
    `);
    await reloaded;
    await new Promise(resolve => setTimeout(resolve, 700));
    await window.webContents.executeJavaScript(`
      document.getElementById("app-version").textContent = "V1.2";
      document.getElementById("send-btn").disabled = false;
    `);
    await new Promise(resolve => setTimeout(resolve, 120));
    await fs.mkdir(path.dirname(output), { recursive: true });
    const image = await window.webContents.capturePage({ x: 0, y: 0, width: 1440, height: 900 });
    await fs.writeFile(output, image.toPNG());
    process.stdout.write(`${output}\n`);
  } finally {
    window.destroy();
    await fs.rm(userData, { recursive: true, force: true });
    app.quit();
  }
});
