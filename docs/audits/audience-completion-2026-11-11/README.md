# 受众条件补齐：截图与快照

日期：2026-11-11。共 28 组 JPG 截图及 AX 文本；源站 17 组，本地 11 组。

[实现及验收说明](../../implementation/audience-fidelity-2026-11-11.md)。源站为当前 Braze Demo – ittor；只操作未保存编辑并最终 Revert。本地使用隔离数据库，消息投递关闭。静态菜单和具体条件的源站证据与本地实现证据分别保留，不将源站 View Only 的 Canvas 声称为逐像素验收。

| 内容 | 截图 | AX 快照 |
| --- | --- | --- |
| 源站：国家六种比较 | [JPG](source-01-country-comparisons.jpg) | [AX](source-01-country-comparisons.ax.txt) |
| 源站：国家复选多选 | [JPG](source-02-country-multiple.jpg) | [AX](source-02-country-multiple.ax.txt) |
| 源站：年龄三种比较 | [JPG](source-03-age-comparisons.jpg) | [AX](source-03-age-comparisons.ax.txt) |
| 源站：日期四种比较 | [JPG](source-04-date-comparisons.jpg) | [AX](source-04-date-comparisons.ax.txt) |
| 源站：相对时间单位 | [JPG](source-05-date-relative-units.jpg) | [AX](source-05-date-relative-units.ax.txt) |
| 源站：双月日历 | [JPG](source-06-date-calendar.jpg) | [AX](source-06-date-calendar.ax.txt) |
| 源站：Retargeting 子菜单 | [JPG](source-07-retargeting-subcategories.jpg) | [AX](source-07-retargeting-subcategories.ax.txt) |
| 源站：SMS 三个条件 | [JPG](source-08-sms-submenu.jpg) | [AX](source-08-sms-submenu.ax.txt) |
| 源站：关键词先选订阅组 | [JPG](source-09-inbound-keyword-condition.jpg) | [AX](source-09-inbound-keyword-condition.ax.txt) |
| 源站：三个关键词类别 | [JPG](source-10-inbound-keyword-categories.jpg) | [AX](source-10-inbound-keyword-categories.ax.txt) |
| 源站：关键词时间配置 | [JPG](source-11-inbound-keyword-date.jpg) | [AX](source-11-inbound-keyword-date.ax.txt) |
| 源站：分群成员表单 | [JPG](source-12-segment-membership.jpg) | [AX](source-12-segment-membership.ax.txt) |
| 源站：会话次数比较 | [JPG](source-13-session-count.jpg) | [AX](source-13-session-count.ax.txt) |
| 源站：Received 布尔及 Campaign | [JPG](source-14-campaign-receipt.jpg) | [AX](source-14-campaign-receipt.ax.txt) |
| 源站：23 类互动 | [JPG](source-15-campaign-interaction.jpg) | [AX](source-15-campaign-interaction.ax.txt) |
| 源站：Push 按钮级联 | [JPG](source-16-push-button-interaction.jpg) | [AX](source-16-push-button-interaction.ax.txt) |
| 源站：Revert 后 Save / Revert 禁用 | [JPG](source-17-restored.jpg) | [AX](source-17-restored.ax.txt) |
| 本地：Canvas 完整目录 | [JPG](local-01-canvas-full-catalog.jpg) | [AX](local-01-canvas-full-catalog.ax.txt) |
| 本地：国家六种比较 | [JPG](local-02-country-comparisons.jpg) | [AX](local-02-country-comparisons.ax.txt) |
| 本地：国家多选 | [JPG](local-03-country-multiple.jpg) | [AX](local-03-country-multiple.ax.txt) |
| 本地：最终双月日历及已存日期 | [JPG](local-04-date-calendar.jpg) | [AX](local-04-date-calendar.ax.txt) |
| 本地：重载后国家及日期保留 | [JPG](local-05-canvas-reloaded.jpg) | [AX](local-05-canvas-reloaded.ax.txt) |
| 本地：分群搜索及已选项 | [JPG](local-06-segment-picker.jpg) | [AX](local-06-segment-picker.ax.txt) |
| 本地：CSV 分群实际匹配两人 | [JPG](local-07-actual-audience.jpg) | [AX](local-07-actual-audience.ax.txt) |
| 本地：Campaign 完整目录 | [JPG](local-08-campaign-full-catalog.jpg) | [AX](local-08-campaign-full-catalog.ax.txt) |
| 本地：CSV 成员比较及真实导入候选 | [JPG](local-09-campaign-csv-membership.jpg) | [AX](local-09-campaign-csv-membership.ax.txt) |
| 本地：23 类 Campaign 互动 | [JPG](local-10-campaign-interactions.jpg) | [AX](local-10-campaign-interactions.ax.txt) |
| 本地：Performed interaction / Campaign / Button | [JPG](local-11-campaign-push-button.jpg) | [AX](local-11-campaign-push-button.ax.txt) |

验证日志：[全量 376 项测试](tests-full.log)、[补充 14 项定向测试](tests-targeted.log)、[最终生产构建](build.log)、[最终生产模式 API 验收](api.log)。文件校验及证据索引见 [manifest.json](manifest.json)。

本地编辑预览：`http://127.0.0.1:3212/engagement/canvas/f216ee2a-4db7-4d57-9e52-1fafce349f8a?locale=en&workspace=local&step=audience`。测试 Canvas 与用户数据仅存在于隔离数据库。
