# Braze Frequency Capping：页面观察

调查日期：2026-11-12（Asia/Shanghai）。以下为浏览器无障碍树中直接观察到的状态摘要，不是 REA 运行时捕获。未保存或发布任何 Braze 配置，未实际发送消息。

**UI-01：用户提供的 Campaign**

- 入口：`https://dashboard-09.braze.com/engagement/campaigns/6af4375320abdf005fc2ef5e/6af4374c46d3080087f1c5d2?locale=en`
- 页面：Edit 'New Feature Showcase with Mobile Push'，存在 Limited access 标识。
- Schedule Delivery → Delivery Controls → Frequency Capping。
- 当前显示尚未创建频控规则，并提供全局设置链接。
- 同一区域单独显示再次接收资格（re-eligibility）和 Quiet Hours。
- Target Audiences 中另有 Limit send volume、Limit the rate at which this Campaign will send；它们是独立控件。

**UI-02：全局设置与权限**

- 地址：`https://dashboard-09.braze.com/engagement/global_message_settings/global-message-settings/6af4374c46d3080087f1c5d2?locale=en`
- 导航：Settings → Workspace Settings → Frequency Capping Rules。
- 同一导航组分别列出 Quiet Hours、Messaging Rate Limits。
- 标题为 Frequency Capping Rules，当前账号显示 View only。
- 当前为空规则状态；Revert 禁用，没有可操作的 Add rule / Save。
- 因而本次没有实际操作创建规则、修改规则、保存、撤销或删除，也没有观察到成功提交请求。

**UI-03：Need help 抽屉**

- 说明规则限制每个人在指定时间窗内收到的消息数量。
- 规则可以覆盖所有渠道/所有消息，或按渠道、Tag、Message Prioritization category 缩小范围；支持多条规则叠加。
- 优先级评估要求消息 opted-in，且被适用的频控规则覆盖。
- Canvas 的 Message Prioritization opt-in 是整个 Canvas 级别的决定，不能只选择部分 Message step。该条说明属于优先级功能，不据此推定普通频控的重试语义。
- 展开渠道详情后，适用渠道为 Email、KakaoTalk、LINE、Push notification、SMS/MMS/RCS、Webhook、WhatsApp。
- 不受该频控影响的渠道为 Banner、Content Card、In-app message。
- 帮助指向官方文档：`https://www.braze.com/docs/en/user_guide/messaging/messaging_fundamentals/frequency_capping#about-frequency-capping`。

**观察边界**

- 当前工作区和权限下的观察；不能代表有编辑权限时的全部交互状态。
- 无真实发送实验，因此发送时的计数、时间窗与跳步语义需分别引用官方文档；浏览器观察不构成服务端实现证据。
- 后续静态代码分析使用浏览器资产清单中实际出现的公开 CDN 脚本。它不能证明某个静态分支在当前会话执行过。

**UI-04：Canvas 开启入口补充观察**

- 后续问题要求明确 Canvas 的开启位置，检查了列表中两个已有草稿，未新建 Canvas。
- 模板 Onboarding flow 显示 View Only，仅能查看 Send Settings 摘要。
- 已有 `New Canvas - November 12, 2026` 草稿进入六步编辑向导，第 4 步为 Send Settings。
- 点击第 4 步后，页面标题说明这些发送设置适用于 Canvas 中的所有步骤。
- Frequency Capping 区域显示尚未创建规则，并链接至与 Campaign 相同的全局频控页。
- 本次没有看到可用的频控开关状态，未切换任何配置、未保存。现有页面空状态与“配置规则后的 ON/OFF 状态”应分开描述。
