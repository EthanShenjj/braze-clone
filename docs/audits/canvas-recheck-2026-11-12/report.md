# Canvas 1:1 复刻复查

日期：2026-11-12。检查代码与生产版本：`702bbcb4d0cbbfabf33ccff84ab2d1f0315bb420`。

**结论：当前未达到 Braze Canvas 全量 1:1，界面、交互、运行服务三个维度均有明确差异。不能按“1:1 完成”验收，也不能用现有测试通过率换算复刻百分比。**

## 检查对象与证据边界

- 源站：[Braze Canvas 列表](https://dashboard-09.braze.com/engagement/canvas/canvas/6af4374c46d3080087f1c5d2?locale=en)。打开现有对照草稿 `6af5503cd8512f008c15c8bd`，本次没有新建源站 Canvas、保存源站配置、启动旅程或发送消息。
- 生产：[Canvas 列表](https://braze-clone.vercel.app/engagement/canvas?locale=en)，使用既有 `canvas_welcome` 草稿检查。
- 本轮实时对照：列表、高级筛选、Basics、Entry Schedule、Send Settings、Build Canvas、展开概览，以及生产 Optimizer 的 SMS 渠道。
- 两边同为 **1280×720** 视口。截图与 AX 分开保存；尺寸比较另有 DOM 几何记录。不同工作区名称、草稿数量、试用天数和用户数据不计为功能差异。
- 运行能力通过当前代码调用链和模型校验确认，没有向真实用户运行旅程或外发消息。
- REA `binary_session` 仍被本机 `SwiftBridging` 重复定义阻止。原始失败见 [rea-session-blocker.json](rea-session-blocker.json)。本轮没有成功的 REA 引擎分析记录，页面事实来自 CUA，代码事实来自当前仓库读取与测试。

## 已确认、影响验收的差异

| 编号 | 优先级 | 差异及用户影响 | 当前证据 |
| --- | --- | --- | --- |
| R01 | P1 | **SMS Optimizer 进入 LINE 编辑器。** 选择 SMS/MMS/RCS 后，正文显示 LINE subscription group / LINE Composer，不能正常配置短信优化内容。 | 本轮生产浏览器已复现：[截图](production-08-sms-optimizer-line-bug.jpg)、[AX](production-08-sms-optimizer-line-bug.ax.txt)。代码：`app/ui/canvas-channel-editor.tsx:41` 将 SMS 交给通用编辑器，`app/ui/campaign-message-editor.tsx:13` 未匹配 SMS，回退 LINE。 |
| R02 | P1 | **指定时间、周期、Action-Based、API-Triggered 的完整入组执行未接通。** 表单可配置，启动校验拒绝，仅能进行受支持的即时本地流程。 | `lib/canvas-wizard-model.ts:122,125`；`lib/braze-store.ts:2222` 启动使用该校验。 |
| R03 | P1 | **六类高级步骤不能执行：Action Paths、Content Optimizer、Agent、Audience Sync、Send to Destination、Feature Flag。** 图上有入口或配置，不代表存在运行链路。 | `lib/canvas-model.ts:74` 的执行白名单排除这些类型；本轮逐类型模型校验确认拒绝。 |
| R04 | P1 | **顶层多变体与 Winning Path 未接通。** 无法完成多变体真实分配和自动胜出路径选择。 | `lib/canvas-model.ts:62` 拒绝顶层多变体；`lib/canvas-step-model.ts:67` 拒绝 Winning Path。普通 Experiment Paths 固定比例分流已有实现，不应一起列为缺失。 |
| R05 | P1 | **Canvas 转化归因没有完整事件链路。** 转化表单、匹配函数可用，但真实事件入口只执行 Campaign 归因。 | `lib/canvas-conversion-model.ts:10` 的匹配函数只有测试调用；`lib/braze-store.ts:2751` 调用 Campaign 归因，`:2727` 要求 getCampaign，Canvas ID 会被跳过。 |
| R06 | P1 | **入组仍有演示硬上限。** 仅检查按 ID 排序的前 100 个 reachable 用户，每轮最多执行 10 人，与完整受众执行不等价。 | `lib/braze-store.ts:2231` 的 `LIMIT 100`；`:2240` 的 `slice(...10)`。 |
| R07 | P1 | **生产新建草稿只保存在浏览器。** 新草稿不能跨设备共享，且历史、执行刷新、跨工作区复制、完整编辑器及部分测试入口受限。既有服务器记录不自动受此限制。 | 本轮列表实时出现 browser-only 提示：[AX](production-01-list.ax.txt)；`next.config.ts:22`、`app/ui/canvas-workspace.tsx:151`、`lib/canvas-browser-store.ts:19`。 |
| R08 | P1 | **Test Canvas 整条旅程测试没有实现。** 当前按钮无条件 disabled，不会随合法配置和服务条件变为完整测试流程。 | `app/ui/canvas-build-toolbar.tsx:12`。本轮源站对照草稿的按钮也禁用，不能把两边当前禁用外观当作视觉差异；缺口是项目缺少可用状态和运行流程。 |
| R09 | P1 | **Standards 评估只具备配置展示。** 选择 Standard 后执行按钮仍无条件禁用，步骤结果为固定空结果。 | `app/ui/canvas-standards.tsx:9,10`。当前源站工作区没有 Standard，本轮没有验证源站完整评估运行；不能把空状态本身视为错误。 |
| R10 | P1 | **非 SMS 消息步骤仍主要生成模拟事件。** Email、Push、WhatsApp 等的 delivered 记录不能等同真实渠道送达，IAM 在该链路也没有完成 SDK 消息物化。 | `lib/braze-store.ts:2145,2148`。SMS 已有受 provider 配置及发送开关控制的真实队列分支 `:2151,2288`，不能写成所有渠道均无真实发送能力。 |
| R11 | P2 | **基础页尺寸与底栏行为明显不同。** 源站名称框宽 437px，项目 620px；源站 Save 在首屏 y653，项目 Save 在 y1194；源站干净草稿 Save 禁用，项目仍可点。 | 本轮 [几何记录](basics-geometry.json)、[源站图](source-03-basics.jpg)、[生产图](production-03-basics.jpg)。项目 `.field max-width:620px`：`app/ui/canvas-wizard.module.css:19,20`；footer 仅普通布局 `:37`；Save 仅按 saving 禁用：`app/ui/canvas-wizard.tsx:189`。 |
| R12 | P2 | **展开概览信息与排版不等价。** 缺少 Changes Since Last Viewed；发送摘要没有 Workspace Messaging Rate Limits 状态，信息密度、图形位置和图标仍不同。 | 本轮 [源站图](source-07-expanded.jpg)、[生产图](production-07-expanded.jpg) 及同期 AX；`app/ui/canvas-wizard.tsx:187`。转化截止窗口的差异有此前源站证据，本轮草稿未配置转化事件，不将其列为本次实时观察。 |

Braze 官方说明明确包含计划、事件和 API 三种入组，并提供相应运行流程，因而 R02 是执行能力缺口。[创建 Canvas](https://www.braze.com/docs/user_guide/messaging/canvas/create_a_canvas)

Action Paths 需要在评估窗口内处理用户行为，并按首个事件或排名决定路径；当前项目尚未运行该步骤，不能以字段目录齐全作为完成依据。[Action Paths](https://www.braze.com/docs/user_guide/messaging/canvas/canvas_components/action_paths)

Test Canvas 的完整流程包含选择测试用户、可选收件人和执行测试，支持时间与消息路径预览；项目目前缺少这条流程。[Preview user paths](https://www.braze.com/docs/user_guide/messaging/canvas/testing_canvases/preview_user_paths)

## 当前代码另有风险，尚未本轮浏览器复现

1. 通用消息编辑器的测试回调仅打开固定 `NativeMessagePreview`，缺少完整用户／收件人／发送流程；variantId 回调被忽略，存在预览非当前变体的路径。位置：`app/ui/canvas-channel-editor.tsx:34,38`、`app/ui/message-controls.tsx:42,46`。
2. 通用消息编辑器仅在 Done 时把内部 state 提交父图，未单独注册未保存导航保护。SMS / WhatsApp 另有保护，不应一概判定所有编辑器都无保护。位置：`app/ui/canvas-channel-editor.tsx:24,30,33`、`app/ui/live-canvas.tsx:79`。
3. Create with Operator 无条件禁用；此前源站 Email Optimizer 快照为可用状态。本轮未重验该源站可用态，保留为已有证据与现有代码差异。位置：`app/ui/canvas-channel-editor.tsx:39`，此前 `../canvas-deep-2026-11-12/source-09-optimizer-email.ax.txt`。

## 已有实现与不能误报的部分

- 列表高级筛选的主要字段本轮已对齐：Canvas experience、Created by、Last edited by、日期类型、三个 Show only 复选框及 Target segment。见 source/production-02 快照。
- 六步向导、brief 展示、转化事件配置、基本节点编辑、Delay、User Update、Context、普通分支、Audience Paths、Experiment Paths 已有实现。
- 智能时间持久化、发送前受众重验、exit/skip、静默等待、限速及全局频控已有实现，不再把它们整体列为“没有”。全部边界是否与 Braze 等价仍需逐场景验证。
- 帮助菜单的五个链接及官方 Wistia 视频已有实现。
- Source 与 production 的示例数据不同，不据此判定缺失。
- 不能把源站当前也因未完成配置而禁用的 Test Canvas，或没有 Standard 的空状态，直接视为按钮外观错误。

## 仍未证明等价的范围

所有渠道、多语言、多变体和完整测试子页；所有权限组合；已连接广告账户；服务配额和付费权限；完整模板库与交互导览；源站版本恢复范围；完整响应式、键盘与焦点行为；所有静默／时区／夏令时组合；完整转化归因及报表。不同状态没有共同分母，本轮不输出复刻百分比。

## 验证与操作清理

- 本轮 `npm run test:canvas`：**44/44 通过**。见 [测试输出](verification-tests.txt)。这些测试包含当前支持边界，不能证明未实现服务与 Braze 等价。
- Optimizer 复现仅在生产页面未保存图中添加审计节点。未点图 Save 或 Save and continue；复现后移除该临时节点并返回列表。
- [生产图回读](production-graph-cleanup.json) 确认仍只有 entry / delay / email 三个原节点，`auditOptimizerPersisted:false`。
- 向导步骤切换会按现有 go() 机制保存原草稿，因此修改时间可能更新；本次没有更改原向导字段，没有运行、发布或发送消息。
- 本轮新增的是审计资料；未修改业务源码，也未提交或重新部署。

建议修复顺序：先修 R01 的错误渠道编辑器和 R07 的生产草稿能力；再完成 R02–R06、R08–R10 的执行链路；然后按固定视口和数据夹具修 R11–R12，并补齐剩余状态的对照验收。
