# Campaigns：12 项剩余差异修复与复核

本轮已修复 12 项原始页面差异，并在生产构建上保存对应截图与 AX 快照。原始审计文件保留不变。这里的“已复核”针对原条目的页面与交互范围；没有把外部服务缺失改称已实现，也没有宣称整站逐像素 1:1。

79 项历史清单当前：64 项有界面证据，15 项已实现但仍待完整交互验收。逐项机器记录：[campaigns-fidelity-status-2026-10-30.json](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-fidelity-status-2026-10-30.json>)。

## 本轮验证

- 304/304 模型与集成测试通过，包含真实 PDF/DOCX 文本提取、异步附件解析、受众 SQL、队列和发送窗口。
- 25/25 本机 HTTP 检查通过：14 项原回归 + 11 项队列/预览/能力/监控检查。
- 最终 `next build` 编译、TypeScript 检查和页面生成通过；`git diff --check` 通过。
- 浏览器验证使用 Node 22 生产服务与隔离 SQLite；未修改 Braze 源站，未发送外部消息。
- 本轮留存 27 张本地截图、27 份本地 AX、3 张新增源站截图、32 份新增源站 AX。原审计源站截图继续保留。

## 12 项修复矩阵

| ID | 修复内容 | 生产版证据 |
|---|---|---|
| CMP-001 全局导航与布局 | 使用源站导航/品牌/顶部图标，补齐真实 Minimize、工作区头像、Home、侧栏滚动与底部品牌；Operator 打开时主区域让出侧栏空间。 | [1](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-001-campaign-list.png>) · [2](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-075-operator.png>) |
| CMP-019 Intelligent Timing | 补齐 Quiet Hours、热门/自定义兜底、前置条件、渠道选择与实际 UTC 投递分布；预览与调度共用真实受众及兜底逻辑。 | [1](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-019-intelligent-popular.png>) · [2](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-019-intelligent-custom.png>) · [3](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-019-delivery-preview.png>) |
| CMP-020 Action-Based 触发器 | 按源站逐字核对普通渠道 22 项、5 个分组；独立保留 IAM 9 项。补齐可搜索、可滚动、键盘可操作的触发器浮层及添加流程。 | [1](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-020-trigger-catalog.png>) · [2](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-020-trigger-search.png>) · [3](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-020-trigger-selected.png>) |
| CMP-026 Additional Filters | 补齐 16 类、6 个其他入口及源站三级目录；浮层支持上下自动定位、图标、返回、搜索及点击外部关闭，组标题与拖动操作保留。可用字段接入同一受众 SQL。 | [1](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-026-filter-catalog.png>) · [2](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-026-filter-sessions.png>) · [3](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-026-filter-session-count.png>) |
| CMP-028 Optimize with BrazeAI | 补齐源站单变体状态的禁用开关、至少两个变体提示与 Compose messages 快捷跳转；服务不可用时不会接受无实际作用的优化开关。 | [1](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-028-ab-prerequisite.png>) · [2](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-028-compose-shortcut.png>) |
| CMP-030 Total Population 与队列 | 精确人数、占比、时间、刷新、breakdown 与 LTV 展开均连接实际数据；队列使用 SQLite 持久化，记录 Queued/Running/Completed/Failed/Cancelled、历史及结果。 | [1](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-030-calculation-queue.png>) · [2](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-030-calculation-history.png>) · [3](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-030-additional-statistics.png>) |
| CMP-034 Agentic Standards | 按源站当前无 Standards 的状态呈现紧凑卡片和 Create one in Agent Console 链接；加载失败单独显示，避免误报空状态。 | [1](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-034-standards.png>) |
| CMP-038 邮件 Sending Info 权限 | Limited access 的 From/IP pool 只读、Customize reply-to 禁用；允许的预设 Reply-to/BCC 保持可选，显式能力覆盖仍有效。 | [1](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-038-email-sending.png>) |
| CMP-045 邮件内容编辑外层导航 | 对齐 CONTENT → Design and Build、Link Management、Personalization、Languages，以及 Copy 和固定底部 Style Settings；移除重复 Sending/Liquid/Subject 层级。 | [1](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-045-email-content.png>) |
| CMP-066 WhatsApp 编辑层级 | 按订阅组→只读实际 WABA→消息类型→8 种响应布局→左预览/右 Compose-Test 呈现；账户工具移入 Test，移除主编辑中的模拟窗口；响应窗口以真实入站事件判断。 | [1](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-066-whatsapp-type.png>) · [2](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-066-whatsapp-layout-cards.png>) · [3](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-066-whatsapp-new-response.png>) |
| CMP-075 BrazeAI Operator | 保留对话侧栏、历史、附件、展开和 Auto-approve，主页面让位、菜单收起；PDF/DOCX 可在隔离 worker 中实际提取文字，原文件可下载，配置 AI 服务后走真实网关。 | [1](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-075-operator.png>) · [2](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-075-brief-context.png>) · [3](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-075-history.png>) |
| CMP-079 Campaign Monitoring | 源站初始状态的两个时长/阈值留空、两种通知渠道不选；行内控件保持可编辑，零阈值和禁用行的空字段在保存后正确回显。 | [1](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-079-monitor-blank.png>) · [2](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-079-monitor-persisted.png>) |

## 仍需配置或另行实现的能力

这些是服务/数据能力限制，与原条目中的缺失页面入口分别记录：

- CMP-019：未连接 Braze 远程预测训练；本地使用已有 best_send_hour 与真实会话分布，缺数据时采用明确的兜底。
- CMP-026：没有数据或尚未实现的 cohort、预测、地理半径、Canvas variation、survey 等高级集成字段显示不可用，目录存在不等于执行能力已实现。
- CMP-028：当前工作区没有 BrazeAI 优化服务；满足两变体前置条件后仍不会伪装为可优化。
- CMP-030：这是本地持久化队列；重启后的待办在后续队列请求恢复，未知 ETA/LTV 显示 —。
- CMP-034：复核覆盖源站无 Standards 的实际空状态；未连接远程 Standards 评估服务。
- CMP-045：复核针对原条目的外层导航；第三方 Bee 编辑器内部不属于本轮已验证范围。
- CMP-066：Meta 模板审批、供应商同步和真实发送依赖工作区提供商配置；本轮没有向外发送。
- CMP-075：当前没有真实 AI 网关凭据；成功生成流程通过受控适配器测试，未把真实服务可用性记作已验证。扫描 PDF 无 OCR，受损/加密文件有明确提示。
- CMP-079：外部 Email/Webhook 告警发送尚未连接；设置保存和本地评估可用，不能等同于外部通知已送达。

未完成整站所有视口、所有高级字段编辑状态与第三方内部编辑器的逐像素验收。后续发现应继续写入差异清单，而不是据此宣称整站完全一致。

## 截图与快照索引

同名 `.ax.txt` 保存该截图对应页面结构，便于核对控件、只读/禁用状态和值。

- [fixed-001-campaign-list.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-001-campaign-list.png>) · [fixed-001-campaign-list.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-001-campaign-list.ax.txt>)
- [fixed-019-delivery-preview.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-019-delivery-preview.png>) · [fixed-019-delivery-preview.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-019-delivery-preview.ax.txt>)
- [fixed-019-intelligent-custom.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-019-intelligent-custom.png>) · [fixed-019-intelligent-custom.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-019-intelligent-custom.ax.txt>)
- [fixed-019-intelligent-popular.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-019-intelligent-popular.png>) · [fixed-019-intelligent-popular.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-019-intelligent-popular.ax.txt>)
- [fixed-020-trigger-catalog.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-020-trigger-catalog.png>) · [fixed-020-trigger-catalog.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-020-trigger-catalog.ax.txt>)
- [fixed-020-trigger-search.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-020-trigger-search.png>) · [fixed-020-trigger-search.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-020-trigger-search.ax.txt>)
- [fixed-020-trigger-selected.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-020-trigger-selected.png>) · [fixed-020-trigger-selected.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-020-trigger-selected.ax.txt>)
- [fixed-026-filter-catalog.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-026-filter-catalog.png>) · [fixed-026-filter-catalog.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-026-filter-catalog.ax.txt>)
- [fixed-026-filter-session-count.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-026-filter-session-count.png>) · [fixed-026-filter-session-count.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-026-filter-session-count.ax.txt>)
- [fixed-026-filter-sessions.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-026-filter-sessions.png>) · [fixed-026-filter-sessions.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-026-filter-sessions.ax.txt>)
- [fixed-028-ab-prerequisite.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-028-ab-prerequisite.png>) · [fixed-028-ab-prerequisite.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-028-ab-prerequisite.ax.txt>)
- [fixed-028-compose-shortcut.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-028-compose-shortcut.png>) · [fixed-028-compose-shortcut.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-028-compose-shortcut.ax.txt>)
- [fixed-030-additional-statistics.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-030-additional-statistics.png>) · [fixed-030-additional-statistics.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-030-additional-statistics.ax.txt>)
- [fixed-030-calculation-history.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-030-calculation-history.png>) · [fixed-030-calculation-history.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-030-calculation-history.ax.txt>)
- [fixed-030-calculation-queue.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-030-calculation-queue.png>) · [fixed-030-calculation-queue.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-030-calculation-queue.ax.txt>)
- [fixed-034-standards.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-034-standards.png>) · [fixed-034-standards.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-034-standards.ax.txt>)
- [fixed-038-email-sending.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-038-email-sending.png>) · [fixed-038-email-sending.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-038-email-sending.ax.txt>)
- [fixed-045-email-content.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-045-email-content.png>) · [fixed-045-email-content.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-045-email-content.ax.txt>)
- [fixed-066-whatsapp-eight-layouts.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-066-whatsapp-eight-layouts.png>) · [fixed-066-whatsapp-eight-layouts.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-066-whatsapp-eight-layouts.ax.txt>)
- [fixed-066-whatsapp-layout-cards.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-066-whatsapp-layout-cards.png>) · [fixed-066-whatsapp-layout-cards.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-066-whatsapp-layout-cards.ax.txt>)
- [fixed-066-whatsapp-new-response.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-066-whatsapp-new-response.png>) · [fixed-066-whatsapp-new-response.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-066-whatsapp-new-response.ax.txt>)
- [fixed-066-whatsapp-type.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-066-whatsapp-type.png>) · [fixed-066-whatsapp-type.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-066-whatsapp-type.ax.txt>)
- [fixed-075-brief-context.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-075-brief-context.png>) · [fixed-075-brief-context.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-075-brief-context.ax.txt>)
- [fixed-075-history.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-075-history.png>) · [fixed-075-history.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-075-history.ax.txt>)
- [fixed-075-operator.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-075-operator.png>) · [fixed-075-operator.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-075-operator.ax.txt>)
- [fixed-079-monitor-blank.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-079-monitor-blank.png>) · [fixed-079-monitor-blank.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-079-monitor-blank.ax.txt>)
- [fixed-079-monitor-persisted.png](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-079-monitor-persisted.png>) · [fixed-079-monitor-persisted.ax.txt](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/fixed-079-monitor-persisted.ax.txt>)

## 实现与检查记录

- [shared-forms.md](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/shared-forms.md>)
- [cmp-001-navigation-fidelity-2026-10-30.md](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/cmp-001-navigation-fidelity-2026-10-30.md>)
- [cmp-066-whatsapp-fidelity-2026-10-30.md](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/cmp-066-whatsapp-fidelity-2026-10-30.md>)
- [campaign-brief-text-2026-10-30.md](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaign-brief-text-2026-10-30.md>)
- [model-tests.log](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/model-tests.log>)
- [production-build.log](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/production-build.log>)
- [http-core-14.json](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/http-core-14.json>)
- [http-followup-11.json](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/implementation/campaigns-followup-2026-10-30/http-followup-11.json>)
