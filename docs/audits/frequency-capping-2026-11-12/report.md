# Braze 全局频控功能拆解

调查日期：2026-11-12（Asia/Shanghai）。目标为用户给出的 Braze Campaign 及其关联工作区。

全局频控是**工作区级、按用户累计、跨 Campaign 和 Canvas Message step 共用**的消息额度。功能由全局规则、单个活动的豁免/计数配置、发送时的规则判断组成。发送总量、发送速率、再次接收资格、Quiet Hours 是独立配置。

**证据范围**

| 类型 | 本次取得的证据 | 能支持的结论 |
| --- | --- | --- |
| 浏览器观察 | Campaign 发送设置、全局空状态、只读状态、帮助抽屉、Settings 导航 | 当前账号看得到的入口、状态和说明 |
| 人工静态检查 | 已加载的公开 CDN 脚本；原始文件 SHA256 和关键字节范围已保存 | 前端数据字段、接口候选、功能开关、权限元数据 |
| 官方文档 | Braze 频控及消息优先级说明 | 产品公开承诺的发送语义；本次没有实发验证 |
| REA CLI | 完成输入清单与哈希记录，随后在解析启动前失败 | 仅支持文件身份，不支持成功的语义图或运行时调用链 |

浏览器操作未保存配置、未发布活动、未发送消息；原 Campaign 已返回 Compose 页面。

**入口和当前状态**

- 全局入口：Settings → Workspace Settings → Frequency Capping Rules。
- Campaign 入口：Schedule Delivery → Delivery Controls → Frequency Capping，可跳转至全局设置。
- Canvas 入口已在已有草稿实测确认：编辑向导第 4 步 Send Settings → Frequency Capping；说明这些发送设置作用于所有 Canvas 步骤。当前同样显示尚未创建规则及全局设置链接，未实测配置规则后的 ON/OFF 状态。（UI-04）
- 当前账号在全局页显示 View only，页面呈现空规则状态，Revert 禁用，没有可操作的新增/保存入口。
- 这只能确认页面状态。共享读取 helper 存在 HTTP 403 → 空数组的恢复分支，因此未取得成功的规则读取响应前，不能据此确定服务端确实没有规则。（UI-01/02、JS-03）

**规则模型**

页面帮助确认规则可覆盖全部消息，也可按渠道、Tag、Message Prioritization category 缩小范围，多条规则可以叠加。以下字段来自前端读取适配器，不是推测的克隆接口。（UI-03、JS-04/05/06）

| 字段 | 静态观察 | 复刻时应保留的含义 |
| --- | --- | --- |
| `type` | 摘要分支包括 `any`、`push`、`email`、`sms`、`webhook`、`whats_app`、`line`、`kakao` | 全渠道或指定消息渠道 |
| `messages` | 数字 | 每位用户的次数上限 |
| `seconds` | 数字；摘要格式化选用 Minute、Day、Week | 规则窗口以秒传递；摘要的单位不等于已实测的所有编辑器选项 |
| `tag_name` / `tag_id` | 可空 | Tag 范围 |
| `category` | 可空的 `{ id, name }` | Message Prioritization 分类范围 |

摘要 helper 优先显示 Tag，其次 Category，再显示无筛选规则；这一显示分支不能证明后端禁止两种筛选并用。当前权限下没有观察新增规则表单，所以输入框边界、重复规则校验、筛选组合、删除确认和保存交互仍未验证。

适用渠道为 Email、Push、SMS/MMS/RCS、Webhook、WhatsApp、LINE、KakaoTalk；帮助抽屉明确排除 Banner、Content Card、In-app message。（UI-03）

**发送行为**

以下是[官方频控说明](https://www.braze.com/docs/user_guide/messaging/messaging_fundamentals/frequency_capping)的语义核对，未作为实发实验结果：

- 按用户的 dispatch 计数；同次发送的多设备不重复消耗，一次多渠道 dispatch 对每条适用规则最多计一次。
- 适用规则按 AND 组合。日窗口按用户本地自然日计算，不是滚动 24 小时。
- Canvas 某 Message step 因超限不发送时，用户继续下一步，不因此退出 Canvas。
- Tag 规则按当前标签回看历史；历史活动增删标签可能改变计数，也可针对主标签和嵌套标签设规则。官方对每渠道高历史消息量的 Tag 计数另有限制警示。
- 频控在 Quiet Hours 前判断；静默延后后，发送时还会重新检查。

规则示例：所有渠道每日最多 3 次，促销 Push 每日最多 1 次。某用户的下一条促销 Push 必须同时满足总额度和促销 Push 额度。该例用于说明模型，不是已保存的工作区配置。

**活动豁免与配额计数**

Campaign/Canvas 数据声明分别出现两个布尔字段：（JS-09）

| 字段 | 作用 |
| --- | --- |
| `ignore_global_frequency_capping` | 该活动是否忽略全局频控约束 |
| `exclude_from_global_frequency_count` | 该活动是否排除在后续频控计数之外 |

它们必须独立建模。某消息允许越过限制，与它是否消耗后续额度，是两个决定；不能用一个开关承载全部语义。

Message Prioritization 则是在有限额度中决定哪些 opted-in 消息优先发送的可选层。页面帮助要求其被频控规则覆盖；优先级功能的 retry window 不能推定为普通频控默认补发机制。[官方优先级说明](https://www.braze.com/docs/user_guide/messaging/messaging_fundamentals/message_prioritization)

**前端接口与兼容路径**

| 路径 | 静态观察的方法 | 证据 |
| --- | --- | --- |
| `/workspaces/{workspace_id}/frequency_capping_rules/v1/rules` | GET、PUT | JS-01，生成式客户端 |
| `/engagement/campaigns/global_frequency_caps/:app_group_id` | GET | JS-02，对旧读取 helper 的调用及旧客户端声明 |
| `/engagement/campaigns/set_global_frequency_caps` | PUT | JS-10，旧客户端声明 |

`frequency_capping_grape_api` 功能开关选择新旧读取路径。新接口更新成功后，共享客户端会失效 `message_frequency_capping` 查询缓存。没有抓取真实请求/响应，没有调用这些更新接口；上述是静态契约候选，不是后端可达性或持久化成功的证明。

**数量上限和权限的差异**

- 官方频控文档写最多 10 条规则；已发布脚本包含 `FREQUENCY_CAPPING.MAX_RULES = 15`，并存在单独的数值额度键 `global_frequency_capping_rules_limit`。（JS-07/08）当前角色不能新增，实际工作区生效额度尚未确认。复刻应把额度作为配置，保留服务端校验。
- 静态权限名为 `viewFrequencyCaps`、`editFrequencyCaps`。编辑权限元数据关联查看权限，并列出 `launchCampaigns`、`launchCanvases` 前置权限；实际角色解析未测试。（JS-11）

**用于复刻的验收场景**

下面是依据已知语义整理的验收设计，尚未在 Braze 或本地克隆中执行：

| 场景 | 预期 |
| --- | --- |
| 两个 Campaign 加一个 Canvas 给同一用户发送 | 共用适用的工作区配额 |
| 渠道规则、总量规则、Tag 规则同时命中 | 全部通过后才发送 |
| 同次 Push 分发到多个设备 | 每条适用规则只计一次 |
| 本地时间跨午夜 | 按自然日边界判断日额度 |
| Canvas 步骤超限 | 跳过该条消息，继续下一步 |
| 活动忽略频控，但仍参与计数 | 本次可越限，同时影响后续额度 |
| 活动忽略频控且排除计数 | 不占用后续受控消息额度 |
| 无编辑权限 | 可展示权限状态，禁止保存；不把读取拒绝伪装成确定的业务空状态 |

**未解决的范围与 REA 状态**

- 没有真实发送实验、成功的规则读取响应或保存请求，因此服务端并发扣减、重试、计数一致性和持久化事务均未知。
- 分钟窗口是否滚动、周窗口起点、缺失用户时区的回退未确认。
- 当前只读角色下，规则编辑器的精确交互、数值校验和有效数量额度未确认。
- REA 6.8.0 使用 Node 24.22.1。首次分析被编译缓存写权限阻止；获准重试后，本机 Command Line Tools 报 `SwiftBridging` 模块重复定义，解析仍在 startup 阶段失败。没有为此改动或安装系统工具链。
- 最后返回的部分 Evidence 为 `ev_29d440b075fe53021d3b241bc3f8fecd2ac9b349827b53a67d2b07277dc93dd1`，仅保留输入身份/清单与未解析范围；不得当作成功的语义分析证据。
- 有界资产扫描尝试 121 个已观察的公开 CDN 脚本，99 个完整取得、22 个失败；另有单独获取的脚本。保留了 26 个完整脚本共 4,917,428 bytes。未声称覆盖全部 Braze 前端。

同目录证据：`ui-observations.md`、`source-facts.json`（JS-01～11 的 SHA256/UTF-8 字节范围）、`retained-assets.json`、`source-scan.json`、`rea-analysis-failure.json`、`rea-partial-evidence.json`。人工静态结论与 REA 返回记录已分别标注。
