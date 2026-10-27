# Braze In-App Message：采集与实现状态

更新日期：2026-10-27。已根据采集证据修改当前项目；完整 1:1 验收尚未完成。

## 原站与限制

原站：[Onboarding IAM](https://dashboard-09.braze.com/engagement/campaigns/6ad0b99a485c580061eb1d6c/6ad0b98fe4b4110085216601?locale=en)。

本轮恢复浏览器后，已使用 Cancel → Discard changes 放弃前次采集的未保存修改，恢复五页草稿。随后只打开编辑器和 Add Page 模板弹层；没有保存、发布或发送原站消息。

再次点击原站 **Braze Templates** 时，浏览器安全策略拒绝该动作，报告该页面不允许 Browser Use，并明确禁止用其他浏览器表面、间接执行或其他方式达成相同动作。本轮没有绕过此限制。此前取得的截图、可见 DOM、页面 HTML 和 SVG 继续作为实现依据。

## 已取得的证据

- 桌面编辑器 1440×900：Compose、Pages、Rows、Blocks、全局样式、Current page。
- Settings：Key-value pairs、添加键值对、Accessibility、Language Liquid。
- Preview & Test：左侧页面与测试设置、四个用户模式入口、Custom user 的 Profile 字段。
- Add Page：14 个内置模板的名称和说明、Braze / Your Templates、列表与网格入口；选择模板直接添加页面；实际触发 10 页上限错误。
- 已导出 9 个页面 HTML：Onboarding 的 5 页、Basic、Email sign-up with background image、Email sign-up with confirmation page 的 2 页。
- Schedule Delivery、Target Audiences、Assign Conversions、Review Summary 的桌面截图与可见 DOM。
- 61 个原站 SVG、6 张 Onboarding 原图及 Companify Logo，已保存在 `public/braze-iam/`；Aribau 复用项目已有本地字体。
- 手机 CSS 视口 390×844 已核对，但浏览器截图只导出 390×244 的缩放画布；该图片不能作为有效的手机像素验收依据。

## 已实现与持久化

- Campaign Details 去重，使用统一 TagPicker。
- Drag-and-drop 编辑器改为与原站对应的三列结构；原站行/块 SVG；设备切换与轮廓开关。
- 全局及单页样式覆盖、颜色透明度、字体与对齐、关闭按钮、背景、边框、Overlay；页面样式重置。
- 编辑器独立草稿、覆盖完整变体的撤销/重做、取消确认与回滚、背景 inert 与键盘焦点约束。
- Key-value pairs 子页，新增、删除、Liquid 插入、重复键校验；Accessibility 的静态与动态语言。
- Add Page 模板弹层，列表/网格、搜索与过滤、Your Templates；5 类有完整页面结构的模板可以添加，其余 9 类保持 unavailable，未用其他模板内容冒充。
- 最多 10 页、模板整组添加时重新关联内部跳转、页面排序和删除链接清理、未连接页面提示、预览跨页跳转与关闭/重新开始。
- Preview & Test 左栏布局；随机、已有、自定义及语言预览；使用真正的 Liquid 引擎处理全页文本、按钮、KVP 和无障碍语言。
- 测试使用未保存快照，持久化测试资源和 `test_prepared` 事件；明确 `simulation` / `delivered: false`，不冒充 SDK 设备投递。
- 保存完整变体为模板；保留语言、KVP、页面和样式。HTML 转换保留多页和页面锚点，预览在隔离 iframe 中展示。
- IAM 的 Action-Based Delivery 基础配置、触发条件、延迟、起止时间、重入与 High / Medium / Low 优先级，以及多变体 A/B 流量配置。
- 完成编辑、测试、模板保存及发布入口校验全页 Liquid；无效测试批次不会留下部分准备记录。

## 尚不能声称 1:1 的范围

1. 其余 9 个内置模板：Email sign-up with special offer / welcome discount、Product announcement、Push primer、Seasonal promo with background image、Background image、Email / SMS / WhatsApp sign-up 的完整内容与样式。
2. 传统 Slideup / 传统 HTML 编辑器、独立 IAM Templates / Color Profiles 管理页。
3. 完整行列嵌套、逐块高级样式、表单订阅/用户属性提交行为、Manage languages 的真实独立流程、完整自定义字体上传流程。
4. View exact priority 排序器、复杂受众过滤、所有转化事件配置与完整 Review Summary 的逐状态对照。
5. 部分字段仍使用原生 select / checkbox 等控件；细节与原站自定义控件不完全一致。自定义字体名称支持设备已有字体，没有实现远程字体上传。
6. 有效手机像素截图和上述未采集状态的视觉核验。

界面上的 unavailable 表示当前实现尚不可用，不能据此推断原站没有相应能力。真实消息展示、表单提交、分析上报仍需要对接 SDK。

## 验证与后续入口

- 16 项模型与 Liquid 单元测试：`tests/in-app-model.test.mjs`、`tests/in-app-runtime.test.mjs`。
- 隔离本地接口验证：`tests/in-app-api.py`，数据库 `/tmp/braze-iam-20261027.sqlite`。
- 浏览器已验证：取消不泄漏、跨页预览、准备测试记录、模板整组添加、10 页上限、手机面板入口、Done 保存及完整模板回读、全局宽度撤销。最后的 KVP / 语言核对修改均已放弃。
- 桌面同视口的组合对比及每轮截图保存在本目录；具体结果见项目根 `design-qa.md`。

需要在原站访问限制解除后继续采集剩余状态；不能把当前代码与通过构建等同于完整复刻通过。
