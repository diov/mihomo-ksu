# C5 WebUI 实施计划

状态：**已批准**。

上级计划：[`v0.1.md`](v0.1.md) C5。合并规则：[`../override.md`](../override.md)。

## 思路

1. 合并逻辑是纯函数 `merge(base, override)`，输入输出都是 JS 对象，不依赖 js-yaml 和 KSU，用 `node --test` 覆盖 `override.md` 中的业务期望。
2. 页面是原生 HTML + ES module，所有设备操作（读写文件、`mihomo -t`、调用 REST API）都通过 kernelsu 的 `exec()` 在 root shell 中完成。
3. `override.yaml` 是唯一的用户输入，保存时由它生成 `config.yaml`；订阅表单、规则表单和原始 YAML 编辑器编辑的是同一份 override。

**否决的备选**：在页面里用 `fetch()` 直接调用 `http://127.0.0.1:9090`。mihomo 默认允许任意 CORS 来源 [已验证 via mihomo `config/config.go` `ExternalControllerCors`]，但页面运行在 `https://mui.kernelsu.org`（KSU 用 WebViewAssetLoader 提供 webroot）[已验证 via KernelSU `WebViewHelper.kt`]，WebView 是否把 `http://127.0.0.1` 当作可信来源、放行混合内容[未验证]。改用 `exec()` 执行 `curl`，不受这些限制。

**复用的现有组件**：
- `scripts/ctl.sh status`：进程状态和私人 DNS 提示
- mihomo 的 `-t` 校验和 `PUT /configs` 热重载
- `config.base.sha256` 与 `description` 提示前缀（C3 已实现）
- 不新建任何系统级入口，WebUI 就是 KSU/APatch 管理器里模块的 WebUI 页面

## 关键做法

- **调用 API**：`printf 'Authorization: Bearer %s' "$(cat secret)" | curl -H @- ...`。`printf` 是 shell 内建命令，secret 只经过 stdin，不出现在任何进程的命令行里 [已验证 via adb：带真实 secret 返回 200]。
- **写文件**：内容在 JS 中 base64 编码，用 `echo <b64> | base64 -d > <tmp>` 写入，避免 YAML 中的引号、`$` 等字符被 shell 解释。
- **保存流程**：
  1. 解析 override，执行 `merge`；报错就显示错误，不写任何文件。
  2. 把 override 写到 `override.yaml.tmp`，把合并结果写到 `config.yaml.tmp`，都放在数据目录（同一文件系统，`mv` 是原子操作）。
  3. 执行 `mihomo -t -d <DATA> -f config.yaml.tmp`；失败就删除临时文件，显示输出。
  4. 依次 `mv` 成 `override.yaml`、`config.yaml`；写入当前 `base.yaml` 的 sha256；去掉 `description` 的提示前缀。
  5. `PUT /configs?force=true`，`path` 为空，即重新加载 `config.yaml`。
- 每次保存都基于当前的 `base.yaml`，所以模板横幅的"应用"就是一次不修改 override 的保存，不需要单独的流程。
- **表单与注释**：订阅、规则表单的修改方式是解析 override → 修改对象 → 重新 dump，override 中手写的注释会丢失。原始 YAML 编辑器保存时原样写入文本，保留注释。页面上标明这一点。

## Commit 拆分

先做纯逻辑和页面骨架，再按设计稿的区块逐个落地。每个提交都能单独在真机上验证；C5.4 之后页面才能修改配置。

### C5.1 `feat(webui): merge function and tests`
- 文件：`webui/merge.js`、`test/merge.test.js`
- `merge(base, override)` 返回合并后的对象；违反 `override.md` 时抛出带说明的错误。
- 测试只覆盖 `docs/override.md` 中的业务期望：prepend 规则在 base 规则之前；append 规则在 MATCH 之前、没有 MATCH 时在末尾；订阅深度补齐默认字段、自动生成 `path`、已写的字段优先；override 可修改 `x-provider-defaults`；数组整体替换；模块管理的字段和含 `/` 的订阅名报错；override 为空时结果等于 base。
- 验证：`node --test`；把被测函数的核心逻辑删掉后，测试必须失败。

### C5.2 `feat(webui): page shell, device bridge and i18n`
- 文件：`build.sh`、`webui/index.html`、`webui/style.css`、`webui/app.js`、`webui/device.js`、`webui/i18n.js`、`webui/i18n/zh.js`
- `build.sh` 把 `webui/` 拷入 zip 的 `webroot/`，并从已校验的 tarball 中取出 js-yaml 的浏览器 ESM 构建（`dist/browser/js-yaml.esm.min.mjs`）和 kernelsu 的 `index.js`，放到 `webroot/vendor/`。
- `style.css`：设计稿的颜色、圆角、间距定义为语义 token，深色模式下重新定义同一组 token（`prefers-color-scheme`）。
- `device.js`：封装 `exec()`，提供读文件、写文件（base64）、调用 API（curl + stdin 传 secret）、执行 `ctl.sh`，其余模块只通过它访问设备。
- `i18n.js`：`t(key)` 与语言选择（见已定事项 2）。
- 页面只有顶部栏：模块版本、内核版本。
- 验证：在 KSU 管理器中打开模块 WebUI 能看到两个版本号；切换系统深色模式后颜色跟随。

### C5.3 `feat(webui): status card`
- 设计稿"主页 · 正常"与"模板更新 + 异常"中的运行状态卡片：后台检查进程、控制器（`/version`）、Tun（`/configs` 的 `tun.enable`）。全部正常时只显示一行"运行中"和 pid；有异常时以第一项异常为标题（未运行 / 控制器不可用 / Tun 未启动），附可能原因、处理办法和日志末尾 20 行。私人 DNS 未关闭时显示提示。
- "打开面板"（系统浏览器，见已定事项 1）与"重启"（`ctl.sh restart`）。
- 验证：正常时显示"运行中"；`ctl.sh stop` 后显示未运行和日志；点击"打开面板"无需输入 secret 即进入面板；"重启"后 pid 变化。

### C5.4 `feat(webui): save flow and YAML editor`
- 保存的完整链路：未保存更改的计数、底部浮动条（放弃 / 保存并应用）、被改动的条目标"未保存"、保存流程（见关键做法）、保存失败弹窗（合并错误和 `mihomo -t` 输出）。
- 设计稿"YAML 编辑"页：原样编辑 `override.yaml`，保存时保留注释；"预览合并结果"只读显示生成的 `config.yaml`。
- 先接入 YAML 编辑页，是因为它覆盖 override 的全部内容，可以独立验证保存链路。
- 验证：在 YAML 页添加一条订阅，保存后面板中能看到节点；写错 YAML、写入模块管理的字段、写入错误规则类型时都被拦截，`config.yaml` 不变。

### C5.5 `feat(webui): subscription editor`
- 设计稿"订阅"卡片与"订阅编辑"底部面板：名称、链接、更新间隔（模板默认 / 1 / 12 / 24 小时）；增删改。
- 验证：通过表单添加、修改、删除订阅，保存后面板中的订阅随之变化；含 `/` 的名称被拦截。

### C5.6 `feat(webui): rule editor`
- 设计稿"自定义规则"卡片与"编辑规则"底部面板，参考 Surge 的列表与编辑方式[未验证]：前置 / 后置两组列表，每行显示类型标签、匹配内容、策略，点击进入编辑；编辑面板依次为位置、类型、匹配内容、策略，IP 类规则（`IP-CIDR`、`IP-CIDR6`、`GEOIP`）额外显示 `no-resolve` 开关，并预览整条规则；删除在编辑面板中。
- 策略下拉框：合并结果中的代理组名，加上 `DIRECT`、`REJECT`。只提供结构化表单，复杂规则在 YAML 页编辑。
- 验证：添加一条前置规则，保存后在面板的规则列表中位于最前；后置规则位于 `MATCH` 之前。

### C5.7 `feat(webui): template update banner`
- 打开页面时比较 `base.yaml` 的 hash 与 `config.base.sha256`，不一致时显示横幅、"应用"和"查看合并结果"。"应用"就是一次不修改 override 的保存。
- 验证：修改模块内的 `base.yaml` 后打开 WebUI 出现横幅；点击"应用"后横幅和 `description` 中的提示都消失。

### C5.8 `feat(webui): import and export via the transfer file`
- 读写 `/sdcard/Download/mihomo-ksu/override.yaml`；导入的内容进入未保存更改，走同一个保存流程；完成后提示删除中转文件（decisions #6）。
- 验证：在电脑上修改导出的文件，`adb push` 回中转路径后导入并保存，改动生效。

## 已定事项

1. **"打开面板"在系统浏览器中打开**：`am start -a android.intent.action.VIEW -d <URL>`。登录状态保存在浏览器中，之后直接打开 `/ui` 即可。已知代价：URL（含 secret）会短暂出现在 `am` 进程的命令行里。
2. **界面语言**：先提供中文，但从一开始就支持多语言。文案集中在 `webui/i18n/<locale>.js`，每个文件导出一个 key → 文案的对象；页面只通过 `t(key)` 取文案，不在 HTML/JS 中写死文字。语言按 `navigator.language` 选择，没有对应文件时回退到中文。只有一种语言时不显示语言切换入口。
3. **界面设计**：已确认设计稿（https://claude.ai/artifact/PXopVDG5kbikpYCmjBtiER，仅本人可见）：主页、模板更新与异常、订阅编辑、编辑规则、YAML 编辑、保存失败。
   - 单页滚动，区块依次为：顶部栏、模板更新横幅（按需）、运行状态、订阅、自定义规则、高级（YAML 编辑、预览、导入导出）。
   - 修改先累积为"未保存的更改"，通过底部浮动条统一"保存并应用"；保存一次要经过 `mihomo -t` 和热重载，不逐项保存。
   - 状态卡片正常时只显示"运行中"，有异常才展开具体问题；保留"重启"按钮。
   - 规则只提供结构化表单，参考 Surge 的列表与编辑方式。
   - 订阅只开放名称、链接、更新间隔，其余字段用模板默认值。
   - 弹层使用原生 `<dialog>`，下拉使用原生 `<select>`，不引入组件库。
   - 不做节点列表、测延迟、手动更新订阅、流量统计，这些由面板负责（decisions #9）。

## 备注

- KSU 的 WebView 已支持文件选择（`onShowFileChooser`）[已验证 via `WebViewHelper.kt`]，decisions #6 当时记为[未验证]。APatch 是否支持[未验证]，本计划仍按固定中转路径实现，不改 decisions #6。
