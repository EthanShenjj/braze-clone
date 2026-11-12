# Campaign / Canvas SMS 配置复刻核查 — 2026-11-12

> 以下为修复前审计。随后实现及验证结果见 [SMS 还原记录](sms-restoration-2026-11-12.md)，请勿将本清单直接视为当前未修复项。

结论：**尚未达到 Braze 1:1 复刻**。Campaign 和 Canvas 使用两套独立短信编辑器，存在已确认的界面、配置接线、预览与执行差异。本次为检查与记录，没有修改业务实现，没有在 Braze 保存草稿或发送测试短信。

## 证据与核查范围

- 本次源站：Demo – ittor → 现有 Early Access SMS 草稿。只读打开 Compose、Add Personalization、Languages、Contact Card Generator、Test。
- 源站地址：https://dashboard-09.braze.com/engagement/campaigns/6af4375320abdf005fc2ef31/6af4374c46d3080087f1c5d2?locale=en
- 本次截图及 AX/DOM 快照：[sms-fidelity-2026-11-12](../audits/sms-fidelity-2026-11-12/)。共 5 组，每组 JPG、AX、DOM。
- Canvas 源站参照为既有 [SMS 原始截图及 QA](../sms-reference/design-qa.md)，本次结合当前代码检查；没有声称重新遍历了源站 Canvas 全部配置分支。
- 当前调用链：Campaign `app/ui/dashboard.tsx:455` → `sms-editor.tsx`；Canvas `app/ui/live-canvas.tsx:373` → `canvas-sms-editor.tsx`。最近增加的通用 `CanvasChannelEditor` 排除了 SMS，不能据此认定短信配置已补齐。
- 可访问源站订阅组未开通 MMS/RCS；高级 MMS/RCS 的源站完整字段、校验、发送行为仍属未核验，不能标记为一致。

## 已确认的 12 项差异

| 编号 | 优先级 | 范围 | 发现与影响 | 证据 / 代码位置 |
| --- | --- | --- | --- | --- |
| SMS-01 | P1 | Campaign、Canvas | 订阅组查询未传 workspaceId。当前 API 缺省只返回 local 工作区，非 local 的编辑器会缺少当前工作区的组或展示 local 组。后端校验工作区并不能修复下拉列表。 | `app/ui/sms-editor.tsx:80`、`app/ui/live-canvas.tsx:113`、`app/api/subscription-groups/route.ts:7` |
| SMS-02 | P1 | Canvas | 预览用户查询 `/api/users` 未按工作区隔离；测试准备也直接 getUser/searchUsers，未检查用户是否属于 Canvas 工作区。可能选用其他工作区用户属性；本接口仅模拟，不据此宣称已经发生真实短信跨工作区发送。 | `app/ui/canvas-sms-editor.tsx:83`、`app/api/users/route.ts:5`、`lib/braze-store.ts:1689` |
| SMS-03 | P1 | Campaign | Add Liquid 只有 first_name、last_name、email_address、city 四个快捷片段，未复刻源站的类型、属性、默认值、片段生成面板。源站本次实际展示 **16 类**：Default Attributes、Custom Attributes、Nested Custom Attributes、Most Recent Device Attributes、Content Blocks、Preference Center、Landing Page、Campaign Attributes、Event Properties、API Trigger Properties、SMS Properties、WhatsApp Properties、Catalog Items、Item Recommendation、Advanced Event Properties、Message Extras。 | `01-source-campaign-personalization.*`；`app/ui/sms-editor.tsx:23`、`:189` |
| SMS-04 | P1 | Canvas | 个性化面板只有 Default / Custom Attributes 两类，默认属性仅 8 项；其他类型及相应配置未接入。Audience 新增个性化面板不被此编辑器复用。Canvas 源站完整类型数量本次未重新展开，不能直接以 Campaign 的 16 类断言 Canvas 数量相同。 | `app/ui/canvas-sms-editor.tsx:13`、`:199`；既有 Canvas SMS 源站证据 |
| SMS-05 | P1 | Campaign | Test 页只有单个电话号码输入及跳转通用测试弹窗；缺少源站同页的 Content Test Groups、多收件人、属性覆盖勾选和 Copy preview link。**通用弹窗已有 random / existing / custom 预览模式，不应误记为项目完全没有用户预览**，但入口、布局和短信专属行为不等价。 | `02-source-campaign-test.*`；`app/ui/sms-editor.tsx:228`；`app/ui/email-dnd-editor.tsx:1148` |
| SMS-06 | P1 | Canvas | Content Test Group 永远固定 disabled / “No Content Test Groups”，未读取资源。源站提供可选择的测试组控件。 | `app/ui/canvas-sms-editor.tsx:182`；既有 Canvas QA；本次 Campaign Test 对照 |
| SMS-07 | P1 | Canvas | Send Test 仅生成 sms-tests、test_prepared 及审计记录，返回 simulation / delivered:false，没有接入真实短信发送；Canvas 运行流程中 SMS 也只记录模拟事件，未像 Email / WhatsApp 分支那样编译正文。Campaign 已有消息分发接口及 Twilio / connector 分支，不能把 Campaign 也概括成永远只模拟。 | `lib/braze-store.ts:1677–1700`、`:2092–2105`；`lib/message-delivery.ts`；`lib/braze-store.ts:1650` |
| SMS-08 | P1 | Canvas | MMS/RCS 编辑和联系人卡生成能力不完整：没有 messageType、media、发送号、RCS 卡片/轮播配置；Contact Card 页无条件展示 MMS 未开通说明，不读取所选组 capabilities。Campaign 已实现部分能力开关及表单，但高级分支尚缺源站验证。 | `app/ui/canvas-sms-editor.tsx:10`、`:176`；`app/ui/sms-editor.tsx:151–154`、`:210`；`03-source-campaign-contact-card.*` |
| SMS-09 | P2 | Campaign、Canvas | Operator 行为不同。Campaign Compose 用 Copywriter 生成文案，Test 页缺少源站 Content Review with Operator；Canvas 的 Review with Operator 仅本地规则检查，不是格式、语法、风格的 AI 审查。 | `02-source-campaign-test.*`；`app/ui/sms-editor.tsx:179`、`:228`；`app/ui/canvas-sms-editor.tsx:179–180` |
| SMS-10 | P2 | Campaign、Canvas | 多语言配置不等价。源站使用 Internationalize your message 对话框、Fields to internationalize（Message / Image）和插入方式。Campaign 使用 translations 文本框及 Preview language；Canvas 虽有 Image 勾选，但插入按钮只处理 message，Image 勾选没有生成/写入目标。 | `05-source-campaign-languages.*`；`app/ui/sms-editor.tsx:159–169`；`app/ui/canvas-sms-editor.tsx:200` |
| SMS-11 | P1 | Campaign、Canvas | 渲染、预览和校验链不统一。Campaign Compose 使用硬编码 Sofia 编译；通用测试弹窗实际使用 NativeMessagePreview / compileSms，支持用户属性但显式关闭短链，而 Compose 用固定短链占位，预览链不统一。Canvas 测试使用 smsPreview，仅对原始文本做 1600 长度校验，Liquid 展开后未重新检查上限。短链预览使用固定 brz.ai/XXXXXXXX，不能视作真实短链重定向。 | `app/ui/sms-editor.tsx:68`；`app/ui/email-dnd-editor.tsx:1285`；`app/ui/message-controls.tsx:52`；`lib/sms-model.ts:26`、`:41`；`lib/braze-store.ts:1682–1694`；`lib/channel-message-model.ts:7` |
| SMS-12 | P1 | Canvas | Intelligent Timing、自定义 fallback、Validate audience at message send 可保存，但当前运行时代码没有消费 intelligentTiming / timingFallback / timingTime / deliveryValidation 这些字段。配置保存成功不能代表优化调度或发送前受众复核已实现。Campaign 的独立 intelligent timing 逻辑不能替代 Canvas 字段的执行接线。 | `app/ui/canvas-sms-editor.tsx:156–164`；`rg` 核对 `lib/`、`app/api/` 当前消费者；`docs/sms-reference/design-qa.md` 能力边界 |

## 已有基础与验收限制

已有正文编辑、订阅组控件、GSM-7 / UCS-2 分段计算、链接缩短开关、基本预览。Campaign 有多 variant、部分 MMS/RCS/联系人卡配置；Canvas 有语言 Liquid 生成、个性化默认值、个体测试收件人和预览快照。它们说明有基础功能，不代表全配置或界面 1:1。

Campaign 源站本次可见 Compose 只有 Language、Message、Link shortening 等控件；本地额外的 Message type、Sending configuration、Append opt-out 等不能仅因“功能更多”就算布局复刻通过，也不能据该源站未开通 MMS 的状态推断 Braze 永远没有相关配置。

此前 Canvas SMS QA 的 “passed” 只针对指定桌面内容面板和列明的交互；该文档明确将模拟发送、固定短链、本地 Operator、调度仅保存列作边界，小屏还采用了响应式改排。因此它不是 Campaign + Canvas 全量 SMS 1:1 验收结论。

## 本次验证

- Node v22.22.3，运行 `tests/sms-model.test.mjs`、`tests/channel-fidelity-2026-10-30.test.mjs`、`tests/campaign-channel-parity.test.mjs`，**31 / 31 通过**。
- 这些测试覆盖编码、分段、个性化、opt-out、部分渠道编译等模型行为；不覆盖上述完整 UI 一致性，也不能抵销未实现项。
- 本次新增 5 组源站截图与文本快照；没有进行真实发送、没有保存源站改动。

建议修复顺序：SMS-01/02 工作区隔离 → SMS-03/04 个性化 → SMS-05/06 测试配置 → SMS-11 渲染校验统一 → SMS-08/10 富媒体与语言 → SMS-07/09/12 真实能力接入及执行验收。
