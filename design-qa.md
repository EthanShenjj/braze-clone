# In-App Message replication QA — 2026-10-27

final result: blocked

本轮已实施并验证核心编辑流程；该结果表示完整 1:1 尚未通过，不能用构建成功代替产品与视觉验收。

## Findings

- [P1] 9 个内置模板尚未取得完整内容。
  - Evidence：原站 14 个名称/说明已采集，完整页面数据只覆盖 Onboarding flow、Basic、Blank 和两种 Email sign-up，共 5 类。
  - Impact：这些模板在当前实现中显示 unavailable，不能完成与原站等价的模板选择。
  - Fix：访问限制解除后逐个采集内容、资产和添加后的页面图，不使用其他模板充数。
- [P1] 部分 IAM 能力仍未逐状态还原。
  - Location：传统编辑器、独立模板/Color Profiles 管理、完整行列嵌套、表单订阅/属性提交、Manage languages、自定义字体上传、exact priority 排序器。
  - Fix：补齐原站对应交互证据后实施。现有代码只提供已记录的核心编辑、样式、元数据、预览及基础发送配置。
- [P2] 桌面自定义控件与细节仍有差异。
  - Evidence：`comparison-compose-final.png` 与 `comparison-message-detail-final.png` 将原站和本地截图放在同一图中。三列结构和消息 450px 宽度已对齐；原生 select/checkbox、关闭按钮周围行轮廓、页面列表菜单、部分字体选择值及间距仍与原站不完全相同。Preview 的桌面窗口装饰、遮罩底色合成和部分操作图标也仍需核对。
  - Impact：尚不满足逐像素复刻。
  - Fix：继续使用原站控件/样式证据对齐；不要用浏览器截图色彩差异反向硬改已核实的 CSS token。
- [P2] 手机像素验收受截图输出异常阻碍。
  - Evidence：DOM 确认编辑器 CSS 视口为 390×844，导出却是 390×244 的缩放合成图。`comparison-mobile.png` 仅作异常记录，不能判定像素通过。
  - Fix：取得有效同视口原站和本地截图。当前手机布局另提供 blocks / canvas / styles 切换，是可操作性适配，尚未认定与原站移动布局一致。

## Source access blocker

浏览器已恢复过一次，前次未保存修改已通过 Cancel → Discard changes 放弃。后续点击原站 Braze Templates 被浏览器安全策略拒绝；工具明确禁止通过其他浏览器表面、间接执行等方式绕过。本轮继续使用已取得的证据实现，没有绕过限制。

[url-to-code](</Users/ethanshen/.codex/plugins/cache/openai-curated-remote/product-design/0.1.56/skills/url-to-code/SKILL.md>) 的验收要求为：“Do not hand off until every single interaction and state is captured from the target.” 因仍有未采集和未验证状态，不能标记完整复刻完成。

## Iterations and evidence

1. 首轮 `implementation-compose-first.png` 的实际截图为 1280×720，与 1440×900 原站不一致；该轮仅用于定位，不作精确对比结论。
2. 明确设置 1440×900，得到 `comparison-compose-1440.png`。发现缩略图位置偏移、部分 SVG 因缺少原站继承的 fill/stroke 而空白，以及消息尺寸偏差。
3. 修正缩略图定位、真实 SVG 填色/描边、背景隔离、布局列宽和消息内容字号/间距；生成 `comparison-compose-revised.png`。
4. 基于页面 HTML 的实际标题 28px、正文 18px、行高和素材生成最终组合对比。最终本地消息容器 DOM 为 x=465、y≈212.33、width=450、height≈410.33；对应原站截图容器约 x=465、y=212、width=450、height=411。
5. `comparison-message-detail-final.png` 对照消息局部，确认真实图片、主体文案和按钮，仍记录上面的轮廓与控件差异。后续小修正另保存最新截图，未据此将 QA 结果改为通过。

6. 最后一轮修正 KVP 居中空态、单行 Key / Value 与内嵌 Liquid 入口、Settings 灰色选中样式，以及 Preview 的页面列表独立滚动和桌面容器比例。已将 `comparison-compose-latest.png`、`comparison-preview-latest.png`、`comparison-settings-latest.png`、`comparison-accessibility-latest.png` 的源站与本地放在同一图中再次查看。
   - KVP 空态和 Preview 主体比例已明显对齐；KVP 说明的链接样式、原生控件、窗口装饰、少量字号/间距仍有差异。
   - `implementation-settings-row-latest.png` 是功能检查用的 QA 示例值，与原站空行内容不同；不据此作字段文案逐像素通过结论。
   - 最新浏览器未出现 console error / warning；核对用的未保存 KVP / 语言修改已 Cancel → Discard changes 放弃，临时视口覆盖已 reset。

## Required fidelity surfaces

- Fonts / typography：界面使用已存在的本地 Aribau；Onboarding 内容按原 HTML 的系统字体与字号处理。部分原站自定义模板字体和所有字体选择状态仍待核对。
- Spacing / layout：Compose 的 340px 左栏、400px 右栏及 450px 消息容器已对齐。Settings / Preview 纠正为左侧配置与右侧主体。自定义控件、行/块高级编辑和手机像素布局未通过完整核验。
- Colors / tokens：复用原站 navy / gold、白底和界面灰色。DOM 背景为 rgb(89,89,89)，但原 Chrome 与内置浏览器 JPEG 截图的采样存在色彩差异；不把该输出差异当作 CSS 值错误。
- Images / assets：Onboarding 6 张原图、Companify Logo、61 个 SVG 本地保存；行/块图标采用原始路径并恢复显示需要的 fill/stroke，未绘制替代图标。未导出的少量操作图标沿用现有 Lucide（如 KVP 连接箭头），不计为图标逐像素通过。其余模板资产未齐。
- Copy / content：核心 Compose、KVP、Accessibility、Preview & Test 标签已核对；五类模板可用，其余 unavailable。所有未采集表单/模板/传统编辑器内容不作完成声明。

## Functional verification

- 16 项 IAM 模型和真实 Liquid 引擎测试通过，覆盖复制链接重映射、10 页上限、删除链接清理、显式空按钮、全页语法校验、用户属性渲染、重复元数据键、HTML 清理和目的地址校验。
- 跨 IAM / SMS / WhatsApp / Webhook / Tag / Global Control / Navigation 的一轮 52 项回归通过；其后新增 IAM 专项测试另通过。
- `tests/in-app-api.py` 对隔离本地数据库通过：保存/读取完整变体、预览不改草稿、测试记录与事件落库、失败批次不产生部分记录、旧测试入口兼容、完整模板持久化、无效模板和发布校验。
- 浏览器已验证取消编辑后的 KVP 不泄漏、真实跨页预览、测试准备提示与记录、模板五页整组添加、10 页上限错误和手机样式面板入口、完成编辑和保存模板的完整 KVP 回读、全局宽度撤销。
- TypeScript 与生产构建通过，浏览器最新页面未发现 console error / warning。
- 所有测试记录只写入 `/tmp/braze-iam-20261027.sqlite`，未使用生产数据库；没有发送原站消息。

## Capability boundary

`/api/iam/test` 返回 simulation / delivered=false，并保存 test_prepared。设备展示、订阅提交和真实分析上报需要 SDK；本地准备测试不能视为真实投递。

详细状态见 `docs/in-app-message-reference/capture-status-2026-10-27.md`；实现架构见 `docs/in-app-message-implementation-2026-10-27.md`。此前 WhatsApp QA 保存在 `docs/whatsapp-reference/design-qa-before-iam-2026-10-27.md`。

## Traditional editor follow-up — public-reference implementation

final result: blocked

- Traditional editor core now exists: inline preview / four tabs, five message types, image upload/library, header/body, up to two independent buttons and their SDK action configuration, design colors/opacity/alignment, email capture, KVP/accessibility, language Liquid branches, local preview/test and template snapshot persistence.
- QA found email capture incorrectly retained two native buttons; fixed to one submit button. Compose shows the submit button while editing, matching the public reference; interactive Test displays it only after a valid email.
- Native variants preserve the original drag-and-drop variant and page graph. Effective first-page styles are copied without sharing mutable state. Fullscreen/image-only content and dismissal bounds are validated.
- 25 IAM model/runtime tests pass; original IAM API regression and traditional IAM API regression pass on the isolated test database. Production build passes. New API validation covers image byte sniffing, 5 MB limit, storage/readback, native action Liquid, full snapshot persistence and prepared simulations.
- Public reference capture adds official traditional/email compose screenshots and six modern template editor screenshots, plus phone examples/editor/picker. See `docs/in-app-message-reference/public-reference-status-2026-10-27.md` for all nine remaining template evidence gaps.
- [P1] All nine modern template payloads remain incomplete; their availability has not been falsely enabled.
- [P1] Traditional editor current dashboard state/DOM, ZIP assets, icon/badge selection, full language picker, Roku/CSS/survey-specific behavior and real SDK integration are incomplete.
- [P2] Public documentation screenshots have a different crop, viewport and sample assets from the local campaign. Comparison is diagnostic only; it does not pass same-state/same-viewport pixel QA. Input sizing, color-profile controls, native preview geometry and modal keyboard behavior still require source-state verification.
- Browser source security denial remains in force; no prohibited dashboard interaction was retried or bypassed. The URL-to-code skill's complete-state handoff requirement remains unsatisfied.

### Final follow-up evidence

- `implementation-traditional-email-test-final.png`: interactive test with a valid example email, visible local-only capture feedback, complete phone preview and working Close test preview header. Invalid email was checked first and did not expose the submit button.
- `implementation-traditional-compose-final.png`: the editable email capture example after the compose-only submit preview and full-width submit styling corrections.
- `comparison-traditional-public-diagnostic.png`: public official reference and local composer appear together. Crops/viewports differ; this is diagnostic evidence and explicitly not pixel QA pass.
- `implementation-traditional-mobile-diagnostic.png`: mobile structure was inspected; source parity and valid mobile pixel comparison remain unverified. A read immediately after viewport switching reported transient desktop geometry; the subsequent read showed the stacked native editor within the mobile main column. The temporary viewport override was reset.
- Browser error/warning logs were empty in the final check. The final production build passes. The broader 63-test regression across IAM, native IAM, SMS, WhatsApp, Webhook, Navigation, Tags and Global Control passes.
- The shared worktree has unrelated concurrent changes; the latest whole-tree whitespace check flagged an added EOF blank line in `app/ui/dashboard.tsx`. That unrelated change was preserved. IAM-scoped whitespace checks remain clean.
