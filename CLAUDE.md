# CLAUDE.md（项目级）

KernelSU / APatch 模块：开机以 Tun 模式运行 mihomo，提供模块 WebUI 管理配置。Captive portal 处理暂缓（见 `docs/decisions.md` #5）。

## 文档索引

- `docs/decisions.md`：已确认的决策及依据。动手前先读；与代码冲突时以它为准，先确认再改。
- `docs/plans/`：实施计划，按 commit 拆分。
- `docs/override.md`：override 合并规则（WebUI 与 `merge.js` 的权威规范）。

## 技术栈

- 设备端：POSIX sh（Android `/system/bin/sh`，可使用 KSU/APatch 自带的 busybox）。不引入 bash 特性。
- WebUI：原生 HTML + ES module，不使用构建工具；第三方依赖只有 js-yaml 和 kernelsu，由 `build.sh` 下载。
- 测试：`node --test`，只测 `webui/merge.js` 这类纯逻辑；脚本类改动在真机上用 adb 验证。

## 目录分层

- `module/`：原样进入 zip 的文件，对应设备上的 `/data/adb/modules/mihomo-ksu/`，升级时整体替换。
- `webui/`：WebUI 源码，构建时拷入 `webroot/`。
- 运行时数据目录 `/data/adb/mihomo-ksu/`：跨升级保留；模块代码不得往模块目录写入运行时数据。例外只有两个：模板变更时改写 `module.prop` 的 `description` 作为提示；mihomo 内核自更新时替换 `bin/mihomo`（见 `docs/decisions.md` #10）。
- 配置合并只在 WebUI（`merge.js`）中进行，开机脚本只负责检测模板变更并提示，不做合并。

## 约束

- 第三方二进制和库不进 git。js-yaml、kernelsu 的版本号和 sha256 只写在 `versions.env` 里；mihomo、metacubexd、geo 数据在构建时取最新版，不固定版本（见 `docs/decisions.md` #10）。
- 不对 `$MODPATH` 执行 `chmod -R`（会破坏 KSU 为 `webroot` 设置的 SELinux context）。
- 订阅 URL、secret 等私人数据只存在于设备端，不进入仓库、日志或测试 fixture。
