# 随包第三方许可

这些文件保留上游原文，构建时会和固定版本依赖逐项比较。便携版同时在 `runtime/resources/licenses/` 提供这些文件，Electron / Chromium 自身的许可位于 `runtime/LICENSE` 和 `runtime/LICENSES.chromium.html`。

| 组件 | 版本 | 许可与说明 |
| --- | --- | --- |
| Nerdamer | 2.0.1 | Apache-2.0，见 `Nerdamer-LICENSE.txt` |
| decimal.js（Nerdamer 使用） | 10.6.0 | MIT，见 `decimal.js-LICENSE.txt` 和 `Nerdamer-bundle-NOTICE.txt` |
| KaTeX | 0.19.1 | MIT，见 `KaTeX-LICENSE.txt` |
| Commander.js（KaTeX 的命令行依赖） | 15.1.0 | MIT，见 `Commander-LICENSE.txt` |
| GeoGebra 官方编译资源 | 5.4.936.0 | 非商业许可，见 `GeoGebra-LICENSE.txt`、`GeoGebra-NOTICE.md` 和 [官方许可](https://www.geogebra.org/license) |
| Overlet 吸附思路 | 参考实现 | MIT，完整声明见项目根目录 `THIRD_PARTY_NOTICES.md`，便携版中位于 `runtime/resources/THIRD_PARTY_NOTICES.md` |

GeoGebra 附带的字体许可及上游 README 也保留在 `vendor/geogebra/`，运行版中随原资源保存在 `runtime/resources/app.asar`。本项目没有下载或重新分发 WIRIS 的手写服务脚本；使用手写时从官方演示地址在线加载。生产使用 MathType Hand 需要有效许可。

本仓库尚未为 Math Pad 原创代码选择开源许可证；公开仓库不等于向原创代码授予 MIT、Apache 等许可。第三方组件继续适用各自许可。本说明没有将 GeoGebra 或 WIRIS 改为可商用组件。
