# 运行环境与验证范围

## 提供的版本

当前交付为 Windows 10 / 11 x64 桌面程序，使用 Electron 45.2.3 与 Windows 自带的 .NET Framework 4.x 启动器。无需另装 Node.js、npm、Java、GeoGebra、微软数学识别组件或原来的 WindowsFloatingButton。

请下载完整仓库并解压到当前用户可写的本地目录，保留根目录的 `MathPad.exe`、`portable-manifest.json` 和完整的 `runtime/`。首次运行会从两个压缩块校验并还原 `runtime/MathPadHost.exe`，后续直接使用已还原的引擎。不要直接在压缩包内运行，也不要仅下载启动器。

目前没有提供 Windows 32 位、Windows ARM64 原生、macOS 或 Linux 的运行包；这些环境不属于本次交付的已验证范围。Windows 11 x64 是目标平台，实际验证范围以本文件的记录和仓库 Actions 结果为准，不把本机验证等同于所有设备已实测。

## 离线与在线

- 可离线：键盘和 Python 数学表达式输入、GeoGebra 绘图、曲线编辑、交点和圆锥曲线特性、数列、符号求导与导数教学、公式排版。Python 模式采用本地语法解析，无需系统安装 Python。
- 需要联网：WIRIS 手写演示。笔画会发给 WIRIS 识别；该服务并非本地识别，正式部署需要授权服务。服务不可用时可使用键盘，现有图像与本地计算不受影响。

GeoGebra 官方编译组件按非商业条款分发和使用。该原型适用于个人及课堂非商业教学；公开上传仓库没有取消第三方授权要求。见 [第三方许可](licenses/README.md)。

## 自检与排错

完整性检查无需安装 Node.js。在 PowerShell 中运行：

```powershell
$check = Start-Process -FilePath .\MathPad.exe -ArgumentList '--verify' -Wait -PassThru
$check.ExitCode
```

退出码为 `0` 表示清单内文件的大小和 SHA-256 校验通过，`1` 表示缺失、损坏或清单无效。`--verify` 只校验，不打开主面板或悬浮球。首次正常启动还会校验还原后的引擎。正常启动时也会检查必要文件是否完整，缺失时显示明确提示。

出现白屏或显卡兼容问题时，可先完全退出，再尝试 `./MathPad.exe --disable-gpu`。这一选项使用 Electron 软件绘制路径，不会安装或修改显卡驱动。

关闭主窗口默认收起到托盘，可在「设置」中改为完全退出。更新或替换 `runtime/` 前，先完全退出 Math Pad。构建同步程序会阻止覆盖正在运行的引擎。

当前启动器未作发行者代码签名。Windows 或企业应用控制策略可能要求额外审核；这类系统策略不等同于运行文件缺失，也不能由项目的完整性检查保证放行。

## 验证方法

`npm run test:portable` 仅复制清单中的文件到含中文、空格的新临时目录，不复制源码、`node_modules`、用户数据、已还原引擎或引擎缓存。随后检查：

1. 原生 `--verify` 与 Node 校验器都能识别缺失和损坏的文件。
2. 从不同工作目录运行根目录入口；应用的 PATH 只保留 Windows 系统目录，并故意注入冲突的 Electron / Node 环境变量。
3. 在禁用硬件 GPU 的情况下，还原引擎并启动本地绘图，检查左侧悬浮球、点击打开、重复启动、关闭收起和完全退出。
4. 新进程保留用户的位置和显隐偏好，旧版位置可正确迁移，正常退出后没有遗留主进程、渲染进程或 GPU 进程。

本机验证为 Windows 10 x64。仓库的 Windows CI 使用两种干净 Windows Server runner，并跳过服务桌面不可靠的前台焦点断言；焦点和四边收起行为使用本机独立测试窗口验证。CI 不等同于 Windows 11 实机或所有 PowerPoint 版本的验收。
