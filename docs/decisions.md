# 决策记录

记录已确认的项目级决策及依据。新增决策追加在末尾，推翻旧决策时在原条目标注"已废弃 → 见 #N"，不直接删除。

外部事实标注：`[已验证 via 来源]` / `[未验证]`。核实日期为 2026-10-02 至 2026-10-03。

---

## 1. 定位

KernelSU / APatch 模块：开机后台运行 mihomo，以 Tun 模式做全局透明代理；在模块 WebUI 中管理配置。

要解决的两个问题：

1. **配置编辑**：手机上手改几千行 YAML 不可行。
2. **Captive portal**：Tun 开启时，连接需要网页认证的 Wi-Fi（咖啡店、酒店等）无法弹出登录页。优先级最低，不在 v0.1 范围（见 #5）。

## 2. 从零实现，不 fork

- 前身是一个第三方 Magisk 模块（module id `Clash`）。其脚本只有约百行，但目录结构、配置组织、权限处理都需要重做，在旧骨架上打补丁的成本高于重写。
- 否决的备选：基于 [box_for_magisk](https://github.com/taamarin/box_for_magisk)（GPL-3.0）。它同时支持 5 个内核，围绕 TPROXY iptables 构建；它的 `net.inotify` 只维护防回环规则，`webroot` 也没有调用 `ksu.exec`。两个目标问题它都没有解决。[已验证 via gh]
- 从旧方案中保留的经验教训：
  - `tun.route-exclude-address-set` 的参数是 **rule-set 名称**，而且需要同时开启 `auto-redirect`；直接填 CIDR 是错误用法，CIDR 应该写在 `route-exclude-address` 里。[已验证 via meta-docs `config/inbound/tun.md`]
    - 旧配置因此实际没有排除任何网段：设备上 mihomo 的路由表 2022 只有 `default dev Meta`，fake-ip 正常工作。[已验证 via adb `ip route show table 2022`、`ping` 解析到 198.18.x.x]
    - base 也不排除局域网网段。sing-tun 在普通 Linux 上会加一条规则把 53 端口拉回 Tun，但在 Android 上跳过了 [已验证 via metacubex/sing-tun v0.4.27 `tun_linux.go`]；排除后发往局域网 DNS（Wi-Fi 路由器）的查询会绕过 `dns-hijack`，fake-ip 失效（推断，C3 真机验证）。局域网流量经 `GEOIP,private,DIRECT` 直连。
  - `external-controller: 0.0.0.0:9090` 不设 secret，在公共 Wi-Fi 上等于把 API 暴露给同网段的所有设备。
  - 内联几千条规则是配置无法手工编辑的根本原因。
  - 不能 `chmod 777 -R $MODPATH`：KSU 会自动为 `webroot` 设置权限和 SELinux context，模块自行修改会破坏它。[已验证 via KernelSU `docs/guide/module-webui.md`]
- **迁移约束**：如果设备上还装着旧模块（`/data/adb/modules/Clash`），两个 Tun 会冲突。安装脚本检测到旧模块目录存在、且其中没有 `remove` 文件时，中止安装并提示用户先卸载旧模块；已在 Manager 中标记卸载（存在 `remove`）的情况放行，避免用户多重启一次。

## 3. 内核：官方 MetaCubeX/mihomo

- 只支持 arm64：只打包官方 release 的 `mihomo-android-arm64-v8-<ver>.gz`，构建时取最新版（见 #10）。这也是内核自更新在 android/arm64 上下载的同一个 asset。[已验证 via mihomo `component/updater/update_core.go` `CoreBaseName()`]
- 不使用 vernesong 的 Smart fork：配置中从来没有用到 `type: smart` 的代理组，也就不需要 `Model.bin`。
- 不换成 sing-box：sing-box 内核的配置里没有订阅或 provider 的概念（`docs/configuration` 下只有 inbound、outbound、route、rule-set 等）。[已验证 via gh]
- **订阅格式**：mihomo 的 proxy-provider 能解析 Clash YAML，以及 v2rayN 风格的 URI 列表（明文或 base64），涵盖 ss、ssr、vmess、vless、trojan、hysteria、hy2、tuic、anytls、mieru、socks、http。[已验证 via mihomo `adapter/provider/provider.go`、`common/convert/converter.go`] Surge、Surfboard、Loon 是各家客户端自己的配置格式，没有内核能直接解析；机场提供的多种格式背后是同一批节点，使用 Clash 格式或 URI 订阅即可。本项目不内置格式转换。

## 4. 配置管理：base 模板 + override 合并，在 WebUI 中完成

- 模型参考 Clash Verge 的 Merge：模块自带 `base.yaml`，用户只维护一份很小的 `override.yaml`，两者合并生成最终运行的 `config.yaml`。
- **订阅默认字段**：每条订阅共用的字段（`type`、`interval`、`health-check` 等）写在 `base.yaml` 的 `x-provider-defaults` 中。合并时用它补齐 override 中每个 `proxy-providers` 条目缺失的字段，条目里已写的字段优先；`path` 按订阅名自动生成。这样用户每条订阅通常只需要填 `url`。
  - 原因：base 和 override 是两个文件，YAML 锚点（`&pp` / `<<: *pp`）无法跨文件引用，所以改由合并步骤实现同样的复用。
  - 否决的备选：在 override 中写完整的 provider 字段。每条订阅要写 5、6 个字段，WebUI 表单要么暴露所有字段，要么在界面层再实现一遍补齐。
  - `x-provider-defaults` 会原样保留在最终的 `config.yaml` 中；mihomo 会忽略不认识的顶层键。
- **模板变更的处理**：合并只在 WebUI 中进行，开机脚本不做合并。否决了"打包 yq、让 shell 在开机时合并"的方案，因为要多打包一个约 12MB 的二进制，复杂度不值得。具体做法：
  - 每次生成 `config.yaml` 时，同时记录所用 `base.yaml` 的 sha256。
  - 开机时比较模块内 `base.yaml` 的 hash 与记录值。如果不一致，仍用旧的 `config.yaml` 启动，并在 `module.prop` 的 `description` 中提示"模板已更新，请打开 WebUI 应用"；WebUI 打开时同样显示提示，并提供"应用"按钮。
  - 例外：如果 `override.yaml` 不存在，合并结果就等于 `base.yaml`，开机脚本直接拷贝即可，不需要提示。
  - 已知代价：在用户打开 WebUI 应用之前，模板里的修复（包括安全修复）不会生效。
- 合并在 WebUI 中用 JS 完成，依赖 **js-yaml**（MIT，截至 2026-10-02 最新为 5.4.2）。[已验证 via npm registry]
- WebUI 使用模块 `webroot/` 机制，通过 **kernelsu** npm 包（Apache-2.0，3.0.2）[已验证 via npm registry] 提供的 `exec()` 执行 root shell。
  - KernelSU：原生支持。[已验证 via KernelSU `docs/guide/module-webui.md`]
  - APatch：读取同一个 `webroot` 目录，并以同名 `ksu` 注入 JS 接口，因此同一套页面可以直接通用。[已验证 via APatch `WebUIActivity.kt`]
  - Magisk：不在支持范围内（需要借助第三方 WebUI X 之类的 App）。
- 规则不再内联：改用 `GEOSITE`、`GEOIP`，数据来自 MetaCubeX/meta-rules-dat 的 `geosite.dat` 和 `geoip.dat`。构建时打包一份，运行时靠 `geo-auto-update` 自动更新（存放位置见 #6）。

## 5. Captive portal：暂缓，优先级最低

不在 v0.1 范围，先完成配置管理。以下分析保留，作为将来重新评估的起点。

根因推断如下（**尚未在真机上验证**）：

1. NetworkMonitor 发出的探测请求被 Tun 截获（mihomo 的 ip rule 优先级更高）。
2. 探测域名经 fake-ip 解析后命中规则，被送去走代理。
3. 认证之前，代理节点和加密 DNS 都不可达，探测超时。
4. 结果系统判定为"无互联网"，而不是"需要登录"，登录页因此不弹出。


- **A（配置层，候选）**：
  - 把 `com.android.captiveportallogin` / `com.google.android.captiveportallogin` 加入 `exclude-package`（meta-docs 示例即为此包名）。
  - 探测域名改为直连，并使用系统 DNS 解析。
- **B（watcher，候选）**：
  - 设想：网络未通过系统验证时，通过 `PATCH /configs` 关闭 tun，验证通过后再开启。[已验证 via mihomo `hub/route/configs.go`：PATCH 的 schema 中包含 `tun` 字段]
  - 风险：手机上 Wi-Fi 和移动数据经常同时在线，"某个网络未验证"并不能推出"应该暂停代理"，误判会让流量绕过代理。应先在真机上验证 A 的效果，以及多网络并存时的系统行为，再决定是否引入。
- **在家测试**：用 `settings put global captive_portal_http_url` / `captive_portal_https_url` 把探测地址指向 PC 上一个返回 302 的服务。这种方式模拟不了"认证前只能用 DHCP DNS"的条件，最终仍需在真实 portal 上验证一次。

## 6. 运行时数据目录：`/data/adb/mihomo-ksu/`

- 存放 override、生成的 config、provider 缓存、日志。
- 该目录同时是 mihomo 的 home dir（`-d`）。沿用旧模块的做法：mihomo 读写的文件都放在 home dir 内，用相对路径引用。
  - geo 数据：`GeoIP.dat`、`GeoSite.dat` 放在 home dir 根目录。mihomo 只在 home dir 根目录查找这两个文件，不认子目录。[已验证 via mihomo `constant/path.go` `GeoIP()`/`GeoSite()`] 安装时仅在文件不存在时拷入，之后由 `geo-auto-update` 或面板更新（见 #10）。
  - 面板（metacubexd，见 #9）：放在 `ui/`，配置中写 `external-ui: ui`，不设置 `external-ui-name` 和 `external-ui-url`（后者默认就是 metacubexd 的 gh-pages）。`external-ui` 必须位于 home dir 内（或 `SAFE_PATHS` 中），否则配置解析报错。[已验证 via mihomo `config/config.go` `IsSafePath`、默认 `ExternalUIURL`] 安装时仅在 `ui/` 不存在或为空时拷入，之后由面板自更新（见 #10）。`ui/` 为空时 mihomo 启动也会自动下载面板。[已验证 via mihomo `component/updater/update_ui.go` `AutoDownloadUI()`]
  - 旧模块以模块目录为 home dir，升级时 provider 缓存和 geo 更新都会丢失，所以没有照搬。目录不放在 `/sdcard`：配置里有订阅 token，`/sdcard` 上的文件任何有存储权限的应用都能读到。另外 `/data/adb` 不依赖 `/sdcard` 解密，也就不用像以前那样等用户解锁。
- **电脑编辑的导入导出**：`/data/adb` 只有 root 能访问，无法通过 MTP 或普通的 `adb push` 写入。WebUI 提供"导入"和"导出"两个按钮，以 root 读写固定的中转路径 `/sdcard/Download/mihomo-ksu/override.yaml`。导入走与保存相同的流程（合并、`mihomo -t` 校验、落盘、热重载），校验不通过就不落盘。中转文件里有订阅 token，有存储权限的 App 都能读到，所以导入、导出完成后 WebUI 提示用户删除它。
  - 否决的备选：使用 `<input type=file>` 选择文件。KSU WebView 是否支持文件选择[未验证]；用固定路径加 root 读写，不依赖这项支持。
- 升级或卸载模块时都不删除这个目录，重装后订阅和 override 仍然保留。README 中说明如何手动删除。

## 7. 安全默认值

- `external-controller: 127.0.0.1:9090`，并在安装时生成随机 `secret`。理由是本机任何 App 都能访问 localhost，不设 secret 就能读到订阅。
- secret 只保存在数据目录的 `secret` 文件中，不写入任何 YAML。启动时通过命令行参数 `mihomo -secret "$(cat secret)"` 传入。[已验证 via mihomo `main.go` 的 `-secret` flag、`hub/hub.go` `WithSecret`]
  - 原因：`base.yaml` 在仓库里，不能带 secret；而首装和"没有 override 时直接拷贝 base"这两条路径都不经过 WebUI，无法注入。
  - 热重载不会丢失 secret：`PUT /configs` 只调用 `executor.ApplyConfig`，不重建 controller。[已验证 via mihomo `hub/route/configs.go`] 因此 override 中的 `external-controller` / `secret` 不会在热重载时生效，只能通过重启生效。
- WebUI 以 root 读取 `secret` 文件，用于调用 REST API。WebUI 中打开面板的链接带上 `#/setup?hostname=127.0.0.1&port=9090&secret=<secret>`，用户无需手动输入。[已验证 via metacubexd `packages/ui/nuxt.config.ts` `hashMode`、`packages/ui/composables/useConnect.ts` `autoLogin()`]

## 8. 项目管理

- 仓库：GitHub public，名称与 module id 统一为 `mihomo-ksu`（符合 KSU 的 id 正则 `^[a-zA-Z][a-zA-Z0-9._-]+$`）。[已验证 via KernelSU `docs/guide/module.md`]
- License：MIT。随包分发的第三方组件（mihomo MIT、metacubexd MIT、js-yaml MIT、kernelsu Apache-2.0）保留各自的许可声明。
- 二进制和第三方产物不进 git，由 `build.sh` 在构建时下载；哪些固定版本、哪些取最新版见 #10。
- 版本号从 git tag 推导：tag `vX.Y.Z` 对应 `version=vX.Y.Z`，`versionCode = X*10000 + Y*100 + Z`（约束：Y、Z < 100）。
- `updateJson` 指向 `https://github.com/<owner>/mihomo-ksu/releases/latest/download/update.json`，由 release workflow 生成并作为 release asset 上传，不需要向 main 分支提交。
- 订阅 token 等私人配置只保存在设备上，不进入仓库。

## 9. 面板（metacubexd）与模块 WebUI 职责分离

- **面板选型：metacubexd**（MetaCubeX 官方，MIT）。
  - 和 ZashBoard 对比过，两者都能满足下面列出的运行时需求：都调用 `/upgrade`、`/upgrade/ui`、`/configs/geo`，都支持用 URL 参数带入 secret。[已验证 via metacubexd `packages/ui/composables/useApi.ts`、zashboard `src/api/clash.ts`]
  - 选 metacubexd 是因为它就是 mihomo `external-ui-url` 的默认值，不需要任何额外配置。
  - 备选 ZashBoard：如果 metacubexd 实际体验不好再换。代价是要设置 `external-ui-url`（指向它的 `releases/latest/download/dist.zip`），否则在面板里升级 UI 会被换成 metacubexd。
- **面板**（由 external-ui 托管在 `:9090/ui`）：负责运行时操作，包括切换节点、测延迟、查看连接和日志、更新 provider、切换模式，以及内核、面板、geo 的自更新（见 #10）。它通过 REST API 修改的是内存中的运行状态，内核重载后就会丢失。
  - 它的"从 URL 拉取配置"只把 YAML 交给 `PUT /configs` 加载到内存，"重载配置"只让内核重新读取磁盘上的配置文件，都不会写入磁盘。会写盘的"Profiles"功能只在连接 metacubexd 自己的 agent 时启用，external-ui 托管下不可用。[已验证 via metacubexd `packages/ui/composables/useApi.ts` `fetchRemoteConfigAPI()`、`reloadConfigFileAPI()`]
- **模块 WebUI**（KSU/APatch 管理器中打开）：负责**持久化**的配置管理，包括编辑 override、合并、校验、落盘并热重载。
- 两者不重复实现对方的功能。WebUI 中只放一个打开面板的链接。

## 10. 随包组件的版本：构建时取最新版，运行时由面板自更新

- **mihomo 内核、metacubexd、geo 数据**：`build.sh` 在构建时下载上游最新版，不固定版本，也不校验 sha256。上游的 latest 内容随时在变（meta-rules-dat 的 `latest` tag 每天重新发布），无法固定 hash，只依赖 HTTPS。[已验证 via gh releases]
  - 下载源与 mihomo 自更新使用的地址一致：
    - 内核：`MetaCubeX/mihomo/releases/latest/download/` 下的 `version.txt` 和对应 asset
    - 面板：`MetaCubeX/metacubexd/archive/refs/heads/gh-pages.zip`
    - geo：`MetaCubeX/meta-rules-dat/releases/download/latest/` 下的 `geoip.dat`、`geosite.dat`
    - [已验证 via mihomo `component/updater/update_core.go`、`config/config.go` 默认 `ExternalUIURL`/`GeoXUrl`]
  - 安装后通过面板自更新：内核走 `POST /upgrade`，面板走 `POST /upgrade/ui`，geo 走 `POST /configs/geo` 或 `geo-auto-update`。[已验证 via mihomo `hub/route/upgrade.go`]
  - 代价：同一个 tag 构建两次，产物可能不同。release 由 CI 在打 tag 时构建一次，已发布的产物不会再变。
- **js-yaml、kernelsu**：属于 WebUI 代码依赖，不会自更新。版本和 sha256 固定在 `versions.env`，校验失败就中止构建。
- **内核放在模块目录 `bin/mihomo`**：
  - `/upgrade` 会原地替换 `os.Executable()` 所在目录的二进制，过程中临时创建 `meta-update/`、`meta-backup/`，然后用 `syscall.Exec` 带原参数重启。pid、`-d`、`-secret` 都不变。[已验证 via mihomo `component/updater/update_core.go`、`hub/route/restart.go`]
  - 这是模块目录中第二个允许在运行时写入的地方（第一个是 #4 的 `description` 提示）。
  - 升级模块时，内核会回到构建时的版本。这样可以保证内核不比同一个 zip 里的 `base.yaml` 旧。
  - 否决的备选：内核放在数据目录，仅在不存在时拷入。用户如果不在面板里升级，内核就一直停在首次安装时的版本，而 `base.yaml` 会随模块演进，最终 `mihomo -t` 失败；要避免这一点就得在安装时比较版本，复杂度不值得。
- **面板和 geo 放在数据目录**，仅在不存在时拷入，自更新的结果可以跨模块升级保留（见 #6）。它们不受模板约束。
- **内核位置不影响生命周期**：KSU 禁用或删除模块时，只是在模块目录中创建 `disable` 或 `remove` 标记，不会结束正在运行的进程。下次开机时，KSU 对禁用的模块跳过 `service.sh`；对删除的模块，在 post-fs-data 阶段执行 `uninstall.sh` 后删除模块目录。[已验证 via KernelSU `userspace/ksud/src/module.rs`、`init_event.rs`] APatch 的行为[未验证]。
