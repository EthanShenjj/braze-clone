# Campaigns 差异补齐与验证记录

本记录为首次实现阶段；随后 12 项页面差异已继续修复。最新结果见 [campaigns-followup-12-2026-10-30.md](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-12-2026-10-30.md>)，本记录下面的旧限制描述保留作历史，不作为当前状态。整体仍未宣称逐像素 1:1。

状态统计：{'Partial': 12, 'Verified': 52, 'Implemented': 15}。原始审计清单和源站截图保持不变。

## 验证

- 全部模型测试：267/267 通过（Node 22，`--experimental-transform-types --test tests/*.test.mjs`）。
- 本地 HTTP 接口检查：14/14，通过隔离数据库验证工作区复制、brief 上传下载、分析、监控和测试请求约束。
- `tsc --noEmit --incremental false` 通过；`next build` 生产编译、类型检查和页面生成通过。
- 浏览器截图与 AX 页面快照：56 组，见下方索引。全部来自隔离测试数据库，未修改源站或发送外部消息。

## 使用与限制

修复分支为 `codex/campaigns-fidelity-completion`。原有未提交修改已保留。本地实现使用真实持久化和校验；AI、预测优化、Bee 内部、Standards、Meta 能力及外部通知的限制逐项保留，不以成功提示代替实际能力。

## 逐项状态

| ID | 差异 | 状态 | 本轮实现 / 剩余 |
|---|---|---|---|
| CMP-001 | Campaigns 全局布局仍不一致 | 部分补齐 | 统一 Campaigns 的侧栏宽度、插画背景、字体及列表工具栏，增加渠道插画图标；**剩余：仍未对全局头像、品牌标记、所有导航图标及每个视口做像素级验收。** [截图 1](campaigns-fidelity-2026-10-30/01-list.png) [截图 2](campaigns-fidelity-2026-10-30/50-messaging-channels.png) |
| CMP-002 | 状态筛选缺少 Archived 和 Idle | 已实现并留存界面证据 | 补齐 Active/Draft/Archived/Stopped/Idle 状态及归档记录查询 [截图 1](campaigns-fidelity-2026-10-30/01-list.png) |
| CMP-003 | 高级筛选目录大量缺失 | 已实现并留存界面证据 | 补齐创建者、编辑者、类型、日期、排程等高级筛选 [截图 1](campaigns-fidelity-2026-10-30/02-filters.png) |
| CMP-004 | Columns 缺少管理列及全选 | 已实现并留存界面证据 | 补齐 All Columns 和逐列显隐并持久化 [截图 1](campaigns-fidelity-2026-10-30/03-columns.png) |
| CMP-005 | 表格排序能力不完整 | 已实现，待完整界面验收 | 补齐 Name/Stop date/Sent/Teams/Last edited 排序 [截图 1](campaigns-fidelity-2026-10-30/01-list.png) |
| CMP-006 | 搜索与筛选标签交互不同 | 已实现，待完整界面验收 | 搜索采用显式提交，筛选芯片可单项移除 [截图 1](campaigns-fidelity-2026-10-30/01-list.png) |
| CMP-007 | 分页缺少 96 行和页码导航 | 已实现，待完整界面验收 | 补齐 12/24/48/96 每页条数及可跳页分页 [截图 1](campaigns-fidelity-2026-10-30/01-list.png) |
| CMP-008 | Copy to workspace 弹窗未复刻 | 已实现，待完整界面验收 | 补齐工作区选择、二步复制和独立公共 UUID [截图 1](campaigns-fidelity-2026-10-30/51-copy-workspace.png) |
| CMP-009 | 批量操作缺少 Archive | 已实现，待完整界面验收 | 补齐多选归档、标签批处理及失败反馈 |
| CMP-010 | 列表缺少 Priority Sorter 快捷入口 | 已实现并留存界面证据 | 增加列表 Priority Sorter 入口 [截图 1](campaigns-fidelity-2026-10-30/52-priority-sorter.png) |
| CMP-011 | 优先级弹窗结构未对齐 | 已实现并留存界面证据 | 补齐分组优先级、计数、批量和上下移动操作 [截图 1](campaigns-fidelity-2026-10-30/52-priority-sorter.png) |
| CMP-012 | Create campaign 菜单底部被视口裁切 | 已实现并留存界面证据 | 创建菜单按视口限制高度并支持滚动到 LINE/API 等底部入口 [截图 1](campaigns-fidelity-2026-10-30/04-create.png) [截图 2](campaigns-fidelity-2026-10-30/04-create-bottom.png) |
| CMP-013 | Campaign brief 上传区缺失 | 已实现并留存界面证据 | 普通、IAM、API、Feature 详情增加 15MB brief 上传、下载及替换 [截图 1](campaigns-fidelity-2026-10-30/07-email-sending-settings.png) [截图 2](campaigns-fidelity-2026-10-30/05-api-campaign.png) |
| CMP-014 | Campaign ID 的形式及用途未对齐 | 已实现，待完整界面验收 | 展示稳定公共 UUID 并复制，保留内部路由 ID [截图 1](campaigns-fidelity-2026-10-30/05-api-campaign.png) |
| CMP-015 | Variant 工具和校验状态不同 | 已实现并留存界面证据 | 变体标签增加校验图标、集中 Rename/Duplicate/Delete，保留独立设置 [截图 1](campaigns-fidelity-2026-10-30/23-variant-actions.png) |
| CMP-016 | 步骤打勾只依赖导航位置 | 已实现并留存界面证据 | 完成状态按每步实际校验计算，修复后续导航造成假打勾 [截图 1](campaigns-fidelity-2026-10-30/31-iam-compose.png) |
| CMP-017 | 发送类型与 Timing 控件未按原版呈现 | 已实现并留存界面证据 | 补齐 Scheduled/Action-Based/API-Triggered 类型卡片和 Timing 选项 [截图 1](campaigns-fidelity-2026-10-30/13-schedule.png) |
| CMP-018 | 默认立即发送与条件字段、Review 不一致 | 已实现，待完整界面验收 | 统一默认立即发送在表单、Review、调度器中的含义 [截图 1](campaigns-fidelity-2026-10-30/13-schedule.png) [截图 2](campaigns-fidelity-2026-10-30/20-review.png) |
| CMP-019 | Intelligent Timing 专属设置缺失 | 部分补齐 | 补齐 Intelligent Timing、个人最佳小时和兜底时间配置；**剩余：个人 best_send_hour 和兜底已执行；没有连接 Braze 的预测服务。** [截图 1](campaigns-fidelity-2026-10-30/13-schedule.png) |
| CMP-020 | Action-Based 触发器目录大幅简化 | 部分补齐 | 补齐分组触发器目录、搜索字段及事件参数；**剩余：源站虚拟列表仅完整采集了部分标签；目录其余深层分支未逐项取得源站截图。** [截图 1](campaigns-fidelity-2026-10-30/14-schedule-action-based.png) |
| CMP-021 | Action-Based 的延迟与活动周期结构未对齐 | 已实现并留存界面证据 | 补齐触发后延迟、时间单位、时区、开始结束和运行时期限 [截图 1](campaigns-fidelity-2026-10-30/14-schedule-action-based.png) |
| CMP-022 | API-Triggered 缺少请求示例与标识操作 | 已实现并留存界面证据 | 补齐 API-triggered 说明、请求示例和真实触发接口 [截图 1](campaigns-fidelity-2026-10-30/15-schedule-api-triggered.png) |
| CMP-023 | 重新入组间隔单位未对齐 | 已实现，待完整界面验收 | 补齐再准入时间单位及规范化运行时计算 [截图 1](campaigns-fidelity-2026-10-30/13-schedule.png) |
| CMP-024 | Frequency Capping 展示与管理入口未对齐 | 已实现，待完整界面验收 | 补齐 Frequency Capping、工作区设置跳转和摘要 [截图 1](campaigns-fidelity-2026-10-30/13-schedule.png) |
| CMP-025 | 分群选择器未复刻搜索与多选呈现 | 已实现并留存界面证据 | 补齐分群搜索、多选、已选移除及 AND/OR [截图 1](campaigns-fidelity-2026-10-30/16-audience.png) |
| CMP-026 | Additional Filters 缺少原版分层筛选目录 | 部分补齐 | 补齐筛选分类目录和已有数据字段的实际查询能力；**剩余：没有对应数据源的预测/集成类筛选保留不可用状态，未伪造计算结果。** [截图 1](campaigns-fidelity-2026-10-30/17-audience-filter-catalog.png) |
| CMP-027 | User Lookup 弹窗被替换为行内输入 | 已实现并留存界面证据 | 补齐 User Lookup 弹窗、查询、匹配及排除原因 [截图 1](campaigns-fidelity-2026-10-30/18-audience-user-lookup.png) [截图 2](campaigns-fidelity-2026-10-30/18-audience-user-lookup-result.png) |
| CMP-028 | A/B Testing 缺少 Optimize with BrazeAI | 部分补齐 | 补齐 BrazeAI 优化选项、变体拆分及手动流量分配；**剩余：保存优化意图并执行手动分配；没有连接 BrazeAI 自动优化服务。** [截图 1](campaigns-fidelity-2026-10-30/16-audience.png) |
| CMP-029 | Suppression Lists 独立区块未复刻 | 已实现并留存界面证据 | 补齐 Suppression Lists 入口和实际抑制规则 [截图 1](campaigns-fidelity-2026-10-30/16-audience.png) |
| CMP-030 | Total Population 缺少队列、刷新与细分统计 | 部分补齐 | 补齐真实本地人数、渠道覆盖、LTV、刷新及计算记录弹窗；**剩余：人数/LTV 来自本地数据库；计算队列是本地请求历史，未接入远端 Braze 队列。** [截图 1](campaigns-fidelity-2026-10-30/16-audience.png) |
| CMP-031 | Conversion event 类型目录不一致 | 已实现，待完整界面验收 | 补齐转化事件目录、应用、事件属性和截止时间 [截图 1](campaigns-fidelity-2026-10-30/19-conversions.png) |
| CMP-032 | 旧草稿的转化编辑页和 Review 显示不同事件 | 已实现，待完整界面验收 | 统一旧购买事件别名，保证表单和 Review 不改写已有含义 [截图 1](campaigns-fidelity-2026-10-30/19-conversions.png) |
| CMP-033 | 转化配置的字段层级与说明不足 | 已实现并留存界面证据 | 补齐主/次转化卡片布局、4 项上限和上线后锁定 [截图 1](campaigns-fidelity-2026-10-30/19-conversions.png) |
| CMP-034 | Review 缺少 Agentic Standards | 部分补齐 | 补齐 Agentic Standards 区块及空状态和控制台入口；**剩余：已补齐空状态和入口；无可调用的 Standards 评估服务，未伪造评估通过。** [截图 1](campaigns-fidelity-2026-10-30/20-review.png) |
| CMP-035 | Review 卡片、编辑入口及统计呈现未对齐 | 已实现并留存界面证据 | 重建 Review 卡片、编辑入口、消息预览、受众及投递摘要 [截图 1](campaigns-fidelity-2026-10-30/20-review.png) |
| CMP-036 | Limited access 下的 Launch 按钮状态不同 | 已实现并留存界面证据 | 按本地 access 配置呈现访问状态，Limited access 隐藏普通 Launch [截图 1](campaigns-fidelity-2026-10-30/20-review.png) |
| CMP-037 | 发送设置页结构和尺寸仍不一致 | 已实现并留存界面证据 | 补齐邮件 Sending Settings 页面壳、独立导航和完成操作 [截图 1](campaigns-fidelity-2026-10-30/07-email-sending-settings.png) |
| CMP-038 | 发送身份、IP Pool 和 Reply-to 控件未对齐 | 部分补齐 | 补齐发送身份、IP pool、Reply-to/BCC、工作区默认值和逐变体策略校验；**剩余：遵循本地真实权限和发送策略；源站 Limited access 的禁用态不同。原生 Resend 不支持 IP pool/Extras 时明确阻止，需支持这些能力的连接器。** [截图 1](campaigns-fidelity-2026-10-30/07-email-sending-settings.png) |
| CMP-039 | Subject / Preheader 未复刻 Liquid 代码字段 | 已实现并留存界面证据 | Subject/Preheader 增加 Liquid 入口，语言译文进入编译结果 [截图 1](campaigns-fidelity-2026-10-30/07-email-sending-settings.png) |
| CMP-040 | Advanced 缺少 Headers 与 Extras 编辑区 | 已实现并留存界面证据 | 补齐 Custom Headers、Extras 保存、校验及编译 [截图 1](campaigns-fidelity-2026-10-30/08-email-advanced.png) |
| CMP-041 | 邮件附件上传流程未完整复刻 | 已实现，待完整界面验收 | 补齐邮件附件上传、媒体库、2MB 校验及编译引用 [截图 1](campaigns-fidelity-2026-10-30/08-email-advanced.png) |
| CMP-042 | HTML 编辑页三栏布局未复刻 | 已实现并留存界面证据 | 重建 HTML 三栏内容、代码和预览区域 [截图 1](campaigns-fidelity-2026-10-30/11-email-html-editor.png) |
| CMP-043 | HTML 编辑页缺少同等代码工具和状态 | 已实现并留存界面证据 | 补齐搜索、图片、源码视图、CSS inlining、下载和保存状态 [截图 1](campaigns-fidelity-2026-10-30/11-email-html-editor.png) |
| CMP-044 | Gmail Promotion 配置页未复刻 | 已实现并留存界面证据 | 补齐 Gmail Promotion 面板及安全注释生成 [截图 1](campaigns-fidelity-2026-10-30/12-email-gmail-promotion.png) |
| CMP-045 | 拖拽编辑器外层导航未对齐 | 部分补齐 | 补齐拖拽编辑器外层 Design/Links/Personalization/Languages/Sending 导航；**剩余：外层流程已补齐；源站 Bee 内部加载受阻，当前保留 GrapesJS，不能宣称内部逐像素一致。** [截图 1](campaigns-fidelity-2026-10-30/10-email-drag-editor.png) |
| CMP-046 | 多平台预览和消息编辑布局不同 | 已实现并留存界面证据 | Push 同时显示已选平台和各自预览 [截图 1](campaigns-fidelity-2026-10-30/21-push-compose.png) |
| CMP-047 | iOS 高级设置不完整 | 已实现并留存界面证据 | 补齐 iOS 高级设置和平台 payload 映射 [截图 1](campaigns-fidelity-2026-10-30/22-push-settings.png) |
| CMP-048 | Android Notification 设置未复刻 | 已实现并留存界面证据 | 补齐 Android 高级设置和平台 payload 映射 [截图 1](campaigns-fidelity-2026-10-30/22-push-settings.png) |
| CMP-049 | 传统编辑器未支持按钮的 Android / iOS 独立行为 | 已实现并留存界面证据 | 补齐 IAM 平台点击动作、保存及实际运行时映射 [截图 1](campaigns-fidelity-2026-10-30/32-iam-traditional.png) |
| CMP-050 | 传统编辑器缺少 Light/Dark mode 样式切换 | 已实现并留存界面证据 | 补齐 IAM 明暗设计、颜色透明度和运行时主题 [截图 1](campaigns-fidelity-2026-10-30/33-iam-traditional-design.png) |
| CMP-051 | 传统 Settings 的 Accessibility 与 KVP 结构不同 | 已实现并留存界面证据 | 补齐 IAM Settings 纵向布局 [截图 1](campaigns-fidelity-2026-10-30/34-iam-traditional-settings.png) |
| CMP-052 | Banner 创建入口缺少原版的分阶段选择 | 已实现并留存界面证据 | Banner 按 Placement 和编辑体验分阶段进入 [截图 1](campaigns-fidelity-2026-10-30/29-banner.png) |
| CMP-053 | Banner 积木目录不完整 | 已实现并留存界面证据 | 补齐 Banner Link/Phone/Email/Subscriptions 等块及 SDK 动作 [截图 1](campaigns-fidelity-2026-10-30/30-banner-fullscreen.png) |
| CMP-054 | Banner 全屏编辑工具未完整复刻 | 已实现并留存界面证据 | 补齐 Banner 全屏、画布尺寸、设备、Liquid、语言及撤销工具 [截图 1](campaigns-fidelity-2026-10-30/30-banner-fullscreen.png) |
| CMP-055 | Content Card 缺少原版设备预览和页签结构 | 已实现并留存界面证据 | Content Card 增加设备、Compose/Settings/Test 和语言工具 [截图 1](campaigns-fidelity-2026-10-30/26-content-card.png) |
| CMP-056 | Content Card 点击行为未按平台分开 | 已实现并留存界面证据 | 补齐 Content Card 各平台点击行为并进入编译 [截图 1](campaigns-fidelity-2026-10-30/27-content-platform-actions.png) |
| CMP-057 | Content Card Settings 缺少 Accessibility | 已实现并留存界面证据 | 补齐 Content Card 无障碍语言、Liquid 和图片替代文本 [截图 1](campaigns-fidelity-2026-10-30/28-content-settings.png) |
| CMP-058 | 消息类型与 Contact Card 的能力门槛未对齐 | 已实现并留存界面证据 | SMS/MMS/RCS 根据订阅组实际能力启用，并在测试/运行时校验 [截图 1](campaigns-fidelity-2026-10-30/35-sms.png) |
| CMP-059 | SMS 预览、语言和字段工具不同 | 已实现并留存界面证据 | 补齐 SMS 编辑布局、语言、Liquid、Copywriter 和联系人生成工具 [截图 1](campaigns-fidelity-2026-10-30/35-sms.png) |
| CMP-060 | Webhook 缺少原版初始模板选择页 | 已实现并留存界面证据 | Webhook 首次进入模板选择 [截图 1](campaigns-fidelity-2026-10-30/36-webhook.png) |
| CMP-061 | Credential 管理入口未复刻 | 已实现，待完整界面验收 | 补齐受管 Webhook 凭据引用、服务端解析和敏感信息脱敏 [截图 1](campaigns-fidelity-2026-10-30/37-webhook-request.png) |
| CMP-062 | Webhook 请求预览及 Liquid 字段布局不同 | 已实现并留存界面证据 | 补齐 Webhook 请求/预览分栏及 URL Liquid [截图 1](campaigns-fidelity-2026-10-30/37-webhook-request.png) |
| CMP-063 | Webhook 页面暴露本地部署环境变量 | 已实现并留存界面证据 | 移除 Webhook 主编辑流中的部署环境变量提示 [截图 1](campaigns-fidelity-2026-10-30/37-webhook-request.png) |
| CMP-064 | 订阅组、WABA 与布局选择的顺序不同 | 已实现并留存界面证据 | WhatsApp 按订阅组、类型、布局分阶段进入 [截图 1](campaigns-fidelity-2026-10-30/38-whatsapp.png) [截图 2](campaigns-fidelity-2026-10-30/39-whatsapp-message-types.png) |
| CMP-065 | Text response 缺少语言与 URL preview 控件 | 已实现并留存界面证据 | 补齐 WhatsApp 语言、URL preview 和内容预览 [截图 1](campaigns-fidelity-2026-10-30/39-whatsapp-message-types.png) |
| CMP-066 | Provider 信息和模板工具不在同等流程位置 | 部分补齐 | 调整 WhatsApp Provider 工具的层级和编辑区位置；**剩余：信息层级已调整；当前 WhatsApp 仍有本地会话资格/预览状态，未连接 Meta 真实账号能力。** [截图 1](campaigns-fidelity-2026-10-30/39-whatsapp-message-types.png) |
| CMP-067 | LINE 未复刻订阅组后的全屏编辑体验 | 已实现并留存界面证据 | LINE 按订阅组进入 Launch Editor 全屏流程 [截图 1](campaigns-fidelity-2026-10-30/40-line-entry.png) [截图 2](campaigns-fidelity-2026-10-30/44-line-fullscreen.png) |
| CMP-068 | LINE 积木和编辑工具未对齐 | 已实现并留存界面证据 | 补齐 LINE 拖拽块、消息堆栈、工具和设备预览 [截图 1](campaigns-fidelity-2026-10-30/44-line-fullscreen.png) |
| CMP-069 | 渠道选择和导航未按原版复刻 | 已实现并留存界面证据 | Multichannel 先选渠道，随后 Channels tabs 和 Add channel [截图 1](campaigns-fidelity-2026-10-30/53-multichannel-first.png) [截图 2](campaigns-fidelity-2026-10-30/24-multichannel-compose.png) |
| CMP-070 | Preview and test 显示旧消息 | 已实现并留存界面证据 | 预览/测试读取选中子渠道和变体，不继承父级旧消息，先保存再测试 [截图 1](campaigns-fidelity-2026-10-30/25-multichannel-current-preview.png) |
| CMP-071 | API Campaign 错用了普通五步流程 | 已实现并留存界面证据 | API Campaign 改为独立单页，移除普通五步和模拟事件按钮 [截图 1](campaigns-fidelity-2026-10-30/05-api-campaign.png) |
| CMP-072 | API Campaign 渠道变体标识和示例缺失 | 已实现，待完整界面验收 | 补齐九个渠道、稳定 Variation UUID、外部参考和真实本地回执示例 [截图 1](campaigns-fidelity-2026-10-30/06-api-variations.png) |
| CMP-073 | Feature flag experiment 步骤不一致 | 已实现并留存界面证据 | Feature Flag Experiment 改为独立四步 [截图 1](campaigns-fidelity-2026-10-30/41-feature-experiment-basics.png) |
| CMP-074 | Experiment Basics 未复刻实验与 Feature Flag 设置 | 已实现，待完整界面验收 | 补齐真实 Feature Flag、属性覆盖、变体权重、校验和实验分配 [截图 1](campaigns-fidelity-2026-10-30/41-feature-experiment-basics.png) |
| CMP-075 | Create with Operator 被实现成另一种活动类型 | 部分补齐 | 补齐 Operator 对话、历史、附件、展开、清空及草稿审批；**剩余：已接入可配置 AI 服务并严格生成草稿；当前无可用 AI 服务，成功生成分支仅通过 mock 回归。PDF/DOCX 只保留文件，尚无正文提取。** [截图 1](campaigns-fidelity-2026-10-30/42-operator.png) [截图 2](campaigns-fidelity-2026-10-30/43-operator-expanded.png) |
| CMP-076 | 已上线活动缺少 Campaign Analytics 详情入口 | 已实现并留存界面证据 | Active 名称默认进入 Campaign Analytics，保留独立编辑入口 [截图 1](campaigns-fidelity-2026-10-30/45-active-analytics.png) |
| CMP-077 | 活动性能与 Historical Performance 未复刻 | 已实现并留存界面证据 | 补齐变体性能、列管理、点击明细、历史图表、筛选及 CSV [截图 1](campaigns-fidelity-2026-10-30/48-historical-metrics.png) [截图 2](campaigns-fidelity-2026-10-30/49-historical-chart.png) |
| CMP-078 | 活动变更记录未复刻 | 已实现并留存界面证据 | 补齐变更记录筛选、Before/After 和真实审计记录 [截图 1](campaigns-fidelity-2026-10-30/46-change-history.png) |
| CMP-079 | Campaign Monitoring 设置未复刻 | 部分补齐 | 补齐 Monitoring 阈值/时间窗/通知偏好、持久化和本地告警记录；**剩余：设置和阈值评估可用，告警仅记入本地数据库；未接入外部 Email/Webhook 通知服务。** [截图 1](campaigns-fidelity-2026-10-30/47-campaign-monitoring.png) |

## 截图索引

| 页面状态 | 截图 | 完整快照 |
|---|---|---|
| 01-list | [PNG](campaigns-fidelity-2026-10-30/01-list.png) | [AX](campaigns-fidelity-2026-10-30/01-list.ax.txt) |
| 02-filters | [PNG](campaigns-fidelity-2026-10-30/02-filters.png) | [AX](campaigns-fidelity-2026-10-30/02-filters.ax.txt) |
| 03-columns | [PNG](campaigns-fidelity-2026-10-30/03-columns.png) | [AX](campaigns-fidelity-2026-10-30/03-columns.ax.txt) |
| 04-create-bottom | [PNG](campaigns-fidelity-2026-10-30/04-create-bottom.png) | [AX](campaigns-fidelity-2026-10-30/04-create-bottom.ax.txt) |
| 04-create | [PNG](campaigns-fidelity-2026-10-30/04-create.png) | [AX](campaigns-fidelity-2026-10-30/04-create.ax.txt) |
| 05-api-campaign | [PNG](campaigns-fidelity-2026-10-30/05-api-campaign.png) | [AX](campaigns-fidelity-2026-10-30/05-api-campaign.ax.txt) |
| 06-api-variations | [PNG](campaigns-fidelity-2026-10-30/06-api-variations.png) | [AX](campaigns-fidelity-2026-10-30/06-api-variations.ax.txt) |
| 07-email-sending-settings | [PNG](campaigns-fidelity-2026-10-30/07-email-sending-settings.png) | [AX](campaigns-fidelity-2026-10-30/07-email-sending-settings.ax.txt) |
| 08-email-advanced | [PNG](campaigns-fidelity-2026-10-30/08-email-advanced.png) | [AX](campaigns-fidelity-2026-10-30/08-email-advanced.ax.txt) |
| 09-email-languages | [PNG](campaigns-fidelity-2026-10-30/09-email-languages.png) | [AX](campaigns-fidelity-2026-10-30/09-email-languages.ax.txt) |
| 10-email-drag-editor | [PNG](campaigns-fidelity-2026-10-30/10-email-drag-editor.png) | [AX](campaigns-fidelity-2026-10-30/10-email-drag-editor.ax.txt) |
| 11-email-html-editor | [PNG](campaigns-fidelity-2026-10-30/11-email-html-editor.png) | [AX](campaigns-fidelity-2026-10-30/11-email-html-editor.ax.txt) |
| 12-email-gmail-promotion | [PNG](campaigns-fidelity-2026-10-30/12-email-gmail-promotion.png) | [AX](campaigns-fidelity-2026-10-30/12-email-gmail-promotion.ax.txt) |
| 13-schedule | [PNG](campaigns-fidelity-2026-10-30/13-schedule.png) | [AX](campaigns-fidelity-2026-10-30/13-schedule.ax.txt) |
| 14-schedule-action-based | [PNG](campaigns-fidelity-2026-10-30/14-schedule-action-based.png) | [AX](campaigns-fidelity-2026-10-30/14-schedule-action-based.ax.txt) |
| 15-schedule-api-triggered | [PNG](campaigns-fidelity-2026-10-30/15-schedule-api-triggered.png) | [AX](campaigns-fidelity-2026-10-30/15-schedule-api-triggered.ax.txt) |
| 16-audience | [PNG](campaigns-fidelity-2026-10-30/16-audience.png) | [AX](campaigns-fidelity-2026-10-30/16-audience.ax.txt) |
| 17-audience-filter-catalog | [PNG](campaigns-fidelity-2026-10-30/17-audience-filter-catalog.png) | [AX](campaigns-fidelity-2026-10-30/17-audience-filter-catalog.ax.txt) |
| 18-audience-user-lookup-result | [PNG](campaigns-fidelity-2026-10-30/18-audience-user-lookup-result.png) | [AX](campaigns-fidelity-2026-10-30/18-audience-user-lookup-result.ax.txt) |
| 18-audience-user-lookup | [PNG](campaigns-fidelity-2026-10-30/18-audience-user-lookup.png) | [AX](campaigns-fidelity-2026-10-30/18-audience-user-lookup.ax.txt) |
| 19-conversions | [PNG](campaigns-fidelity-2026-10-30/19-conversions.png) | [AX](campaigns-fidelity-2026-10-30/19-conversions.ax.txt) |
| 20-review | [PNG](campaigns-fidelity-2026-10-30/20-review.png) | [AX](campaigns-fidelity-2026-10-30/20-review.ax.txt) |
| 21-push-compose | [PNG](campaigns-fidelity-2026-10-30/21-push-compose.png) | [AX](campaigns-fidelity-2026-10-30/21-push-compose.ax.txt) |
| 22-push-settings | [PNG](campaigns-fidelity-2026-10-30/22-push-settings.png) | [AX](campaigns-fidelity-2026-10-30/22-push-settings.ax.txt) |
| 23-variant-actions | [PNG](campaigns-fidelity-2026-10-30/23-variant-actions.png) | [AX](campaigns-fidelity-2026-10-30/23-variant-actions.ax.txt) |
| 24-multichannel-compose | [PNG](campaigns-fidelity-2026-10-30/24-multichannel-compose.png) | [AX](campaigns-fidelity-2026-10-30/24-multichannel-compose.ax.txt) |
| 25-multichannel-current-preview | [PNG](campaigns-fidelity-2026-10-30/25-multichannel-current-preview.png) | [AX](campaigns-fidelity-2026-10-30/25-multichannel-current-preview.ax.txt) |
| 26-content-card | [PNG](campaigns-fidelity-2026-10-30/26-content-card.png) | [AX](campaigns-fidelity-2026-10-30/26-content-card.ax.txt) |
| 27-content-platform-actions | [PNG](campaigns-fidelity-2026-10-30/27-content-platform-actions.png) | [AX](campaigns-fidelity-2026-10-30/27-content-platform-actions.ax.txt) |
| 28-content-settings | [PNG](campaigns-fidelity-2026-10-30/28-content-settings.png) | [AX](campaigns-fidelity-2026-10-30/28-content-settings.ax.txt) |
| 29-banner | [PNG](campaigns-fidelity-2026-10-30/29-banner.png) | [AX](campaigns-fidelity-2026-10-30/29-banner.ax.txt) |
| 30-banner-fullscreen | [PNG](campaigns-fidelity-2026-10-30/30-banner-fullscreen.png) | [AX](campaigns-fidelity-2026-10-30/30-banner-fullscreen.ax.txt) |
| 31-iam-compose | [PNG](campaigns-fidelity-2026-10-30/31-iam-compose.png) | [AX](campaigns-fidelity-2026-10-30/31-iam-compose.ax.txt) |
| 32-iam-traditional | [PNG](campaigns-fidelity-2026-10-30/32-iam-traditional.png) | [AX](campaigns-fidelity-2026-10-30/32-iam-traditional.ax.txt) |
| 33-iam-traditional-design | [PNG](campaigns-fidelity-2026-10-30/33-iam-traditional-design.png) | [AX](campaigns-fidelity-2026-10-30/33-iam-traditional-design.ax.txt) |
| 34-iam-traditional-settings | [PNG](campaigns-fidelity-2026-10-30/34-iam-traditional-settings.png) | [AX](campaigns-fidelity-2026-10-30/34-iam-traditional-settings.ax.txt) |
| 35-sms | [PNG](campaigns-fidelity-2026-10-30/35-sms.png) | [AX](campaigns-fidelity-2026-10-30/35-sms.ax.txt) |
| 36-webhook | [PNG](campaigns-fidelity-2026-10-30/36-webhook.png) | [AX](campaigns-fidelity-2026-10-30/36-webhook.ax.txt) |
| 37-webhook-request | [PNG](campaigns-fidelity-2026-10-30/37-webhook-request.png) | [AX](campaigns-fidelity-2026-10-30/37-webhook-request.ax.txt) |
| 38-whatsapp | [PNG](campaigns-fidelity-2026-10-30/38-whatsapp.png) | [AX](campaigns-fidelity-2026-10-30/38-whatsapp.ax.txt) |
| 39-whatsapp-message-types | [PNG](campaigns-fidelity-2026-10-30/39-whatsapp-message-types.png) | [AX](campaigns-fidelity-2026-10-30/39-whatsapp-message-types.ax.txt) |
| 40-line-entry | [PNG](campaigns-fidelity-2026-10-30/40-line-entry.png) | [AX](campaigns-fidelity-2026-10-30/40-line-entry.ax.txt) |
| 41-feature-experiment-basics | [PNG](campaigns-fidelity-2026-10-30/41-feature-experiment-basics.png) | [AX](campaigns-fidelity-2026-10-30/41-feature-experiment-basics.ax.txt) |
| 42-operator | [PNG](campaigns-fidelity-2026-10-30/42-operator.png) | [AX](campaigns-fidelity-2026-10-30/42-operator.ax.txt) |
| 43-operator-expanded | [PNG](campaigns-fidelity-2026-10-30/43-operator-expanded.png) | [AX](campaigns-fidelity-2026-10-30/43-operator-expanded.ax.txt) |
| 44-line-fullscreen | [PNG](campaigns-fidelity-2026-10-30/44-line-fullscreen.png) | [AX](campaigns-fidelity-2026-10-30/44-line-fullscreen.ax.txt) |
| 45-active-analytics | [PNG](campaigns-fidelity-2026-10-30/45-active-analytics.png) | [AX](campaigns-fidelity-2026-10-30/45-active-analytics.ax.txt) |
| 46-change-history | [PNG](campaigns-fidelity-2026-10-30/46-change-history.png) | [AX](campaigns-fidelity-2026-10-30/46-change-history.ax.txt) |
| 47-campaign-monitoring | [PNG](campaigns-fidelity-2026-10-30/47-campaign-monitoring.png) | [AX](campaigns-fidelity-2026-10-30/47-campaign-monitoring.ax.txt) |
| 48-historical-metrics | [PNG](campaigns-fidelity-2026-10-30/48-historical-metrics.png) | [AX](campaigns-fidelity-2026-10-30/48-historical-metrics.ax.txt) |
| 49-historical-chart | [PNG](campaigns-fidelity-2026-10-30/49-historical-chart.png) | [AX](campaigns-fidelity-2026-10-30/49-historical-chart.ax.txt) |
| 50-messaging-channels | [PNG](campaigns-fidelity-2026-10-30/50-messaging-channels.png) | [AX](campaigns-fidelity-2026-10-30/50-messaging-channels.ax.txt) |
| 51-copy-workspace-destination | [PNG](campaigns-fidelity-2026-10-30/51-copy-workspace-destination.png) | [AX](campaigns-fidelity-2026-10-30/51-copy-workspace-destination.ax.txt) |
| 51-copy-workspace | [PNG](campaigns-fidelity-2026-10-30/51-copy-workspace.png) | [AX](campaigns-fidelity-2026-10-30/51-copy-workspace.ax.txt) |
| 52-priority-sorter | [PNG](campaigns-fidelity-2026-10-30/52-priority-sorter.png) | [AX](campaigns-fidelity-2026-10-30/52-priority-sorter.ax.txt) |
| 53-multichannel-first | [PNG](campaigns-fidelity-2026-10-30/53-multichannel-first.png) | [AX](campaigns-fidelity-2026-10-30/53-multichannel-first.ax.txt) |

## 额外修复的集成缺陷

- 邮件预览按当前变体读取正文、样式和 Sending 信息，纯文本不作为 HTML 注入。
- 使用最新草稿引用保存，防止子编辑器保存后旧回调覆盖新内容；离开页面先保存，忽略已离开页面的异步返回。
- 多渠道子消息不继承父级旧正文；保留历史 channelContent，测试前持久化选择，拒绝不属于该活动的测试快照。
- 修复 brief 上传返回 ID 与实际存储 ID 不同导致无法下载。
- 邮件各变体统一校验发件策略；语言主题/预览文本和 GA 参数进入编译，避免设置只停留在表单。
- 原生投递不支持 IP pool/Extras、附件未核实大小时明确拒绝，避免静默丢失已配置设置。
- 修复全局 table 最小宽度造成 Review 横向溢出；补齐 IAM 独立详情的 brief 和公共 UUID。

## 详细实现说明

- [shared-forms-fidelity-2026-10-30.md](shared-forms-fidelity-2026-10-30.md)
- [email-fidelity-2026-10-30.md](email-fidelity-2026-10-30.md)
- [channel-fidelity-2026-10-30.md](channel-fidelity-2026-10-30.md)
- [campaign-list-fidelity-2026-10-30.md](campaign-list-fidelity-2026-10-30.md)
- [special-campaign-fidelity-2026-10-30.md](special-campaign-fidelity-2026-10-30.md)
- [campaign-operator-fidelity-2026-10-30.md](campaign-operator-fidelity-2026-10-30.md)
- [campaign-analytics-fidelity-2026-10-30.md](campaign-analytics-fidelity-2026-10-30.md)
