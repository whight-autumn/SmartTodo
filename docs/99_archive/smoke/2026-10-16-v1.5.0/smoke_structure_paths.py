"""SmartTodo 项目结构冒烟测试。

目的：验证 DS-001 规定的新源码路径和 T5 清理结果。
前置条件：位于 SmartTodo 仓库内；T1-T6 已完成；无需第三方 Python 包。
运行命令：python docs/99_archive/smoke/2026-10-16-v1.5.0/smoke_structure_paths.py
预期结果：输出 PASS 并以状态码 0 退出；任一契约不满足时输出 FAIL。
依赖：Python 标准库 pathlib、sys。
"""

from pathlib import Path
import sys


def find_project_root() -> Path:
    """从脚本归档位置向上寻找 SmartTodo 项目根。"""

    for candidate in Path(__file__).resolve().parents:
        if (candidate / "package.json").is_file() and (
            candidate / "ENGINEERING_CHARTER.md"
        ).is_file():
            return candidate
    raise RuntimeError("无法从脚本位置定位 SmartTodo 项目根")


PROJECT_ROOT = find_project_root()

EXPECTED_FILES = (
    "main.js",
    "src/main/paths/main-paths.js",
    "src/main/runtime/runtime-data-manager.js",
    "src/main/startup/app-launch-spec.js",
    "src/main/startup/login-startup.js",
    "src/main/settings/app-settings-ipc.js",
    "src/main/attachments/task-attachment-store.js",
    "src/main/attachments/task-attachment-ipc.js",
    "src/main/widget/widget-controller.js",
    "src/main/widget/widget-window-state.js",
    "src/main/widget/widget-ipc.js",
    "src/preload/main-preload.js",
    "src/preload/widget-preload.js",
    "PROJECT_TREE.md",
    "docs/reference/文件说明.md",
)

REMOVED_ROOT_FILES = (
    "main-paths.js",
    "runtime-data-manager.js",
    "app-launch-spec.js",
    "login-startup.js",
    "app-settings-ipc.js",
    "task-attachment-store.js",
    "task-attachment-ipc.js",
    "preload.js",
    "widget-controller.js",
    "widget-window-state.js",
    "widget-ipc.js",
    "widget-preload.js",
)


def main() -> int:
    failures: list[str] = []

    if PROJECT_ROOT.name != "SmartTodo":
        failures.append(f"项目目录名不是 SmartTodo: {PROJECT_ROOT.name}")

    for relative_path in EXPECTED_FILES:
        if not (PROJECT_ROOT / relative_path).is_file():
            failures.append(f"缺少正式文件: {relative_path}")

    for relative_path in REMOVED_ROOT_FILES:
        if (PROJECT_ROOT / relative_path).exists():
            failures.append(f"旧根文件仍存在: {relative_path}")

    if (PROJECT_ROOT / "dist").exists():
        failures.append("dist/ 尚未清理")

    release_executables = sorted((PROJECT_ROOT / "release").rglob("*.exe"))
    if release_executables:
        failures.append(f"release/ 仍有 {len(release_executables)} 个 EXE")

    if not (PROJECT_ROOT / "node_modules").is_dir():
        failures.append("node_modules/ 未按裁定保留")

    if failures:
        print("FAIL")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("PASS")
    print(f"project_root={PROJECT_ROOT}")
    print(f"expected_files={len(EXPECTED_FILES)}")
    print(f"removed_root_files={len(REMOVED_ROOT_FILES)}")
    print("release_executables=0")
    return 0


if __name__ == "__main__":
    sys.exit(main())
