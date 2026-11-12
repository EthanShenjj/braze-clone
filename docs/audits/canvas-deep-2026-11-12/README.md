# Canvas 深层快照（2026-11-12）

源站工作区 `6af4374c46d3080087f1c5d2`，经用户明确授权创建一个临时对照 Canvas `6af5503cd8512f008c15c8bd`。保留该 Draft，未启动或发送消息。编辑器改名和深层保存未确认成功，详见 [实现及剩余差异报告](../../implementation/canvas-deep-2026-11-12.md)。

共 48 组源站、21 组本地截图；每组包含 JPEG 和同期 AX 文本。编号 41 未采集，保留编号而不补造快照。source-04 是源站自身异常状态。截图只作为实际观察证据。

## 重点状态

- 源站 09–16：Optimizer、组件、目标、投递设置和 Standards。
- 源站 17–19：折叠概览、16 个数值速率预设和 Other、自定义范围。
- 源站 20–30、37–43、47–48：Action Paths 深层字段及真实选项。
- 源站 32–36：转化事件 App 范围和电商事件。
- 源站 44–46、49：临时 Draft 列表、帮助、搜索和保存状态。
- 本地 02–04：三栏概览、视图/缩放/时长和 Standards 弹窗。
- 本地 05–10、20：优化组件、目标和投递条件，保存后刷新回读。
- 本地 11–16：转化属性、Action 交互/订阅来源及自定义限速。
- 本地 17–19、21：搜索地址与刷新恢复、教程弹窗、最终连体帮助按钮。

## 验收日志

- [完整测试 482/482](all-tests.log)、[Canvas 专项 44/44](canvas-tests.log)、[重点模型 24/24](focused-model-tests.log)。
- [生产构建](build.log)、[深层 HTTP 验收](deep-api.log)、[原有扩展 HTTP 回归](existing-api.log)。
- [浏览器验收明细](browser-acceptance.md)、[API fixtures](api-fixtures.json)、[人工编辑 fixture](browser-fixture.json)。

## 源站截图

| 状态 | 截图 | AX |
| --- | --- | --- |
| source-01-authorized-draft | [查看](source-01-authorized-draft.jpg) | [文本](source-01-authorized-draft.ax.txt) |
| source-02-conversion-custom-event | [查看](source-02-conversion-custom-event.jpg) | [文本](source-02-conversion-custom-event.ax.txt) |
| source-03-conversion-property-filter | [查看](source-03-conversion-property-filter.jpg) | [文本](source-03-conversion-property-filter.ax.txt) |
| source-04-conversion-source-error | [查看](source-04-conversion-source-error.jpg) | [文本](source-04-conversion-source-error.ax.txt) |
| source-05-builder-tools | [查看](source-05-builder-tools.jpg) | [文本](source-05-builder-tools.ax.txt) |
| source-06-view-menu | [查看](source-06-view-menu.jpg) | [文本](source-06-view-menu.ax.txt) |
| source-07-maximum-duration | [查看](source-07-maximum-duration.jpg) | [文本](source-07-maximum-duration.ax.txt) |
| source-08-evaluation | [查看](source-08-evaluation.jpg) | [文本](source-08-evaluation.ax.txt) |
| source-09-optimizer-email | [查看](source-09-optimizer-email.jpg) | [文本](source-09-optimizer-email.ax.txt) |
| source-10-optimizer-settings | [查看](source-10-optimizer-settings.jpg) | [文本](source-10-optimizer-settings.ax.txt) |
| source-11-optimizer-component-types | [查看](source-11-optimizer-component-types.jpg) | [文本](source-11-optimizer-component-types.ax.txt) |
| source-12-optimizer-component-options | [查看](source-12-optimizer-component-options.jpg) | [文本](source-12-optimizer-component-options.ax.txt) |
| source-13-optimizer-goal | [查看](source-13-optimizer-goal.jpg) | [文本](source-13-optimizer-goal.ax.txt) |
| source-14-message-delivery | [查看](source-14-message-delivery.jpg) | [文本](source-14-message-delivery.ax.txt) |
| source-15-delivery-validation | [查看](source-15-delivery-validation.jpg) | [文本](source-15-delivery-validation.ax.txt) |
| source-16-step-standards | [查看](source-16-step-standards.jpg) | [文本](source-16-step-standards.ax.txt) |
| source-17-builder-expanded | [查看](source-17-builder-expanded.jpg) | [文本](source-17-builder-expanded.ax.txt) |
| source-18-rate-options | [查看](source-18-rate-options.jpg) | [文本](source-18-rate-options.ax.txt) |
| source-19-custom-rate | [查看](source-19-custom-rate.jpg) | [文本](source-19-custom-rate.ax.txt) |
| source-20-message-quiet-hours | [查看](source-20-message-quiet-hours.jpg) | [文本](source-20-message-quiet-hours.ax.txt) |
| source-21-action-campaign | [查看](source-21-action-campaign.jpg) | [文本](source-21-action-campaign.ax.txt) |
| source-22-action-interactions | [查看](source-22-action-interactions.jpg) | [文本](source-22-action-interactions.ax.txt) |
| source-23-action-session-attribute | [查看](source-23-action-session-attribute.jpg) | [文本](source-23-action-session-attribute.ax.txt) |
| source-24-action-subscriptions | [查看](source-24-action-subscriptions.jpg) | [文本](source-24-action-subscriptions.ax.txt) |
| source-25-subscription-types | [查看](source-25-subscription-types.jpg) | [文本](source-25-subscription-types.ax.txt) |
| source-26-subscription-update-source | [查看](source-26-subscription-update-source.jpg) | [文本](source-26-subscription-update-source.ax.txt) |
| source-27-inbound-trigger | [查看](source-27-inbound-trigger.jpg) | [文本](source-27-inbound-trigger.ax.txt) |
| source-28-step-custom-trigger | [查看](source-28-step-custom-trigger.jpg) | [文本](source-28-step-custom-trigger.ax.txt) |
| source-29-action-step-target | [查看](source-29-action-step-target.jpg) | [文本](source-29-action-step-target.ax.txt) |
| source-30-subscription-group-types | [查看](source-30-subscription-group-types.jpg) | [文本](source-30-subscription-group-types.ax.txt) |
| source-31-draft-validation | [查看](source-31-draft-validation.jpg) | [文本](source-31-draft-validation.ax.txt) |
| source-32-conversion-apps | [查看](source-32-conversion-apps.jpg) | [文本](source-32-conversion-apps.ax.txt) |
| source-33-conversion-specific-apps | [查看](source-33-conversion-specific-apps.jpg) | [文本](source-33-conversion-specific-apps.ax.txt) |
| source-34-conversion-app-options | [查看](source-34-conversion-app-options.jpg) | [文本](source-34-conversion-app-options.ax.txt) |
| source-35-conversion-ecommerce | [查看](source-35-conversion-ecommerce.jpg) | [文本](source-35-conversion-ecommerce.ax.txt) |
| source-36-ecommerce-event-options | [查看](source-36-ecommerce-event-options.jpg) | [文本](source-36-ecommerce-event-options.ax.txt) |
| source-37-attribute-change-options | [查看](source-37-attribute-change-options.jpg) | [文本](source-37-attribute-change-options.ax.txt) |
| source-38-subscription-state | [查看](source-38-subscription-state.jpg) | [文本](source-38-subscription-state.ax.txt) |
| source-39-action-conversion-event | [查看](source-39-action-conversion-event.jpg) | [文本](source-39-action-conversion-event.ax.txt) |
| source-40-landing-inbound | [查看](source-40-landing-inbound.jpg) | [文本](source-40-landing-inbound.ax.txt) |
| source-42-location-ecommerce | [查看](source-42-location-ecommerce.jpg) | [文本](source-42-location-ecommerce.ax.txt) |
| source-43-location-types | [查看](source-43-location-types.jpg) | [文本](source-43-location-types.ax.txt) |
| source-44-more-options | [查看](source-44-more-options.jpg) | [文本](source-44-more-options.ax.txt) |
| source-45-tutorial | [查看](source-45-tutorial.jpg) | [文本](source-45-tutorial.ax.txt) |
| source-46-list-filter-state | [查看](source-46-list-filter-state.jpg) | [文本](source-46-list-filter-state.ax.txt) |
| source-47-landing-interactions | [查看](source-47-landing-interactions.jpg) | [文本](source-47-landing-interactions.ax.txt) |
| source-48-landing-target | [查看](source-48-landing-target.jpg) | [文本](source-48-landing-target.ax.txt) |
| source-49-temporary-draft-save-state | [查看](source-49-temporary-draft-save-state.jpg) | [文本](source-49-temporary-draft-save-state.ax.txt) |

## 本地截图

| 状态 | 截图 | AX |
| --- | --- | --- |
| local-01-list-help | [查看](local-01-list-help.jpg) | [文本](local-01-list-help.ax.txt) |
| local-02-build-overview | [查看](local-02-build-overview.jpg) | [文本](local-02-build-overview.ax.txt) |
| local-03-view-duration | [查看](local-03-view-duration.jpg) | [文本](local-03-view-duration.ax.txt) |
| local-04-standards-dialog | [查看](local-04-standards-dialog.jpg) | [文本](local-04-standards-dialog.ax.txt) |
| local-05-optimizer-components | [查看](local-05-optimizer-components.jpg) | [文本](local-05-optimizer-components.ax.txt) |
| local-06-component-options | [查看](local-06-component-options.jpg) | [文本](local-06-component-options.ax.txt) |
| local-07-optimization-event | [查看](local-07-optimization-event.jpg) | [文本](local-07-optimization-event.ax.txt) |
| local-08-delivery-validation | [查看](local-08-delivery-validation.jpg) | [文本](local-08-delivery-validation.ax.txt) |
| local-09-optimizer-reloaded | [查看](local-09-optimizer-reloaded.jpg) | [文本](local-09-optimizer-reloaded.ax.txt) |
| local-10-delivery-reloaded | [查看](local-10-delivery-reloaded.jpg) | [文本](local-10-delivery-reloaded.ax.txt) |
| local-11-conversion-properties | [查看](local-11-conversion-properties.jpg) | [文本](local-11-conversion-properties.ax.txt) |
| local-12-action-fields | [查看](local-12-action-fields.jpg) | [文本](local-12-action-fields.ax.txt) |
| local-13-action-interactions | [查看](local-13-action-interactions.jpg) | [文本](local-13-action-interactions.ax.txt) |
| local-14-subscription-sources | [查看](local-14-subscription-sources.jpg) | [文本](local-14-subscription-sources.ax.txt) |
| local-15-rate-options | [查看](local-15-rate-options.jpg) | [文本](local-15-rate-options.ax.txt) |
| local-16-custom-rate | [查看](local-16-custom-rate.jpg) | [文本](local-16-custom-rate.ax.txt) |
| local-17-search-url | [查看](local-17-search-url.jpg) | [文本](local-17-search-url.ax.txt) |
| local-18-search-reloaded | [查看](local-18-search-reloaded.jpg) | [文本](local-18-search-reloaded.ax.txt) |
| local-19-tutorial | [查看](local-19-tutorial.jpg) | [文本](local-19-tutorial.ax.txt) |
| local-20-final-optimizer | [查看](local-20-final-optimizer.jpg) | [文本](local-20-final-optimizer.ax.txt) |
| local-21-final-help | [查看](local-21-final-help.jpg) | [文本](local-21-final-help.ax.txt) |
