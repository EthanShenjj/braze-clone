# Braze 复刻缺口审计

审计日期：2026-09-16  
审计方法：检查本地工程的路由、状态模型、页面组件和可执行交互。未把“菜单可以打开”计入页面完成。当前外部 Braze 浏览器会话不可读取，因此视觉差异只记录已从代码确认的缺口；后续需补充逐屏截图对比。

## 结论

当前项目是可运行的 Braze 风格交互原型，尚不是“全后台 1:1 复刻”。唯一做过专门页面结构收敛的是 **Email Campaign 的 Compose Messages**。其余大多数功能要么是通用列表壳，要么是静态预览或 toast 提示，不能作为实际复刻验收通过。

| 验收域 | 当前状态 | 说明 |
|---|---|---|
| 全局框架 | 部分实现 | 有侧栏、抽屉、试用条、标签和 Operator 面板；搜索、帮助、通知、账户、工作区切换没有真实菜单或结果。 |
| Campaign 列表 | 部分实现 | 有本地搜索、状态筛选、名称/编辑时间排序、编辑和停止；无 URL 同步、分页、列配置、标签过滤、批量操作、复制、归档、详情和真实更多操作菜单。 |
| Email Campaign | 部分实现 | Compose 已有专用信息结构；排期、受众、转化和审核仍是通用简化表单。无拖拽编辑器、真实 HTML 渲染、内容块、发送测试记录和校验错误状态。 |
| 其他 12 个创建入口 | 未复刻 | 创建菜单存在，但 Push、IAM、Content Card、Banner、SMS、Webhook、WhatsApp、LINE、Multichannel、Operator、Feature flag experiment、API campaign 都进入同一套通用 Compose 表单。 |
| Canvas | 原型 | 只有按顺序摆放的节点按钮；没有连线、拖拽、缩放、平移、复制、删除、撤销重做、节点类型配置、图校验、版本与模拟执行。 |
| Messaging / Audience / Content / Analytics / Settings 等 | 占位 | 大部分二级菜单统一进入 `CollectionPage`，显示三条内存行和通用 Create/Filter/Columns 控件。 |
| 数据与模拟执行 | 未实现 | 只有 Campaign 存进浏览器 localStorage。没有 SQLite、Prisma、Route Handlers、Worker、用户/事件/订阅/模板/日志数据，以及发布后的执行链路。 |
| 报表与跨模块联动 | 未实现 | 报表数值与柱状图固定，Demo Lab 只显示提示，不会改变日志、受众或报表。 |
| 自动化与视觉验收 | 未实现 | 没有 Vitest、Playwright、参考截图、截图差异阈值或验收报告。 |

## 已确认的代码证据

1. 应用只有 [根页面](../app/page.tsx)，没有各业务路由、详情路由或 Route Handlers。页面状态由 `Dashboard` 内的 `page` 和 `editing` 控制，刷新后无法按 URL 回到具体模块或编辑步骤。
2. `Campaign` 仅保存名称、渠道、状态、排期、发送数、主题、正文、受众和转化；无法表示渠道配置、变体、条件、模板、版本、审计日志或执行快照。
3. 除 Campaign 外没有持久化实体。`CollectionPage` 的行数据是组件内 `useState`，离开页面即丢失。
4. `saveCampaign(..., true)` 直接把 `sent` 设为至少 `38,420`；没有受众过滤、频控、分桶、渲染、渠道回执或幂等任务。
5. `ReportPage` 的指标和图形写死；`DemoLab` 的四个操作只触发 toast。

## 按模块的复刻缺口

### 1. 全局导航与工作区

- 工作区切换目前只是折叠侧栏。
- 顶部搜索、帮助、通知、账号菜单、Quick links、页面标签关闭和试用 CTA 没有原版对应的结果页、菜单或状态。
- 二级导航抽屉中的图标、描述和入口是程序生成；没有按真实账号的权限、分组、禁用状态及外部跳转还原。
- 无 URL、前进后退和跨标签编辑状态恢复。

### 2. Campaigns

- 无真实 Campaign 详情、活动分析、诊断、版本记录、活动复制、归档、批量操作、列显示配置、分页和空状态。
- 创建菜单的 13 个入口只做到入口名称；特殊流程没有分别实现。
- 通用的 Schedule、Audience、Conversions、Review 没有按渠道显示字段和限制，也没有发布前的完整校验、回跳、未保存离开提示或冲突处理。
- 变体只记录当前选择的下标；多个变体不会保存独立内容，也没有删除、复制、实验分流或对照组。

### 3. 渠道编辑器

| 渠道 | 仍缺少的关键复刻内容 |
|---|---|
| Email | Drag-and-drop editor、真实模板/内容块选择、编辑器工具栏、Liquid 校验、预览设备切换、链接/退订配置、测试收件人和错误反馈。 |
| Push | iOS/Android/Web 专用字段、通知类别、图片、按钮、深链、声音、Payload 与平台高级配置。 |
| In-app message | 页面/布局类型、样式面板、展示与关闭行为、触发条件、设备预览。 |
| Content Card | 卡片类型、图片、分类、置顶、过期、键值对和点击行为。 |
| Banner | Placement、尺寸、优先级、内容和实际预览。 |
| SMS/MMS/RCS | 类型切换、号码、订阅组、编码与分段、媒体、短链、退订处理。 |
| Webhook | URL、Headers、鉴权、Body、变量预览、响应与失败模拟。 |
| WhatsApp / LINE | 模板/语言/参数/媒体/按钮、帐号/凭证限制、渠道特有预览。 |
| Multichannel / Operator / Feature / API | 各自的创建向导、配置、限制、审核与结果页面。 |

### 4. Canvas、Audience 与 Content

- Canvas 没有真实图模型或连线数据，无法配置 Audience Paths、分支、延迟、动作、消息节点或执行轨迹。
- Segments 只有一条固定条件；无嵌套条件、预估人数、保存、更新、导入或订阅影响。
- Search Users 只有搜索框；没有用户结果、档案、设备、事件或订阅状态。
- Media、模板、Catalogs、Promotion Codes、Brand Guidelines 等不保存资源，也不能被 Campaign 或 Canvas 引用。

### 5. Analytics、集成、数据与设置

- 所有 Analytics 报表缺少原版筛选、指标选择、查询编辑、保存视图、明细表及与活动事件的关联。
- Partner Integrations 没有可见连接配置、连接状态、日志、测试连接或权限状态。
- Data Settings 没有属性、事件、导入、Catalog、CDI 和 Transformation 的数据模型或配置页。
- Settings 没有各自的实际字段、保存范围、审计记录和权限控制；仅复用一个开关面板。

### 6. 数据、后端和质量保障

- 没有 SQLite 数据库、Prisma Schema、种子脚本、Node Worker 或持久任务恢复。
- 没有 1,000 个合成用户，或设备、事件、订阅、模板、素材、连接、优惠码和消息事件数据。
- 没有 Route Handler，因此 API、发布、预览、受众估算、连接测试和 Demo Lab 都不具备可检验的服务端结果。
- 只有三篇 Markdown 文档；缺少项目启动/初始化细节、逐页验收报告，以及按渠道拆分的时序图、字段映射、Payload 与失败案例。

## 修复顺序

1. **停止把通用占位页统计为已覆盖**：更新覆盖矩阵，以“未开始 / 原型 / 页面已还原 / 交互已还原 / 验收通过”记录每页。
2. **完成 Campaigns 纵向闭环**：先逐页复刻 Email 的五步流程、详情、测试、发布、日志与分析；再将同一数据模型用于 Push、IAM、SMS、Webhook 等渠道。
3. **建立数据底座**：加入 SQLite、Prisma、种子数据、Route Handlers 和本地 Worker，使保存、发布、回执、日志与报表共用一份状态。
4. **按真实页面拆分其余模块**：Canvas、Segments、Content 和 Analytics 先于通用二级菜单占位页。
5. **做视觉基线**：为真实账号可见页面保存 1440×900 参考截图，逐页跑截图对比与关键交互用例。

## 当前可作为已完成的最小验收项

- 本地开发服务器可运行。
- Campaign 列表可以创建、保存、编辑和停止本地 Campaign。
- Email 的 Compose 区域具备独立布局、字段、发送信息展开、HTML 文本编辑、模板选择和测试弹窗。
- 侧栏、抽屉、创建菜单和一组展示型页面可用于浏览原型。

这些项目不代表 Braze 的同等功能实现，也不应作为“全后台已完成”的依据。

## 2026-09-16 修复记录

以下项目已在本次审计后实现，本文前文中对应“未实现”的结论以此节为准：

- Campaign 已从浏览器 localStorage 迁移到 `.data/braze-local.sqlite`；新增 Campaign、资源、1,000 个合成用户、消息事件、执行快照与审计记录。
- 新增 Campaign、资源、测试、发布、报表、活动日志与 Demo Lab 的 Route Handlers。Campaign 发布会依据本地受众、订阅和可达性写入 delivered、opened、clicked、suppressed、unreachable 事件。
- 新增 `/engagement/campaigns/campaigns`、`/engagement/campaigns/:id` 等可直接打开的 App Router 路径，并支持 Campaign 深链接。
- Push、In-app message、Content Card、Banner、SMS/MMS/RCS、Webhook、WhatsApp、LINE、Multichannel、Operator、Feature flag experiment 和 API campaign 已拆分为各自的配置面板。
- Canvas 已具备节点添加、拖拽、连线、缩放、复制、删除、撤销重做、图校验、本地保存和执行路径展示。
- Message Activity Log、Performance Overview、Analytics 报表页和 Demo Lab 已读取同一份 SQLite 事件数据。
- 新增 Playwright 回归脚本与本地截图基线生成流程。当前运行环境缺少 Chromium，浏览器下载网络速度不足，故本次未能实际生成截图；构建和本地 API 闭环已验证。

仍需逐屏对照真实 Braze 完成视觉精修，并把其余二级模块从资源列表形式拆分成各自的原版页面结构。

## 2026-09-17 Campaign 复查

参考地址：用户指定的 `dashboard-09.braze.com/engagement/campaigns/6aaa7a57393fa100863f0327/...`。内置浏览器跳转到登录页；外部 Chrome 当前显示私有飞书文档，自动审批阻止读取。尚未取得该 Campaign 的逐屏截图，因此本节的修复仅以本地交互和已有参考为依据，**不计作视觉 1:1 验收通过**。

本轮确认并修复的本地问题：

| 项目 | 修复后行为 | 验证 |
|---|---|---|
| Campaign 步骤链接 | `?step=schedule` 可直接打开，切步更新 URL，浏览器历史可恢复步骤 | 本地浏览器直接打开排期页，点击下一步后 URL 变为 `?step=audience` |
| 页面标签 | 关闭编辑标签会返回 Campaign 列表 URL | 代码审查，待参考页核对具体标签行为 |
| Email 子编辑器保存 | 点击 Save 写入 SQLite；拖拽块结构和编辑器模式保存在 Campaign 配置中 | 保存标题块、刷新后仍显示同一内容 |
| Email 变体 | 每个变体分别保存正文、主题、编辑器类型和块 | 两个变体切换与刷新后分别显示各自标题 |
| 受众估算 | 读取合成用户、订阅及可达状态；国家筛选同时作用于发布执行 | All Users 为 840/1,000，US 筛选为 168/200 |
| 排期与审核 | 排期模式和字段可切换并保存；缺少主题等必要内容时阻止发布；重复发布不重复生成执行记录 | 本地 UI 查看字段切换和审核错误，构建通过 |

仍未通过的部分包括：目标 Braze 页面逐屏视觉对照、HTML 编辑器与发送信息的真实布局、完整字段与状态、所有渠道的独立表单、Canvas 和其他后台模块的逐页验收。历史审计中的缺口以实际代码与本节更新为准，不能用本轮修复推断全后台完成。

## 2026-09-17 Campaign 列表交互补充

- 列表状态、搜索、名称排序和分页与 `start`、`limit`、`globalFilter`、`columnFilters[status]`、`sortby`、`sortdir`、`display` 查询参数同步；刷新和浏览器历史可恢复。
- 行菜单可编辑、复制、停止与归档。复制创建独立 Draft 并打开编辑页；归档更新 SQLite，列表随即移除。菜单使用浮层避免被表格滚动容器裁切。
- 本地浏览器验证了带 `active` 状态的深链接、重置筛选后的 URL 与结果数，以及复制后打开编辑页和归档后结果数恢复。`npm run build` 通过。
- **视觉 1:1 仍未验收**：外部 Chrome 的 Braze Campaign 页尚未在可读取的前台显示；当前修改只解决已确认的本地交互缺口。
