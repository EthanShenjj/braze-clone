# Campaign / Canvas SMS 还原记录 — 2026-11-12

本轮依据 [修复前的 12 项差异](sms-fidelity-2026-11-12.md) 修改实现。Campaign 和 Canvas 已共用短信正文、个性化、多语言、联系人卡、用户预览与测试组件；Canvas 保留自己的步骤外壳及共享发送设置。不是对整个 Braze 产品的完整验收声明。

## 本轮修复

| 原编号 | 实现与验证 |
| --- | --- |
| SMS-01 | 订阅组按当前 workspaceId 查询；跨工作区同名组不会混入。共享编辑器由工作区上下文 API 加载组，旧 Canvas 查询同步带工作区。 |
| SMS-02 | 随机/现有预览用户、测试组成员和 ID/邮箱解析均限定当前工作区。测试前解析全部收件人；外工作区用户、组或无法解析的号码被拒绝。 |
| SMS-03 / 04 | 个性化统一为源站 Campaign 可见的 16 类，支持搜索、默认值、片段生成、复制和光标处插入。默认属性 19 项、设备属性 14 项、Campaign 属性 5 项、SMS 属性 3 项、WhatsApp 属性 10 项。自定义/嵌套属性、内容块、已发布 Preference Center、Landing Page、目录及推荐项来自当前工作区。Canvas 已复用这些能力；其只读源站未能展开 Add Liquid，不能据此声称其所有上下文类型均已源站验收。 |
| SMS-05 / 06 | 两端均有 Content Test Groups、多收件人、属性覆盖、随机/现有/自定义用户、复制预览链接。测试组读取真实 internal-groups 资源，取消硬编码禁用。 |
| SMS-07 | 两端测试共用服务端编译和发送入口，接入现有消息连接器/Twilio 分发适配器；未连接或未启用时明确返回 prepared。记录逐收件人结果与消息历史，accepted 不冒充 delivered。Canvas 正式运行通过 outbox 等待发送处理，并在处理后推进后续步骤。 |
| SMS-08 | Canvas 与 Campaign 共用按组 capabilities 展示的 MMS/RCS、媒体、联系人卡及富卡片/轮播配置。vCard 支持生成并上传为实际消息附件。源站当前组未开通 MMS/RCS，高级字段的完整源站分支仍未验收，不能标记全分支 1:1。 |
| SMS-09 | 两端恢复 Test 内 Content Review with Operator，调用已配置的 AI 服务进行格式、内容、语法和风格审查；没有配置时返回明确提示，移除“本地规则检查等同 AI”的行为。 |
| SMS-10 | 还原 Internationalize 对话框、15 种语言、多选/移除、Message / Image 目标字段。已有内容时使用源站的 Replace existing text / Add after existing text 两个按钮；空字段使用 Add text to fields。Image 选择会写入媒体 Liquid，支持只勾 Image。保留旧 translations 数据以兼容既有草稿。 |
| SMS-11 | 正文、属性覆盖、语言、媒体、opt-out、编码、短链统一编译；实际测试/发送按渲染和缩短后的结果检查上限。Compose 按源站显示不含动态 Liquid 的估算及警告：同文案为 158 字、1 段，渲染后的实际段数独立计算。预览使用源站示意短链；测试和发送生成真实重定向短链。 |
| SMS-12 | SMS 智能时间按用户时区、最优小时及当前工作区活动 fallback 计算并等待；支持旧 timingFallback / timingTime 与新 intelligentFallback / intelligentFallbackTime。发送前检查步骤受众条件，支持失败时退出或跳过，outbox 处理时再次校验。受保护的 delivery worker 会处理到期 Canvas 步骤，不依赖手动推进演示时钟。修复 time input 输入 15:30 后状态未同步的问题。 |

## 源站逐项核对产生的修正

- Campaign Attributes 实际为 `name`、`api_id`、`message_name`、`message_api_id`、`dispatch_id`，不是四个 variant 快捷属性。
- WhatsApp Properties 实际为 10 项，Liquid 命名空间为 `whats_app`。
- Languages 实际为 15 种语言加 Select all；已有内容的插入方式是两个页脚按钮，而不是额外单选项。
- Compose 展示原始 Liquid；切换 Test 后才按选择的用户预览。计数中的 Liquid 警告与真实发送校验分开处理，未通过改计数值掩盖超长内容。
- Preference Center 使用实际发布页面 `/preferences/:id` 及当前工作区用户的受保护令牌；Landing Page 使用实际 `/pages/:slug` 或已配置地址。拒绝用外工作区用户生成链接。
- MMS 切回 SMS 后保留草稿中的媒体数据，但 SMS 编译忽略附件；多语言分支实际渲染为空时拒绝发送。

## 验证及证据

- 自动化覆盖模型、工作区隔离、模板上下文、渲染后超长拒绝、长链接缩短、媒体 URL、MMS 能力、测试组、覆盖属性、预览快照、AI 连接、消息连接器、outbox 防重复处理、校验失败跳过及真实 worker 到期唤醒。
- AI 和消息连接器使用测试中替换的 fetch 验证契约，没有向外部服务发送测试消息。
- 浏览器已验证 Campaign 个性化插入、158 字估算、草稿保存、测试组选择、随机用户预览与 prepared 结果；Image-only 语言片段已保存；Canvas 15:30 自定义兜底及校验开关已保存，最终生产页面另行回读。
- [源站与本地截图、DOM/AX 索引](../audits/sms-restoration-2026-11-12/README.md)。

最终结果：全量 Node 测试 **483/483 通过**，TypeScript 检查、Next.js 生产构建及 `git diff --check` 通过。生产模式 API 验收通过，覆盖工作区隔离、16 类上下文、逐用户渲染、资源 Liquid、测试组、属性覆盖、真实短链、长度/能力校验、预览快照和 Canvas 编译执行。源站菜单快照对照测试核对选项及顺序；快照中含 Liquid 的 option 有额外引号，解析器已兼容。

本机最终生产预览（独立测试数据库，未部署到线上）：

- [Campaign SMS](http://127.0.0.1:3216/engagement/campaigns/cmp_sms_qa_f730215b_campaign?step=compose&workspace=sms_qa_f730215b&locale=en)
- [Canvas SMS](http://127.0.0.1:3216/engagement/canvas/06748311-79d2-46ac-9cf7-7d733eebd8e2?step=build&workspace=sms_qa_f730215b&locale=en)

## 验收边界

1. 当前工作区没有配置真实 SMS/AI 连接，因此没有实际运营商送达、线上 AI 结果或运营商计费验收。连接路径通过模拟提供方测试，产品不会宣称真实送达。
2. 当前 Braze 组未开通 MMS/RCS；旧 Canvas 参照链接返回 Forbidden，当前工作区现有 Canvas 为 View Only。可读取 Compose 与 Delivery settings，但 Add Liquid/Test 点击没有展开。已记录限制，没有通过新建源站数据或绕过权限继续。
3. 本轮不把源站无法访问的 MMS/RCS、目录/推荐项更深配置状态、Canvas 全部多渠道组合，以及整个 Canvas 产品的其他页面标记为 1:1 验收通过。已实现的条件分支与源站已核验分支分别记录。
4. 所有源站检查均未保存 Campaign/Canvas，也未发送源站测试。验证数据位于独立本机数据库。
