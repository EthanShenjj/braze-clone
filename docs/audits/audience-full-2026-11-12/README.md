# Audience 全范围截图快照

本目录保存 137 张截图：97 张源站、20 张开发阶段、20 张最终生产验收。AX 文本与 DOM 快照在存在时按同名对应；20 张最终截图均有完整 AX/DOM。源站包含 Demo – ittor 和 Live – ittor 两个工作区，不把示例数据量当成复制结果。

- `source-01` 至 `source-42`：导航、分群编辑、订阅、偏好中心、用户详情六个页签。
- `source-support*` / `source-live-support*`：Extensions、Manage、Import、Locations、Suppression。
- `source-subscriptions*`：订阅语言、关键词、日期、GCG Demo/Live 权限状态。
- `source-import*`：Live 三种导入类型及上传前配置。
- `source-segment*` / `source-insights*`：分群和 Insights 的补充状态。
- `source-cleanup*`：获用户授权后归档指定空白分群的前后证据。
- `local-*`：开发服务阶段功能检查；含加载完成后替换的快照。
- `final-*`：最终生产构建验收快照。

[截图索引](index.html) 展示所有截图；[实现与剩余核验范围](../../implementation/audience-full-2026-11-12.md) 记录各模块完成内容与限制。`manifest.csv` 记录文件大小及 SHA-256，便于核对快照完整性。

源站权限/套餐门禁、Insights 加载错误、未执行的导入后步骤和被阻止的 Preference Preview 操作均单独记录，未伪造源站截图。没有为取得隐藏界面而在源站创建额外记录。Operator 意外自动创建的指定 `(unnamed)` 已获用户授权归档，具体见 cleanup 证据。

证据完整性：9 张早期源站补充截图仅有 AX、没有 DOM；`source-subscriptions-20-live-global-control-exclusions.jpg` 仅有截图。manifest 对缺失文本留空，没有以其他状态补写或伪造快照。
