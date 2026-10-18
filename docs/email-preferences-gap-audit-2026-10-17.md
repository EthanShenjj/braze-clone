# 邮件偏好设置与 Braze 差异检查报告

日期：2026-10-17（Asia/Shanghai）
对象：当前本地工作区，`http://127.0.0.1:3100`；参考：已登录 Chrome 中的 Braze Email Preferences。
参考页面：[Braze Sending Configuration](https://dashboard-09.braze.com/app_settings/app_settings/email_settings/sending_configuration/6ad0b98fe4b4110085216601?locale=en)；其他页签由该页进入。

检查标准：可见页面逐项对照 + 本地关键操作复现 + 配置消费路径检查。**不是仅检查“标签页能打开、表单能保存”。**

## 1. 结论

**尚未达到完整 1：1 复刻。** 六个标签页的主要结构已经建立，但仍确认 **22 项差异或缺口：7 项 P1、12 项 P2、3 项 P3**。

主要风险是：部分设置只有存储，没有实际生效；页脚 Liquid 预览不完整；离开页面可能丢失未保存内容。视觉方面，字体、订阅设置卡片高度、样式预览区域及 IP Warming 新建页仍有明显差异。

上轮 `design-qa.md` 的 passed 仅对应其限定的内容区域和本地配置流程，不能作为“功能与 Braze 全部一致”的结论。本次完整一致性检查的结论为 **未通过**。

优先级：P1＝核心流程/数据或配置生效缺口；P2＝明显布局、交互或文档功能缺口；P3＝控件和文案细节。本轮没有确认 P0。

## 2. 范围、方法与证据限制

- 本轮重新打开并截图了六个标签页，以及 IP Warming 新建页；没有使用上轮截图作为本轮审计证据。
- 桌面浏览器统一为 **1440×900 CSS px**。Chrome 页面 DPR=2，截图接口返回 1440×900 像素；本地 DPR=1，截图同为 1440×900 像素，已按 CSS 尺度对齐。
- 对比图左为 Braze、右为本地。通常裁剪 x=260…1440、y=90…900，排除浏览器工具栏；保留完整截图用于核对公共框架。
- 浏览器实际读取到 Braze 字体栈为 `Aribau, helvetica, arial, sans-serif`，本地为 `Inter, -apple-system, system-ui, Segoe UI, sans-serif`。
- 参考账号为 **View only**。编辑、保存、地址新增/删除等原版权限内状态无法直接验证；有关这些状态的说明标为“文档”或“本地独立缺陷”，不冒充原版实测。
- 本地页脚探测输入均未保存。没有修改 Braze 账号配置，没有进行真实邮件发送。本轮仅新增检查资料。
- 不把工作区名称、头像、试用剩余天数和真实数据条数不同计为缺陷。不要求复刻原版在当前环境中的水平滚动问题。

证据类型：**实测**＝本轮截图/DOM/操作；**代码**＝本轮检查当前实现；**文档**＝官方手册规则；**待核对**＝参考账号权限或测试条件不足。

## 3. 检查路径与逐页状态

| 步骤 | 检查内容 | 当前状态 | 主要问题 |
|---|---|---|---|
| 1 | Sending Configuration | 部分一致 | 字体/状态差异；约束与发送相关设置未贯通 |
| 2 | Subscription Pages and Footers | 结构接近，功能不完整 | 高视口卡片明显过短；页脚及订阅页面没有完整消费链路 |
| 3 | Drag-And-Drop Email Editor Settings | 部分一致 | 控件排列、预览高度及预览内容不同；多个配置未进入编辑器 |
| 4 | Link Aliasing | 空列表接近，数据链路不完整 | 邮件编辑器未生产跟踪别名；下拉、排序和提示细节不同 |
| 5 | Bot Filtering | 视觉接近，行为缺口明显 | 开关未进入事件/报表过滤路径 |
| 6 | Automated IP Warming 空状态 | 接近 | 插图、按钮的纵向位置及控件细节仍不同 |
| 7 | Automated IP Warming 新建 | 明显不一致 | 三列变单列、嵌套卡缺失、路由不一致 |
| 8 | 本地页脚 HTML / Preview | 未通过完整预览验收 | 用户写死、变量原样显示、缺少文档中的相关能力 |
| 9 | 本地未保存内容离开/返回 | 未通过 | 侧栏导航没有拦截，返回后输入丢失 |

### 步骤 1：Sending Configuration

![步骤 1：发送配置，左 Braze，右本地](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/email-preferences/audit-2026-10-17/01-comparison.png>)

标题、发送人字段、Reply-To/BCC 分组及默认开关已存在。仍有字体、间距、权限状态差异；不能由界面相似推导发送策略已生效。完整公共框架见 [Braze 全景](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/email-preferences/audit-2026-10-17/01-braze-sending.png>) / [本地全景](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/email-preferences/audit-2026-10-17/01-local-sending.png>)。

### 步骤 2：Subscription Pages and Footers

![步骤 2：订阅与页脚，左 Braze，右本地](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/email-preferences/audit-2026-10-17/02-comparison.png>)

三个分区及默认禁用开关接近。1440×900 下，Braze 白卡/内导航竖线随可视高度延展，本地卡片提前约 150px 结束；上轮 750px 高度下的接近不能代表其他高度一致。

### 步骤 3：全局样式

![步骤 3：全局样式首屏对比](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/email-preferences/audit-2026-10-17/03-comparison.png>)

![步骤 3 细节：按标题对齐后的按钮样式比较](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/email-preferences/audit-2026-10-17/03b-comparison.png>)

首屏基本配置接近；深入按钮样式后差异明显。Braze 按钮预览区约 450×470px，本地约 466×150px；字段顺序也不同。该细节图单独按小节标题对齐，不把两边滚动位置差异计为问题。

### 步骤 4：Link Aliasing

![步骤 4：链接别名表格对比](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/email-preferences/audit-2026-10-17/04-comparison.png>)

四列和空状态已建立。原版有状态说明图标、自定义状态下拉和排序方向提示；本地使用原生下拉及固定排序图标。空列表一致不等于编辑器→别名→点击记录链路已完成。

### 步骤 5：Bot Filtering

![步骤 5：Bot Filtering 对比](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/email-preferences/audit-2026-10-17/05-comparison.png>)

左右分栏和开关默认值接近，正文换行、卡片高度仍有差异。开关实际消费问题见 F06。

### 步骤 6：IP Warming 空状态

![步骤 6：IP Warming 空状态对比](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/email-preferences/audit-2026-10-17/06-comparison.png>)

标题、插图与按钮已存在。参考图的插图/说明/按钮整体略高，本地按钮约低 20px；属于 V09 的位置精修。

### 步骤 7：IP Warming 新建

![步骤 7：IP Warming 新建页对比](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/email-preferences/audit-2026-10-17/07-comparison.png>)

原版 Schedule 内还有 Sending information 白卡，三个地址字段横向排列。本地缺少该嵌套卡并将三个字段纵向堆叠，改变了首屏信息密度。两边下一步均禁用，**不把参考权限限制本身误报为缺陷**。

### 步骤 8：本地页脚预览探测

输入为姓名、一个自定义属性和官方当前推荐的退订变量，切换 Preview 后得到：

```text
Hello John Doe, {{custom_attribute.${loyalty_tier}}}
退订链接 href 仍是 {{${set_user_to_unsubscribed_url}}}
```

![步骤 8：本地页脚预览保留了未解析变量](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/email-preferences/audit-2026-10-17/08-local-footer-preview.png>)

原版编辑态受权限限制；此图只证明本地预览不完整，不能用来断言原版编辑器具体像素样式。

### 步骤 9：未保存内容离开

复现：开启本地页脚并输入测试 HTML（页面显示 Unsaved changes）→点击左侧 Campaigns→没有离开确认→浏览器返回→页脚开关恢复关闭，测试输入已丢失。

[离开后已进入 Campaigns，无确认弹窗](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/email-preferences/audit-2026-10-17/09-local-leave-without-prompt.png>)；[返回后未保存内容消失](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/email-preferences/audit-2026-10-17/09b-local-return-discarded.png>)。这是本地独立缺陷；原版对应编辑态未实测。

![步骤 9：离开及返回后的本地状态](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/email-preferences/audit-2026-10-17/09-comparison.png>)

## 4. P1：优先修复的功能与数据问题（7 项）

### F01 · 未保存内容可被侧栏导航直接丢弃

- **依据：实测 + 代码；步骤 8→9。** 页签切换和 Cancel 有保护，侧栏 SPA 导航没有；仅注册了 beforeunload。
- **影响：** 输入较长的页脚/订阅 HTML 后误点导航会丢失编辑。
- **建议：** 把离开保护接到侧栏、应用内路由和浏览器历史；确认放弃或保存后才能离开。
- **位置：** [app/ui/email-preferences.tsx](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/app/ui/email-preferences.tsx:54>)、[app/ui/email-preferences.tsx](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/app/ui/email-preferences.tsx:65>)。

### F02 · “限定发件地址”“强制 BCC”没有落实到邮件校验

- **依据：代码。** 设置保存时校验默认 BCC，但发送编辑器仍提供 No BCC，地址候选还合并固定 verifiedIdentities；保存和 launch 校验未读取 requireBcc / requireListedAddresses。
- **影响：** 可以保存策略开关，却仍在消息级选择不符合策略的配置。
- **建议：** 统一消息保存/发布校验，按策略收敛候选和错误提示；不要只在设置页验证“存在默认值”。
- **位置：** [app/ui/dashboard.tsx](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/app/ui/dashboard.tsx:572>)、[app/ui/dashboard.tsx](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/app/ui/dashboard.tsx:603>)、[lib/campaign-validation.ts](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/lib/campaign-validation.ts:12>)。

### F03 · 自定义页脚/订阅页面未接入实际邮件和订阅流程

- **依据：代码 + 文档。** pages 配置目前仅供设置页展示/保存；生成新邮件默认值时没有携带页脚配置，现有渲染路径也没有注入工作区的 `{{${email_footer}}}`。自定义 opt-in / unsubscribe HTML 未绑定订阅结果页面。
- **影响：** HTML 保存成功、snippet 可以复制，不能证明邮件预览或退订落地页会使用它。
- **建议：** 使用统一工作区配置读取；在邮件 Liquid 预处理和对应订阅页面渲染中接入，并覆盖旧邮件引用的行为。Braze 页脚是工作区级模板能力，见[官方页脚说明](https://www.braze.com/docs/user_guide/channels/email/customize/custom_email_footer)。
- **位置：** [lib/email-preferences.ts](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/lib/email-preferences.ts:124>)、[app/ui/email-preferences.tsx](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/app/ui/email-preferences.tsx:144>)。

### F04 · 九组全局样式仅部分进入邮件编辑器

- **依据：代码 + 源页面。** 新建 block 读取 Header 1、paragraph、button；Header 2–6、独立 list/icon、移动端 icon 和 Content Block 宽度未接通对应组件。themeAttributes 也未输出 direction / spacing，GrapesJS 路径没有消费 globalStyle.linkColor。
- **影响：** 界面可配置的部分选项不会影响新邮件组件或导出，预览与最终内容可能不一致。
- **建议：** 为各组件建立完整映射并在新 Campaign、Canvas、模板、Content Block 创建路径复用；已有邮件保留自身样式。范围依据[全局样式手册](https://www.braze.com/docs/user_guide/message_building_by_channel/email/drag_and_drop/dnd_email_style_settings)。
- **位置：** [app/ui/email-grapes-editor.tsx](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/app/ui/email-grapes-editor.tsx:70>)、[app/ui/email-grapes-editor.tsx](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/app/ui/email-grapes-editor.tsx:356>)。

### F05 · Link Aliasing 没有接通邮件编辑器的数据来源

- **依据：代码。** 页面读取通用 `/api/resources/link-aliases`；本轮检索未找到编辑器创建/更新该资源的生产路径。旧 Link Management 只编辑 href，当前 GrapesJS 也没有跟踪别名配置闭环。
- **影响：** 页面能操作预先插入的样本，却不能按邮件中的跟踪配置自然产生真实列表。
- **建议：** 先贯通链接 alias、tracked 状态、关联消息及点击记录，再检查列表筛选与批量停用。[官方跟踪流程](https://www.braze.com/docs/user_guide/messaging/templates/email_templates/link_aliasing)由邮件编辑器的 Link Management 发起。
- **位置：** [app/ui/email-preferences.tsx](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/app/ui/email-preferences.tsx:202>)、[app/ui/email-dnd-editor.tsx](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/app/ui/email-dnd-editor.tsx:779>)、[app/ui/email-grapes-editor.tsx](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/app/ui/email-grapes-editor.tsx:356>)。

### F06 · Bot Filtering 开关没有参与点击统计

- **依据：代码。** removeBotClicks 的读取限于偏好设置；当前事件记录、报表路径未消费该字段。
- **影响：** 改开关不会带来界面说明所描述的统计变化。
- **建议：** 在事件中记录 bot 判定，定义开关生效时间及过滤规则，报表统一执行；若当前只做配置原型，必须明确其尚未生效。
- **位置：** [app/ui/email-preferences.tsx](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/app/ui/email-preferences.tsx:216>)、[lib/braze-store.ts](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/lib/braze-store.ts:706>)。

### F07 · 其他发送相关开关仍停留在配置层

- **依据：代码。** 未发现追踪像素位置、list-unsubscribe 工作区选项、TEST/SEED 前缀、换邮箱自动恢复订阅的执行消费；emailCssInlining 只写入 config，未进入编译开关。当前非 webhook 的测试发送仅记录模拟事件。
- **影响：** 这些开关的产品承诺尚未实现。不能把“模拟发送成功”写成真实 MIME、主题或订阅状态已改变。
- **建议：** 分别接入编译、消息参数、测试主题、订阅更新；真实投递能力应另列验收门槛。[工作区发送规则依据](https://www.braze.com/docs/user_guide/administer/global/workspace_settings/email_preferences)。
- **位置：** [lib/email-preferences.ts](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/lib/email-preferences.ts:124>)、[lib/braze-store.ts](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/lib/braze-store.ts:675>)、[app/api/users/route.ts](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/app/api/users/route.ts:11>)。

## 5. P2：交互、明显视觉与文档能力差异（12 项）

| ID | 问题与证据 | 影响及建议 |
|---|---|---|
| F08 | **页脚预览是局部替换。** 步骤 8 固定 John Doe；自定义属性、新版退订变量原样显示。iframe 还禁止全部远程图片/字体。代码：email-preferences.tsx:148、158。 | 无法验证真实用户结果；统一 Liquid 解析和用户预览上下文，使用明确资源策略。当前页面不是完整邮件预览器。 |
| F09 | **条件 Liquid URL 被错误拒绝。** 本轮直接运行校验：以 if 开头、两个分支都是 HTTPS 的 URL，返回“must start with https://”。 | 官方支持条件 Liquid；先识别模板、再校验可验证部分，避免把模板原文当普通 URL。代码：lib/email-preferences.ts:93。参见[官方 FAQ](https://www.braze.com/docs/user_guide/administer/global/workspace_settings/email_preferences#frequently-asked-questions)。 |
| F10 | **只读状态语义不一致。** 步骤 1–5 同时出现 View only 和 Edit settings；标签取决于本地 editing，而非权限。 | 区分“浏览态”和“无编辑权限”；只读用户不能出现可进入编辑的入口，有权限用户也不应被标成 View only。代码：email-preferences.tsx:16、86。 |
| F11 | **页脚扩展能力缺少入口。** 当前只有 HTML textarea、Preview、复制 snippet；没有纯文本页脚配置、Copy preview link、对应测试入口。 | 属于官方文档能力缺口，原版编辑态未实测。应补齐或明确本期范围，不能宣称编辑能力全部还原。[官方页脚功能](https://www.braze.com/docs/user_guide/channels/email/customize/custom_email_footer)。 |
| V01 | **字体资源和字体栈不同。** 实测 Aribau vs Inter/系统字体，造成标题、徽标、段落和标签宽度变化。 | 先统一字体资源、字重与行高，再做像素级间距调整，否则会反复漂移。证据：步骤 1、2、3。 |
| V02 | **公共框架未还原。** 本地侧栏顶部层级、AI Decisioning 项、品牌区、Settings 选中态与原版不同；顶部语言为 select，原版为 globe 菜单。返回设置后仍可看到 Campaigns 高亮。 | 公共框架单独验收，选中态由当前路由推导。工作区名称/试用天数差异不计入此项。证据：步骤 1 全景、09b。 |
| V03 | **订阅卡片仅在部分高度下接近。** 步骤 2 的 900px 高视口下本地卡片明显短于原版，内导航竖线也提前结束。 | 根据可视区域设置卡片/内部滚动高度；至少验证 750px 和 900px 两种桌面高度。代码：email-preferences.module.css 的 splitCard。 |
| V04 | **九组样式的字段顺序及分组不同。** 原版按钮为字号→字体色→边框粗细→背景→圆角→边框色；本地把背景/边框色提前。段落/列表统一显示 Spacing，原版分别为 Paragraph Spacing / List Item Spacing。Icon 的移动端与 block 分组顺序也不同。 | 按类型明确配置表结构，减少通用 ThemeControls 带来的顺序偏差。证据：03b 与本轮 editor DOM。代码：email-preferences.tsx:175、188。 |
| V05 | **样式预览区域未完整还原。** 按钮预览明显矮于原版；段落示例截短、列表缺嵌套项，Block Padding 示意图及移动端 icon 专用预览缺少。spacing/mobileAlign/mobilePadding 等值也没有完整映射到这些示例。 | 按小节还原预览尺寸、样本及双向绑定；不能仅展示一个通用灰色盒子。证据：03b；代码：email-preferences.tsx:172–188。 |
| V06 | **IP Warming 新建页结构不同。** 步骤 7 原版 Sending information 是嵌套卡+三列，本地为单列；进度区/提示条间距和固定操作栏也不同。 | 按原版重建区块层级和三列布局；保留当前账号禁用状态。代码：email-preferences.tsx:223。 |
| V07 | **IP Warming 新建未使用独立路由。** 原版进入 `/ip_warming/new/{workspace}`；本地 URL 仍在 `/ip_warming/{workspace}`，仅改 creating state。 | 刷新/深链接不能恢复新建页；应以路径驱动页面状态与 Back。代码：email-preferences.tsx:219。 |
| A01 | **页签键盘导航缺失。** 实测在 Link Aliasing 按 ArrowRight：原版焦点移动到 Bot Filtering，本地仍停在 Link Aliasing。 | 实现 roving tabindex 和方向键/Home/End 导航，按 Enter/Space 激活。代码：email-preferences.tsx:84。 |

## 6. P3：精修差异（3 项）

| ID | 差异 | 建议 |
|---|---|---|
| V08 | 原生 select 的箭头/分隔线、自定义下拉外观、固定排序图标及缺失的 Status 说明图标，与原版不同；IP Warming 禁用按钮仍带淡紫底。 | 统一控件、排序状态图标、说明 popover 和 disabled token。证据：步骤 4、7。 |
| V09 | View only 的宽度/内边距、标签下划线长度、IP Warming 空态内容垂直位置仍有数像素到约 20px 的差异。 | 字体统一后，再逐项测量；不要用账号动态内容硬凑宽度。证据：步骤 1、6。 |
| V10 | 三个订阅分区的 here 均指向同一个偏好设置文档，原版分别链接 Custom Footer 和 Email Subscriptions；Need help 的按钮/外链表现也不同。 | 对齐每个帮助入口的目标与行为。证据：本轮源 DOM；代码：email-preferences.tsx:152、223。 |

## 7. 暂不能下结论的项目

1. **Braze 真正编辑态：** 地址新增/删除、错误定位、保存按钮具体位置、HTML 编辑器工具栏、确认弹窗等，参考账号无权限；文档截图不能替代当前账号实测。
2. **IP Warming 后四步：** 原版同样禁用。不能把它们当成已复刻，也不能仅因本地禁用而判断与参考不一致。
3. **非空 Link Aliasing：** 原版当前为空，尚未直接核对分页、大数据量、非空行和批量停用的原版反馈。F05 是代码路径缺口，不是伪造了一次原版非空测试。
4. **真实投递、MIME 与 Bot 识别：** 本轮没有向真实收件人发送，也没有外部邮件服务商环境；F06/F07 是当前代码未接入的确认，不是假装检查过真实邮件头。
5. **手机端与完整无障碍：** 本轮桌面一致性审查未覆盖 Braze 手机布局、屏幕阅读器、完整焦点陷阱和所有 tooltip。A01 只代表已经复现的键盘差异，不代表通过 WCAG 验收。
6. **纯文本页脚/共享预览的具体编辑态外观：** 功能由官方文档确认，当前账号不能直接打开相应启用状态。

## 8. 建议修复顺序与复验标准

### 第一批：先修复可丢数据或“保存但不生效”

1. F01：侧栏、路由、历史导航统一未保存保护。
2. F02/F03：发送约束、页脚变量、订阅页面与消息/订阅流程贯通。
3. F04/F05：完整样式映射和编辑器链接别名生产路径。
4. F06/F07：明确哪些能力在本地模拟、哪些真正执行；完成后分别验证事件、编译产物和消息配置。

### 第二批：完整还原可见流程

5. F08/F09/F11：真实用户 Liquid 预览、条件模板、纯文本/共享预览。
6. V01/V02/F10：统一字体与公共框架、权限/编辑状态。
7. V03–V07/A01：多高度卡片、各类型控件和示例、IP 新建路由与布局、键盘导航。
8. V08–V10：控件图标、像素间距、帮助链接。

### 复验必须满足

- “配置保存成功”和“消费后结果正确”分开验证：每个设置都有明确消费者和至少一个结果断言。
- 新邮件/旧邮件、Campaign/Canvas/模板等适用范围逐项核对；不把一个创建入口的覆盖推成全覆盖。
- 同尺寸同状态截图比较，重点再看订阅卡片和按钮/IP 新建页，不能只验首屏。
- 补齐离开保护回归；动态用户结果必须改变，自定义属性与新版退订变量不能保留原文。
- 取得有编辑权限的参考账号后，再补原版编辑态验收；没有证据的项保持待核对。

---

**本次结论：1：1 一致性验收未通过。** 本报告只做检查与建议，没有在检查过程中修复业务代码。证据保存在 `docs/email-preferences/audit-2026-10-17/`。

## 8. 本轮修复状态

2026-10-17：已针对以上 22 项实施对应修改，复核结果、截图、测试及外部环境边界见 [修复复核报告](email-preferences-fix-report-2026-10-17.md)。上文保留为修复前的审查记录，不代表当前代码仍存在全部原始问题。
