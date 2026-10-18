# Braze 对照检查与优化方案

检查日期：2026-10-18（Asia/Shanghai）
范围：当前工作区；重点为 Canvas、订阅组、Email Preference Centers、Subscription Pages and Footers，以及它们与 Campaign、用户档案、日志和报表的连接。
交付性质：差距审计、实施方案与后续实施记录。

## 实施进度（2026-10-18 续）

本节记录方案完成后的第一批代码优化；下文的“本轮实测问题”保留原始审计时点的证据，不再代表这些项目仍未修复。

| 工作项 | 当前进度 | 验证 |
| --- | --- | --- |
| S01/S02/S03 | Campaign 与预估均组合全局状态和订阅组状态；归档/跨渠道组拒绝；仅 PATCH 状态可用 | `tests/subscription-safety-api.py` |
| S04 | 增加 Email `opted_in/subscribed/unsubscribed` 三态；旧 boolean 自动迁移，旧接口继续兼容 | TypeScript 检查、API 回归 |
| P01/P03 | 偏好页区分“清除列出的组”和“全局退订”；公开读取强制 30 天 HMAC 链接，移除用户无关属性 | `tests/subscription-safety-api.py` |
| C02/C03/C04 | Canvas 延迟步骤持久化，Demo Advance 到期恢复；按用户检查重入；Update User 先更新后发信 | `tests/canvas-runtime-api.py` |
| C07（部分） | Canvas 消息节点在执行时复查可达、Email 全局状态和所选组状态 | API 回归；频控及抑制名单尚未接通 |

仍需按后续阶段实施：Canvas 多实例列表和发布版本、完整 Entry Rules 与真实事件驱动、更多分支节点、偏好中心草稿/线上版本隔离、订阅组时间序列和列表对齐、跨模块完整验收。签名链接的生成入口仍依赖当前演示项目的整体访问控制，尚无生产级后台身份与权限校验。当前仍为**本地模拟执行**，不能用于真实渠道投递或生产订阅合规系统。

## 一、结论与建议顺序

当前项目已具备较完整的本地演示基础：SQLite 持久化、独立渠道编辑器、Canvas 图编辑、订阅组成员管理、偏好中心搭建器、邮件编译及日志联动均已存在。下一阶段的重点应是**让配置真正决定执行结果，再补齐与 Braze 一致的页面流程**。

本轮确认的主要问题：

1. Canvas 的 Delay、User Update、禁止重入配置没有相应运行效果；运行固定选择前 10 名可达且订阅的用户，一次请求立即走完整条路径。
2. 邮件选择订阅组后，组内状态替代了全局状态。隔离测试中，全局退订用户仍被估算为可达并产生本地 delivered 事件；归档组也仍可发送。
3. 订阅组 PATCH 存在实际错误：只提交归档状态会返回 400，无法完成界面提供的归档操作。
4. 偏好中心已有页面搭建能力，但缺少独立的全局退订动作、可用的邮件 Liquid 引用、草稿与线上版本隔离；公共读取接口还存在收件人校验缺口。
5. Canvas 列表、Entry Rules、多种分支节点、订阅组时间序列、偏好中心 Details/Launch 流程存在明显结构差异。

**推荐实施次序：订阅与公共链接正确性 → Canvas 运行基础 → Canvas 页面流程 → 订阅管理与偏好中心完善 → 跨模块验收。**

本方案默认继续建设可重复运行的本地 Braze 演示项目。真实邮件、SMS、Push、WhatsApp 投递，以及生产级部署能力，作为单独扩展范围估算。

## 二、检查方法与证据边界

| 标记 | 含义 | 本轮使用方式 |
| --- | --- | --- |
| 原版实测 | 用户已登录外部 Chrome 中的页面、弹窗和可见配置 | Canvas 列表、Onboarding flow、Audience Paths 配置、订阅组列表和创建弹窗、偏好中心列表和新建页、订阅页脚设置 |
| 本地实测 | 当前项目的浏览器页面、本地 API、隔离 SQLite 查询 | Canvas 与订阅组页面；归档、发送资格、公共链接、偏好提交与 Canvas 运行探测 |
| 代码确认 | 当前工作区实际路由和调用链 | 使用中的 LiveCanvas、专用订阅组件、邮件编译与 store；包含工作区尚未提交的改动 |
| 文档规则 | 当天读取的 Braze 官方说明 | 原版无法提交验证的分支、订阅、偏好中心规则 |
| 方案建议 | 根据以上证据提出的设计 | 本文的新模型、接口、任务拆分和工期均属于建议 |

本地服务使用 Node 22.22.3、Next.js 16.3.5，绑定 `127.0.0.1:3100`；数据库独立设置为 `/private/tmp/braze-gap-audit-20261018.sqlite`。探测只修改该隔离库，邮件和 Push 均为本地模拟事件。

原版 Canvas 为 View Only，Subscription Pages and Footers 的三个开关不可编辑。只查看了订阅组创建弹窗和偏好中心新建页，没有提交原版新增、保存、归档或发布操作。不能把这些页面的可访问性解释为拥有全部编辑权限。

本轮没有进行统一视口的截图差异测量，也没有验证原版真实投递及转化归因，因此不输出视觉完成百分比或“已达到 1:1”的结论。完整复现记录见[检查证据与复现步骤](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/braze-gap-audit-evidence-2026-10-18.md>)。

### 历史结论需要更新的地方

- 2026-09-16 的“Canvas 没有连线、保存和执行路径”已不适用于当前代码。当前确实已有拖动、连线、复制、删除、缩放、撤销重做、草稿恢复、图校验和运行记录。
- 2026-09-26 增加的 Entry 重入、转化字段和 Open in full editor 已存在，但本轮确认部分配置还未被执行器消费。
- 2026-10-17 邮件偏好修复涉及的页脚编译、用户预览、MIME、链接追踪、Bot 过滤及离开保护，当前已有相应代码；本轮不把它们重新列为“完全未实现”。此前的全部验证结果没有在本轮重新执行。
- 历史订阅文档称原版偏好中心页面出现异常；本轮原版已正常加载空列表和新建详情页，这条限制已过时。
- `dashboard.tsx` 已将多个业务模块分发到专用组件，不能继续笼统地称“所有二级菜单都是通用列表”。

## 三、原版与项目的当前能力对照

| 模块 | 本轮看到的 Braze 结构 | 当前项目 | 判断 |
| --- | --- | --- | --- |
| Canvas 列表 | 状态、标签、搜索、Filters、Columns、排序、行操作、分页、Create Canvas | Canvas 入口直接打开固定画布 | 列表层缺失 |
| Canvas 详情 | 名称、说明、Send Settings、Conversion Events、Entry Rules、画布、View Analytics | 图编辑与执行记录在同一页 | 页面流程明显简化 |
| Canvas 分支 | 原版示例包含 50/50 Experiment、多组 Audience Paths、带窗口的 Action Paths | 一种固定二出口属性判断 branch；入口按钮标为 Audience Paths | 名称与语义不一致 |
| Canvas 执行 | 原版显示重入、退出、发送控制及转化配置 | 可保存图、校验、记录轨迹；无等待任务和事件驱动推进 | 基础模拟可用，运行能力不足 |
| 订阅组列表 | Timeseries、日期范围、今日统计；Name/Channel/ID/Description/Status；排序和分页 | 搜索、渠道、状态、成员数与更新时间；无时间序列和 ID 列 | 需重新对齐页面结构 |
| 订阅组创建 | 专门的 Create email subscription group，Name/Description；提示其他渠道另有接入流程 | 一个弹窗自由创建 Email/SMS/WhatsApp | 与原版渠道边界不同 |
| 偏好中心列表 | Name/Description/Type/Status/Last Edited/Created by | 名称、组、状态、更新时间 | 列表信息不完整 |
| 偏好中心新建 | Details、Name、Description、Liquid、API ID、Page Previews、Launch Editor、Save as draft、Launch | 列表直接进入自建搭建器，状态下拉与 Save | 缺少详情和发布阶段 |
| 页脚/订阅结果页 | 三个独立配置区；当前账号 View only | 已有配置、编译、预览、订阅结果页链路 | 延续已有成果，补状态和引用语义 |

## 四、Canvas 优化方案

### 4.1 差距清单

| ID / 优先级 | 已确认差距 | 影响与优化要求 | 证据 |
| --- | --- | --- | --- |
| C01 / P1 | 服务端固定 `canvas_local_main`，API 没有 Canvas ID；入口直接进画布 | 无法管理多个独立旅程。增加列表、创建、详情、复制、归档与独立 URL | 原版实测、代码 |
| C02 / P1 | Delay 只参与数值校验，执行器立即走下一节点 | 24 小时延迟后立即生成消息，轨迹时间完全相同。必须持久化等待状态并在到期后恢复 | 本地实测 |
| C03 / P1 | 重入配置已保存，运行器不读取；转化截止字段也无运行消费 | 连续两次运行均进入 10 人。增加用户旅程实例、重入窗口、退出条件和转化事件记录 | 本地实测、代码 |
| C04 / P1 | Update 节点没有属性编辑表单，执行器也不执行更新 | 路径显示经过 Update，用户档案却不变。接通属性、全局订阅及组状态更新，并先提交再推进 | 本地实测、代码 |
| C05 / P1 | Audience Paths 按钮实际新增 entry；Action Paths 是国家等属性相等判断，出口靠数组顺序区分 | 容易新增第二个入口并触发校验错误，无法表达原版多组分流和事件窗口。拆分节点类型、使用明确出口 ID | 原版实测、代码 |
| C06 / P1 | 完整编辑器创建独立 Campaign；linkedCampaignId 仅写前端历史后跳转；运行器使用节点 message | 编辑器内容与 Canvas 发送可能不一致，刷新可能丢失关联。以共享消息文档和版本建立唯一内容来源，跳转前保存 | 代码确认，往返流程待专项回归 |
| C07 / P1 | Canvas 固定选前 10 个已订阅且可达用户；没有按消息渠道复核组状态、归档组、抑制和频控 | 不能模拟真实目标受众，且与 Campaign 规则不同。统一入口受众与每次消息发送资格计算 | 代码确认 |
| C08 / P2 | 缺少实验节点、独立 Review/Test、发布版本和 Canvas 专属分析 | 不能演示新手引导、流失召回、路径实验的完整工作流 | 原版实测、代码 |
| C09 / P2 | 图仅以 `[from,to]` 存边；直线无出口名；无统一未保存保护、适配全图和结构化问题列表 | 删除重连可能改变判断结果；复杂图可读性和编辑恢复不足。增加端口、分支名称、自动布局/适配和定位错误 | 代码确认 |

原版 Audience Paths 的配置面板已经实测到多组排序、Everyone Else、Segments、Filters、排除组、User Lookup 和退出选项。原版 Action Paths 按行为及评估窗口分流，不能用即时属性判断代替；Decision Split 才是独立的二路决策组件。[Audience Paths 官方说明](https://www.braze.com/docs/user_guide/messaging/canvas/canvas_components/audience_paths)、[Action Paths 官方说明](https://www.braze.com/docs/user_guide/messaging/canvas/canvas_components/action_paths)、[Canvas 组件说明](https://www.braze.com/docs/user_guide/messaging/canvas/canvas_components)。

### 4.2 页面与交互设计

建议采用四层结构，保留已完成的图编辑操作：

1. **Canvas 列表**：默认状态筛选、标签、搜索、排序、列设置、分页、行菜单；筛选与页码写入 URL。列表显示真实资源状态。
2. **Canvas 配置**：Details → Entry Schedule → Target Audience → Send Settings / Conversion / Exit → Build → Review。布局和具体入口以原版可访问状态继续核对。
3. **Canvas 编辑器**：上方摘要、Entry Rules、节点工具区、画布、右侧配置抽屉、固定底栏。区分入口、节点和路径；节点配置错误可定位。
4. **Canvas 分析**：进入、等待、退出、完成、发送、抑制及转化；可按版本、时间、节点、路径筛选，查看单用户轨迹。

建议本地路由：`/engagement/canvas`、`/engagement/canvas/:id`、`/engagement/canvas/:id/analytics`。原版 URL 中的 workspace 与本地 Canvas ID 应明确区分，避免旧链接全部映射到同一画布。

### 4.3 节点能力分批交付

| 节点 | 第一批应具备的行为 | 下一批 |
| --- | --- | --- |
| Entry | 受众快照、定时或手动模拟入口、重入资格、退出规则 | 事件/API 入口、入口属性上下文 |
| Message | Email/Push/SMS/IAM，共享渠道编辑器；发送时复核资格 | 更多渠道、变体、多语言与频控精细化 |
| Delay | 相对时长、持久化到期时间、模拟时钟推进 | 指定日期、用户时区、截止和跨时区边界 |
| Decision Split | 是/否条件，带稳定的 Yes/No 出口 | 嵌套筛选表达式 |
| Audience Paths | 有序多组条件、首个匹配、Everyone Else | 分群引用更新和复合排除 |
| Action Paths | 事件窗口、首个命中或截止时按优先级判断、兜底路径 | 多事件属性和更完整事件上下文 |
| Experiment Paths | 比例分配、稳定分桶、明确对照路径 | 胜出路径与自动优化 |
| User Update | 更新用户属性、Email 全局状态、组成员状态；写审计 | 事件/购买更新等更广泛能力 |

Context、Agent、Audience Sync、Send to Destination 等高级组件可另列后续清单，第一阶段无需为追求菜单数量提前铺开。[官方组件目录](https://www.braze.com/docs/user_guide/messaging/canvas/canvas_components)。

### 4.4 执行模型

建议新增或拆分以下实体，替代“一次 POST 同步遍历完整图”：

| 实体 | 关键字段与作用 |
| --- | --- |
| `canvases` | ID、名称、状态、标签、当前草稿版本、当前发布版本 |
| `canvas_versions` | 不可变图快照、入口配置、发送规则、转化和退出配置 |
| `canvas_instances` | Canvas/版本/用户、进入批次、当前节点、状态、上下文、下一次执行时间 |
| `canvas_jobs` | 到期时间、状态、重试次数、租约、幂等键 |
| `canvas_step_events` | 进入/等待/分流/更新/发送/退出，节点与出口、事件来源、时间、原因 |
| `message_documents` | 渠道内容和版本，Campaign 与 Canvas 均引用同一内容模型 |

推荐运行流程：入口检查 → 创建实例 → 执行当前节点 → 写入节点事件 → 等待任务或下一节点 → 消息资格检查 → 编译 → 记录本地结果 → 推进或退出。

- **Delay**：只写 `dueAt` 和 waiting，未到期不发送。Demo Lab 的 Advance time 应调用同一个到期任务处理器。
- **User Update**：数据库事务提交完成后才推进；下一条消息重新读取订阅状态。该顺序也符合 Braze 对订阅更新步骤的说明。[User Update 官方说明](https://www.braze.com/docs/user_guide/messaging/canvas/canvas_components/user_update)。
- **重试与幂等**：重试同一任务不会重复发送或更新；有意创建的新入口批次按重入规则处理。不能把“所有第二次运行都禁止”当成正确实现。
- **版本**：执行中的实例绑定发布版本；编辑草稿不影响既有实例。发布前必须基于相同版本校验与审核。
- **时钟**：保存与任务执行统一使用可注入时钟，区分模拟时间和真实事件到达时间。

本地阶段可用 SQLite 队列表和手动推进任务；持续运行的 Worker、托管队列和多实例租约属于后续部署方案。

## 五、订阅管理优化方案

### 5.1 先明确四类不同能力

| 能力 | 管理对象 | 主要入口 |
| --- | --- | --- |
| Email 全局订阅 | 一个用户是否允许接收该工作区邮件，以及明确 opt-in 状态 | 用户档案、订阅链接、API、Canvas 更新 |
| Subscription Groups | 某个渠道/用途下的独立组状态 | Audience → Subscription Group Management |
| Email Preference Centers | 用户选择邮件类别的托管页面 | Audience → Email Preference Centers |
| Subscription Pages and Footers | 工作区页脚和订阅动作的结果页面 | Settings → Email Preferences |

它们需要共享状态变更服务，但不能共享一个无差别的 boolean。Email 具有 opted-in/subscribed/unsubscribed 三态；SMS、WhatsApp、LINE 则有各自的订阅组与发送资源约束。[跨渠道订阅组规则](https://www.braze.com/docs/user_guide/audience/subscription_preferences/subscription_groups)。

### 5.2 订阅组与发送资格差距

| ID / 优先级 | 差距 | 优化要求 | 证据 |
| --- | --- | --- | --- |
| S01 / P1 | 选组时只看组成员状态，不再看 Email 全局订阅 | 根据渠道、全局模式、组条件共同计算；预估、测试和发布共用服务 | API 实测：全局退订仍 delivered=1 |
| S02 / P1 | 归档仅改 status；估算和发布不检查组是否 Active、是否与渠道一致 | 服务端拦截无效、归档和跨渠道组；归档前展示引用关系，已运行消息也重新检查 | API 实测：归档后仍 delivered=1 |
| S03 / P1 | PATCH 将未提交字段构造成 undefined，再覆盖现有值并传入 SQLite | 仅合并显式提交字段；归档、改名、改说明分别测试；返回业务错误而非 SQLite 参数错误 | 实测只 PATCH status 返回 400 |
| S04 / P1 | `users.subscribed` 只有 boolean，无法区分 opted-in 和 subscribed | 迁移为渠道独立状态；历史 true 映射 subscribed，不能推断为明确 opted-in；兼容旧接口 | 代码确认 |
| S05 / P2 | 同一个弹窗可以创建三种渠道组，缺少 LINE 和发送资源关联 | Email 独立创建；其他渠道通过接入或明确标注的模拟接入生成，维护发送号码/渠道引用 | 原版创建弹窗实测、代码 |
| S06 / P2 | 列表缺少 Timeseries、ID 复制、排序与分页；结果数写成 Subscribers；成员页固定前 20 条 | 对齐原版结构，补图表/日期/今日计算；修正数量文案，接通成员分页和 URL | 本地 UI、原版 UI、代码 |
| S07 / P2 | 单组当前状态与通用审计已有，但缺少便于查询的订阅变更明细和每日快照 | 存 before/after、来源、操作者、时间、组/全局范围，供趋势、用户档案、活动归因消费 | 代码确认 |

Braze 的归档组不可用于发送，且归档涉及活动、Canvas、Segment 的引用。项目应优先建立引用检查和发送拦截；本地提供的重新激活能力也应复核引用与权限，不能只翻转状态。[官方归档规则](https://www.braze.com/docs/user_guide/audience/subscription_preferences/subscription_groups#archive-subscription-groups)。

### 5.3 统一资格计算规则

建议提供 `evaluateMessageEligibility(context)`，返回是否可发送和明确原因。Campaign、Canvas、Audience Estimate、测试预览使用同一规则定义；列表中的“组订阅人数”继续表示组成员数，不应被改成最终可发送人数。

| 场景 | 建议行为 |
| --- | --- |
| Email 普通营销、未选组 | subscribed 或 opted-in，再检查地址有效性、受众、抑制、控制组、频控和时段 |
| Email 普通营销、选定组 | 全局状态满足要求，且所选 Active Email 组为 subscribed |
| Email 仅 opted-in | 全局状态必须是 opted-in；有组条件时继续检查组 |
| Email 显式选择包含退订用户 | 保留 Braze 的 all 目标模式；明确记录该选择，不由组状态意外触发；组筛选和其他发送约束独立处理 |
| SMS/WhatsApp/LINE | 检查本渠道组、发送资源及成员状态；不能使用 Email 全局 boolean 或通用 all 选项绕过 |
| 归档/不存在/跨渠道组 | 阻止发布；执行中的步骤产生可解释的跳过原因，不生成 delivered |
| 用户等待期间退订 | 入场资格不代表稍后发送资格；消息执行时再次读取最新状态 |

Braze 的 Email 目标模式包含默认订阅者、仅 opted-in 和包含退订用户三种；项目应完整表达选择，而不是用一个 boolean 加一个组替代状态模型。[Email 订阅与目标选择](https://www.braze.com/docs/user_guide/channels/email/subscriptions#subscriptions-and-campaign-targeting)。

资格结果建议区分：`global_unsubscribed`、`not_opted_in`、`group_unsubscribed`、`group_archived`、`channel_mismatch`、`address_invalid`、`suppression_list`、`control_group`、`frequency_capped`、`quiet_hours_waiting`。

当前估算尚不完整覆盖发布时的抑制、频控和控制组。产品上应明确展示“匹配人数 / 订阅可达人数 / 预计发送人数”，避免统一叫 Reachable 导致误解。最终投递结果以执行时检查为准。

## 六、Email Preference Centers 与订阅页脚优化

### 6.1 差距清单

| ID / 优先级 | 差距 | 优化方案 | 证据 |
| --- | --- | --- | --- |
| P01 / P1 | 全部退订复选框只取消当前展示组；服务端没有全局退订动作，缺少独立底部全局退订入口 | 区分“当前展示组全部取消”和“全局退订”；后者走专门原子操作并保留明确入口 | UI/代码；组全部取消后全局状态仍为 true |
| P02 / P1 | 邮件运行上下文没有生成偏好中心 Liquid 对应的收件人链接，也未实现单组退订专用 tag | 补中心发布标识、Liquid 解析、消息上下文与组范围链接；Campaign/Canvas 使用相同解析服务 | 代码确认 |
| P03 / P1 | 公共 GET 未提供 token 也返回完整用户对象；token 为公开 ID 的无密钥固定哈希 | 公共读写统一强制校验不可伪造的收件人凭据，最小化返回字段；预览和真实修改凭据隔离 | 本地 GET 无 token 实测 200 |
| P04 / P1 | Active 中心每次 Save 直接覆盖线上内容，虽有版本记录但没有独立 draft/published 指针和冲突校验 | 保存草稿与发布分离，线上只读取发布快照；检查 expectedVersion，支持查看历史与恢复为新草稿 | 代码确认 |
| P05 / P2 | 列表直接打开自建搭建器，缺少 Details、Liquid/API ID、单独发布确认；名称规则较宽松 | 对齐原版“详情→编辑→预览→保存草稿/发布”，发布后稳定引用名称；增加类型与创建人列 | 原版实测、代码 |
| P06 / P2 | 搭建器只有单层 blocks；确认页主要是文案配置，预览写死示例姓名；错误样式可自定义 | 增加 rows/cells、独立确认页、明确的布局预览状态；原版不可验证的编辑细节标记待核验 | 代码、官方文档 |

原版拖拽偏好中心使用 rows/blocks，支持独立 Confirmation Page；块内“全部取消”与底部全局退订具有不同作用。发布后可复制 Liquid；编辑器预览和 Send Test 不具备真实保存订阅的能力。项目应保留单独的本地收件人调试入口，避免将其当成 Braze 的 Send Test。[拖拽偏好中心官方说明](https://www.braze.com/docs/user_guide/audience/subscription_preferences/preference_center/dnd_preference_center)。

公共链接缺口当前仅在本地合成数据中复现；若应用将被共享或部署公网，P03 应升级为发布阻断项。后台接口的身份与工作区隔离也应在该部署阶段统一接入。

### 6.2 建议的产品流程

**后台流程**：中心列表 → Details（名称、描述、类型、API ID、发布 Liquid）→ Launch Editor → 配置订阅组和样式 → 编辑 Confirmation Page → Preview → Done → Save as draft / Launch → 复制 Liquid。

**用户流程**：打开消息中按收件人生成的链接 → 校验凭据和发布版本 → 显示用户当前偏好 → 调整组或选择全局退订 → 原子保存 → 确认页 → 用户档案和发送资格立即读取新状态。

需要明确处理以下状态：中心未发布、被归档、链接无效、收件人不匹配、组被归档、网络失败、重复提交、配置版本变化。失败时保留选择并允许重试，不能显示成功。

建议底部提供独立“退订全部邮件”动作；块内复选框文案为“取消当前展示的所有类别”。对于重新订阅，区分恢复组状态、恢复全局 subscribed 和明确 opted-in，不把三者隐式合并。

### 6.3 与 Subscription Pages and Footers 的衔接

保留当前三卡结构以及已完成的页脚渲染和自定义结果页功能，补齐统一动作上下文：

| 链接/动作 | 更新范围 | 结果页面 |
| --- | --- | --- |
| 全局退订链接 | Email 全局状态 | 默认或自定义 unsubscribe 结果页 |
| 单组退订链接 | 指定 Email 组 | 显示退订的类别，并提供偏好中心入口 |
| 偏好中心 Liquid | 用户选定的组或明确全局动作 | 中心的 Confirmation Page |
| opt-in 确认链接 | 明确的 Email opted-in 状态 | 默认或自定义 opt-in 结果页 |

当前 `prepareEmailMessage` 已生成全局退订/订阅 token；建议扩展其 action、scope、channel、group、recipient、message context，复用有效期与状态处理，而非再创建第三套订阅实现。

还应单独复核单组退订 tag、List-Unsubscribe 的组范围与目标组是否一致、测试与正式上下文的链接行为。Braze 工作区邮件设置描述了全局或指定组的退订头范围；其文档也带有时间相关说明，实施时应按最新规则及账号配置验证。[Email Preferences 官方说明](https://www.braze.com/docs/user_guide/administer/global/workspace_settings/email_preferences)。

## 七、相邻模块的定向优化

| ID / 优先级 | 当前需要处理的连接 | 方案 |
| --- | --- | --- |
| X01 / P1 | Campaign 与 Canvas 的资格判断、内容来源和消息事件不一致 | 共享消息文档、资格服务和发送记录接口；同一个用户、同一组条件必须得出一致结论 |
| X02 / P2 | 报表已有事件聚合，但缺少旅程等待/退出、订阅来源、版本与路径分析 | 订阅变更事件与消息事件分开记录，按消息上下文关联；不要把后台/API 改订阅计作某邮件链接的退订 |
| X03 / P2 | 历史覆盖文档混合“已增加字段”“已生效”“原版验收” | 为每项登记页面、保存、运行、联动、参考证据和最后验证时间；更新过时审计结论 |

已有 Segments、Catalogs、IAM、SMS、WhatsApp、LINE 编辑器本轮仅做连接与路由检查，没有逐屏审计。后续重点核对它们在 Canvas 中能否复用；不据此宣称这些模块全部通过或全部缺失。

## 八、技术实施安排

### 8.1 代码调整边界

| 当前文件/区域 | 建议职责 |
| --- | --- |
| `app/ui/live-canvas.tsx` | 保留图操作，拆出列表、配置、Inspector、运行轨迹；增加 Canvas ID 和离开保护 |
| `lib/canvas-model.ts` | 节点类型判别联合、稳定端口、分支条件、入口/退出规则、版本化校验 |
| `app/api/canvas/route.ts` | 从单例入口迁移到集合接口；补 ID、版本、发布、测试与运行查询接口 |
| `app/ui/subscription-group-workspace.tsx` | 拆分组列表/详情和中心列表/详情/编辑器；补分页、趋势、独立发布 |
| `lib/preference-center-model.ts` | 增加 rows/cells、确认页和动作类型，兼容已有 blocks 数据 |
| `lib/braze-store.ts` | 先修 PATCH 和发送资格，再按 Canvas、订阅、消息、报表拆服务，避免一次性大重构 |
| `lib/email-editor-model.ts` / `lib/email-runtime.ts` | 集中处理中心与组范围链接、不同发送上下文，不在 UI 中拼接可修改订阅的 URL |

以上路径为实施责任范围；当前可点击代码证据见附录。新增文件名称与接口属于建议，不代表已经存在。

### 8.2 API 建议

| 领域 | 建议接口/约定 |
| --- | --- |
| Canvas 集合 | `GET/POST /api/canvas`：查询、筛选、分页与创建独立 Canvas |
| Canvas 草稿 | `GET/PATCH /api/canvas/:id`：含版本和预期版本校验 |
| Canvas 动作 | `POST /api/canvas/:id/validate`、`/publish`、`/test`、`/stop` |
| Canvas 观察 | `GET /api/canvas/:id/runs`、`/instances`、`/analytics` |
| 订阅更新 | 内部统一 `changeSubscription` 服务；界面、API、导入、Canvas 复用 |
| 订阅趋势 | `GET /api/subscription-groups/:id/timeseries`，今日计算单独受控触发 |
| 中心发布 | 草稿 PATCH 与 `POST /api/preference-centers/:id/publish` 分离 |
| 公共订阅提交 | 已校验凭据 + 明确 action/scope + 幂等标识；只允许操作中心允许的组 |

按当前安装的 Next.js 本地指南实施：Route Handlers 放在 `app/**/route.ts`；动态参数按 Promise 读取；依赖 `node:sqlite` 的处理器保留 Node runtime；不假设 GET 自动缓存。订阅和公共用户数据还应明确禁止共享缓存。

### 8.3 数据迁移与兼容

- 给 Canvas 图增加 schemaVersion；原 branch 迁移为 Decision Split，原 entry 保持入口，迁移时固定原有 Yes/No 对应关系。
- 现有单例图迁移为一个独立 Canvas，不丢弃当前草稿或运行历史。
- 旧 boolean true → Email subscribed，false → unsubscribed；无法追溯明确 opt-in 的历史记录保留未知来源。
- 已有偏好中心 blocks 迁移为单行/单列结构；现有 Active 配置建立首个 publishedVersion，后续保存产生草稿。
- 通用 `audit_log` 和已有事件保留，增加结构化订阅事件供查询；迁移使用事务和版本号，避免每次读取都执行补数据逻辑。
- 已发消息中的旧链接兼容期单独设计；不因发布新版本让全部历史链接失效。

## 九、优先级、工作量与里程碑

估算假设：一位熟悉项目的全栈工程师，沿用当前 React/Next.js/SQLite 和现有渠道编辑器；包含有针对性的自动验证，不含真实渠道接入、全部后台页面复刻或生产多租户改造。以下为初步人日区间，不是交付承诺。

| 阶段 | 内容 | 工作量 | 完成门槛 |
| --- | --- | --- | --- |
| M0 正确性修复 | S01–S04、P01/P03；共享资格判断的最小实现 | 3–5 人日 | 全局/组状态、归档、PATCH 和公共凭据的关键用例全部通过 |
| M1 Canvas 核心 | 独立实体/URL、节点语义、等待任务、重入、更新、消息编辑器往返 | 8–12 人日 | 两个 Canvas 独立；Delay 真等待；User Update 真更新；恢复和重试不重复发送 |
| M2 订阅产品流程 | 组列表/趋势/分页、中心详情与草稿发布、Liquid、确认页与块结构 | 6–9 人日 | Campaign/Canvas 的中心链接均能正确更新选定用户；预览与正式动作隔离 |
| M3 联动与验收 | 路径分析、订阅审计、视觉结构收敛、迁移回归与文档 | 4–6 人日 | 以下验收场景通过；受限原版状态保留待核验清单 |
| 合计 | 完成本方案定义的本地闭环 | 21–32 人日 | 单人顺序开发约 4–7 个工作周，按实际排期调整 |

若只做下一轮最小可交付版本，建议先交付 M0，并在 M1 中优先完成 Delay、User Update、消息内容往返。时间序列、多列搭建器和实验优化可后移；不应后移发送资格和公共凭据修复。

如要部署共享环境，再单独安排托管数据库、持续 Worker、后台认证/权限、工作区隔离和外部消息服务商。它们会改变执行和故障恢复设计，应另行估算。

## 十、验收场景

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| A01 | 创建 A/B 两个 Canvas，分别编辑、刷新、后退再进入 | 图、规则、名称和运行记录互不覆盖，URL 可恢复 |
| A02 | 添加 Audience Paths 和 Decision Split | 不新增第二个 entry；每个出口具有稳定名称和对应条件 |
| A03 | Delay 24h 后接 Message，推进模拟时钟 23h/24h | 23h 无消息，24h 只执行一次；重启后等待状态仍在 |
| A04 | 禁止重入后重复提交相同入口事件；再测试允许 1 天后重入 | 同一事件幂等；未到窗口不重入，到窗口后新事件可进入 |
| A05 | User Update 退订某组，后接该组 SMS/Email 消息 | 更新先持久化；后续消息按新状态跳过，并记录原因 |
| A06 | 从 Canvas 打开完整编辑器，改主题/正文并返回、刷新、运行 | 展示和编译使用同一个已保存内容版本，不回退旧正文 |
| A07 | 普通营销 Email：全局退订但组已订阅 | 估算和运行均排除；显式 all 模式按独立配置验证 |
| A08 | 配置归档组、跨渠道组或不存在的组；运行中再归档 | 发布给出错误；既有任务执行时不生成 delivered |
| A09 | 单独 PATCH status/name/description | 正确更新字段，未提交字段不变；失败不部分写入 |
| A10 | 在偏好中心只取消一个组 | 只更新该组，其他组和全局状态不变 |
| A11 | 使用独立全局退订入口 | 全局退订生效，结果页明确；普通营销与后续 Canvas 均读取新状态 |
| A12 | 邮件插入中心 Liquid 与单组退订 tag；分别预览、测试和模拟正式发送 | 链接按上下文生成；预览不写订阅；正式动作只影响正确用户和范围 |
| A13 | 无凭据、伪造、过期、错用户链接；重复提交 | 不泄露用户档案，不修改订阅；有效重复操作不产生重复业务效果 |
| A14 | Active 中心保存新草稿，再发布；并发编辑同一版本 | 发布前线上不变；发布后使用新快照；旧版本提交返回冲突 |
| A15 | 筛选订阅组趋势与日期，计算今日统计；翻成员列表 | 读取真实快照和事件，缺数据保持空态；成员可访问全部分页 |
| A16 | 查询 Campaign/Canvas、用户档案、日志和报表 | 同一消息/节点/版本可关联；退订、频控、对照和等待不误算失败或投递 |

视觉验收应另建 1440×900 基线，补 1280×800、1920×1080 与窄屏检查；保留导航、列表、弹窗和节点配置区域。账号权限不同导致的按钮禁用、工作区名、试用天数与示例数据不直接记为视觉缺陷。

## 十一、代码证据索引

| 编号 | 当前实现证据 |
| --- | --- |
| E01 | [Canvas 节点与图校验](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/lib/canvas-model.ts:1>) |
| E02 | [Canvas 页面、载入和交互](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/app/ui/live-canvas.tsx:11>)；[打开完整编辑器](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/app/ui/live-canvas.tsx:119>) |
| E03 | [Canvas API](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/app/api/canvas/route.ts:1>)；[单例、保存和运行器](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/lib/braze-store.ts:816>) |
| E04 | [受众估算](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/lib/braze-store.ts:333>)；[Campaign 发布与资格判断](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/lib/braze-store.ts:585>) |
| E05 | [订阅组与成员操作](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/lib/braze-store.ts:413>)；[PATCH 入参构造](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/app/api/subscription-groups/[id]/route.ts:10>) |
| E06 | [中心配置与版本](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/lib/braze-store.ts:479>)；[公共读取、token 和提交](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/lib/braze-store.ts:509>) |
| E07 | [组与中心后台组件](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/app/ui/subscription-group-workspace.tsx:18>)；[公共偏好页](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/app/ui/preference-center-public.tsx:12>) |
| E08 | [邮件编译上下文](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/lib/braze-store.ts:1223>)；[Liquid 解析](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/lib/email-editor-model.ts:261>) |
| E09 | [实际模块分发](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/app/ui/dashboard.tsx:279>)；[当前四项 Canvas 测试](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/tests/canvas-model.test.mjs:1>) |

本轮四项 Canvas 图校验测试通过，只覆盖图结构，不证明任务调度、重入、订阅资格或真实发送正确。发现的运行缺口应成为新增回归场景，而不是由已有测试通过推断已完成。

## 十二、本轮交互修复状态

以下是针对后续反馈的本地演示交互修复，不等同于上表 M1–M3 或 Braze 全量能力已经交付。

| 交互问题 | 本轮处理 |
| --- | --- |
| 新建订阅组后未进入详情 | 创建结果直接进入详情；筛选结果刷新也不会使新建详情突然消失 |
| 成员列表只能看前 20 人 | 接入已有的服务端 `start/limit`，显示总数与上一页/下一页 |
| 偏好中心 Active 保存立即影响线上 | 草稿版本与已发布快照分离；显式发布才更新公共页面；草稿不提供分享链接 |
| 偏好中心预览与线上不一致 | 对齐设计颜色、宽度、字体、组控件和独立全局退订区；仍标记为示例选择，不写真实用户状态 |
| Canvas 完整编辑器往返丢失关联 | 打开前保存关联 ID；已关联消息从 Campaign 读取最新内容；提供解绑操作 |
| Canvas `subscribed` 误输入可退订 | 编辑器限定 true/false；图校验和执行器再次拒绝其他值 |
| Canvas 路径 Yes/No 不可见 | 检查器和连线显示路径对应目标，可交换两条路径 |
| Canvas 等待任务不可观察 | 运行记录显示下次到期时间，可在演示中推进一天并刷新执行轨迹；进行中的用户不会重复进入 |
| 离开未保存编辑、归档和全局退订误操作 | Canvas 与中心增加离开提醒；归档与全局退订增加确认 |

已在独立 SQLite 数据库上通过订阅安全和 Canvas 运行 API 回归，并通过 TypeScript 与 Canvas 图单测。仍待按前述里程碑实施：多 Canvas 独立实体、完整多渠道节点语义、生产调度与权限、真实渠道投递、趋势统计以及与 Braze 的视觉细节一致性。
