# Canvas 再次对照证据

[结论、优先级与代码定位](report.md)

实时源站与生产对照，每个状态分别保留 JPEG 与 AX：

| 编号 | 状态 | 源站 | 生产 |
| --- | --- | --- | --- |
| 01 | 列表 | [图](source-01-list.jpg) / [AX](source-01-list.ax.txt) | [图](production-01-list.jpg) / [AX](production-01-list.ax.txt) |
| 02 | 高级筛选 | [图](source-02-filters.jpg) / [AX](source-02-filters.ax.txt) | [图](production-02-filters.jpg) / [AX](production-02-filters.ax.txt) |
| 03 | 基础配置 | [图](source-03-basics.jpg) / [AX](source-03-basics.ax.txt) | [图](production-03-basics.jpg) / [AX](production-03-basics.ax.txt) |
| 04 | 入组计划 | [图](source-04-entry.jpg) / [AX](source-04-entry.ax.txt) | [图](production-04-entry.jpg) / [AX](production-04-entry.ax.txt) |
| 05 | 发送设置 | [图](source-05-send-settings.jpg) / [AX](source-05-send-settings.ax.txt) | [图](production-05-send-settings.jpg) / [AX](production-05-send-settings.ax.txt) |
| 06 | 构建画布 | [图](source-06-builder.jpg) / [AX](source-06-builder.ax.txt) | [图](production-06-builder.jpg) / [AX](production-06-builder.ax.txt) |
| 07 | 展开概览 | [图](source-07-expanded.jpg) / [AX](source-07-expanded.ax.txt) | [图](production-07-expanded.jpg) / [AX](production-07-expanded.ax.txt) |
| 08 | SMS Optimizer 误入 LINE | — | [图](production-08-sms-optimizer-line-bug.jpg) / [AX](production-08-sms-optimizer-line-bug.ax.txt) |

- [同视口几何测量](basics-geometry.json)
- [测试结果 44/44](verification-tests.txt)
- [临时节点未持久化的图回读](production-graph-cleanup.json)
- [REA 工具链阻碍](rea-session-blocker.json)

不同草稿数据不做逐像素差异统计。以上是选定状态的证据，不代表覆盖了全部状态、服务和账户权限。
