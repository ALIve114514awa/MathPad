# Math Pad

在 PowerPoint 编辑或同屏全屏放映时，用置顶窗口手写公式、画多条曲线、查看交点与曲线特性。

## 开始使用

1. 下载整个仓库（**Code → Download ZIP**）并完整解压，或从 [Releases](https://github.com/ALIve114514awa/MathPad/releases) 下载 `MathPad-win32-x64-0.3.0.zip`。两种方式均有根目录 `MathPad.exe` 入口。
2. 从 [WindowsFloatingButton v1.12 发布页](https://github.com/david419kr/WindowsFloatingButton/releases/tag/v1.12) 获取 `configurable_floating_button.exe`，将它放在可写目录中并打开。
3. 在悬浮按钮的齿轮菜单里点 **Browse**，选择解压目录内的 `MathPad.exe`，点 **Apply**。把按钮拖到屏幕上方合适的位置。
4. 点悬浮按钮，再点 **新增公式**，即可在应用内的大画布上用鼠标或触控笔书写。检查或修改下面的识别结果，然后点 **插入并绘图**。也可切换到 **键盘** 输入。

窗口右上角的关闭按钮会收起面板，再点悬浮按钮即可继续使用当前图形。按 `Ctrl+Q` 可退出 Math Pad。

公式弹窗最大宽度为 780 像素，手写区域随窗口高度增大，最高 430 像素。识别期间暂停提交，失败时可重试或改用键盘。当前版本使用应用内 WIRIS 手写，不会打开微软数学输入面板。

仓库根目录的 `MathPad.exe` 是一个小型 Windows x64 启动器，`runtime/` 随仓库完整提供 Electron、应用资源、运行库和压缩引擎。首次启动会在 `runtime/` 中还原并校验引擎，后续直接启动，不需要安装 Node.js、npm、Git LFS，也不需要在启动时下载运行文件。请保留完整文件夹并解压到可写目录。`portable-manifest.json` 记录随包文件的大小和 SHA-256；启动器源码位于 `native/Launcher.cs`。

Release ZIP 是常规 Electron 便携版，解压后直接双击根目录 `MathPad.exe`。悬浮按钮可指向任一种目录的入口。

![应用内的大手写画布](docs/screenshots/handwriting.png)

## 示例

| 操作 | 输入与结果 |
| --- | --- |
| 求交点 | 输入 `y=x^2`、`y=x+2`，勾选两条曲线，点 **求交点**，得到 `(-1, 1)` 和 `(2, 4)` |
| 椭圆焦点 | 输入 `x^2/25+y^2/9=1`，勾选曲线并选择 **焦点**，得到 `(-4, 0)` 和 `(4, 0)` |
| 双曲线渐近线 | 输入 `x^2/4-y^2/9=1`，勾选曲线并选择 **渐近线**，得到 `y=±3x/2` |
| 一般函数 | 可用 `sqrt(x)`、`abs(x)`、`exp(x)`、`ln(x)`、`log(2,x)`、`sin(x)` 等。数值求交按当前横轴范围计算，结果区显示使用的区间 |

键盘输入可用 `y=…`、`f(x)=…` 或直接输入关于 `x` 的表达式。二次方程可同时含 `x` 和 `y`。选择一条曲线可查看它的特性，选择两条可求交点。

## 数列和导数

顶部可切换 **函数绘图 / 数列 / 导函数与导数**，切换时保留各区输入和结果。

- 数列支持等差、等比、已知通项和 `aₙ₊₁ = p aₙ + q` 的一阶线性递推。给出通项、前 n 项和、第 N 项、前 N 项和以及前 12 项预览。内置平方数列、裂项求和、错位相减和递推示例，并显示对应方法的关键步骤。
- 导数支持 1 至 4 阶符号求导，可输入一个点计算精确导数和切线方程。支持多项式、分式、根式、绝对值、指数、对数、三角与反三角函数及其复合，也支持 `x^x`。`a、b、c、k、m、n、p、q、r` 按常数参数处理。
- 原函数、导函数和切线可一键加入同一坐标系。含未赋值参数的表达式暂不能直接绘图。三角函数使用弧度，`ln(x)` 为自然对数，`lg(x)` / `log(x)` 为常用对数，`log(2,x)` 为以 2 为底的对数。
- 分式、根式等优先保留精确结果，另列可计算的数值近似。求导展示所用的积、商、链式等规则；点值和切线会检查原式的分母、对数定义域和绝对值分界。分段函数及复杂分界点仍需人工判断，提示不会替代证明。

本地使用 [Nerdamer 2.0.1](https://nerdamer.com/docs/) 进行符号计算，使用 [KaTeX](https://katex.org/) 排版公式，二者都随运行包提供。**数列、求导和公式排版可离线使用**。计算在独立工作线程执行，可取消；超过 10 秒会停止并保留已有结果。

N 从 1 开始，最大 1000。一般通项优先尝试闭式求和；没有闭式时最多精确累加 100 项。部分通项会保留有限求和形式或提示不支持，不能保证任意递推和任意函数都有闭式结果。原式中的未定义项即使约分后消失，也会被拒绝。

## 开发和打包

在 Windows x64 使用 Node.js 24、npm。开发运行和常规 ZIP 打包不需要 C# 编译器；生成仓库根目录便携入口时，使用系统 .NET Framework 的 x64 C# 编译器。启动器使用 Windows 自带的 .NET Framework 4.x。

```powershell
npm ci
npm test
npm run test:app
npm start
npm run make
npm run portable
npm run verify:portable
```

`npm run make` 将常规 ZIP 写入 `out/make/zip/win32/x64/`；`npm run portable` 另外更新根目录启动器、`runtime/` 和文件清单。运行引擎拆成两个小于 100 MiB 的压缩块，随普通 Git 文件提交，避免源码 ZIP 缺少大文件。更新这些发布文件前请退出已运行的程序。如果构建环境预先下载了 Electron 官方 ZIP，可以用 `MATHPAD_ELECTRON_ZIP_DIR` 指定包含该 ZIP 的目录。

`npm test` 验证精确计算、导数规则、定义域与输入边界。`npm run test:app` 在独立测试配置中先断网验证本地数列、导数及公式排版，再恢复网络验证绘图和应用内大画布。日志与截图写入系统临时目录。

## 在线组件

应用的桌面运行文件已随包提供。绘图仍从网络加载 GeoGebra，当前固定到已验证的 5.4.920.0 组件版本；手写笔画由 WIRIS 在线处理，需要联网使用。本版本接入 MathType Hand 演示服务用于联调，正式部署需使用获得授权的服务。GeoGebra 官方组件用于非商业场景。

[MathType Hand 接入文档](https://docs.wiris.com/en_US/mathtype-html-generic-integration/embed-mathtype-hand-in-a-web-page) · [GeoGebra 许可](https://www.geogebra.org/license)

Made with GeoGebra® · [www.geogebra.org](https://www.geogebra.org/)
