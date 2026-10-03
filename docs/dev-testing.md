# 真机验证

脚本和 WebUI 的改动都要在真机上验证（CLAUDE.md "技术栈"）。本文记录做法和已踩过的坑；结论来自作者的设备：OnePlus CPH2723（Android 16，arm64），管理器 KernelSU Next（`com.rifsxd.ksunext`），WebView Chrome 153。

## 隐私（先读）

设备上的 `override.yaml`、`config.yaml`、`providers/` 缓存与 `secret` 含订阅链接（带 token）与 API 密钥，不能进入对话、日志或仓库：

- 不输出编辑页表单的值、`override.yaml` 原文、订阅缓存内容；需要时只输出统计（数量、类型分布）或测试数据。
- 不用 `ps` 查看 mihomo 的完整命令行；调用 API 时 secret 只在设备 shell 内展开（`printf 'Authorization: Bearer %s' "$(cat secret)" | curl -H @- ...`）。
- 测试只用 `test-` 开头的假订阅 / 假规则；需要验证真实订阅时，只检查节点数等结果。

## 构建与安装

- `./build.sh` 生成 `dist/mihomo-ksu-v0.0.0-dev.zip`。作者的 Mac 直连 `release-assets.githubusercontent.com` 不稳定，失败时临时走本机代理：`https_proxy=http://127.0.0.1:6152 ./build.sh`（不改 `build.sh`）。
- `adb push dist/*.zip /sdcard/Download/`，在管理器中安装后**重启**。WebUI（`webroot/`）和脚本在重启前不会更新。
- 同时只能有一个 Tun 代理模块在运行（decisions #2），旧的 `Clash` 模块已卸载。

## 开发时同步（不重装）

`tools/sync-webroot.sh` 把 `webui/` 复制到已安装模块的 `webroot/`，保持安装器设置的属主 `root:root`、权限 644 与 SELinux 上下文 `u:object_r:system_file:s0`；加 `--module` 同时同步 `service.sh`、`action.sh`、`scripts/*.sh`（755）。之后在 WebUI 里刷新即可。

- 这会让设备上的模块与已安装的 zip 不一致；发布前的验证要重新构建并安装 zip。
- **当前状态（2026-10-04）**：设备上的 webroot 与模块脚本已同步到 main 的 C5.6，已安装的 zip 较旧，下次开始工作前建议重新构建并安装。

## WebView 调试（在页面里执行 JS）

1. KernelSU Next：设置中同时打开"开发者选项"和"WebView 调试"（两者都要开，管理器源码中为 `developerOptionsEnabled && enableWebDebugging`）。
2. 打开模块 WebUI，**保持在前台且屏幕亮着**；WebView 在后台或熄屏时会接受连接但不响应。
3. `node tools/cdp.mjs [--reload] <file.js>`：自动找到 `webview_devtools_remote_*` 并 `adb forward`，在页面中执行文件里的表达式，输出结果和页面报错（忽略 `/favicon.ico` 的 404，WebView 总会请求它）。
   - 文件中用 `(async () => { ... })()` 包裹；每次执行共享同一个全局作用域，顶层 `const` 第二次执行会因重复声明报错。
   - 页面的 ES module 可以动态导入并直接调用，例如 `const m = await import('./draft.js')`。

## 真实触摸

导航、返回键、输入法相关的验证必须用真实触摸：

- `adb shell input tap X Y`：`X = cssX × devicePixelRatio`，`Y = cssY × devicePixelRatio + 状态栏高度`。WebView 从状态栏下方开始；该设备状态栏 135 设备像素（`adb shell dumpsys window | grep statusBars`），`devicePixelRatio` 约 2.975。不加偏移会点到上方的元素。
- **不要用 JS 的 `click()` 去打开视图再测返回键**：没有用户手势时 `history.pushState` 加的记录会被 Chromium 的历史记录干预机制跳过，返回键因 `canGoBack()` 为 false 直接关闭 WebUI。用真实触摸打开时正常。
- **不要用 `adb shell input text`**：中文输入法会把字符转成全角。先真实点击输入框（弹出键盘），再用 JS 设置 `value` 并派发 `input` 事件。
- 输入法：KernelSU Next 消费了窗口 insets，键盘弹出时 WebView 不缩小，页面拿不到键盘高度（`innerHeight`、`visualViewport`、VirtualKeyboard API、`interactive-widget` 均无效）。因此带输入的表单用全屏页（`plans/c5-webui.md` 已定事项）。
- 截图：`adb exec-out screencap -p > shot.png`；截图会包含屏幕上的真实数据，测试真实配置时注意隐私。

## 用真实配置测试保存

1. 备份：`for f in override.yaml config.yaml config.base.sha256; do cp -p $D/$f $D/$f.pretest; done`（`D=/data/adb/mihomo-ksu`，root）。
2. 测试（在 WebUI 中保存会写入真实配置并热重载）。
3. 恢复：`for f in ...; do mv $D/$f.pretest $D/$f; done`，然后 `scripts/ctl.sh restart`；确认没有 `*.pretest` / `*.tmp` 残留，并检查节点数（`GET /providers/proxies`）。

不要用 `*.tmp` 命名备份：保存流程使用 `override.yaml.tmp` / `config.yaml.tmp`。

## 脚本的沙盒测试

模块脚本先在 `/data/local/tmp` 的沙盒里测：复制脚本，把 `scripts/env.sh` 的 `MODDIR`、`DATA` 指向沙盒，用桩替换 `ctl.sh` 或 `iptables`。

- `adb push` 不会推送空目录，沙盒里需要的空目录在设备上 `mkdir -p`。
- 清理 `inotifyd` 时按 `/proc/<pid>/cmdline` 匹配沙盒路径，不要用 `pkill -f <路径>`：它会匹配到 adb 命令行本身。
- `mihomo -t` 可在 PC 上用 macOS 版 mihomo 校验配置（关掉 `tun`）；Android 上的行为以真机为准。

## PC 上的端到端合并检查

单元测试用手写的对象，覆盖不到 YAML 解析与 mihomo 的实际校验（C5.1 曾因此漏掉 js-yaml 5 默认不支持合并键）。改动合并规则或 `base.yaml` 后，在 PC 上用真实文件走一遍：

1. 从已校验的 tarball 取出 js-yaml：`tar xzf .cache/js-yaml-<ver>.tgz package/dist/browser/js-yaml.esm.min.mjs`（`.cache/` 由 `build.sh` 生成）。
2. 写一个临时的 Node 脚本：`import { merge } from '<repo>/webui/merge.js'`，用 `loadAll(text, undefined, { schema: CORE_SCHEMA.withTags(mergeTag) })` 解析 `module/base.yaml` 和测试用 override，`dump(merge(...), { noRefs: true, lineWidth: -1 })` 写出 `config.yaml`。
3. 把 `config.yaml` 里的 `tun.enable` 改为 `false`，用 macOS 版 mihomo 校验：`mihomo -t -d <dir> -f config.yaml`（`<dir>` 中放 `GeoIP.dat`、`GeoSite.dat`，可从 `.cache/latest/` 复制；macOS 版从 MetaCubeX/mihomo 的 release 下载 `mihomo-darwin-arm64-<ver>.gz`）。

临时脚本和下载的二进制放在仓库之外，不提交。

## 设备上的有用命令

- 内核状态：`su -c /data/adb/modules/mihomo-ksu/scripts/ctl.sh status`。
- fake-ip 是否生效：`ping -c1 www.google.com` 解析到 `198.18.x.x`。
- 私人 DNS：`settings get global private_dns_mode`（`null` 表示未设置，按自动模式）；实际模式看 `su -c "dumpsys dnsresolver"`。
- 规则顺序：`GET /rules`；订阅节点数：`GET /providers/proxies`。
