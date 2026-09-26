# 非 Email 渠道与模块复核（2026-09-17）

这份清单区分两类证据：**Chrome 实测**表示在用户已登录的真实 Braze 页面读取了当前账号可见结构；**代码核查**表示检查本地 Next.js 工程，不能据此声称与 Braze 视觉一致。当前只逐屏实测了 Email 和一个已有的 Push 草稿，其余渠道尚缺真实页面截图。创建菜单的 13 个入口均可打开本地草稿，但入口可用不等于功能完成。下表记录首轮审计发现；文末的“后续修正”记录本轮实现与验证，避免把历史缺口误认为仍未处理。

## Campaign 渠道

| 渠道 / 入口 | 证据 | 当前本地状态 | 主要缺口 |
|---|---|---|---|
| Email | Chrome 实测 + 本地 UI | 五步流程、发送信息、HTML/拖拽编辑和变体可保存 | 拖拽行网格、完整工具栏、真实 Liquid 渲染、邮件测试细节和逐像素验收未完成 |
| Push notification | Chrome 实测 + 本地 UI | 已补真实页面的双平台预览、Compose/Settings/Test、内容、交互、素材与发送选项结构；修改写入活动配置 | 与真实设备渲染、凭证状态、语言管理、平台差异、媒体库和发送测试仍不同 |
| In-app message | 代码核查 | 布局、文本、按钮、触发方式和频控开关可编辑并保存 | 无真实 SDK 展示规则、视觉编辑器、设备预览及会话执行 |
| Content Card | 代码核查 | 卡片类型、类别、文本、图片 URL、点击、置顶和过期字段可保存 | 无真实卡片设计器、媒体库、同步/移除状态及曝光统计 |
| Banner | 代码核查 | Placement、优先级、文本、按钮和目的地址可保存，含简化预览 | 未读取已注册 Placement；尺寸、样式和优先级效果未接入执行 |
| SMS/MMS/RCS | 代码核查 | 类型、订阅组、号码、文本、媒体 URL 和退订选项可保存 | 分段数只是本地估算；无运营商规则、媒体渲染、真实 RCS 卡片与回执 |
| Webhook | 代码核查 + 浏览器回归 | 变体、模板、POST/GET/PUT/DELETE、结构化 Headers、JSON/Raw Text、Liquid、多语言、用户预览、受控真实测试/投递、状态码重试和 attempt 日志 | 外联默认关闭且要求主机白名单；同步 Route Handler 适合本地演示，尚未替换为 Braze 规模的队列 Worker；未做真实 Braze 页面逐像素验收 |
| WhatsApp | 代码核查 | 模板、语言、媒体、参数文本和按钮 URL 可保存 | 模板状态为本地示例；无实际账号/模板同步、参数校验及渠道预览 |
| LINE | 代码核查 | 消息类型、账号、正文、图片和动作 URL 可保存 | 无真实账号配置、Flex 编辑器、身份映射与回调 |
| Multichannel | 代码核查 | 渠道勾选与规则可保存 | 无各渠道独立内容、真实 fallback 调度与跨渠道去重 |
| Create with Operator | 代码核查 | 确定性的建议文案可保存 | 输入目标不会驱动真实规划；未形成可编辑的多渠道方案 |
| Feature flag experiment | 代码核查 | flag key、rollout、值和转化配置可保存 | 无独立实验流程、稳定曝光状态、SDK flag 评估与归因 |
| API campaign | 代码核查 | 标识、事件描述与外部归因开关可保存 | 无外部事件接收/标识匹配，仍共用普通 Campaign 的发布模拟 |

真实 Push 草稿的 Compose 包含：凭证缺失提示、iOS/Android 预览、Device/Notification State、Compose/Settings/Test 标签、Notification type、Language、Title/Message/Android summary、Interactions、Action buttons、三类 Assets、Push destination 与 Android delivery priority。本地此前只有平台按钮、标题、正文、链接、图片和声音，且多个控件没有持久化。本轮已针对这些可见结构和字段修正，但没有据此将 Push 标为 1:1 验收通过。

## 其他功能模块

| 模块 | 已存在的功能 | 确认的问题 | 当前判定 |
|---|---|---|---|
| Campaign 列表与全局框架 | 列表 URL 筛选、分页、复制、归档；侧栏与菜单 | 真实列表有行选择、Teams、编辑者/创建者等列；本地 Columns/Filters、顶部搜索、帮助/通知/账户多为无结果控件 | 部分实现 |
| Canvas | `LiveCanvas` 有基础拖动、点选连线、缩放、复制、删除、撤销重做和 SQLite 保存 | 保存每次新增资源，但刷新不加载保存的图；节点属性只有名称；连线验证只数边；执行是当前节点逐项标记，没有用户路径事件 | 原型 |
| Audience | Campaign 内有分群、国家筛选与可达人数计算 | Segments、用户搜索、订阅组、Suppression、Import 等二级页多用通用资源页，未改变真实用户/订阅数据 | 大部分占位 |
| Content / Catalogs | Catalogs 有独立 catalog/item SQLite CRUD；其他资源列表可创建 | Catalog 字段架构和导入导出不完整，未实际供个性化渲染；媒体、模板、内容块等仍是通用资源页 | Catalog 部分实现，其他原型 |
| Analytics | 共有消息事件驱动的指标与柱图；Message Activity Log 读取 SQLite | 多个报表入口共用一张 `LiveReportPage`；没有原版查询构建器、指标设置、报表定义、活动维度；图表数据与过滤口径仍简化 | 部分实现 |
| Demo Lab | reset 与 failure 会改 SQLite；本轮修正 reset 对 catalog_items 的清理 | advance 只更新种子活动而没有推进任务时钟；receipts 返回提示但不写新回执 | 部分操作空转 |
| Agent Console / Integrations / Data Settings / Settings | 菜单、按域区分的说明和 SQLite 资源行 | 大量二级页共用 `ModuleWorkspace`；连接测试、部分 Save/Export 只 toast，不能形成对应配置或审计记录 | 大部分占位 |
| 执行服务 | Campaign 发布写执行快照、消息事件和审计日志；受众、订阅、国家排除与控制组参与本地计算 | 没有独立 Worker、排期队列、重启恢复、渠道专属适配器或真实触发；不同渠道仍走同一即时发送循环 | 简化模拟 |
| 路由与质量保障 | Campaign 深链接和列表查询参数可恢复；Next 构建可通过 | 多数二级页没有真实原版路径/详情页；无 Playwright 用例、截图基线、像素差异报告 | 未验收 |

当前开发版保留了两个未接入路由的旧组件 `CanvasPage` 和 `CollectionPage`。评估当前 UI 应查看 `PageContent` 实际分派到的 `LiveCanvas`、`LiveReportPage` 和 `ModuleWorkspace`，以免把死代码误作当前实现。Vercel 的 SQLite 在临时目录，不能作为持久演示数据源；本地 `.data/braze-local.sqlite` 可持久化。

## 后续修正与实测（2026-09-17）

- Canvas 现使用固定草稿 ID 保存图，不再每次创建新资源；刷新恢复图、配置和最近 8 次执行。保存失败和并发版本冲突会明确显示。
- 节点 Inspector 支持 Message 渠道/正文、Delay 时长和 Action Path 条件；发布检查单一入口、连接有效性、可达性、分支数、配置必填和环路。执行对 10 个合成用户逐节点记录路径，消息节点写入本地活动事件。它仍不是 Braze Canvas 的完整节点系统，也没有真实调度 Worker。
- Performance Overview 路由修正为实际报表页；Canvas 投递进入活动日志与汇总报表，报表柱图按日期范围读取 Campaign 与 Canvas 执行快照。
- Demo Lab 的 Generate delivery receipts 会生成打开/点击事件并记录已处理投递，重复操作不重复计数；Advance demo clock 改为持久化本地时钟，并明确它不会调度任务。重置会清理 Canvas 执行、回执和时钟。
- Search Users 现是独立页面，查询 SQLite 中的合成用户，支持 URL 查询、分页、档案字段和订阅状态修改。修改订阅会重新计算 Campaign 使用的可达人数；本地 UI 实测从 840 变为 839，恢复订阅后回到 840。
- 本地 UI 实测：Canvas 发布后 10 人进入、10 条模拟消息；刷新仍可查询路径；回执生成 8 条事件后报表显示 Delivered 10、Opened 5、Clicked 3；重复生成 0 条。未连线 Action Path 被发布校验阻止。

本轮没有新增真实 Braze Canvas 参考截图，因此以上是功能补齐，不代表视觉 1:1 验收。多数二级页复用通用列表、渠道适配器、独立 Worker、Playwright 截图基线和 Vercel 持久数据库仍未完成。

下一轮最有价值的验收是：在真实账号逐一打开现成的 IAM、Banner、WhatsApp、SMS 草稿和各主要二级页，记录字段/状态/截图；再依清单逐页修正并建立截图差异测试。没有实测的渠道不应声称 1:1 完成。

## Catalogs 真实页面对照与修正（2026-09-17）

- 已在外部 Chrome 检查当前账号的 Catalogs 列表、`Sample_Catalog` 详情、Preview 项目表、Selections 和 Settings。真实列表显示 `View only`、一条样例目录、来源、31 条项目、4KB 使用量；详情有 Preview / Selections / Settings 三个标签，Selections 存在 `Gaming`。样例数据依真实可见字段建立 SQLite 种子，页面现在有分开的列表和详情路由，不再将两者挤在同一屏。
- 本地 Preview 支持按项目 ID 搜索、字段过滤、分页和查看项目；Selections 能筛选名字并查看对应的六条 Gaming 项目；Settings 保留只读状态、通知规则及订阅区域；刷新或直接打开详情链接会恢复页面。另保留本地可创建目录与编辑项目的演示入口，实际账号的 `View only` 页面不显示该入口。
- 这些是已比对的页面结构和基本交互，**不代表 Catalogs 已 1:1 完成**。目录创建向导、CSV 导入、推荐算法、真实 Selection 编辑与权限、订阅规则和通知调度仍缺少实现；部分按钮仍只给出本地限制提示。尚未为目录页建立相同视口的逐像素截图基线。其他 Content 页面和大量二级模块仍有通用列表占位。

## Messaging 抽屉交互补查（2026-09-17）

- 外部 Chrome 中的真实 Braze `Messaging` 抽屉，在 `Campaigns` 下有独立的 `View by channel` 展开入口。本地此前只有带右箭头的 Campaigns 页面入口；已补齐可展开的渠道列表，选择后进入 Campaigns 并按渠道筛选，筛选写入 URL，刷新可恢复。
- 当前页再次点 Campaigns 原先会关闭抽屉但停留在同一页面，容易误以为点击无效；现在当前项有明确选中样式。`Messaging Diagnostics` 等页面的路由映射也已修正，二级页顶部的 Create 按钮会打开实际输入表单。
- 这次只修复导航行为与筛选。Feature Flags、Landing Pages、Surveys、Messaging Diagnostics 等目的页仍复用通用资源页，不能标记为 Braze 页面 1:1 完成。

## 邮件编辑器 1:1 重做与全站功能化（2026-09-26）

### Email 编辑器（本轮重做，交互级复刻）

- **数据模型**：新 `lib/email-editor-model.ts` 定义行→列→块三层结构（`EmailRow/EmailCell/EmailBlock`），旧扁平 `emailBlocks` 自动迁移为单列行；launch 校验与 Review 摘要读取新结构。
- **拖拽编辑器**（`app/ui/email-dnd-editor.tsx`）：块可跨行/列拖拽移动、上下移动、复制、删除；ROWS 面板插入 1–4 列真实行，列宽可调；每类块有完整属性面板（Button 链接/配色/圆角，Image 媒体库/alt/宽度，Social/Menu 逐项编辑等）；画布内富文本（粗/斜/下划线/删除线/链接/列表/对齐）；Undo/Redo（含 ⌘Z）与自动保存。
- **左栏真实化**：Link Management 列出并编辑全部链接；Languages 面板按语言维护块级翻译（回退英文）；Style Settings 含全局字体/链接色/内容区背景/宽度。
- **HTML/纯文本编辑器**：HTML 实时渲染（Liquid 已解析）+ Liquid 语法校验；新增纯文本编辑器入口。
- **模板库弹窗**：搜索 + 编辑器类型筛选 + 预览；工作区 Templates 页保存的模板自动进入画廊。
- **Personalization 选择器**：7 大类 Liquid token（含 custom attributes、catalog、content blocks、promotion codes、connected content）。
- **Sending Info**：From 改为已验证身份下拉；Advanced 增加 open/click tracking 与 Google Analytics UTM；Languages 支持分语言的 subject/preheader 翻译。
- **Preview & Test**：Random/Existing/Custom user 模式对全部渠道开放；邮件预览支持桌面/移动/深色模式；DnD 编辑器内的测试图标接入真实弹窗。
- **Compose 页**：移除死代码与写死的预览模板；补 Teams 字段；多 Variant A/B 百分比分配与超额校验。
- `tests/e2e_smoke.py` 已按新交互更新（验证身份下拉），全流程通过；新增 `tests/artifacts/email-dnd-editor.png`、`email-preview-test.png` 视觉基线。

### 环境修复（影响全站，非 Email 改动）

- `next.config.ts` 增加 `allowedDevOrigins: ["127.0.0.1", "localhost"]`。此前 Next 16 将 127.0.0.1 的 dev 资源请求判为跨域并阻断，导致所有使用 `next/navigation` 的页面水合失败（页面可见但完全不可交互）。该问题先于本轮改动存在。

### 全站功能化（"每个控件可点击"）

- `/api/resources` 新增 PATCH（带 expectedUpdatedAt 并发检查）与 DELETE。
- 新 `app/ui/module-workspaces.tsx` 替换通用占位页：Segments/Segment Extensions（筛选构建器+真实用户估算）、Media Library（上传/复制/删除）、Templates（各渠道 CRUD）、Content Blocks、Promotion Codes（批量生成）、Brand Guidelines、Report Builder（指标+范围+保存）、Query Builder（事件流过滤+保存查询）、APIs and Identifiers（密钥生成）、Frequency Capping（开关+规则 CRUD）、Tag Management、Suppression Lists、Import Users（CSV 解析入库）、Locations（按国家聚合可达率）；Settings 域 7 个页面改为持久化表单。
- **跨页打通**：自建 Segment 出现在 Campaign 受众下拉，且 `/api/audience/estimate` 真正应用其筛选条件；Media Library 图片进入拖拽编辑器媒体选择器；Templates 页邮件模板进入编辑器画廊。
- **全局控件**：⌘K 工作区搜索（活动+页面，键盘导航）、通知下拉（读取活动流）、头像菜单、Take a tour 导览、Campaign 列表 Columns 选择器（localStorage 记忆）与 Filters 弹层（渠道/标签/状态）、Message Activity Log 筛选、GCG 百分比可编辑保存、Schedule 静默时段时间选择、Target 用户查找真实查询。
- 通用 `ModuleWorkspace` 列表补齐：创建含描述、行内编辑、归档删除。

### 仍未完成（不代表本轮验收范围）

- 视觉层面未与真实 Braze 对应页做逐像素比对（无新参考截图）；拖拽编辑器的块属性编辑（逐键）不进入 Undo 历史；多语言邮件正文渲染仍按回退逻辑模拟；Catalogs CSV 导入、Selection 编辑器、真实调度 Worker、渠道专属回执等维持原状。
