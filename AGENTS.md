# Math Pad 开发指引

## 语言偏好

在 Codex CLI 会话中，默认使用简体中文与用户交流，包括进度说明、解释和最终答复。用户明确要求其他语言时遵循用户要求。代码、命令、文件名和必要的原始错误信息保留原文，并在有帮助时用中文解释。

## 项目与入口

Math Pad 是用于 Windows 10 / 11 x64 的 Electron 数学工作台，面向 PPT 旁的函数绘图、导数教学和数列计算。用户入口是仓库根目录的 `MathPad.exe`，运行时需要同级的 `runtime/` 与 `portable-manifest.json`。

- 主窗口生命周期、单实例、托盘和本地资源路由在 `src/main.cjs`。新增本地页面资源时，将对应路径加入这里的资源映射。
- 悬浮球窗口和拖动入口在 `src/floating-window.cjs`，吸附和收起在 `src/floating-dock.cjs`，外观和输入事件在 `src/ui/floating.*`。悬浮球置顶且不抢焦点。默认启动只显示屏幕左边缘的悬浮球，点击球或托盘图标才打开工作台。
- `src/settings.cjs` 负责校验和持久化设置。设置页和托盘的「启用悬浮窗」都使用 `showBall`。设置和悬浮球位置保存在 Electron 用户配置目录，分别使用 `settings.json` 和 `floating-window.json`。
- 工作台由 `src/ui/renderer.mjs` 协调，绘图和曲线分析在 `src/ui/graph.mjs`。公式处理复用 `src/ui/expression.mjs`、`src/ui/mathml.mjs` 和 `src/ui/python-expression.mjs`。Python 模式使用本地表达式解析器，支持直接输入 `sin(x)`、`sqrt(x)`。
- 数列与求导的界面入口在 `src/ui/calculator.mjs`，计算通过 `calculation-worker.js` 调用 `calculations.mjs`。导数教学的图像联动和公式分组分别在 `src/ui/derivative-lesson.mjs` 和 `src/ui/derivative-group.mjs`。

## 开发与验证

- 使用 Node.js 24。PowerShell 中可用 `npm.cmd ci` 安装锁定依赖，`npm.cmd start` 运行源码，`npm.cmd test` 运行单元测试。集成检查的入口列在 [开发与打包](docs/DEVELOPMENT.md)。
- 小改动做一次与修改直接相关的验证即可。按改动风险选择单元测试或定向界面检查，涉及多个模块或交付流程时扩大验证范围。
- 验证启动、设置、托盘或窗口行为时使用独立的临时用户配置。现有集成脚本会建立隔离配置，手动启动可传入 `--user-data-dir=<临时目录>`。
- 绘图、键盘输入、排版和计算都在本地运行。GeoGebra 离线资源与校验清单在 `vendor/geogebra/`。手写使用 WIRIS 在线演示，服务不可用时可切换到键盘输入。

## 便携版与提交

- 需要更新根目录便携版时，先从托盘完全退出占用运行文件的 Math Pad，再在 Windows x64 上运行 `npm.cmd run portable:local`。该命令同时更新根目录启动器、`runtime/` 和校验清单。可用 `npm.cmd run verify:portable` 校验，目标机器也可运行 `MathPad.exe --verify`。
- `portable:local` 用于本地便携版交付。需要发行 ZIP 时按 [开发与打包](docs/DEVELOPMENT.md) 使用对应的打包命令。
- 提交便携版时把配套应用源码、启动器、运行文件和校验清单一起提交。构建和测试临时文件放在忽略目录 `out/` 或系统临时目录。离线资源和随包许可都按 [第三方声明](THIRD_PARTY_NOTICES.md) 随包交付。
