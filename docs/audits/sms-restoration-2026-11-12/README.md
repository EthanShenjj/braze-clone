# SMS 还原证据索引

源站 Campaign：Demo – ittor，现有 Early Access SMS 草稿。

https://dashboard-09.braze.com/engagement/campaigns/6af4375320abdf005fc2ef31/6af4374c46d3080087f1c5d2?locale=en

当前可访问的 Canvas：

https://dashboard-09.braze.com/engagement/canvas/6af4375b20abdf005fc2f215/6af4374c46d3080087f1c5d2?locale=en&version=flow&isEditing=true

## 源站

- `source-options-default-attributes.*`：19 个默认属性。
- `source-options-most-recent-device-attributes.*`：14 个设备属性。
- `source-campaign-attribute-options.*`：5 个 Campaign 属性。
- `source-options-sms-properties.*`：3 个 SMS 属性。
- `source-options-whatsapp-properties.*`：10 个 WhatsApp 属性。
- `source-whatsapp-property-snippet.*`：`whats_app` 命名空间。
- `source-language-options.*`：15 种语言及 Select all。
- `source-language-insertion.*`：已有正文时的 Replace / Add after 按钮。
- `source-canvas-compose.*`、`source-canvas-delivery.*`：当前 View Only Canvas 的可读状态。
- `source-canvas-test.*` 是 View Only 下点击 Test 未发生切换的原始证据，**不计为 Test 页成功采集**。
- `source-personalization-01` 至 `16` 为早期逐类型原始采集。部分点击受下拉层位置影响实际选中了相邻选项；以截图实际选中标签为准，后续精确筛选的 `source-options-*` 等文件优先。初始编号不代表 16 类配置均已完整验证。

## 本地

- `local-campaign-personalization.*`：16 类个性化菜单。
- `local-campaign-test.*`：测试组、工作区预览用户及 prepared 提示。
- `local-campaign-language-image.*`：只选择 Image 时可以生成片段并插入。
- `local-canvas-delivery.*`：15:30 自定义兜底、受众条件和失败行为。
- 以 `final-` 开头的文件为最终生产页面回读及截图；其他文件保留中间检查过程。

详细修复与验收边界：[SMS 还原记录](../../implementation/sms-restoration-2026-11-12.md)。所有检查未保存源站改动、未发送真实短信。

最终验证：483/483 测试通过，生产 API 验收、TypeScript 检查、生产构建通过。日志保存在 `verification-tests.log`、`verification-api.log`、`verification-build.log`。本机最终预览端口为 3216；没有执行线上部署。
