# In-App Message 实现说明

本轮沿用现有 Next.js 应用、SQLite 存储和 Campaign 编辑流程；没有重建项目或替换既有标签、全局对照组、SMS、WhatsApp 模块。

## 数据架构

`campaign.config.iamVariants[]` 保存各消息变体：

- `id / name / sendTo`：变体标识、名称和目标平台。
- `pages[]`：稳定页面 ID、标题、正文、图片、按钮、内容块、列数及可选页面样式覆盖。
- `pages[].buttons[].behavior`：`dismiss / web_url / deep_link / page`；`page` 的目标存页面 ID。
- `global`：消息容器、默认内容、关闭按钮和遮罩样式。
- `keyValuePairs[]`：稳定行 ID、键和值；键和值均可包含 Liquid。
- `accessibilityLanguage / accessibilityLanguageLiquid`：静态与动态 HTML 语言。
- `customCode / customHtml`：HTML 模式及转换后的多页文档。

`channelValues` 保留旧版本读取需要的布局、平台、语言与页面数量。`config.delivery` 保存 IAM 基础发送配置，`variantSplits / controlGroup` 对接现有 A/B 配置。

## 编辑事务

打开拖拽编辑器时深复制当前变体。页面、全局样式、KVP、语言都写入编辑器内部快照；Undo / Redo 存整个变体。Cancel 检测修改并提示丢弃。Done 校验整个消息后才提交到父级草稿，再由现有 Campaign 保存流程持久化。

模板复制先为所有页面建立新 ID 映射，再重写内部跳转。删除页面将指向它的按钮重置为关闭动作，避免悬空链接。

## 运行与接口

- `lib/in-app-model.ts`：共享模型、兼容迁移、10 页限制、元数据/链接校验、复制/删除页面、HTML 转换。
- `lib/in-app-runtime.ts`：使用 LiquidJS 检查所有页面和元数据的语法，按用户属性渲染；HTML 预览移除脚本和内联处理器。
- `POST /api/iam/preview`：接收未保存的变体快照和预览模式，返回渲染后变体；`validateOnly` 只做结构和语法校验。
- `POST /api/iam/test`：接收 Campaign ID、快照、收件人及覆盖属性；先完成整个批次渲染，再保存测试准备记录。
- 旧 `POST /api/campaigns/[id]/test` 的 IAM 分支转到相同准备流程。
- 模板继续使用 `/api/resources/in-app-message-templates`，完整快照放在 `data.variant`，兼容保留 `pages / global / sendTo`。

测试资源类型为 `in-app-message-tests`，事件类型为 `test_prepared`。响应明确 `delivered: false`；此实现不连接设备 SDK，也不会发送真实 Braze 消息。

## 证据和边界

参见 [采集与差异记录](in-app-message-reference/capture-status-2026-10-27.md) 与 [验收报告](../design-qa.md)。未取得完整内容的模板保持 unavailable。未完成逐状态核验的传统编辑器、独立模板管理、表单高级行为等不能视为已经复刻。

## Traditional editor follow-up

Implementation follows the official public [traditional editor guide](https://www.braze.com/docs/user_guide/channels/in_app_messages/traditional) and the public `iam_compose.png` / `email_capture.png` screenshots. These are partial reference evidence, not a current dashboard state capture.

- `app/ui/in-app-traditional.tsx` adds inline Preview / Compose / Design / Settings / Test surfaces. Message types: Modal, Full Screen, Slideup, Custom HTML, Email Capture Form. Existing multi-page drag-and-drop content remains a separate variant when choosing Traditional Editor.
- `lib/in-app-traditional.ts` models native layout, orientation, iOS targeting, 1–60 second dismissal, body action, email placeholder and terms, separate header/body styles, and two independent button designs. Email capture uses exactly one submit button.
- On-click configuration includes close, web URL with in-app browser preference, deep link, custom event, custom attribute, and push permission. Test previews show SDK actions locally without requesting actual permissions or updating real user profiles.
- Color profiles can be saved and applied in Design. Language selection inserts real Liquid branches into existing content; it does not translate copy.
- `/api/iam/media` uploads PNG/JPEG/GIF up to 5 MB to the existing resource store; MIME is determined from file bytes. `/api/iam/media/[id]` serves stored bytes with `nosniff`. Image snapshots persist a URL instead of embedding large base64 in a message.
- Native settings and action payloads are validated, rendered with actual Liquid, included in template snapshots, and carried through the existing simulated test records.

Remaining traditional parity gaps: current dashboard pixel/state verification; complete supported languages UI; ZIP asset bundle handling; badge/icon selection; Roku/CSS-specific variants and simple-survey behavior; full SDK delivery/collection. Modal focus trapping and exact native layout/safe-zone behavior also require further verification. This is core capability implementation, not a claim of complete traditional-editor parity.

### Verification

- 25 model/runtime tests pass, including nine traditional-specific cases. `npm run test:iam` now includes these cases (use the configured modern Node runtime).
- `tests/in-app-api.py` and `tests/in-app-traditional-api.py` pass against isolated localhost database `/tmp/braze-iam-20261027.sqlite`.
- Native API checks cover two-editor snapshot roundtrip, action Liquid rendering, prepared simulation, template persistence, invalid close settings, real PNG upload and byte-identical readback, forged MIME and size rejection.
- Production build and TypeScript pass. Browser checks recorded native variant creation, independent Design controls, color-profile persistence, push-action simulation, Save Draft/readback, and invalid/valid email capture behavior. Email capture never changed real user profiles.
