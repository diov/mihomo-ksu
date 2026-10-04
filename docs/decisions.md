# 决策记录

记录已确认的项目级决策及依据。新增决策追加在末尾，推翻旧决策时在原条目标注"已废弃 → 见 #N"，不直接删除。

外部事实标注：`[已验证 via 来源]` / `[未验证]`。核实日期为 2026-10-02 至 2026-10-05。

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
- **与其他 Tun 模块的冲突**：冲突与 module id 无关，而是运行时争用同一批资源（网卡名 `Meta`、策略路由优先级与表 2022、53 端口劫持、控制端口）。安装时不做检测：写死某个旧模块的路径没有意义，安装时刻的进程状态也不代表下次开机的状态。
  - mihomo 在资源冲突时不会退出：控制端口被占只记 error 继续运行 [已验证 via adb 实测 `bind: address already in use`]；Tun 创建失败时把 `tun.enable` 置为 false 后继续运行，`GET /configs` 返回的 `tun.enable` 随之为 false [已验证 via mihomo `listener/listener.go` `ReCreateTun()`/`GetTunConf()`]。
  - 因此由 WebUI 根据状态提示：进程是否在运行、控制器能否访问、`tun.enable` 是否为 true，异常时附上日志。不依赖日志措辞，内核自更新后仍然有效。

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
  - 开机时比较模块内 `base.yaml` 的 hash 与记录值。如果不一致，仍用旧的 `config.yaml` 启动，并在 `module.prop` 的 `description` 前加上"模板已更新，请打开 WebUI 应用"的提示前缀；WebUI 打开时同样显示提示，并提供"应用"按钮，应用后去掉前缀。模块升级会换上新的 `module.prop`，前缀不会残留到下个版本。
  - 例外：如果 `override.yaml` 不存在，合并结果就等于 `base.yaml`，开机脚本直接拷贝即可，不需要提示。
  - 已知代价：在用户打开 WebUI 应用之前，模板里的修复（包括安全修复）不会生效。
- 合并在 WebUI 中用 JS 完成，依赖 **js-yaml**（MIT，截至 2026-10-02 最新为 5.4.2）。[已验证 via npm registry]
- WebUI 使用模块 `webroot/` 机制，通过 **kernelsu** npm 包（Apache-2.0，3.0.2）[已验证 via npm registry] 提供的 `exec()` 执行 root shell。
  - KernelSU：原生支持。[已验证 via KernelSU `docs/guide/module-webui.md`]
  - APatch：读取同一个 `webroot` 目录，并以同名 `ksu` 注入 JS 接口，因此同一套页面可以直接通用。[已验证 via APatch `WebUIActivity.kt`]
  - Magisk：不在支持范围内（需要借助第三方 WebUI X 之类的 App）。
- 规则不再内联：改用 `GEOSITE`、`GEOIP`，数据来自 MetaCubeX/meta-rules-dat 的 `geosite.dat` 和 `geoip.dat`。构建时打包一份，运行时靠 `geo-auto-update` 自动更新（存放位置见 #6）。

## 5. Captive portal：v0.2 最后一步

不在 v0.1 范围，先完成配置管理；v0.2 排在最后（见 `plans/v0.2.md` 第 4 步）。以下分析是 spike 的起点。

根因推断如下（**尚未在真机上验证**）：

1. NetworkMonitor 发出的探测请求被 Tun 截获（mihomo 的 ip rule 优先级更高）。
2. 探测域名经 fake-ip 解析后命中规则，被送去走代理。
3. 认证之前，代理节点和加密 DNS 都不可达，探测超时。
4. 结果系统判定为"无互联网"，而不是"需要登录"，登录页因此不弹出。


- **A（配置层，候选）**：
  - 把 `com.android.captiveportallogin` / `com.google.android.captiveportallogin` 加入 `exclude-package`（meta-docs 示例即为此包名）。
  - 探测域名改为直连，并使用系统 DNS 解析。
  - 或者用 `tun.exclude-uid` 排除探测进程，让探测完全不进 Tun。探测由 NetworkStack 发出，uid 为 `network_stack`（1073）[已验证 via AOSP `android_filesystem_config.h` `AID_NETWORK_STACK`]；sing-tun 先把 `exclude-package` 换算成 uid，再与 `exclude-uid` 一起生成 ip rule，所以 `exclude-uid` 在 Android 上同样有效 [已验证 via MetaCubeX/sing-tun `tun_rules.go`]。待 spike 确认：设备上的探测是否确实以 1073 发出，它的 DNS 查询（由 netd 代发）是否也被排除。
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
- **从文件导入订阅**：网络不好时，mihomo 启动前可能拉不到订阅链接，没有节点也就没有代理去拉它。订阅编辑页可以选择来源"本地文件"：用户用系统文件选择器选一个订阅文件（完整 Clash 配置或 v2rayN 风格的节点列表），保存时复制到该订阅的缓存位置 `providers/<name>.yaml`，作为固定配置（mihomo `type: file`），不自动更新。原文件不被引用，之后移动或删除都不影响。
  - KernelSU Next、KernelSU、APatch 的 WebView 都实现了 `onShowFileChooser` [已验证 via 三者的 `WebUIActivity.kt` / `WebViewHelper.kt`]；页面只拿到文件内容，拿不到路径。
  - 网络恢复后把来源改成"订阅链接"即可自动更新：两种来源的缓存位置相同，http 订阅启动时先加载已有文件，再按间隔从链接更新，更新失败时保留旧节点 [已验证 via mihomo `component/resource/fetcher.go` `Initial()`]。
  - 不从文件内容中识别订阅链接：Clash 配置没有约定记录自己的订阅链接，作者的订阅文件中也没有（只有 DNS 的 DoH 地址）[已验证 via adb，只统计结构]。
  - 否决的备选：以 root 读写固定中转路径 `/sdcard/Download/mihomo-ksu/override.yaml` 导入导出 override。override 修改频率低，在 WebUI 的 YAML 编辑页复制粘贴即可；中转文件里有订阅 token，有存储权限的 App 都能读到。
- 升级或卸载模块时都不删除这个目录，重装后订阅和 override 仍然保留。README 中说明如何手动删除。

## 7. 安全默认值

- `external-controller: 127.0.0.1:9090`，并在安装时生成随机 `secret`。理由是本机任何 App 都能访问 localhost，不设 secret 就能读到订阅。
- secret 只保存在数据目录的 `secret` 文件中，不写入任何 YAML。启动时通过环境变量 `CLASH_OVERRIDE_SECRET` 传入，效果等同 `-secret`。[已验证 via mihomo `main.go`、`hub/hub.go` `WithSecret`]
  - 不写进 YAML 的原因不是保密（文件和 `config.yaml` 都只有 root 可读，暴露面相同），而是写入路径：`base.yaml` 在仓库里不能带 secret，写 `config.yaml` 的三处（首装、开机直接拷贝 base、WebUI 合并）都得负责注入。单独的文件是唯一来源。
  - 不用命令行参数：`/proc` 以 `hidepid=invisible,gid=3009` 挂载，readproc 组（含 adb shell）能通过 `ps` 看到命令行；而 `/proc/<pid>/environ` 为 0400，shell 读取被拒绝。[已验证 via adb]
  - 热重载不会丢失 secret：`PUT /configs` 只调用 `executor.ApplyConfig`，不重建 controller。[已验证 via mihomo `hub/route/configs.go`] override 中的 `external-controller` 和 `secret` 由合并步骤直接拒绝（见 `override.md`"模块管理的字段"）。
- WebUI 以 root 读取 `secret` 文件，用于调用 REST API。WebUI 中打开面板的链接带上 `#/setup?hostname=127.0.0.1&port=9090&secret=<secret>`，用户无需手动输入。[已验证 via metacubexd `packages/ui/nuxt.config.ts` `hashMode`、`packages/ui/composables/useConnect.ts` `autoLogin()`]

## 8. 项目管理

- 仓库：GitHub public，名称与 module id 统一为 `mihomo-ksu`（符合 KSU 的 id 正则 `^[a-zA-Z][a-zA-Z0-9._-]+$`）。[已验证 via KernelSU `docs/guide/module.md`]
- License：MIT。随包分发的第三方组件保留各自的许可声明：mihomo（MIT）、metacubexd（MIT）、geo 数据 meta-rules-dat（GPL-3.0）、js-yaml（MIT）、kernelsu npm 包（Apache-2.0；KernelSU 主仓库是 GPL-3.0，但随包的是 npm 包）。[已验证 via gh repo license、npm registry，2026-10-04]
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
  - `/upgrade` 会原地替换 `os.Executable()` 所在目录的二进制，过程中临时创建 `meta-update/`、`meta-backup/`，然后用 `syscall.Exec` 带原参数和环境变量重启。pid、`-d`、`CLASH_OVERRIDE_SECRET` 都不变。[已验证 via mihomo `component/updater/update_core.go`、`hub/route/restart.go`]
  - 这是模块目录中第二个允许在运行时写入的地方（第一个是 #4 的 `description` 提示）。
  - 升级模块时，内核会回到构建时的版本。这样可以保证内核不比同一个 zip 里的 `base.yaml` 旧。
  - 否决的备选：内核放在数据目录，仅在不存在时拷入。用户如果不在面板里升级，内核就一直停在首次安装时的版本，而 `base.yaml` 会随模块演进，最终 `mihomo -t` 失败；要避免这一点就得在安装时比较版本，复杂度不值得。
- **面板和 geo 放在数据目录**，仅在不存在时拷入，自更新的结果可以跨模块升级保留（见 #6）。它们不受模板约束。
- **内核位置不影响生命周期**：KSU 禁用或删除模块时，只是在模块目录中创建 `disable` 或 `remove` 标记，不会结束正在运行的进程。下次开机时，KSU 对禁用的模块跳过 `service.sh`；对删除的模块，在 post-fs-data 阶段执行 `uninstall.sh` 后删除模块目录。[已验证 via KernelSU `userspace/ksud/src/module.rs`、`init_event.rs`] APatch 的行为[未验证]。

## 11. 规则来源：geo 数据 + 自定义规则

- **订阅中的规则不使用**：mihomo 解析 proxy-provider 时只读 `proxies` 字段，订阅里的 `rules`、`proxy-groups` 等被忽略 [已验证 via mihomo `adapter/provider/provider.go` `ProxySchema`]。
  - 否决的备选：保存时把订阅规则抄进配置（映射策略名）。只是保存时的快照，订阅更新后不跟随；以作者的订阅为例有 4280 条内联规则，`config.yaml` 会从约 6KB 涨到约 200KB；也违背 #2 去掉内联规则的初衷。
  - 否决的备选：运行时把订阅规则按策略拆成多个 rule-set。实现复杂，mihomo 没有订阅更新后的回调可用。
  - 订阅里的规则与 base 的 GEOSITE 分类大体重合（按分类名对比，未逐条核对）；缺少的个别规则用前置规则补。
- **不做规则集（rule-providers）**：按服务分流用前置规则 `GEOSITE,<分类>,<策略>`，geo 数据之外的个别需求用 `DOMAIN-SUFFIX`、`PROCESS-NAME` 等自定义规则补。
  - 随包 geosite 有 1552 个分类（含 `openai`、`anthropic`、`github`、`tiktok`、`category-ai-!cn` 等），geoip 有 260 个；`geo-auto-update` 每 24 小时更新，与规则集通常的更新间隔相同。[已验证 via 解析 meta-rules-dat latest 的 `GeoSite.dat` / `GeoIP.dat`，2026-10-05]
  - 规则集的 `behavior`、`format` 由文件内容决定，填错时 mihomo 不报错：格式错则规则数为 0，classical 文件当成 `domain` 会把 `DOMAIN-SUFFIX,…` 整行当作域名、永不匹配；`mihomo -t` 不下载规则集，也发现不了。最常用的 Loyalsoldier/clash-rules 的 `.txt` 内容是 YAML，无法按扩展名推断。[已验证 via 本地 mihomo v1.19.32 载入 Loyalsoldier/clash-rules、blackmatrix7/ios_rule_script 的文件]
  - 覆盖不到：大规模去广告（geosite `category-ads-all` 只有 911 条），base 本就不做。出现 geosite 分类与自定义规则都解决不了的常见需求时再评估。
