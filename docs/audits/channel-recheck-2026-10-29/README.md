# Braze 十渠道编辑器复核 · 2026-10-29

**结论：当前仍未达到 Braze 1:1。十个入口均可进入本地编辑流程，但字段、布局、编辑方式、权限状态和预览行为仍有差异。本轮修复了 6 处可确认的功能或校验缺陷；没有把本地模拟、模型测试通过视为原站全功能验收。**

## 范围与证据

- 对照已登录的 `dashboard-09.braze.com` 实际页面。本轮截图和 DOM 均保存在本目录；没有以历史审计截图替代本轮原站证据。
- 原站使用单独浏览器页检查新建草稿；用户提供的 IAM 活动只读取当前页面，不修改其内容。没有发送真实消息、启动活动或调用原站测试发送。
- 本地基于当前工作目录的全部已有改动运行，数据库复制到 `/private/tmp/braze-channel-recheck-20261029.sqlite` 后测试，避免改写原有活动数据。
- 本轮是核心编辑流程、配置持久化及重点异常检查，不涵盖所有平台、所有模板、全部语言和全部高级选项的组合。
- 截图保留浏览器实际画面。原站主要为 1440×693，本地主要为 1425×891；浏览器 viewport 设置未统一到两个页面。因此只用于结构和交互对照，没有计算像素差异百分比，也没有给出像素级通过结论。
- 新建原站检查草稿可能保留在原站；Push 的平台 Confirm 步骤出现过原站 `Save completed`。未删除或发布这些草稿。

## 本轮已修复

| 编号 | 问题及触发方式 | 修改与验证 |
| --- | --- | --- |
| F1 | Push 已填写正文后，只修改 Device 为 Tablet，Review 报 `Add message content before launching`，但预览仍有正文 | 通用 `MessageVariants` 更新配置时保留第一变体的标题和正文；浏览器复现前后均已截图，修复后 Review 无该错误且 Launch 按钮可用，未点击发布 |
| F2 | WhatsApp 选择自建模板后打开 Preview and test，正文和页脚被替换为 September offer 示例 | 测试预览传入自建模板集合，并按预览用户解析 Liquid；浏览器确认自建正文和页脚正确显示 |
| F3 | Multichannel 取消 Content Card 后，Review 仍显示已取消消息 | Review 按当前选中的渠道过滤消息；保留取消前的编辑草稿，重新选择时可以继续编辑；浏览器确认取消消息消失且 Push 保留 |
| F4 | LINE 的空白消息存入 messageVariants 后，活动级校验仍读取旧顶层正文，错误通过 | 活动校验逐变体检查 LINE 消息栈；新增空消息与修复后有效消息回归 |
| F5 | Push 第一变体有效、第二变体正文为空时，活动级校验错误通过 | 各 Push 变体独立检查正文，并允许无标题/正文的 silent push；新增回归 |
| F6 | Banner 按钮动作里的 `broken` URL 可以通过校验；事件动作没有名称也可通过 | 检查可视化内容块的 URL 和事件/属性动作名称；新增无效和有效配置回归 |

修改位置：`app/ui/message-controls.tsx`、`app/ui/email-dnd-editor.tsx`、`app/ui/campaign-message-editor.tsx`、`lib/campaign-validation.ts`、`lib/channel-message-model.ts`、`tests/campaign-channel-parity.test.mjs`。其余既有工作区改动均保留。

修复证据：

- Push：`11-push-settings-review-bug.png` / `11-push-settings-review-fixed.png`，以及对应 DOM。
- WhatsApp：`12-whatsapp-custom-preview-bug.png` / `12-whatsapp-custom-preview-fixed.png`。
- Multichannel：`13-multichannel-removed-review-bug.dom.txt` / `13-multichannel-removed-review-fixed.dom.txt`。
- 校验缺口修复前探针：`additional-validation-probes.json`；修复后断言：`regression-tests.txt`。

![WhatsApp 自建模板测试预览修复前后](/Users/ethanshen/Desktop/LLM/untitled%20folder/braze-clone/docs/audits/channel-recheck-2026-10-29/whatsapp-preview-fix-comparison.png)

## 逐渠道检查步骤与结果

### 1. Multichannel：可编辑，仍有结构与总预览差异

原站路径：选择第一个消息渠道 → Channels 标签 → Add channel → 渠道编辑。原站可选七种渠道，本地当前七种渠道集合一致；不包含 IAM 和 Banner 这一点不应算缺失。

仍需处理：

- 本地使用一排复选框和普通按钮；原站是首次渠道选择面板、Channels 标签和 Add channel 菜单。
- 本地每个子渠道还展示一套变体工具，层级与原站本轮看到的渠道编辑结构不同。
- 顶部总 Preview and test 仍读取旧的 `channelValues.channelContent`，新编辑器内容存于 `multichannelMessages`；逐渠道测试入口与总预览并未完全统一。这是代码确认的剩余接线问题，尚未在浏览器对全部组合复验。
- 取消渠道后 Review 的残留内容已修复（F3）。

证据：`08-braze-multichannel.png`、`08-braze-multichannel-message.dom.txt`、`08-local-multichannel.png`。

### 2. Email：基础编辑可用，HTML 工作台布局偏差大

原站路径：创建方式选择 → HTML code editor → Sending Settings / Content / Preview & Test → Done 返回摘要。本地已具备 HTML、Plaintext、AMP、附件和发送信息，不应重复列为完全缺失。

仍需处理：

- 原站 HTML 工作台为左侧功能导航、中间代码、右侧预览；本地为大块左预览和窄右侧表单，工具、代码区、按钮位置均不同。
- 原站 Content 有 Link Management、Gmail Promotion、Personalization、Languages；当前 HTML 编辑器没有对应的完整导航与 Gmail Promotion 配置。
- 原站 Advanced 含 Email Headers 和 Email Extras；本地发送高级设置主要为追踪与 UTM，未提供同等自定义 Headers / Extras 编辑链路。
- 本地有 BCC、Reply-to、IP pool、preheader whitespace、list-unsubscribe，不属于缺失，但仍需按原站组件、布局和默认状态对齐。
- 原站本轮拖拽邮件编辑器进入 Bee iframe 后长期停在加载进度条，Done 不可用。**拖拽邮件内容区无法完成本轮原站视觉验收**，不能据此认定本地通过，也不能把原站加载失败算成本地缺失。

证据：`09-braze-email-html.png`、`09-braze-email-sending.dom.txt`、`09-braze-email-advanced.dom.txt`、`09-local-email-html.png`。`09-braze-email-drag-blocked.png` 仅是阻塞证据，不是正常编辑器基准图。

### 3. In-App Message：传统编辑器部分接近，关键配置仍缺失

原站读取用户提供的 Modal / Image Only 页面；本地进入 Traditional Editor 检查同类配置，并检查相关模型和预览实现。

仍需处理：

- 原站按钮点击动作按 Android、iOS、Web 分别设置；本地每个按钮只有一套动作，不能保存三套不同平台行为。
- 原站 Image Only 页面可编辑图片 Alt text；本地传统预览的图片替代文本写死为 `Message image`，页面主图片没有相应编辑字段。这同时影响无障碍内容。
- 原站图文布局的图片入口包含 No image / Pick a Badge / Upload Your Own Image；本地主要为上传、媒体库和 URL，缺少对应选择结构和 Badge 体验。
- 管理语言入口、按钮增删位置、下拉组件、图片信息展示和预览尺寸仍有差异。
- 本地 drag-and-drop、traditional、custom HTML 是不同编辑链路，本轮没有对所有 IAM 模板和设计面板逐项验收。

证据：`10-braze-iam.dom.txt`、`10-braze-iam.png`、`10-local-iam-traditional.dom.txt`、`10-local-iam-traditional.png`。

### 4. Push Notification：配置缺失较多，需优先补齐

原站路径：Mobile / Web → iOS / Android → Confirm（平台随后锁定）→ 双平台预览 → Compose / Settings / Test。

仍需处理：

- 本地没有原站的平台确认与锁定步骤，且多出 Kindle 入口。
- 本地缺 Android Summary text、Android push icon、Push destination、iOS device destinations、Android delivery priority 的当前有效编辑入口。
- 本地的 Same content for all platforms 控制内容；原站本轮的 Same for all platforms 位于 On-click behavior，控制点击动作。本地不能配置同等分平台点击行为。
- 原站同时显示 iOS / Android 原生通知外观，本地显示通用手机气泡；设备下拉、通知状态、图片区及帮助说明不一致。
- 不要把 `dashboard.tsx` 中旧 Push 实现拥有的字段当作当前已实现：当前路由使用 `push-campaign-editor.tsx`。
- 设置误清正文、空白第二变体的校验已修复（F1、F5）。

证据：`01-braze-push.dom.txt`、`01-braze-push-settings.dom.txt`、`01-braze-push.png`、`01-local-push.dom.txt`、`01-local-push.png`。

### 5. Banner：可构建本地内容，距离原站全屏体验较大

原站路径：选择 placement → Drag-and-drop / HTML / Templates 三卡入口 → 全屏构建器 → Compose / Settings / Preview。

仍需处理：

- 本地直接显示内嵌构建器和编辑方式下拉，缺原站的三卡入口、全屏工作台、Cancel / Done 回填流程。
- 原站可见的 Link、Phone Capture、Email Capture、Manage Subscriptions 内容块未包含在本地六类块里。
- 缺原站 Style 工具、画布尺寸编辑、Mobile / Desktop 切换、outline 开关、Personalization 和 Manage languages 工作台入口。
- 本地未选择 placement 时仍可编辑；原站未选择 placement 会拦截打开拖拽编辑器。本地发布校验虽然要求 placement，但步骤体验仍不相同。
- 原站提示 API-triggered 不支持，本地目前已有对应限制，不能沿用上轮“仍支持 API-triggered”的旧结论。
- 内容块动作校验已修复（F6）。

证据：`03-braze-banner.png`、`03-braze-banner-builder-1440.png`、`03-braze-banner-builder.dom.txt`、`03-local-banner.png`。

### 6. Content Card：基础内容可编辑，高级配置未对齐

原站路径：Classic / 其他卡片类型 → Compose / Settings / Test → Device 预览。

仍需处理：

- 缺正文多语言编辑、按平台分开的点击行为、Accessibility language 及 Liquid 设置入口。
- 本地默认 Open web URL，原站新建卡片默认 Behavior 为 None；默认行为不同会影响操作流程。
- 原站可切换预览 Device，本地主要是普通卡片容器。
- 本地 Compose / Settings / Card controls 与原站 Compose / Settings / Test 不同。全局 Preview and test 已存在，属于入口组织差异，不是完全没有测试功能。
- Pin card 的位置、素材上传区、Liquid 编辑器、KVP 组件与原站不同。生命周期控件的所有组合本轮未逐项验收。

证据：`02-braze-content.dom.txt`、`02-braze-content-settings.dom.txt`、`02-braze-content.png`、`02-local-content.png`。

### 7. SMS/MMS/RCS：SMS 核心链路可用，权限和预览不一致

原站路径：订阅组 → Preview 与 Compose / Contact Card Generator / Test。本地具备变体、Liquid、语言、订阅组和短链配置。

仍需处理：

- 原站本账号未开通 MMS；Contact Card Generator 只有权限说明，本地直接提供消息类型和联系人卡片能力。若目标是此账号的 1:1，需按能力开关展示状态。
- 原站预览为消息气泡区域，本地为明显的整部手机轮廓；列宽、留白、语言入口和输入组件均不同。
- 本地增加 Sending number / messaging service 和 opt-out 选项，原站当前订阅组下未呈现同等字段结构，需要与订阅组能力联动。
- **MMS 媒体、RCS rich card、联系人卡片的原站完整编辑体验，本轮无权限验证。** 本地模型测试通过不等于这些分支已 1:1。

证据：`05-braze-sms.png`、`05-braze-contact-card.dom.txt`、`05-local-sms.png`。

### 8. Webhook：请求编辑有基础，但界面结构不同

原站路径：Compose webhook / Templates → 左预览、右 Compose / Test → URL、Credential、HTTP method、Body、Headers。

仍需处理：

- 本地直接展开长表单，预览位于下方；缺原站首次模板选择、双栏布局、Compose / Test 标签和 Choose New Template 流程。
- 原站有 Credential 管理入口，本地主要是手填 Header 和 Quick authentication；能力和配置来源不同。本轮原站 Credential 处于不可选择状态，未验证完整凭证管理流程。
- 语言管理使用本地 prompt，未复刻原站 Manage languages；Liquid 插入工具也不是同一组件。
- 本地运行能力提示直接展示环境变量名，属于实现信息泄露到产品流程的体验问题，应移至诊断页。

证据：`06-braze-webhook-editor.dom.txt`、`06-braze-webhook.png`、`06-local-webhook.png`。

### 9. WhatsApp：八种布局入口已有，部分编辑能力与流程缺失

原站路径：订阅组 → 模板/回复模式 → 八种回复布局 → Select layout → Compose / Test。

仍需处理：

- 本地直接进入带示例模板的编辑区，原站先选择订阅组再选择消息类型与布局；布局选择卡片、按钮和列结构不同。
- 原站 Text Response 有 Add languages 和 Include a preview of the URL；本地响应消息缺同等语言管理及 URL preview 配置。
- 本地八种布局入口已包含 Carousel、Flow、Product，不能沿用上轮“五种布局”结论。但 Flow / Product 依赖提供商配置，入口存在不等于完整能力已验收。
- 原站预览在左，本地 WhatsApp 手机预览在右；模板管理、准备状态及 WABA 展示与原站不同。
- 自建模板在测试弹窗显示错误示例已修复（F2）。媒体、Carousel、Flow、Product 的所有组合仍需后续逐布局验收。

证据：`07-braze-whatsapp-layouts.png`、`07-braze-whatsapp-text.dom.txt`、`07-local-whatsapp.dom.txt`、`12-whatsapp-custom-preview-fixed.png`。

### 10. LINE：消息模型有基础，编辑工作台仍是不同产品形态

原站路径：订阅组 → Launch editor → 全屏 Compose / Settings / Preview，提供 Text / Image / Card-based message / Rich Message，最多五条消息。

仍需处理：

- 本地未选订阅组也展示整套内嵌编辑器，缺 Launch editor 的前置步骤和全屏 Cancel / Done 回填流程。
- 原站是块工具箱与消息画布，本地为 Message stack 标签、表单和气泡预览；卡片类型名称、属性入口和编辑顺序均不同。
- 缺原站 Undo / Redo、Mobile / Tablet / Desktop、Personalization 工具栏和独立 Preview 工作区。
- 本地有 5 条消息、卡片、rich 区域和 Flex JSON 能力，但不能据此认定交互已复刻。
- 空变体未被活动校验拦截已修复（F4）。原站各卡片属性面板及 rich message 区域编辑未逐一深入操作，本轮不作全量通过结论。

证据：`04-braze-line-groups.dom.txt`、`04-braze-line-editor.png`、`04-local-line.png`。

## 共性差异与建议顺序

1. **先统一功能和预览数据来源。** 优先修复多渠道总预览旧结构，以及各编辑器保存、Review、测试和编译使用不同模型的剩余接线问题。
2. **补齐渠道关键配置。** Push 平台/点击/发送选项、IAM 分平台动作和图片替代文本、Content Card 语言与无障碍、WhatsApp 响应语言和 URL preview。
3. **重做 Banner / LINE 工作台外壳与缺失块。** 仅给现有表单换颜色无法达到原站全屏编辑体验。
4. **对齐 Email HTML 与 Webhook 信息架构。** 包含导航、代码和预览的位置、模板返回流程、Header / Extras 等真正缺失的配置。
5. **最后逐状态视觉验收。** 相同视口、内容、语言、选中状态和权限条件下重拍，逐项检查间距、字体、圆角、下拉、tab、按钮与原生设备预览。当前不能给出“还原度百分比”。

共性问题：多个新渠道使用原生 select 和 checkbox，原站使用带图标/帮助说明的自定义组件；侧栏宽度、内容最大宽度、标题层级、变体区域、固定底栏和通知外观差异明显。大部分本地 Campaign Details 没有原站 Campaign brief 上传区。部分 tab 仅使用 aria-pressed，与原站的 tab 语义不同；未做完整键盘和屏幕阅读器验收。

## 验证记录

- **45 / 45 模型回归通过**，含本轮新增的三个校验回归：`regression-tests.txt`。
- **TypeScript `tsc --noEmit` 通过**：`typecheck.txt` 为空且进程退出码为 0。
- **10 / 10 渠道配置保存、重新读取一致且正文保留**：`persistence-results.json`。这是 API 持久化检查，不代替所有 UI 控件的端到端测试。
- Push、WhatsApp、Multichannel 三个 UI 缺陷有修复前后浏览器证据；没有点击 Launch 或发送真实消息。
- 本轮未执行生产构建，未验证真实 APNs、FCM、Email、Meta、LINE 或运营商投递，未完成所有高级编辑组合的像素验收。


## 本轮截图索引

下列为流程结构证据。两端内容、布局状态和视口高度不完全一致，不作逐像素差异图使用；具体字段结论以正文所列 DOM 和代码检查为准。

### 1. Multichannel

| Braze 原站 | 当前本地 |
| --- | --- |
| ![原站](/Users/ethanshen/Desktop/LLM/untitled%20folder/braze-clone/docs/audits/channel-recheck-2026-10-29/08-braze-multichannel.png) | ![本地](/Users/ethanshen/Desktop/LLM/untitled%20folder/braze-clone/docs/audits/channel-recheck-2026-10-29/08-local-multichannel.png) |

### 2. Email HTML

| Braze 原站 | 当前本地 |
| --- | --- |
| ![原站](/Users/ethanshen/Desktop/LLM/untitled%20folder/braze-clone/docs/audits/channel-recheck-2026-10-29/09-braze-email-html.png) | ![本地](/Users/ethanshen/Desktop/LLM/untitled%20folder/braze-clone/docs/audits/channel-recheck-2026-10-29/09-local-email-html.png) |

### 3. IAM Traditional

| Braze 原站 | 当前本地 |
| --- | --- |
| ![原站](/Users/ethanshen/Desktop/LLM/untitled%20folder/braze-clone/docs/audits/channel-recheck-2026-10-29/10-braze-iam.png) | ![本地](/Users/ethanshen/Desktop/LLM/untitled%20folder/braze-clone/docs/audits/channel-recheck-2026-10-29/10-local-iam-traditional.png) |

### 4. Push

| Braze 原站 | 当前本地 |
| --- | --- |
| ![原站](/Users/ethanshen/Desktop/LLM/untitled%20folder/braze-clone/docs/audits/channel-recheck-2026-10-29/01-braze-push.png) | ![本地](/Users/ethanshen/Desktop/LLM/untitled%20folder/braze-clone/docs/audits/channel-recheck-2026-10-29/01-local-push.png) |

### 5. Banner

| Braze 原站 | 当前本地 |
| --- | --- |
| ![原站](/Users/ethanshen/Desktop/LLM/untitled%20folder/braze-clone/docs/audits/channel-recheck-2026-10-29/03-braze-banner-builder-1440.png) | ![本地](/Users/ethanshen/Desktop/LLM/untitled%20folder/braze-clone/docs/audits/channel-recheck-2026-10-29/03-local-banner.png) |

### 6. Content Card

| Braze 原站 | 当前本地 |
| --- | --- |
| ![原站](/Users/ethanshen/Desktop/LLM/untitled%20folder/braze-clone/docs/audits/channel-recheck-2026-10-29/02-braze-content.png) | ![本地](/Users/ethanshen/Desktop/LLM/untitled%20folder/braze-clone/docs/audits/channel-recheck-2026-10-29/02-local-content.png) |

### 7. SMS

| Braze 原站 | 当前本地 |
| --- | --- |
| ![原站](/Users/ethanshen/Desktop/LLM/untitled%20folder/braze-clone/docs/audits/channel-recheck-2026-10-29/05-braze-sms.png) | ![本地](/Users/ethanshen/Desktop/LLM/untitled%20folder/braze-clone/docs/audits/channel-recheck-2026-10-29/05-local-sms.png) |

### 8. Webhook

| Braze 原站 | 当前本地 |
| --- | --- |
| ![原站](/Users/ethanshen/Desktop/LLM/untitled%20folder/braze-clone/docs/audits/channel-recheck-2026-10-29/06-braze-webhook.png) | ![本地](/Users/ethanshen/Desktop/LLM/untitled%20folder/braze-clone/docs/audits/channel-recheck-2026-10-29/06-local-webhook.png) |

### 9. WhatsApp

| Braze 原站 | 当前本地 |
| --- | --- |
| ![原站](/Users/ethanshen/Desktop/LLM/untitled%20folder/braze-clone/docs/audits/channel-recheck-2026-10-29/07-braze-whatsapp-layouts.png) | ![本地](/Users/ethanshen/Desktop/LLM/untitled%20folder/braze-clone/docs/audits/channel-recheck-2026-10-29/07-local-whatsapp.png) |

### 10. LINE

| Braze 原站 | 当前本地 |
| --- | --- |
| ![原站](/Users/ethanshen/Desktop/LLM/untitled%20folder/braze-clone/docs/audits/channel-recheck-2026-10-29/04-braze-line-editor.png) | ![本地](/Users/ethanshen/Desktop/LLM/untitled%20folder/braze-clone/docs/audits/channel-recheck-2026-10-29/04-local-line.png) |

