# Braze Campaign 十渠道编辑复刻差异报告

检查日期：2026-10-28（Asia/Shanghai）  
对象：用户截图中的 Multichannel、Email、In-App Message、Push Notification、Banner、Content Card、SMS/MMS/RCS、Webhook、WhatsApp、LINE。  
结论：**不能认定这 10 个渠道已完整 1：1 复刻。所有渠道均发现功能、交互或公共编辑流程的缺口；原站视觉和租户实际状态的逐项对照尚未完成。**

## 1. 本报告的证据与边界

本轮完成的是“本地页面实测 + 当前实现代码核查 + Braze 官方文档能力对照”。公开文档用于确定产品能力，不能代替登录后的原站界面审查。

- 原站认证页面此前被浏览器安全策略阻止；本轮未重试、未通过其他浏览器、认证接口或间接请求绕过。没有取得本轮原站编辑器截图，因此字体、尺寸、图标、间距、字段顺序、弹窗、权限状态等均**未通过像素级对照验收**。
- 本地使用独立端口 3218、独立 SQLite 数据库及 10 个审查草稿。未启动 Campaign，未执行最终测试发送，未更改原站草稿，未部署。
- 页面实测从“打开已有草稿”开始；创建菜单与新建向导未完成全链路 UI 验证。
- 共保存 18 组页面截图/DOM，其中 **17 张截图接受为证据**。第 17 张截图出现导航时序问题，实际为 Compose，已明确排除；Review 的判断依据为同组 DOM 和代码。
- 审查期间工作区持续出现 Email 编辑器改动，主工作区构建产物也发生变化。页面截图与 12:51 左右冻结的代码副本不是统一构建，尤其不能把旧邮件页面当作最新拖拽编辑器的验证结果。
- 冻结时 Git HEAD 为 `6ba367e`，同时存在未提交改动。最新隔离副本构建未通过 TypeScript 检查，随后浏览器连接中断；最新拖拽版本的 UI 标记为**未验证**。构建问题是该副本的时点结果，不代表其他会话后续改动的最终状态。
- 本任务只新增审查文档和证据，不修改业务代码；其他会话产生的代码改动予以保留。

证据入口：[截图总览](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/audit-contact-sheet.png>)、[采集说明](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/capture-notes.md>)、[代码快照与 SHA-256](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/evidence-manifest.json>)、[模型测试结果](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/model-tests.txt>)、[校验探针](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/validation-probes.json>)、[隔离构建日志](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/snapshot-build.txt>)。

判定用语：

| 判定 | 含义 |
|---|---|
| 已确认缺口 | 本地 UI、冻结代码或执行结果能够直接证明 |
| 部分实现 | 存在可用能力，但范围、交互或数据行为仍不完整 |
| 未验证 | 原站、最新构建、账号权限、设备或供应商条件不足 |
| 环境/集成差异 | 本地演示、供应商连接、SDK、任务执行等；与编辑器外观分开记录 |

优先级：P1 为会影响正确配置、编辑结果、预览或发布判断的问题；P2 为能力覆盖、操作效率及完整体验差距。不凭截图估算完成百分比。

## 2. 十渠道结论总表

| 渠道 | 当前已有 | 已确认的主要差异 | 本轮判断 |
|---|---|---|---|
| Multichannel | 选渠道、关联草稿、简易内容、子 Campaign 编排 | 渠道集合错误；包含原生不支持的 IAM；缺专用编辑器切换；缺 Webhook / Content Card / LINE 等选项 | 核心架构有差异 |
| Email | HTML、拖拽、纯文本、模板、变体、Sending info、部分个性化和追踪 | HTML 模式切换/纯文本同步不完整；缺附件和 Inbox Vision；Operator 是固定生成逻辑；Review 简化；最新拖拽 UI 未验证 | 部分实现，不能通过 1：1 |
| In-App Message | 拖拽多页、传统编辑器五类、样式、表单、预览测试、专属调度 | 14 个目录模板仅 5 个带页面，9 个不可用；缺 Roku / Web modal with CSS 等入口；优先级管理只读；测试是本地记录 | 部分实现，有明确残缺 |
| Push Notification | iOS/Android 示意预览、标准/富推送、语言、媒体、少量设置 | 缺 Web/Kindle 平台和 Push Stories / Inline image 专用编辑；无变体编辑；语言和部分预览控件未连通 | 部分实现 |
| Banner | Placement、优先级、文案、按钮、URL、简单预览 | 缺拖拽/HTML/模板编辑器；调度暴露不支持的模式；默认优先级用 Normal 而非 Medium | 差距大 |
| Content Card | 三类卡片、图片 URL、点击动作、置顶、到期时间 | 缺完整卡片预览、变体、KVP；缺创建时机、移除事件和完整到期控制 | 差距大 |
| SMS/MMS/RCS | SMS 文本、变体、分段示意、订阅组、联系卡表单 | 当前入口未接 MMS/RCS；语言是假面板；联系卡未生成附件；测试手机号丢失；长度校验缺失 | 仅部分 SMS 能力接入 |
| Webhook | 变体、模板、HTTP、Headers、鉴权、JSON/Raw、个性化、测试配置 | A/B 分流未接公共流程；重试调度/限流语义不完整；真实投递需环境配置 | 编辑能力较多，仍非完整复刻 |
| WhatsApp | 模板/Response、变体、变量、媒体、订阅组、预览、校验 | Campaign 页面只提供 5 种 Response 布局；模板同步/审核是本地模拟；24h 窗口模拟；A/B 分流不完整 | 部分实现 |
| LINE | 最多五消息栈、文字/图片/Flex JSON/Carousel、排序、编译校验 | 缺 Braze 拖拽富消息编辑器、订阅组闭环、点击追踪设置、10 卡与多动作能力；无变体编辑 | 差距大 |

以上均未完成原站视觉逐项对照。Email/Webhook“能力较多”仅表示本地已有范围，不能理解为原站视觉或生产投递已接近通过。

## 3. Campaign 公共五步编辑流程

### 第 1 步：Compose Messages — 有结构，渠道专属能力不齐

健康状态：**部分实现，P1/P2 混合**。

已有名称、描述、Tag、Campaign ID 和多数渠道的 Teams 控件，也有保存及草稿自动保存逻辑。Tag 具有后端持久化，不能把它归为纯装饰。

问题：

1. 不同渠道接入深度不一致：有的使用独立编辑器，有的仅使用普通表单。不能通过相同的五步外框判断渠道编辑已对齐。
2. Teams 在公共表单中是固定三项；IAM 的 Campaign Details 没有同样的 Teams 字段。与真实工作区团队、角色权限的行为对应关系未完成。
3. 多处 AI 图标没有对应服务行为；“有图标”不能计作 AI 能力。
4. 变体创建、复制、命名、上限、渠道适用性与公共 A/B 流程没有统一实现。Braze 官方说明测试最多支持八个变体；本地多处添加操作未形成统一上限与发布校验。[官方 A/B 文档](https://www.braze.com/docs/user_guide/messaging/ab_testing/create_tests)

### 第 2 步：Schedule Delivery — IAM 专属实现较多，其他渠道复用简化表单

健康状态：**部分实现，P1**。

已有 Scheduled / Action-Based / API-Triggered、日期、时间、周期、本地时区、重入和 Quiet hours；IAM 已有独立调度界面、事件元数据和较丰富的触发条件，不能再笼统称其“没有事件配置”。

问题：

1. 非 IAM 的 Action-Based 只是有限事件类型和延迟，缺少完整事件名称、属性条件和触发窗口编辑。
2. Intelligent Timing 可以选择，但没有对应的用户最佳发送时间优化执行逻辑。
3. Banner 不应出现 Action-Based / API-Triggered，却复用了公共模式选择。
4. Frequency Capping 的提示文案固定为未创建规则，无法准确反映后台策略。
5. 调度表单保存与持续运行的生产调度器是两件事；目前通用 launch 主要围绕立即计算受众、生成本地事件，不足以证明时间调度已经复刻。

证据：[Banner 调度截图](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/14-banner-schedule.png>)。

### 第 3 步：Target Audiences — 基础受众可用，筛选器与实验分流有实质缺口

健康状态：**部分实现，P1**。

已有保存分群加载、基础估算、订阅状态、部分渠道订阅组、控制组、限量和限速。全局对照组及 Tag 排除参数已进入估算请求；本轮没有将它们误判为不存在，也未对 Tag 体系再次进行完整验收。

问题：

1. Segment 控件是单选；并非页面文案所说的多个 Segment 组合。
2. Additional Filters 仅有 Country；AND/OR 下拉只有默认值，无配置更新处理。
3. Add filter group 主要设置一个国家值，没有创建通用条件组；排除组也为简化国家排除。
4. User Lookup 只查询并展示用户基础信息，没有计算该用户是否满足当前 Segment、Filter、App 等组合条件，与页面说明不符。
5. 可编辑变体分流只读取 Email 和 IAM 的变体；SMS、Webhook、WhatsApp 的编辑器虽然能添加变体，受众步骤没有对应的分配 UI。
6. 分流校验仅提示超过 100% 的情形，低于 100% 的无效总和未被完整约束。校验函数探针中，两个变体各 5%、控制组 0%，没有返回问题。
7. “Optimize with BrazeAI”是文字标签，未找到实际自动优化配置/执行逻辑。
8. Suppression Lists 固定显示没有应用，而 Review 会读取后台真实资源数，存在展示与真实策略脱节的风险。
9. Email 的域名、IP Pool、Provider 表格使用固定演示值，不能作为实际发送配置确认。

证据：[受众截图](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/15-shared-audience.png>)、[完整 DOM](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/15-shared-audience.dom.txt>)。

### 第 4 步：Assign Conversions — 四事件外框已有，事件语义与锁定不完整

健康状态：**部分实现，P1**。

已有最多四个事件、主事件、期限及时间单位。

问题：

1. 选择 Performs Custom Event 后，没有自定义事件名称和属性条件的完整编辑。
2. App 列表固定为少量演示项。
3. 页面承诺发布后不可更改，但冻结的 Campaign upsert 与 PATCH 路径没有相应不可变校验；Canvas 的相关限制不能视为 Campaign 已实现。
4. 没有完成真实发布、用户行为触发和归因验证；保存四个事件不等于转化统计行为已经对齐。

证据：[转化截图](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/16-shared-conversions.png>)。

### 第 5 步：Review Summary — 内容摘要与渠道真实结构脱节

健康状态：**部分实现，P1**。

已有回到前一步、受众数、策略摘要和问题提示。

问题：

1. Email 和 WhatsApp 有专门的摘要分支；其他渠道使用通用 Variant 1 + subject/body，不能完整呈现 SMS 变体、IAM 多页、LINE 消息栈或 Webhook 请求结构。
2. Email 摘要将行结构转换为纯文本，或者将 HTML 字符串作为 React 文本显示；不能据此验证最终邮件视觉。
3. 公共调度摘要读取通用 delivery 字段，不能完整反映 IAM 专用调度结构。
4. 发布问题提示主要依赖通用校验，缺少部分渠道的有效配置约束；见第 5 节探针。
5. 本轮未点击 Launch。Review 的 UI/代码检查不能替代实际发布链路验证。

证据：[Review DOM，截图已排除](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/17-shared-review.dom.txt>)。

公共流程代码依据：[冻结的 dashboard.tsx](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/source-snapshot/app/ui/dashboard.tsx.txt>)（Schedule 856、Audience 868、Conversions 929、Review 937 行附近）；[冻结的 Campaign 校验](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/source-snapshot/lib/campaign-validation.ts.txt>)；[冻结的数据与投递实现](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/source-snapshot/lib/braze-store.ts.txt>)。

## 4. 各渠道具体差异

### 4.1 Multichannel

已有：勾选渠道、为各渠道选择保存草稿或填写简单内容、一次发送的编排及子 Campaign 记录。

已确认缺口：

- **MC-01 / P1：渠道集合不符合原生 Campaign 规则。** 本地只有 Email、Push notification、In-app message、SMS、WhatsApp 五项。Braze 的 Multichannel Campaign 不包含 IAM；该限制不应与 Canvas 可以组合 IAM 混淆。[官方创建 Campaign 说明](https://www.braze.com/docs/user_guide/messaging/campaigns/creating_campaign)
- **MC-02 / P1：没有在同一 Campaign 中切换各渠道自己的 composer。** 当前是关联独立草稿或一个 textarea，无法在此处完成 Email Sending info、Push 平台配置、SMS 媒体等完整编辑。
- **MC-03 / P2：缺少 Webhook、Content Card、LINE 等对应的多渠道配置入口。** 具体租户可用渠道仍须原站验证。
- **MC-04 / P1：采用创建/启动多个子 Campaign 的本地模型。** 不应直接等同于原生一个多渠道 Campaign 的消息、变体、转化和报告模型。

不计为缺口：将“Push 后未打开再发 Email”留给 Canvas 是合理分工，不把这个禁用选项本身列为 Campaign 必补能力。

证据：[截图](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/01-multichannel.png>)；dashboard 的 MultichannelFields（790 行附近），store 的 launchMultichannelCampaign（932 行附近）。

### 4.2 Email

已有：变体、Sending info、HTML/纯文本/模板路径、拖拽编辑、预览测试、基础 Liquid、工作区 Catalog/Content Blocks 的部分解析、退订及追踪配置。

代码追踪表明冻结版本的拖拽入口使用 **GrapesJS/MJML**。项目中存在 Unlayer 文件，并不证明当前入口运行 Unlayer；使用不同引擎本身也不是不合格原因，需看用户能力和输出。

已确认缺口：

- **EM-01 / P1：HTML 编辑体验被简化。** 当前源码编辑区域没有 Braze HTML / Classic / Plaintext / AMP 的完整模式切换，也没有独立纯文本编辑后停止自动同步及 Regenerate from HTML 的状态逻辑。[官方 HTML 编辑器](https://www.braze.com/docs/user_guide/channels/email/html_editor)
- **EM-02 / P2：缺少完整附件编辑及 MIME 附件输出。** 冻结的发送配置和邮件编译结果没有附件列表；MIME 只有 plain/html alternative。无法完成上传、媒体库选择或 URL 附件发送。[官方邮件拖拽编辑说明](https://www.braze.com/docs/user_guide/channels/email/drag_and_drop)
- **EM-03 / P2：缺 Inbox Vision 等真实邮箱客户端渲染验证。** 现有 desktop/mobile/dark 预览不能替代不同邮箱的截图与渲染测试。[官方邮件测试说明](https://www.braze.com/docs/user_guide/channels/email/drag_and_drop)
- **EM-04 / P2：拖拽模块目录未完整覆盖。** 冻结侧栏的 Basic blocks 不包含 NPS Survey；该模块在官方目录中有定义。其他属性和手势需最新可运行版本继续逐项核对。[官方模块目录](https://www.braze.com/docs/user_guide/channels/email/drag_and_drop)
- **EM-05 / P2：Create with Operator 生成固定优惠邮件结构。** Prompt 主要影响占位图片文字，正文、优惠码、按钮等为固定逻辑，不能作为 BrazeAI 的等价实现。
- **EM-06 / P1：Summary 没有最终 HTML 邮件预览；受众发送配置仍有固定演示数据。** 影响最终审核。
- **EM-07 / 未验证：最新拖拽属性面板和拖放行为。** 隔离快照构建有三处 TS 问题，未取得该版本的可用 UI，不能继承旧截图的通过结论。

证据：[HTML 编辑器截图](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/18-email-html-editor.png>)；[编辑器入口快照](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/source-snapshot/app/ui/email-dnd-editor.tsx.txt>)（EmailMessageEditor、GeneralEmailEditor、generateOperator）；[拖拽实现快照](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/source-snapshot/app/ui/email-grapes-editor.tsx.txt>)；[侧栏快照](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/source-snapshot/app/ui/email-grapes-sidebar.tsx.txt>)；[MIME 编译快照](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/source-snapshot/lib/email-runtime.ts.txt>)。

### 4.3 In-App Message

已有：独立 composer、变体、拖拽/传统体验、最多十页、页面跳转、全局/页面样式、表单块、部分无障碍配置、预览用户、测试组和专属调度。传统编辑器已有 Modal、Full Screen、Slideup、Custom HTML、Email Capture Form，不能再说“传统编辑器完全没有”。

已确认缺口：

- **IA-01 / P1：剩余九个模板仍不可用。** 目录共 14 个，只有 5 个配置了 pages；模板选择器将以下 9 个标为 Unavailable：Email sign-up with special offer、Email sign-up with welcome discount、Product announcement、Push primer、Seasonal promo with background image、Background image、Email sign-up、SMS sign-up、WhatsApp sign-up。目录展示名称不等于模板已经补齐。
- **IA-02 / P2：传统编辑器平台/类型覆盖不完整。** Send To 只有 Mobile/Web/Both，缺 Roku；类型集合缺 Web modal with CSS。图标/Badge、HTML 资源附件等也没有完整专用编辑路径。[官方传统编辑器能力](https://www.braze.com/docs/user_guide/channels/in_app_messages/traditional)
- **IA-03 / P2：个性化与自定义代码能力存在边界。** 页面提供的快捷 Liquid 类型和变量集有限；基础解析器不支持 Connected Content / abort_message 等全部 Braze 扩展。不能仅凭一个 Add Liquid 按钮认定对齐。
- **IA-04 / P2：优先级管理不是完整可编辑管理器。** 当前跨消息对话框标明 View only，保存不可用，列表只来自 IAM Campaign；未实现完整跨 Campaign/Canvas 编辑与排序。是否应对特定角色只读仍须原站权限验证。
- **IA-05 / 集成差异：测试明确是本地准备记录，无 SDK delivery。** 表单预览、页面动作演示不证明手机端会采集属性、变更订阅或弹出权限请求。
- **IA-06 / P1：通用 Review 不完整展示 IAM 变体、多页和专属调度。**

官方拖拽编辑器包含模板、多页和设备测试，这些必须分别验收，不能只核对 Modal 的初始画面。[官方拖拽编辑器说明](https://www.braze.com/docs/user_guide/channels/in_app_messages/drag_and_drop)

证据：[不可用模板截图](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/13-iam-unavailable-templates.png>)、[完整模板 DOM](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/13-iam-unavailable-templates.dom.txt>)；[模板映射快照](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/source-snapshot/lib/in-app-templates.ts.txt>)；[传统模型](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/source-snapshot/lib/in-app-traditional.ts.txt>)；[编辑器](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/source-snapshot/app/ui/in-app-message.tsx.txt>)；[专属调度](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/source-snapshot/app/ui/in-app-schedule.tsx.txt>)。

### 4.4 Push Notification

已有：iOS/Android 预览壳、标准/富推送选择、媒体上传/媒体库、语言表单、点击目的地、少量动作和设置。

已确认缺口：

- **PU-01 / P1：平台和消息类型缺失。** 当前主要是 iOS + Android 示意，缺 Web/Kindle 选择；类型只有 Standard push / Rich push，没有 Push Stories 和 Android Inline image 的专用配置。[官方 Push 创建说明](https://www.braze.com/docs/user_guide/channels/push/create_a_push_message)
- **PU-02 / P1：没有完整变体编辑和公共分流接入。**
- **PU-03 / P1：多语言内容与预览脱节。** 输入保存到 contentByLanguage，但预览继续读取 draft.subject/body。
- **PU-04 / P2：同平台文案开关没有展开独立平台内容模型；Device 和 Notification State 主要存值，没有相应预览结构变化。**
- **PU-05 / P2：多操作按钮/动作类别等配置简化为少量字段，不能替代完整平台专属设置。**
- **PU-06 / P2：凭证状态分支不一致。** diagnostics 转成 Available/Missing，但展示逻辑比较 Configured，导致成功提示分支无法按当前映射进入。
- **PU-07 / P1：TTL 等渠道值没有进入完整发布校验；负 TTL 的校验函数探针无问题。**
- **PU-08 / 集成差异：Test 明确记录模拟结果，不联系设备。**

证据：[入口截图](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/04-push.png>)、[完整 DOM](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/04-push.dom.txt>)；dashboard 快照 PushFields（661 行附近）。

### 4.5 Banner

已有：Placement 资源选择、High/Normal/Low、标题正文、按钮、URL 和简单预览。

已确认缺口：

- **BA-01 / P1：编辑器主体未复刻。** 缺少拖拽、HTML、模板、行/块和样式属性编辑，当前为简单文案表单。[官方创建 Banner](https://www.braze.com/docs/user_guide/channels/banners/create_a_banner)
- **BA-02 / P1：调度规则错误。** 本地可选择 Action-Based 和 API-Triggered；Braze Banner 不支持这两类 Campaign。[官方 Banner 限制](https://www.braze.com/docs/user_guide/channels/banners)
- **BA-03 / P2：优先级默认值和命名不一致。** 原生为 High/Medium/Low，本地使用 Normal。[官方 Banner 优先级](https://www.braze.com/docs/user_guide/channels/banners)
- **BA-04 / P2：缺少元素级点击、自定义事件/属性、报告标识及关闭行为编辑。** 一个 URL 字段不足以覆盖这些能力。[官方 Banner 配置](https://www.braze.com/docs/user_guide/channels/banners/create_a_banner)
- **BA-05 / P1：Placement 与目的地没有完整的渠道有效性校验。** 无效 URL 的模型校验探针返回空问题。
- **BA-06 / 集成差异：未验证 SDK Placement 拉取、实际展示和刷新。** 项目存在 Banner 资源 CRUD，不等于 Campaign 编辑和 SDK 行为已经接通。

证据：[编辑截图](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/05-banner.png>)、[错误调度选项](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/14-banner-schedule.png>)；dashboard 快照 BannerFields（690 行附近）与 Schedule。

### 4.6 Content Card

已有：Image only / Captioned image / Classic，标题描述、图片 URL、类别、点击动作、置顶、到期日期。

已确认缺口：

- **CC-01 / P2：缺少与卡片类型对应的完整编辑/设备预览。** 通用 Preview 没有完整复现图片及各卡片布局；Compose 本身主要是表单。
- **CC-02 / P1：缺少卡片创建时机选择。** Scheduled Card 的 At campaign launch / At first impression 未接入。[官方 Card creation](https://www.braze.com/docs/user_guide/channels/content_cards/create_a_content_card/card_creation)
- **CC-03 / P2：缺少 removal event 和完整过期控制。** 当前单个 expireDate 不等于基于购买/事件移除、个性化持续时间和最长周期约束。[官方生命周期说明](https://www.braze.com/docs/user_guide/channels/content_cards/create_a_content_card/card_creation)
- **CC-04 / P2：缺少独立变体、KVP 和完整点击/追踪设置。**
- **CC-05 / P1：无效图片、目的地和空到期值未被通用校验拒绝。**
- **CC-06 / 集成差异：未验证 SDK Feed 同步、已读、点击、关闭及到期一致性。** 界面说明“synchronized to SDK feed”不能作为已接通证据。

证据：[入口截图](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/06-content.png>)、[完整 DOM](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/06-content.dom.txt>)；dashboard 快照 ContentCardFields（686 行附近）。

### 4.7 SMS/MMS/RCS

已有：独立 SMS composer、文本变体、订阅组、GSM 分段计算、手机气泡、Liquid 快捷项、联系卡表单和测试入口。

已确认缺口：

- **SM-01 / P1：渠道名称覆盖三种消息，但当前 Campaign 入口只接文本短信编辑器。** dashboard 直接返回 SmsCampaignComposer；另一套含 MMS/RCS 字段的 SmsFields 没有走到。不能把未接入代码计为可用能力。官方支持短信、彩信媒体和 RCS 类型编辑。[官方 SMS/MMS/RCS 创建说明](https://www.braze.com/docs/user_guide/channels/sms_mms_and_rcs/create)
- **SM-02 / P1：测试手机号丢失，已在页面复现。** 输入 +15550001111 后打开共享测试弹窗，收件人变为 marketing.qa@example.com；测试入口没有传递 phone。仅打开弹窗，未执行最终发送。
- **SM-03 / P2：Add languages 只是固定 English/Spanish 展示，没有真正配置语言、维护翻译或生成语言条件。**
- **SM-04 / P1：Contact Card Generator 只保存联系字段，未生成可附加/发送的 vCard 文件或消息附件。**
- **SM-05 / P1：链接缩短为预览正则替换的 brz.ai/XXXXXXXX，没有真实唯一短链和追踪闭环。**
- **SM-06 / P2：分段指标基于原始正文，未完整结合最终 Liquid、追加退订文案和缩短后的实际消息。** 预览内的退订文案在不同层也不一致。
- **SM-07 / P1：1600 字符约束未进入当前 Campaign 统一发布校验。** 1601 字符探针返回空问题；UI 警示和 HTML 属性不能替代服务端校验。[官方消息长度说明](https://www.braze.com/docs/user_guide/channels/sms_mms_and_rcs/create)
- **SM-08 / P1：变体没有接入 Target 分流与完整 Review。** 测试 modal 的变体逻辑主要按 Email 处理。
- **SM-09 / 集成差异：通用测试只生成本地结果，没有 SMS/MMS/RCS 供应商消息 payload 与真实交付闭环。**

证据：[短信入口](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/07-sms.png>)、[错误测试弹窗](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/11-sms-test-recipient.png>)、[弹窗 DOM](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/11-sms-test-recipient.dom.txt>)；[短信编辑器快照](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/source-snapshot/app/ui/sms-editor.tsx.txt>)（Test 按钮直接调用 openTest）；Email 共享 TestModal（1146 行附近）与 dashboard 的路由分支。

### 4.8 Webhook

已有：独立编辑器、变体、模板、POST/GET/PUT/DELETE、Headers、Basic/Bearer、JSON 键值/Raw、语言、用户个性化预览、模板保存和投递配置。

已确认缺口：

- **WH-01 / P1：变体没有接入公共 A/B 分配与 Review。** 本地执行按 hash 对变体取模，不按配置的权重分流。
- **WH-02 / P2：重试行为没有完整对齐。** 本地最多五次、120 秒超时已有，但数字 Retry-After 被压到最多 30 秒，不解析 HTTP-date，也没有完整 X-RateLimit 头处理或 24 小时持久重试队列。[官方 Webhook 重试说明](https://www.braze.com/docs/user_guide/channels/webhooks/create_a_webhook)
- **WH-03 / P2：缺少完整的跨请求/主机级故障延期与恢复机制。** 本地函数重试不等于原生投递系统的整体故障处理。[官方 Webhook 概述](https://www.braze.com/docs/user_guide/channels/webhooks)
- **WH-04 / 未验证：原站模板目录、布局、错误提示、重试结果弹窗与具体权限。** 本地内置模板存在，不代表模板集合逐项对齐。

环境说明：Live delivery 默认关闭，需配置开关及目标域白名单；这类安全边界不是复刻 bug，也不应为了表面一致删除。报告将“可配置但未开启”与“功能未实现”分开。未向外部 Webhook 发请求。

证据：[入口截图](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/08-webhook.png>)、[完整 DOM](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/08-webhook.dom.txt>)；[编辑器快照](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/source-snapshot/app/ui/webhook-editor.tsx.txt>)；[投递快照](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/source-snapshot/lib/webhook-delivery.ts.txt>)（retryDelay 68 行附近）。

### 4.9 WhatsApp

已有：Template / Response、变体及复制删除、变量、媒体、订阅组、预览、消息校验、部分 payload 模型。

已确认缺口：

- **WA-01 / P1：Campaign Response 仅提供五类布局。** 实际 UI 为 Text、Quick reply、Media、Call-to-action、List；缺 Carousel、Flow、Product 的编辑入口。底层模型支持更多枚举、Carousel payload 也已有部分实现，但不等于 Campaign 页面接入。官方 Response 说明包含这些布局，具体 Flow/Product 还取决于 Meta 资源配置。[官方 WhatsApp 创建说明](https://www.braze.com/docs/user_guide/channels/whatsapp/create_a_whatsapp_message)
- **WA-02 / P1：Sync templates 只更新本地时间/注册表状态，没有 Meta 模板同步。**
- **WA-03 / P1：Submit for approval 是本地 Pending 状态，没有真实审批请求和状态回流。**
- **WA-04 / P1：24-hour window 通过 Simulate open window 手动控制，没有依据实际 inbound message 时间验证。**
- **WA-05 / P2：Business account、Quality rating 是 Demo 数据，没有真实账号/号码质量状态同步。**
- **WA-06 / P1：变体权重未接入 Audience 与执行；当前执行按 hash 取模均分。**
- **WA-07 / 集成差异：测试和结果为本地模拟。** 没有真实 Braze→Meta→Device 交付确认。编辑器明确显示 Demo mode，不应将本地成功理解为 Meta 接收成功。

证据：[入口截图](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/09-whatsapp.png>)、[五种 Response 布局](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/12-whatsapp-response-layouts.png>)、[完整 DOM](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/12-whatsapp-response-layouts.dom.txt>)；[当前 Campaign 编辑器快照](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/source-snapshot/app/ui/whatsapp-editor.tsx.txt>)（responseLayouts 19、Sync 99、ResponseComposer 195 行附近）；[模型快照](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/source-snapshot/lib/whatsapp-model.ts.txt>)。

### 4.10 LINE

已有：最多五条消息栈、排序/删除、Text、Image、Flex JSON、Carousel；模型已有基础校验、个性化与 payload 编译。

已确认缺口：

- **LI-01 / P1：编辑器架构不同。** 当前是表单和 Flex JSON 输入，没有 Braze 的 LINE 拖拽消息编辑器。Rich message 的图片点击区域编辑未实现；Flex JSON 不等同于可视化富消息编辑。[官方 LINE 创建说明](https://www.braze.com/docs/user_guide/channels/line/create_a_line_message)
- **LI-02 / P1：卡片能力被截断。** Campaign UI 最多五列，只有简化 URI 动作；原生 card-based 最多十张卡，每张可配置多个动作。底层模型允许十张，并不能消除 UI 的五张限制。[官方 LINE 卡片说明](https://www.braze.com/docs/user_guide/channels/line/create_a_line_message)
- **LI-03 / P1：缺 LINE subscription group 选择与服务端通道映射。** 当前 Official Account 只有 Demo 一项，公共订阅组支持 Email/SMS/WhatsApp，没有形成 LINE 的群组绑定；无 group 的模型探针未报错。[官方 LINE 创建前置条件](https://www.braze.com/docs/user_guide/channels/line/create_a_line_message)
- **LI-04 / P2：没有完整的点击追踪 Settings。**
- **LI-05 / P1：预览被简化。** Flex 主要读平面文本或 altText；共享 Preview & Test 只读 draft.body，不能完整显示消息栈与所有富卡片。
- **LI-06 / P2：缺变体编辑、相应分流、内容测试组和 LINE 专属测试流程。**
- **LI-07 / 集成差异：编译 payload 不等于真实 Official Account 投递，也未验证 native_line_id、好友关系及设备渲染。**

证据：[入口截图](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/10-line.png>)、[完整 DOM](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/10-line.dom.txt>)；dashboard 快照 LineFields（746 行附近）；[LINE 模型](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/source-snapshot/lib/line-model.ts.txt>)；store 的 subscriptionGroupForChannel（373 行附近）。

## 5. 本轮实际执行的验证

### 5.1 模型测试

运行 IAM model/runtime/traditional/schedule、SMS、WhatsApp、Webhook、LINE、navigation、email-liquid 的既有测试：**61 通过，0 失败**。

这些测试证明已覆盖的模型场景工作，不能证明页面路由接入、原站视觉、供应商投递或全部渠道配置通过。没有新增只复述实现的测试。

### 5.2 校验探针

对 `campaignValidationIssues` 直接传入以下数据：

| 输入 | 结果 | 结论 |
|---|---|---|
| SMS 1601 字符 | [] | 统一模型没有限制此长度 |
| Banner 无效目的地/缺 placement | [] | 缺相应渠道完整校验 |
| Push 无效 deeplink、负 TTL | [] | 缺相应渠道完整校验 |
| Content Card 无效图片/目的地、开启到期但空日期 | [] | 缺相应渠道完整校验 |
| LINE 无 subscription group | [] | 没有要求 LINE 群组 |
| Multichannel 含 IAM | [] | 没有排除不适用渠道 |
| 两个 Email 变体各 5%、控制组 0% | [] | 未拒绝总和不足 100% |

**严格解释：这只是统一模型层的结果，不表示以上请求已经实际发布成功。** launch 仍可能受发送地址、工作区策略、其他校验等限制。本轮未通过 launch API 验证，也未启动任何 Campaign。

基础 `renderBrazeLiquid` 对 connected_content、catalog_items、abort_message 探针报 tag not found。**不能据此说 Email 完全不支持 Catalog**：Email 的另一个工作区解析层确实注册了 catalog_items / catalog_selection_items 和部分 Content Blocks。可以确认的是多个解析层的能力不同，Connected Content 与 abort 等完整 Braze 语义没有形成统一兼容层。

证据：[探针原始结果](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/validation-probes.json>)；[基础 Liquid 快照](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/source-snapshot/lib/email-liquid.ts.txt>)；[工作区解析快照](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/audits/campaign-channel-2026-10-28/source-snapshot/lib/email-editor-model.ts.txt>)。

### 5.3 最新隔离副本构建

webpack 编译阶段成功，TypeScript 阶段失败：

- email-grapes-drag：doc 可能为 null。
- email-grapes-drag：可能 undefined 的内容传给 ComponentAdd。
- email-grapes-editor：拖放回调只接收 Component，而类型还可能传 Component[]。

同时记录了磁盘空间不足的缓存警告。报告文件中的日志保留完整上下文。这些是冻结副本的时点结果；本报告没有替其他正在进行的 Email 修改作最终构建判决。

## 6. 修复顺序与验收建议

### 第一批：纠正会导致配置错误或能力误判的 P1

1. 接通 SMS 的 MMS/RCS 路径；修复测试手机号、变体传递与发布长度校验。
2. 纠正 Multichannel 的渠道集合及数据模型，接入真正的各渠道 composer。
3. 按渠道统一变体模型、分流权重、总和校验、预览与 Review；避免“能添加但不能正确分配”。
4. Banner 禁用不适用调度模式，补 Placement/URL 校验。
5. 修复通用受众组的真实数据模型与 Lookup 判断；统一策略提示与后台状态。
6. 补 Campaign 转化事件的发布后不可变约束，以及自定义事件编辑。
7. 使当前 Email 拖拽快照能通过构建，再重新录制实际编辑、保存、刷新和预览结果。

### 第二批：补齐缺失的编辑器与模板

1. Banner 拖拽/HTML 编辑器。
2. LINE 拖拽、Rich message 点击区域、十卡及多动作、订阅组、追踪。
3. IAM 九个不可用模板及传统平台/类型缺口。
4. Push 平台、类型、语言预览、变体与平台独立配置。
5. Content Card 创建/移除/到期生命周期与真实卡片预览。
6. WhatsApp Campaign 缺失 Response 布局；根据实际资源能力显示 Flow/Product 可用状态。
7. Email 附件、HTML 多视图/纯文本同步、NPS 及真实客户端预览能力。

### 第三批：完成真正的 1：1 验收

每个渠道至少提供一份相同数据的原站与本地验收记录：

- 创建/打开：默认状态、账号条件、权限、菜单与初始字段。
- 编辑：每个类型、变体、语言、媒体、动作、个人化与错误状态。
- 保存：草稿保存后刷新恢复；切换模板/编辑器的数据保留与不可逆转换。
- 五步：合法调度、受众、实验分流、转化、Review 内容一致。
- 预览：相同用户、相同语言、相同设备，截图对照；不能将壳宽变化当作原生渲染。
- 测试：收件人和变体正确，结果明确区分本地模拟、供应商接受、设备收到。
- 发布：在明确的测试环境中核验调度、订阅、限频、GCG/Tag 排除及事件回流。
- 视觉：同 viewport 的原站/本地截图，检查布局、字体、图标、间距、空态、加载态、错误态和弹窗；未取得配对证据前不标记通过。

## 7. 暂不能下结论的部分

- 当前 Braze 租户在套餐、角色、语言、灰度开关下的精确界面。
- 原站各模板的当前视觉、默认内容、交互及是否与本地目录完全同批次。
- 最新 Email 拖拽改动的最终构建与页面行为。
- 所有渠道的真实供应商与移动/Web SDK 端到端结果。
- 全渠道键盘、读屏和响应式完整覆盖；本轮没有执行完整无障碍验收。
- 当前线上 braze-clone.vercel.app 是否与审查代码完全一致；本轮检查对象为本地实现，未对线上版本作等价推断。

这些项标记为未验证，不与已确认功能缺口合并计算，也不以完成百分比掩盖证据缺失。

