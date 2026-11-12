# Canvas 对照复刻记录（2026-11-12）

> 后续已获用户明确授权，完成临时源站草稿深层补查及进一步实现。最新状态见 [Canvas 深层复刻与验收](canvas-deep-2026-11-12.md)；下文为首轮历史记录。

本轮按照真实 Braze 页面继续补齐 Canvas。**当前仍不能标记为全量 1:1 完成。** 下表区分已实现、已验收和仍需补齐的部分，避免把可保存的表单当作外部能力已接通。

## 对照依据与快照

- 工作区：Braze `6af4374c46d3080087f1c5d2`。
- 源站入口：<https://dashboard-09.braze.com/engagement/canvas/canvas/6af4374c46d3080087f1c5d2?locale=en>。
- [截图和 AX 快照索引](../audits/canvas-fidelity-2026-11-12/README.md)。本轮保留 44 组源站状态，覆盖列表、筛选、创建向导、13 种组件及其编辑器。
- 源站空白编辑流程最后执行 Discard changes；最终列表仍为原来的 3 条 Canvas。`source-43-more-options` 记录了这一状态。
- 再次点击源站 Create Canvas 的补查操作被自动审批拦截：可能创建远程草稿、改变共享账户状态，当前复刻授权未明确包含源站资源创建。之后未重试创建，也未通过其他工具或入口绕过该限制；使用已采集快照和官方文档继续本地实现。

## 本轮补齐

| 范围 | 实现与核验 |
| --- | --- |
| 列表状态 | All Statuses / Draft / Active / Stopped / Archived / Idle；支持实际记录筛选 |
| 高级筛选 | Canvas experience、创建人、编辑人、实际 Segment ID、创建/编辑日期范围、三项 Show only 标志 |
| 表格 | 四个可切换列、All Columns、Alerts Configured、标签、相对编辑时间、20 条默认分页和 10/20/40/60/100 选项 |
| 行操作 | 编辑、归档、复制、跨工作区复制；跨工作区草稿清除标签、受众条件及资源引用，保留路径结构；不同工作区写入被拒绝 |
| Priority Sorter | 连接已有真实排序管理器；源站只读状态另存截图 |
| Canvas brief | PDF/TXT/MD/CSV/DOCX/XLSX、15MB、上传/下载/移除/替换、随草稿保存；HTTP 验收 XLSX 文件回读 |
| 发送设置 | 工作区/自定义静默时段、跨天时间、最长 20 小时校验、延后/跳过、共享或分渠道限速；工作区设置独立持久化与并发校验 |
| 画布交互 | 184px 组件区、350px 入口卡、200px 节点、组件点选后网格放置、拖放、显式连线端口、删除清理、深拷贝节点、保留 variants |
| Delay | 专用双栏编辑器；Duration / Calendar date / Day of week；Hours/Days/Weeks、指定时间、时区、同日/下周策略、个性化表达式；实际排队恢复 |
| Decision Split | Segment、完整筛选组、AND/OR、排除组、真实用户查询；按命名 Yes/No 目标执行，支持合流 |
| Audience Paths | 排序分组、独立受众条件、Everyone Else、退出与命名路径目标；真实匹配与分流已验收 |
| Experiment Paths | 路径权重、控制组、平均分配、随机选路配置；实际按稳定用户分桶或每次运行分桶，权重校验；Winning Path 明确要求优化服务 |
| User Update | 多属性 Update/Remove、个性化、UI/Advanced JSON、65536 字符限制、Braze attributes 数组格式；预览无副作用，运行真实更新用户 |
| Context | 六种数据类型、最多 10 个变量、名称校验、排序/移除/测试；上下文按运行和用户持久化，延时恢复仍保留；个性化等待已验收 |
| Action Paths | 专用设置页、Evaluation Window、ranked order、分组/退出、21 项真实触发类型、真实自定义事件候选；深层配置和事件执行仍有差异，见后表 |
| Agent / Feature Flag / Audience Sync / Destination | 专用表单和实际工作区候选/空状态；未接通服务时保留真实限制，不伪造执行结果 |
| 邮件与其他消息渠道 | Email/Push/IAM/Content Cards/Webhook/LINE/Banner 复用已有完整渠道编辑器；SMS/WhatsApp 保留专用编辑器；邮件补上发送设置、正文和预览入口 |
| 图版本 | 图保存前存历史版本、列出最近 30 版、恢复前并发/工作区检查；恢复保留图及 variants |
| 重复保存 | 修复向导元数据 PATCH 更新后未同步画布版本号，导致下一次保存误报另一标签页已修改的问题；同步版本号时保留未保存节点 |

## 验证范围

- Node 22：Canvas 专项 36/36；整个项目单元测试 440/440。
- Next.js 生产构建通过，包含 TypeScript 检查。
- 隔离本地 SQLite 的 HTTP 验收：实际国家条件分流与用户更新、无副作用预览、Context 类型、图与 variants 回读、跨工作区复制及拒绝越界、XLSX 上传下载持久化、历史版本恢复和过期版本拒绝、工作区静默配置并发校验、显式路径绑定、Experiment 分配、Context 延时恢复、静默时段延后/跳过、每分钟限速排队与恢复。
- 浏览器验收详见快照索引中的 local 状态和 `browser-acceptance.md`。
- 测试仅使用 `/private/tmp/braze-canvas-fidelity-20261112.sqlite` 和单独构建数据库，`MESSAGE_DELIVERY_ENABLED=false`，不执行实际消息发送。本地模拟继承每次最多 10 名用户的范围，不等于 Braze 的实际投递规模。
- 同仓库 Audience 用例发现两处测试前提问题，仅调整 fixture：Push 草稿补齐必须的 title；币种聚合断言先按 currency 排序，消除随机资源 ID 导致的不稳定顺序。未放宽产品校验。

## 仍未达到 1:1 的地方

| 编号 | 剩余差异 | 当前边界/后续要求 |
| --- | --- | --- |
| C01 | Build Canvas 底栏与工具区 | Run evaluation、Detailed View、Maximum duration、Test Canvas 和源站折叠信息区尚未逐状态复刻；现有 Back/Save/Forward、缩放和展开布局仍不同 |
| C02 | Content Optimizer | 当前只有渠道选择、基础消息和免费版提示；Delivery/Optimizer/Agentic Standards 深层页与完整变体编辑仍需源站对照，优化服务尚未连接 |
| C03 | Action Paths 事件细节 | 21 项类型已对齐；除自定义事件候选外，消息交互、购买、属性变化等触发器的专用字段、窗口内事件评估和 ranked runtime 尚未补齐 |
| C04 | Agent Step | 真实候选、输出和说明表单已实现；具体 Agent 服务、执行及输出评估尚未接入 |
| C05 | Audience Sync | Google Ads/Facebook 空状态已对齐；已连接账户的选择器、受众创建和外部同步需实际集成与源站状态 |
| C06 | Send to Destination | Canvas/Decisioning Studio agent 类型与候选已实现；跨 Canvas 实际接收执行尚未接入 |
| C07 | Feature Flag | 真实候选和空状态已实现；功能开关步骤在旅程中的分配/变体执行尚未补齐 |
| C08 | Entry Schedule | 计划、Action-Based、API-Triggered 配置可以保存；指定时间/周期调度、完整事件/API 入场链路不能通过本地手动模拟替代，目前明确阻止假启动 |
| C09 | Conversion Events | 已保留九类候选；各事件深层配置、真实 app 范围及全部联动需要继续对照 |
| C10 | 多 Canvas variants 与 Winning Path | 保存/删除节点保留 variants；Canvas 顶层多变体实际投递和 Winning Path 服务仍有明确本地限制 |
| C11 | 消息步骤配置覆盖 | 本轮邮件发送设置和 HTML 正文已浏览器验收；所有渠道完整子页、Canvas 专属 Delivery/Intelligent Timing、跨语言/多变体/测试流程仍需逐状态对照，不能由共享 Campaign 编辑器推定完全一致；已观察到保存后默认 reply-to 候选重复，仍待清理 |
| C12 | 全部像素与微交互 | 信息图标、关闭提示、时间格式、开关、面板细节、响应式及部分文案尚有差异；本轮修正主要尺寸，未做所有状态逐像素断言 |
| C13 | 模板库、导览与帮助 | 当前模板库只有少量本地模板，More options 帮助菜单与源站 tour/eLearning/交互 demo 未全量复刻 |
| C14 | 列表筛选与地址同步 | 选项已补齐，但源站 URL 参数、返回列表保留状态及全部空结果/权限状态尚未完整验收 |
| C15 | 静默和限速的完整源站状态 | 本地保存和排队已验收；全部预设速率选项、消息静默与工作区静默组合、所有时区/夏令时边界尚未逐状态对照 |
| C16 | 图历史版本页 | 当前功能为图历史恢复，布局及是否应同时恢复向导元数据未从源站确认；不能视为完整 Braze 版本体验 |
| C17 | 浏览器存储模式 | 浏览器草稿不能运行后端模拟或跨工作区复制；相关按钮明确禁用。当前验收使用服务器持久化模式 |

用户随后已明确允许创建临时对照草稿；深层补查和进一步修复见 [后续报告](canvas-deep-2026-11-12.md)。真实外部服务执行仍需对应服务配置。

## 官方文档参考

- [Canvas 创建](https://www.braze.com/docs/user_guide/messaging/canvas/create_a_canvas)
- [静默时段](https://www.braze.com/docs/user_guide/messaging/messaging_fundamentals/quiet_hours)
- [工作区静默时段](https://www.braze.com/docs/user_guide/messaging/messaging_fundamentals/quiet_hours/workspace_quiet_hours)
- [频控及限速](https://www.braze.com/docs/user_guide/messaging/messaging_fundamentals/frequency_capping)

本轮未提交 Git、未推送、未部署到远程环境。预览为本机 `127.0.0.1:3220`。
