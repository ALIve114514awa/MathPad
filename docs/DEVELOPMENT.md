# 开发与打包

在 Windows x64 上使用 Node.js 24 和 npm。依赖固定在 `package-lock.json`，使用 `npm ci` 安装。仅根目录便携启动器的构建需要系统 .NET Framework x64 C# 编译器；普通用户不需要编译器。

```powershell
npm ci
npm test
npm run verify:geogebra
npm run verify:licenses
npm start
```

图形界面集成检查会创建独立临时配置，不使用真实用户的公式或窗口：

```powershell
npm run test:app
npm run test:edit
npm run test:python
npm run test:polish
npm run test:tray
npm run test:floating
```

`scripts/lib/smoke.cjs` 集中提供集成测试的等待、日志、离线窗口配置和应用入口加载。各测试保留自己的场景和断言；动画检查在测试窗口中关闭后台节流，避免窗口被编辑器或 CI 桌面遮挡时误报超时。

`test:portable` 的全新运行副本位于忽略目录 `out/portable-test-*/`，成功后会在确认应用退出和目录边界后删除；失败时保留副本供排查。

`test:app` 阻断 HTTP / HTTPS，验证本地绘图、交点、圆锥曲线、数列、导数、排版以及手写不可用时的键盘回退。设置 `MATHPAD_TEST_MISSING_GEOGEBRA=1` 可额外验证缺失本地绘图脚本的提示和重试。`MATHPAD_TEST_APP_ROOT` 可指向实际运行版的 `runtime/resources/app.asar`，检查打包后的应用。

更新本地入口前，完全退出已运行的 Math Pad：

```powershell
npm run portable:local
npm run verify:portable
npm run test:launcher
npm run test:portable
```

`portable:local` 在 `out/` 内生成并校验新运行文件，再将根目录入口和唯一的 `runtime/` 一起更新；替换前的运行文件保留在忽略目录 `out/portable-build-*/previous/`，失败时回退。引擎拆为两个小于 100 MiB 的普通 Git 文件，完整仓库下载不依赖 Git LFS。已还原的 `MathPadHost.exe`、引擎缓存、旧版本、测试产物和 `node_modules/` 不提交。

应用归档只包含 `src/`、`assets/`、`vendor/`、包元数据以及实际使用的 KaTeX / Nerdamer 浏览器文件。依赖中的 Node 入口、命令行工具、类型声明、源码、仓库配置和开发文档不装入运行归档；第三方许可仍随 `runtime/resources/` 一起提供。

`npm run make` 才会生成常规 ZIP，`npm run portable` 会同时生成 ZIP 和根目录便携版。只更新源码、运行文件或上传仓库时不要运行这两个命令。若提前下载了官方 Electron ZIP，可用 `MATHPAD_ELECTRON_ZIP_DIR` 指定其所在目录；默认安装和构建不需要这项设置。

`vendor/geogebra/` 包含固定版本官方资源、来源、SHA-256 清单和许可。构建前逐个校验资源，缺失时中止。如需重新导入，先下载 `vendor/geogebra/manifest.json` 记录的官方 ZIP，再运行 `./scripts/import-geogebra.ps1 -Archive <ZIP路径>`。脚本只接受清单中固定 SHA-256 的版本。

GitHub Actions 在 Windows Server 2022 / 2025 的干净环境安装依赖，执行单元测试、离线集成、许可、运行文件及迁移测试。原生焦点检查仅在本机交互桌面执行；完整性检查和实际入口启动检查继续在 CI 执行。工作流不发布或更新 ZIP。
