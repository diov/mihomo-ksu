# C8 规则集（rule-providers）实施计划

状态：**已批准，未开始**。v0.1 中优先级最低，排在 C7 之后。

决策依据：[`../decisions.md`](../decisions.md) #11。合并规则：[`../override.md`](../override.md) "2b. 规则集补齐"。WebUI 的整体做法沿用 [`c5-webui.md`](c5-webui.md)（草稿模型、保存流程、全屏编辑页、`views.js`）。

## 思路

1. 规则集在 override 里的写法与订阅相同：`rule-providers` 每条只写 `url`、`behavior`、`format`，其余由 base 的 `x-rule-provider-defaults` 补齐，`path` 按名称与格式生成。
2. WebUI 新增"规则集"卡片与全屏编辑页，规则编辑页的类型加入 `RULE-SET`，匹配内容改为选择已定义的规则集。
3. 只支持粘贴链接，不内置预设；够用之前不做规则集下载状态的展示（面板里已有，decisions #9）。

**否决的备选**：只在 YAML 编辑页里手写 rule-provider。每条要写五六个字段且容易漏 `path`，规则编辑页也无法列出可引用的规则集。

**复用的现有组件**：`merge.js` 的订阅补齐（改为通用的条目补齐）、全屏编辑页与 `views.js`、`draft.js` 的 `updateDraft` 与保存流程、`changes.js` 的计数、"未保存"标签、`rules.js` / `rules-card.js`。

## Commit 拆分

### C8.1 `feat(config): rule-provider defaults and merge`
- `module/base.yaml` 增加：
  ```yaml
  # Fields every rule-providers entry in override.yaml inherits; path comes from name and format.
  x-rule-provider-defaults:
    type: http
    interval: 86400
  ```
- `webui/merge.js`：把 `fillProviders` 改为通用的条目补齐（默认字段对象 + 生成 path 的函数），同时用于 `proxy-providers` 与 `rule-providers`；规则见 `override.md` 2b。
- `test/merge.test.js` 增加：规则集按 `x-rule-provider-defaults` 补齐；`format` 为 `yaml`/未写、`text`、`mrs` 时的 `path` 扩展名；已写的 `path` 保留；含 `/` 的名称与非 map 条目报错；override 可修改 `x-rule-provider-defaults`。
- `changes.js`：`rule-providers` 与 `proxy-providers` 一样按条目计数（每个增删改的规则集计 1）。
- 验证：`node --test`；在 PC 上用 `mihomo -t` 校验 `base.yaml`；用真实 `base.yaml` + 一个含 rule-provider 与 `RULE-SET` 规则的 override 合并后 `mihomo -t` 通过（端到端做法见 `docs/dev-testing.md`）。

### C8.2 `feat(webui): rule set editor`
- `webui/rulesets.js`（纯函数，`node --test` 覆盖）：列出规则集、增删改（只改 `url`、`behavior`、`format`、`interval`，其他手写字段保留；改名保持顺序；删空去掉键）、校验、`changedRuleSets`（"未保存"标签）、按链接扩展名推断格式（`.mrs` → mrs，`.txt`/`.list` → text，`.yaml`/`.yml` → yaml，其他不推断）。
- 校验：名称必填、不含 `/`、不重名；链接 http(s)；`format: mrs` 时 `behavior` 不能是 `classical`。
- 删除：仍有前置 / 后置规则以 `RULE-SET,<name>,…` 引用时不能删除，提示"仍有 N 条规则引用它"。
- `webui/rulesets-card.js`：主页"规则集"卡片（放在"订阅"与"自定义规则"之间），每行显示名称、行为、链接（同订阅，只显示主机名与路径）；全屏编辑页字段为名称、链接、行为（域名 / IP / 经典）、格式（yaml / text / mrs，填链接时自动选择，可手改）、更新间隔（模板默认 24 小时 / 6 / 12 / 48 小时，原有的非预设值额外列出）。
- 草稿无法解析或 `rule-providers` 不是 map 时，卡片提示到 YAML 编辑页修正。
- 文案进 `i18n/zh.js`；设计沿用设计稿"订阅编辑"全屏页的样式（设计稿未单独画规则集页）。
- 验证：通过表单添加一个真实的公开规则集（如 blackmatrix7/ios_rule_script 的某个 Clash YAML 规则），保存后 `GET /providers/rules` 中出现该规则集且规则数大于 0；校验与删除拦截生效。

### C8.3 `feat(webui): RULE-SET rules`
- `rules.js`：`RULE_TYPES` 加入 `RULE-SET`；`parseRule` / `formatRule` 支持它；`no-resolve` 对 `RULE-SET` 允许（是否显示由规则集的 `behavior` 决定）。
- `rules-card.js`：类型为 `RULE-SET` 时，"匹配内容"由文本框换成已定义规则集的下拉（无规则集时提示先添加）；所选规则集 `behavior: ipcidr` 时显示"不解析域名"。
- 验证：添加 `RULE-SET,<name>,<策略>` 前置规则，保存后在 `GET /rules` 中位于最前且类型为 RuleSet；引用中的规则集删除被拦截。

## 注意

- 规则集的下载走 mihomo 自身分流，订阅不可用时 GitHub 上的规则集可能下载失败；此时引用它的规则不匹配任何流量，不会报错。
- `config.yaml` 体积：规则集内容不进入 `config.yaml`（只写引用），不受 WebUI 单条命令写文件长度上限影响。
