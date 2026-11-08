# Math Pad

在 PowerPoint 编辑或同屏全屏放映时，用置顶窗口手写公式、画多条曲线、查看交点与曲线特性。

## 开始使用

1. 完整解压 `MathPad-win32-x64-0.1.0.zip`。
2. 从 [WindowsFloatingButton v1.12 发布页](https://github.com/david419kr/WindowsFloatingButton/releases/tag/v1.12) 获取 `configurable_floating_button.exe`，将它放在可写目录中并打开。
3. 在悬浮按钮的齿轮菜单里点 **Browse**，选择解压目录内的 `MathPad.exe`，点 **Apply**。把按钮拖到屏幕上方合适的位置。
4. 点悬浮按钮，打开 **新增公式**。可用鼠标或触控笔手写，也可切换到 **键盘**。确认公式后点 **插入并绘图**。

窗口右上角的关闭按钮会收起面板，再点悬浮按钮即可继续使用当前图形。按 `Ctrl+Q` 可退出 Math Pad。

## 示例

| 操作 | 输入与结果 |
| --- | --- |
| 求交点 | 输入 `y=x^2`、`y=x+2`，勾选两条曲线，点 **求交点**，得到 `(-1, 1)` 和 `(2, 4)` |
| 椭圆焦点 | 输入 `x^2/25+y^2/9=1`，勾选曲线并选择 **焦点**，得到 `(-4, 0)` 和 `(4, 0)` |
| 双曲线渐近线 | 输入 `x^2/4-y^2/9=1`，勾选曲线并选择 **渐近线**，得到 `y=±3x/2` |
| 一般函数 | 可用 `sqrt(x)`、`abs(x)`、`exp(x)`、`ln(x)`、`log(2,x)`、`sin(x)` 等。数值求交按当前横轴范围计算，结果区显示使用的区间 |

键盘输入可用 `y=…`、`f(x)=…` 或直接输入关于 `x` 的表达式。二次方程可同时含 `x` 和 `y`。选择一条曲线可查看它的特性，选择两条可求交点。

## 开发和打包

在 Windows x64 使用 Node.js 24 和 npm。

```powershell
npm ci
npx install-electron
npm test
npm start
npm run make
```

Forge 将 ZIP 写入 `out/make/zip/win32/x64/`。如果构建环境预先下载了 Electron 官方 ZIP，可以用 `MATHPAD_ELECTRON_ZIP_DIR` 指定包含该 ZIP 的目录。

## 在线组件

绘图组件和手写识别需要联网。手写笔画由 WIRIS 在线处理。本版本接入 MathType Hand 演示服务用于联调，正式部署需使用获得授权的服务。GeoGebra 官方组件用于非商业场景。

[MathType Hand 接入文档](https://docs.wiris.com/en_US/mathtype-html-generic-integration/embed-mathtype-hand-in-a-web-page) · [GeoGebra 许可](https://www.geogebra.org/license)

Made with GeoGebra® · [www.geogebra.org](https://www.geogebra.org/)
