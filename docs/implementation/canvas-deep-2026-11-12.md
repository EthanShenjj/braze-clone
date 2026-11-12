# Canvas 深层复刻与验收（2026-11-12，授权草稿补查）

本轮继续处理 [首轮差异表](canvas-fidelity-2026-11-12.md) 中的 Canvas 深层状态。**仍不能标记全量 1:1 完成。** 已补齐的编辑界面、已验证的本地执行，以及仍缺服务或交互的部分分别记录如下。

## 源站对照范围

用户已明确允许“创建临时对照草稿”。在 Braze 工作区 `6af4374c46d3080087f1c5d2` 创建了一个临时 Canvas：

- [临时草稿 6af5503cd8512f008c15c8bd](https://dashboard-09.braze.com/engagement/canvas/6af5503cd8512f008c15c8bd/6af4374c46d3080087f1c5d2?isEditing=true)。API-sendable ID 为 `8df1bd9e-8d6d-4898-87e3-02a69777a263`。
- 源站列表由 3 条 Draft 增至 4 条；原有三条未编辑。未启动 Canvas、未提交评估、未发送测试或正式消息。
- 编辑器中名称改为 `Canvas fidelity audit - 2026-11-12 (temporary)`。包含深层配置的保存曾被源站 `subscription group must not be blank` 拒绝；重新查看列表时仍是 `New Canvas - November 12, 2026`。再次检查保存按钮为禁用状态，**不能把界面中的改名和深层编辑视作已成功保存**。临时草稿仍保留，不再新建第二条。
- 首次操作遇到审批服务自身的 Bad Request，核实未创建后，在用户明确授权范围内重试成功。之前的“缺少源站创建授权”限制已解除。
- [深层截图和 AX 索引](../audits/canvas-deep-2026-11-12/README.md) 记录实际源站和本地状态；源站有一处切换转化事件后的 Unexpected error，也已保存，不将源站异常当作应复刻行为。

## 已补齐与实际验证

| 范围 | 本轮实现 | 验证 |
| --- | --- | --- |
| 构建工具栏 | Run evaluation 配置弹窗；Detailed/Simplified View；100/75/50/25/10%；独立全屏；Maximum Duration 计算提示；Save、Save and continue | 浏览器切换简化视图与 75%，展开时长提示，打开 Standards 空状态，保存后进入 Summary |
| 构建概览 | Expand/Collapse 与全屏分开；Canvas 详情、Send Settings、Conversion Events 三栏；折叠参数写入 `initialConditionsCollapsed` | 展开截图、地址同步、各 Edit 入口 |
| Content Optimizer | Email/Push/SMS；四个主标签；Components/Optimization Event；七类组件；多变体、组合数、Liquid 插入与片段复制；Opens/Clicks；邮件真实编辑/发送设置入口 | 浏览器新增 Preheader 两个变体，改为 Opens，显示四种组合，Done→Save→刷新，全部回读 |
| 投递设置 | 所有消息编辑器共用 Intelligent Timing、用户本地自定义兜底时间、每步静默开关、完整受众筛选组和排除组、退出/跳过策略 | 浏览器国家条件及策略保存回读；HTTP 实际执行出口和下一步更新 |
| 智能发送时间 | 按用户 best_send_hour 或用户本地兜底时间排队；热门时间只使用当前工作区用户和事件；一次计算后持久化，恢复时复用 | HTTP 校验准确 dueAt、跨工作区隔离和恢复完成；修复了资源 ID 未保留导致恢复时再次排到下一天的问题 |
| 投递校验时点 | 非 IAM 在实际发送前重验（含 Delay、Intelligent Timing、静默和限速等待）；IAM 在进入步骤时校验 | HTTP 修改等待中用户资料后拒绝发送；退出终止旅程，跳过继续更新用户；IAM 时点已在代码中分开，未把 IAM 展示链路视为完整验收 |
| Action Paths 字段 | 29 项消息交互；同 Canvas/另一 Canvas 步骤；别名/按钮/页面；属性新值；全局和四种订阅组类型；八个更新来源；入站、落地页、位置和地理围栏字段 | 目录模型断言；完整字段 HTTP 保存回读；浏览器核对交互、订阅来源及电商属性组 |
| 主转化触发 | Perform Conversion Event 使用当前 Canvas 的 Primary Conversion Event | 不再要求选择另一个 Campaign |
| 转化事件 | 九类事件；真实事件名和属性候选；电商默认规范事件名；属性组；全部 App/指定 App；截止时间与最长路径展示 | 模型覆盖窗口、事件名、App 和数字/嵌套对象属性；HTTP 回读属性组和 App ID；浏览器核对表单 |
| 真实候选 | 当前工作区事件属性、地理围栏、WhatsApp Flows、订阅组渠道信息 | HTTP 断言同名事件的属性候选不跨工作区 |
| 限速 | 16 个数值预设加 Other；源站自定义范围 1,000–1,000,000；对话框；共享/分渠道上限扩大到 1,000,000 | 模型断言全部预设和边界；浏览器保存 1,500 |
| 帮助 | 连体 Take a tour/下拉按钮；五个源站链接；同一官方 Wistia 教程视频弹窗 | 源站实际打开确认链接；本地菜单和视频弹窗截图 |
| 搜索 | `name` 使用 JSON 字符串 URL 参数；防抖同步；刷新和返回时恢复；保留其他参数 | 浏览器搜索 `optimizer persistence` 并刷新确认保留。源站 Active 在本次观察中不保留，刷新回 Draft；未擅自发明全套筛选参数 |
| 编辑兼容性 | 保留旧 timingFallback/timingTime/deliveryValidation；不完整草稿安全展示；清理邮件默认 reply-to 重复项；App/Standard 选择器不再显示 segment 文案 | 模型兼容性回归；编辑状态回读；生产构建检查 |

## 测试与运行环境

- Node 22 完整项目回归：**482/482**，零失败。
- Canvas 专项：**44/44**；深层模型及相关回归：**24/24**；`test:canvas` 已加入新测试文件。
- Next.js **16.3.5 生产构建通过**，含 TypeScript 检查。磁盘空间不足时只清理了可重建的生产缓存，新增 `NEXT_DISABLE_BUILD_CACHE=1` 可关闭本次构建磁盘缓存，默认构建行为保留。
- `tests/canvas-deep-api.py`：退出/跳过、延迟后重验、最优时间持久化恢复、用户本地兜底、热门时间工作区隔离、优化器与转化草稿回读、未接通优化执行时 422 拒绝、运行记录通用写入拒绝、属性候选隔离和 Action Paths 字段回读。
- `tests/canvas-fidelity-api.py` 原有扩展验收通过：真实分流/用户更新、Context、工作区复制和拒绝越界、brief、历史版本并发、静默延后/跳过、限速队列。
- 所有执行验收只使用 `/private/tmp/braze-canvas-fidelity-deep-20261112.sqlite`，服务绑定 `127.0.0.1:3221`，`MESSAGE_DELIVERY_ENABLED=false`。本地运行事件为模拟，不证明已向外部渠道发送。
- [浏览器验收记录及日志](../audits/canvas-deep-2026-11-12/README.md)。人工编辑后重新加载的优化器预览：`http://127.0.0.1:3221/engagement/canvas/c754785c-fad4-423d-8c9f-7967e2b59389?locale=en&workspaceId=local&step=build`。
- 本轮未提交 Git、未推送、未重新部署；保留同仓库其他任务的修改。

## 首轮 17 类差异的更新状态

| 编号 | 当前状态与剩余部分 |
| --- | --- |
| C01 | 工具栏、视图和折叠概览已补。Test Canvas 全流程仍未实现，目前保持禁用；不能称该按钮具备源站完整能力。Duration 对日历时间和全部夏令时路径未做等价证明。 |
| C02 | 优化器深层编辑与保存回读已补；实际内容生成、自动优化、胜出组合、Push/SMS 全量专属子页尚未完成。Standards 仅真实配置/空状态，评估服务未接入。 |
| C03 | 主要类型字段与 29 项交互、八个更新来源已补；Action Paths 的事件窗口、首事件/排名执行仍未实现，启动保持拒绝。入站正文/Flow 的完整联动未逐层验证。 |
| C04 | Agent Step 实际服务、输出评估未接入。 |
| C05 | Audience Sync 已连接广告账户状态、受众创建和外部同步未完成。 |
| C06 | Send to Destination 的跨 Canvas 接收执行未完成。 |
| C07 | Feature Flag 的实际旅程分配和变体执行未完成。 |
| C08 | 周期/指定时间调度、事件和 API 入口完整链路未完成。 |
| C09 | 深层表单、规范事件名、属性组和 App 范围已补；完整归因/报表流水线、订单嵌套数组属性、平台分组样式尚未完全复刻。纯函数事件匹配测试不等于生产转化分析已接通。 |
| C10 | 顶层多变体实际投递和 Winning Path 服务未完成。 |
| C11 | Canvas 专属投递设置、智能时间、校验和邮件 reply-to 重复已处理；所有渠道的跨语言、多变体、测试发送和完整子页仍需逐状态补查。 |
| C12 | 仍存在像素、图标、排版、焦点约束、响应式、地图绘制等细节差异；圆形区域复用实际地图，多边形仍为坐标输入，尚非源站绘图交互。 |
| C13 | 五项帮助链接和教程视频已补；模板库仍只有少量本地模板，完整交互导览未完成。 |
| C14 | 搜索 URL 同步已验收；其他全部筛选/排序/返回状态、权限和空结果组合尚未完整等价验证。 |
| C15 | 全部速率预设、Other 和步级投递开关已补；所有静默组合、时区及夏令时边界仍未逐状态对照。 |
| C16 | 图版本恢复可用；完整源站版本体验、向导元数据恢复范围未确认。 |
| C17 | 浏览器草稿模式仍不能执行后端模拟或跨工作区复制；本轮验收以服务器持久化模式为准。 |

## 一手参考

- [源站 Canvas](https://dashboard-09.braze.com/engagement/canvas/canvas/6af4374c46d3080087f1c5d2?locale=en)，详细状态以快照索引为准。
- [Braze 创建 Canvas](https://www.braze.com/docs/user_guide/messaging/canvas/create_a_canvas)：投递校验、静默和步骤创建说明。
- [Braze 转化事件](https://www.braze.com/docs/user_guide/messaging/messaging_fundamentals/conversion_events)：Canvas 转化窗口和归因说明；完整统计仍列为差异。
