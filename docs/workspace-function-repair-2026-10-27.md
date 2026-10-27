# Braze 工作区功能修复记录（2026-10-27）

## 交付状态

本轮移除了 `ModuleWorkspace`、`DomainConfiguration` 和原来的通用资源占位页，并替换了共用模板、共用报表及共用设置入口。补齐了本地持久化、服务端校验、编辑冲突检查、发布、提交、执行记录与部分跨模块联动。

**这次交付仍不等于完整还原 Braze，也不代表 1:1 验收通过。** 本地已实现的流程、外部连接配置和仍然缺失的能力分别在下文列明。

## 已验证的功能

| 范围 | 本轮实现 |
|---|---|
| Feature Flags | 不可变 ID、有序人群规则、稳定百分比分流、自定义属性、用户资格检查；Campaign 实验覆盖及停止后恢复全局规则；REST / SDK 返回相同结果 |
| Landing Pages | 创建、编辑、HTML 预览、显式发布快照、独立公开页面；草稿修改不会直接改变已发布 HTML |
| Surveys | 文本、评分、单选、多选；必填与选项服务端校验；响应入库及邮件订阅同意记录 |
| Email 模板 | HTML / Plain text / Beefree 编辑入口、设计 JSON 与 HTML 保存、编辑与归档；应用后创建对应 Campaign 草稿 |
| IAM / Webhook 模板 | 使用对应的专用编辑器；保留结构化配置并应用到对应渠道 |
| Push / Banner / Canvas / Link 模板 | 专属字段或图数据、编辑、预览、导出与应用；Canvas 应用前校验图结构 |
| Content Blocks | 创建、编辑、预览、Liquid 引用复制、归档；邮件编译读取当前有效内容 |
| Promotion Codes | 邮件编译时按名单和用户分配；不同用户获得不同码，重复发送复用原分配，耗尽会导致对应邮件失败 |
| CSV Import | 引号、逗号、换行及 BOM 解析；列数、重复 ID、空 ID 校验；预览后批量创建或更新档案 |
| 手动 Ingestion | 校验输入行，真正更新用户档案或记录事件；重复同步更新已有用户；记录同步历史 |
| Data Transformation | 字段路径映射、测试预览、应用到标准字段或自定义属性；记录转换历史 |
| Products / Custom Events | 购买事件与自定义事件分别记录；产品及事件可阻止后续追踪；记录供收入报表及用户事件日志读取 |
| Reports | 自定义事件统计不再读取消息事件；收入按币种计算实际购买金额；转化读取实际 conversion 事件；渠道过滤、日期过滤、分组、CSV 导出与报表保存 |
| Dashboard Builder | 保存仪表盘、添加和移除报表组件，按保存的日期和渠道计算指标 |
| Performance Overview | 使用实际记录的 session_start 事件计算活跃和会话指标，提供 App 与日期选择 |
| Campaign / Canvas 治理 | 当前内容快照审批；未审批版本无法上线，修改内容后原审批失效；工作区限速接入 Campaign / Canvas；频控正确匹配渠道 |
| Multichannel | 同时发送模式会创建并执行所选渠道草稿；继承父活动受众、排期与 holdout；重复上线同一 Active 父活动不会重复执行 |
| LINE | Text / Image / Flex / Carousel 校验及结构化、个性化 payload 编译；图片消息无需虚构文本 body |
| API Keys | 服务端生成、只展示一次原始密钥、仅保存 SHA-256 哈希；权限检查、脱敏列表和撤销立即生效 |
| Workspace SDK | 应用标识校验；属性、会话和事件记录；Feature Flags、Banners、Geofences 下发；可选或必需的用户 HMAC 认证 |
| 记录与导出 | Message Activity / Event User Log、事件详情、导出快照下载及 Exports Log；Currents / Data Sharing 下载实际选定数据 |
| Settings | 应用、平台、会话、认证、地理围栏、Push 配置、Locale、Banner Placement、内部测试组、审批与限速的独立字段和持久化 |

## 验证证据

- `npm run build`：通过；TypeScript 检查通过。
- `node --experimental-transform-types --test tests/*.test.mjs`：112/112 通过。
- `tests/workspace-api.py`：42/42 检查通过。
- `tests/workspace-interactions.py`：7/7 流程通过；1280×800、1920×1080 的 14 次页面检查无横向溢出。
- 最终生产巡检：80/80 页面和 13/13 Campaign 渠道可打开；0 个通用占位入口、0 个 HTTP 错误页面、0 个浏览器错误页面、1440×900 下 0 个横向溢出页面。结果见 [runtime-summary.json](audits/workspace-repair-2026-10-27/runtime-summary.json) 和 [逐页原始记录](audits/workspace-repair-2026-10-27/runtime-results.json)。404 检查以 HTTP 状态与错误页标题为准，资源 ID 中的数字 404 不计为错误。

全部 API 与浏览器测试使用 `/private/tmp/braze-workspace-final-20261027.sqlite`，未修改用户原有 `.data/braze-local.sqlite`。中途开发缓存因磁盘写入失败发生 Turbopack panic；已删除本项目的可生成 `.next` 目录、重新构建，并改用生产服务完成最终验收。

可复查的记录：

- [模型测试汇总](audits/workspace-repair-2026-10-27/unit-results.json)
- [API 检查结果](audits/workspace-repair-2026-10-27/api-results.json)
- [浏览器交互结果](audits/workspace-repair-2026-10-27/interaction-results.json)
- [补充视口结果](audits/workspace-repair-2026-10-27/responsive-results.json)
- [Feature Flags 操作截图](audits/workspace-repair-2026-10-27/ui-feature-flag.png)
- [Landing Page 发布及提交截图](audits/workspace-repair-2026-10-27/ui-landing-publish-submit.png)
- [模板应用截图](audits/workspace-repair-2026-10-27/ui-template-campaign.png)
- [CSV 导入截图](audits/workspace-repair-2026-10-27/ui-csv-import.png)

## 尚未完整实现的能力

| 项目 | 当前边界 / 所需后续工作 |
|---|---|
| 全量视觉及权限状态 | 尚未取得全部页面同账号、同权限、同数据、同视口的成对截图。参考账号 Feature Flags 为付费介绍页，App Settings 与 Approval Workflow 为只读。不能据此证明付费编辑页或全权限状态已经 1:1 |
| Beefree | 保留用户选定的 Beefree；外部编辑器启动需要有效凭证。其 UI 与 Braze 原生编辑器不同，本轮未验证外部授权和真实在线编辑服务 |
| 外部消息投递 | Email、Push、SMS、WhatsApp、LINE 仍使用本地执行和编译记录；未对各真实供应商实现完整连接、发送、回执、重试和退订回调。Webhook 延续现有可选白名单外联能力 |
| Warehouse / Currents / Data Sharing | 当前是手动 source rows 与下载快照；尚未实现 Snowflake / BigQuery 等连接器、常驻同步任务及外部事件流传输 |
| Transformation | 当前支持安全的字段映射；尚未还原任意 JavaScript 转换编辑器和完整 Webhook 接入生命周期 |
| AI Decisioning / Agents | 当前支持配置及调用显式配置的远端模型、保存响应；尚未实现 Braze 的优化引擎、自动执行 Canvas 决策和 Catalog 写回 |
| 公司用户与权限 | 用户、角色和权限是本地配置记录；尚未接入登录、邀请邮件、SSO / SCIM，以及基于已认证身份的完整权限执行 |
| 高级 Audience / Canvas | Segment 仍为平面 AND 条件及有限操作符；Canvas 仍只运行已有基础节点，未覆盖 Braze 全部节点、高级事件分支和完整生产调度 |
| 高级分析与查询 | Query Builder 仍为结构化事件查询；未还原 Snowflake SQL、全量归因、复杂漏斗、LTV 和全部下载/共享权限状态 |
| 多渠道延迟 fallback | 同时发送已实现；按“未打开”触发的后台延迟 fallback 尚未完成，界面不再把该选项当作可立即执行的规则 |
| Locations / Push | 可保存配置并下发地理围栏；未接入真实设备坐标、地图与围栏事件，也未验证 APNs / FCM 凭证有效性 |
| Billing | 展示真实本地用量；没有外部账单系统、合同、发票或付款操作 |
| Braze SDK 兼容 | `/api/sdk` 是本项目的工作区协议，不承诺可以直接替代 Braze 官方 SDK 服务端协议 |

这些项目仍需开发或真实外部环境验证，因此本次任务不能标记为“全部功能完整还原”。

## 实现位置

- 页面与表单：`app/ui/workspace-pages.tsx`、`module-manager.tsx`、`data-workspaces.tsx`、`analytics-workspace.tsx`、`template-workspace.tsx`。
- 字段与规则：`lib/workspace-modules.ts`、`reporting-model.ts`、`csv.ts`、`line-model.ts`。
- 动作与权限：`lib/workspace-service.ts`、`integration-auth.ts`、`braze-store.ts`。
- API：`app/api/workspace/`、`integration/`、`sdk/`、`pages/`。
- 公开页面：`app/pages/[slug]/page.tsx`。

## 参考

- [Braze Feature Flags 创建与多规则分流](https://www.braze.com/docs/developer_guide/feature_flags/create)
- [Braze Approvals](https://www.braze.com/docs/user_guide/messaging/governance/approvals)
- [Braze Cloud Data Ingestion](https://www.braze.com/docs/user_guide/data/unification/cloud_ingestion)
- [Braze User Management](https://www.braze.com/docs/user_guide/administer/global/user_management/manage_company_users)
- [修复前逐页审计](braze-full-page-fidelity-audit-2026-10-27.md)

## 80 个导航页面的当前覆盖

本表记录最终构建的页面可用性及功能范围。所有行均未标记为完整 1:1 验收通过。

| 页面 | 浏览器 | 当前功能范围 |
|---|---|---|
| Canvas (`canvas`) | HTTP 200 | 现有专用列表、向导和基础节点运行；高级节点与生产调度仍有缺口。 |
| Campaigns (`campaigns`) | HTTP 200 | 13 个渠道入口、五步配置及持久化；本轮增强多渠道、Feature Flag、LINE 和治理联动。 |
| Segments (`segments`) | HTTP 200 | 修复属性选择及估算/发送条件一致性；仍是平面 AND 和有限操作符。 |
| Getting Started (`getting-started`) | HTTP 200 | 清单完成状态持久化，可导航到对应工作区。 |
| Performance Overview (`performance`) | HTTP 200 | 读取真实会话事件，提供 App、日期及活跃指标。 |
| AI Decisioning (`ai-decisioning`) | HTTP 200 | 保存优化配置并调用配置的远端模型；不是 Braze 优化引擎。 |
| Agent Console (`agents`) | HTTP 200 | 改为可导航的业务工作区，不再显示无业务含义的通用 Create 表单。 |
| Messaging (`messaging`) | HTTP 200 | 改为可导航的业务工作区，不再显示无业务含义的通用 Create 表单。 |
| Audience (`audience`) | HTTP 200 | 改为可导航的业务工作区，不再显示无业务含义的通用 Create 表单。 |
| Content (`content`) | HTTP 200 | 改为可导航的业务工作区，不再显示无业务含义的通用 Create 表单。 |
| Analytics (`analytics`) | HTTP 200 | 改为可导航的业务工作区，不再显示无业务含义的通用 Create 表单。 |
| Partner Integrations (`partners`) | HTTP 200 | 改为可导航的业务工作区，不再显示无业务含义的通用 Create 表单。 |
| Data Settings (`data`) | HTTP 200 | 改为可导航的业务工作区，不再显示无业务含义的通用 Create 表单。 |
| Settings (`settings`) | HTTP 200 | 改为可导航的业务工作区，不再显示无业务含义的通用 Create 表单。 |
| Feature Flags (`feature-flags`) | HTTP 200 | 有序规则、稳定分流、用户资格及实验/SDK 联动。 |
| Landing Pages (`landing-pages`) | HTTP 200 | 创建、编辑、预览、发布快照、公开访问与提交。 |
| Surveys (`surveys`) | HTTP 200 | 问题配置、必填/选项校验、响应记录；高级分析未覆盖。 |
| Banners (`banners`) | HTTP 200 | 保存内容与 Placement，SDK 返回有效 Banner；真实设备投递未接入。 |
| Content Calendar (`content-calendar`) | HTTP 200 | 按已保存发送日期展示 Campaign 日历和列表，支持筛选与导出。 |
| Messaging Diagnostics (`messaging-diagnostics`) | HTTP 200 | 实际事件计数、检索、失败与延期详情和导出。 |
| Segment Extensions (`segment-extensions`) | HTTP 200 | 保留基础筛选与持久化；不等于完整时间聚合 Segment Extensions。 |
| Global Control Group (`global-control-group`) | HTTP 200 | 保留现有专用配置、分组与排除逻辑。 |
| Suppression Lists (`suppression-lists`) | HTTP 200 | 保留邮件/域名条目与发送排除逻辑。 |
| Subscription Group Management (`subscription-group-management`) | HTTP 200 | 保留专用列表、渠道分组、成员与订阅状态管理。 |
| Email Preference Centers (`email-preference-centers`) | HTTP 200 | 保留现有编辑、发布及公开订阅表单。 |
| Search Users (`search-users`) | HTTP 200 | 保留档案检索与订阅管理；未覆盖全部原站详情页签。 |
| Manage Audience (`manage-audience`) | HTTP 200 | 档案 JSON 编辑、标准/自定义字段更新与导出。 |
| Import Users (`import-users`) | HTTP 200 | CSV 完整引用解析、验证、预览、创建/更新及导入历史。 |
| Locations (`locations`) | HTTP 200 | 保存地理围栏并由 SDK 下发；真实围栏事件和地图未接入。 |
| Media Library (`media-library`) | HTTP 200 | 保留本地图片上传、引用与删除；未覆盖完整素材管理。 |
| Banner Templates (`banner-templates`) | HTTP 200 | 已接入该类型的专属字段/编辑器，支持保存、编辑、应用与归档；完整原站状态未验收。 |
| Canvas Templates (`canvas-templates`) | HTTP 200 | 已接入该类型的专属字段/编辑器，支持保存、编辑、应用与归档；完整原站状态未验收。 |
| Content Blocks (`content-blocks`) | HTTP 200 | 可编辑和归档的 HTML/Liquid 内容、预览与引用。 |
| Email Link Templates (`email-link-templates`) | HTTP 200 | 已接入该类型的专属字段/编辑器，支持保存、编辑、应用与归档；完整原站状态未验收。 |
| Email Templates (`email-templates`) | HTTP 200 | 已接入该类型的专属字段/编辑器，支持保存、编辑、应用与归档；完整原站状态未验收。 |
| In-App Message Templates (`in-app-message-templates`) | HTTP 200 | 已接入该类型的专属字段/编辑器，支持保存、编辑、应用与归档；完整原站状态未验收。 |
| Webhook Templates (`webhook-templates`) | HTTP 200 | 已接入该类型的专属字段/编辑器，支持保存、编辑、应用与归档；完整原站状态未验收。 |
| Promotion Codes (`promotion-codes`) | HTTP 200 | 保留生成列表，新增按用户唯一分配与重复发送复用。 |
| Catalogs (`catalogs`) | HTTP 200 | 保留现有专用 Items、Selections、预览与编辑流程；完整 1:1 尚未验收。 |
| Brand Guidelines (`brand-guidelines`) | HTTP 200 | 保留风格配置；与全部编辑器的字段映射仍需完整核验。 |
| Report Builder (`report-builder`) | HTTP 200 | 日期、渠道、活动、分组和指标选择；保存并复用报表定义。 |
| Custom Events Report (`custom-events-report`) | HTTP 200 | 统计真实用户自定义事件，与消息事件分离。 |
| Global Control Group Report (`global-control-group-report`) | HTTP 200 | 读取实际分组人数与投递对照。 |
| Query Builder (`query-builder`) | HTTP 200 | 修复查询数据上限和保存配置恢复；仍为结构化查询，未实现 SQL。 |
| Engagement Reports (`engagement-reports`) | HTTP 200 | 实际投递、打开、点击及独立用户指标，支持筛选和分组。 |
| Revenue Report (`revenue-report`) | HTTP 200 | 按币种统计真实购买事件，未用点击数虚构收入。 |
| Segment Insights (`segment-insights`) | HTTP 200 | 读取已保存 Segment 的服务端人群估算。 |
| Dashboard Builder (`dashboard-builder`) | HTTP 200 | 仪表盘与报表组件的创建、持久化、计算和移除。 |
| Email Performance (`email-performance`) | HTTP 200 | Email 专属事件筛选、打开与点击指标、保存和导出。 |
| Push Performance (`push-performance`) | HTTP 200 | Push 专属发送、到达、打开和失败指标。 |
| SMS/MMS/RCS Performance (`sms-mms-rcs-performance`) | HTTP 200 | SMS 专属事件与点击指标；供应商成本与真实回执尚未接入。 |
| Conversions (`conversions`) | HTTP 200 | 实际 conversion 事件、去重转化用户与转化率。 |
| Technology Partners (`technology-partners`) | HTTP 200 | 独立目录和连接配置、服务端凭证存在性检查；未验证真实供应商连接。 |
| Currents (`currents`) | HTTP 200 | 事件选择、实际数据快照下载、导出记录；未实现外部流传输。 |
| Data Sharing (`data-sharing`) | HTTP 200 | 数据集选择、实际快照下载；未开通外部 Warehouse Share。 |
| Solutions Partners (`solutions-partners`) | HTTP 200 | 提供官方伙伴目录入口，未复刻目录完整内容。 |
| Custom Attributes (`custom-attributes`) | HTTP 200 | 保留实际用户属性类型与覆盖统计；完整 Schema 管理未覆盖。 |
| Custom Events (`custom-events`) | HTTP 200 | 真实自定义事件管理、记录和后续追踪阻止。 |
| Products (`products`) | HTTP 200 | 商品定义、购买追踪控制及真实购买事件记录。 |
| Cloud Data Ingestion (`cloud-data-ingestion`) | HTTP 200 | 手动输入数据校验、同步与历史；无常驻外部连接器。 |
| Data Transformation (`data-transformation`) | HTTP 200 | 映射、预览、应用与历史；不是任意 JavaScript 转换引擎。 |
| App Settings (`app-settings`) | HTTP 200 | 独立 App 配置、标识、会话/围栏/认证字段；实时 SDK 版本等未覆盖。 |
| APIs and Identifiers (`apis-and-identifiers`) | HTTP 200 | 真实 scoped key、单次展示、哈希、撤销、REST / SDK 端点。 |
| Message Activity Log (`message-activity-log`) | HTTP 200 | 实际消息事件详情、搜索、分类与导出。 |
| Event User Log (`event-user-log`) | HTTP 200 | 用户维度消息、自定义事件和购买记录。 |
| Internal Groups (`internal-groups`) | HTTP 200 | 内部测试组的渠道、邮箱列表、编辑和归档；全编辑器联动仍需补齐。 |
| Exports Log (`exports-log`) | HTTP 200 | 创建、查看及下载真实数据快照。 |
| Tag Management (`tag-management`) | HTTP 200 | 保留现有标签体系、层级及资源联动。 |
| Email Preferences (`email-preferences`) | HTTP 200 | 保留现有六页签与版本化配置；未完成所有权限态 1:1。 |
| Frequency Capping Rules (`frequency-capping-rules`) | HTTP 200 | 修复渠道匹配并接入 Canvas 消息步骤；完整频控规则类型未覆盖。 |
| Push Settings (`push-settings`) | HTTP 200 | 独立平台配置及凭证状态；未建立真实 APNs / FCM 连接。 |
| Approval Workflow (`approval-workflow`) | HTTP 200 | 内容快照、请求、批准/拒绝和发送检查；认证身份权限需接入。 |
| Localization Settings (`localization-settings`) | HTTP 200 | Locale 配置持久化；全部编辑器的语言来源联动未完成。 |
| Banner Placements (`banner-placements`) | HTTP 200 | 独立 Placement ID、平台与展示参数，供 Banner 配置选择。 |
| Messaging Rate Limits (`messaging-rate-limits`) | HTTP 200 | 真实工作区限速与延期记录；完整后台延期队列仍未实现。 |
| Billing (`billing`) | HTTP 200 | 真实本地用量与明确的空订阅/发票状态，无外部财务操作。 |
| User Management (`user-management`) | HTTP 200 | 用户/角色/权限配置记录；无登录、邀请或完整身份权限执行。 |
| Canvas Step Agents (`canvas-step-agents`) | HTTP 200 | 配置、远端模型响应和运行记录；未自动执行 Canvas 动作。 |
| Data Agents (`data-agents`) | HTTP 200 | 配置及远端响应记录；未实现完整数据分析 Agent。 |
| Catalog Agents (`catalog-agents`) | HTTP 200 | 配置及远端响应记录；未实现 Catalog 自动写回。 |
