# Canvas 本轮实现与验收

本轮补齐了 2026-11-12 复查记录中的编辑器、入场、执行、测试与评估链路，并准备了共享持久磁盘的 SQLite 自托管版本。目标服务器尚未提供，本轮没有进行外部部署。

## 已实现

| 功能 | 当前行为 |
| --- | --- |
| SMS 与 Content Optimizer 编辑 | 打开真实 SMS/MMS/RCS composer，保留 Optimizer 页签、消息变体、订阅组与未保存保护。 |
| 定时入场 | 支持指定时间、日/周/月周期、用户时区、DST 与月末日期；保存调度游标并对每次入场去重。 |
| Action-Based / API-Triggered | 激活后等待事件或显式请求；保留入场属性，验证工作区与用户，支持请求 ID 去重。 |
| Action Paths | 按真实事件选择首个命中路径；排名模式等待窗口结束，未命中走 Everyone Else。 |
| 多变体与实验路径 | 稳定分配，独立入口路由，支持随机重入、Control Group、Winning Path 和一次性入场 Delay Group。 |
| Winning Path | 依据实验窗口内的真实曝光、转化及首步消息互动决定结果；同率按保存顺序选择。使用公开的 Pearson 两两检验方法判断显著性；稀疏期望格不作显著结论，按保存的 fallback 处理。 |
| 高级节点 | Feature Flag 写入实际分配并与 SDK/受众查询一致；Destination 校验目标 Canvas；Agent、Audience Sync 使用配置的连接器及持久任务。 |
| 转化与退出 | 转化有独立入场窗口及去重，并进入 Action Paths 事件流；异常、退出 Segment/Filter 会阻止后续发送、取消待发任务并清理 SDK 消息。异常发生于 Delay 时立即标记，到原截止时间结束等待；Filter/Segment 在 Delay 结束时评价。 |
| 消息发送 | 调用实际渠道适配器或 SDK；保留 prepared / available / accepted / delivered / failed 的区别，执行订阅、抑制、频控和限速检查。未连接供应商时仅准备内容。 |
| Test Canvas | 可选择工作区用户、时间、事件、变体和 Agent fallback；默认只预览。显式发送需要收件人，SDK 测试消息有独立标记与过期时间，不影响业务频控或事件触发。 |
| Standards | 执行实际结构规则并保存逐步结果；语义评估通过可配置服务执行，缺配或失败显示真实状态。 |
| 保存与概览 | 干净草稿不产生额外保存；接入变化摘要、工作区限速状态、转化期限和变体编辑。变化摘要使用当前浏览器的查看快照。 |
| 持久存储 | 新草稿默认存服务端；旧浏览器草稿可以幂等导入，保留原稿。Web 与独立 worker 使用同一 SQLite 文件。 |

Web 与 worker 联跑曾暴露 SQLite WAL 的读快照升级写入冲突（517）。工作区事务、资料导入与 Canvas 事务现在会先获取写锁，再读取业务数据；嵌套事务使用独立 SAVEPOINT。新增两个真实 Node 子进程、独立连接的并发回归，分两轮恢复各 80 人的 Delay，并逐人断言只执行一次。

## 验收记录

- `npm run test:all`：702 / 702 通过，无跳过。
- `npx tsc --noEmit --incremental false`：通过。
- 生产构建 Web 与独立 worker 共用全新 SQLite 文件时，`tests/canvas-runtime-api.py` 全部通过：125 人入场、延迟恢复、纯预览隔离、Standards 持久化、API 去重、工作区隔离、事件与定时入场。联跑日志无锁错误，最后健康检查为 `status:ok / worker.ready:true`。旧测试库与其残留旅程保留供排查，未用其结果代替隔离验收。
- worker 的原生 Node 启动、受控时间、心跳、失败状态、SIGTERM、真实 `server-only` 条件及 Compose schema 已验证。
- `npm run build`：通过（Next.js 16.3.5，Node 22.22.3）。

命令与结果摘录：[最终验证记录](../audits/canvas-implementation-2026-11-12/final-verification.txt)。

页面验收使用 1280×720 的本地页面。名称框为 `x329 / y351 / 437×40`；Save 为 `x1187 / y653 / 82×40`，干净状态禁用。与原始复查记录在取整精度下一致。实际运行了 Test Canvas 的无发送预览，并用“标题必填”规则触发并保存了邮件节点的真实评估失败。生产构建页面已确认 SMS Optimizer 打开 SMS/MMS/RCS Composer，保留订阅组、四个 Optimizer 页签及两个正文组件变体。

证据：[几何记录](../audits/canvas-implementation-2026-11-12/basics-measurements.json)、[Basics](../audits/canvas-implementation-2026-11-12/basics-1280.png)、[SMS Optimizer](../audits/canvas-implementation-2026-11-12/sms-optimizer.png)、[预览](../audits/canvas-implementation-2026-11-12/test-canvas-preview.png)、[Standards](../audits/canvas-implementation-2026-11-12/standards-evaluation.png)。源站对照沿用 [2026-11-12 复查证据](../audits/canvas-recheck-2026-11-12/report.md)；本次恢复浏览器时源站登录已过期。

## 运行与部署

完整步骤见 [SQLite 自托管说明](../deployment/self-hosted-sqlite.md)。生产运行需要带持久磁盘的服务器、Node 22.22.3+、Web 服务与独立 worker。仓库已提供 Dockerfile、Compose、只读健康检查和 worker 心跳。当前 Docker daemon 未运行，因此没有构建或运行容器镜像；Compose schema 已验证。

```sh
npm run build
npm start
npm run canvas:worker
```

两个进程需要配置相同的 `BRAZE_DATABASE_PATH`；对外链接使用 `BRAZE_PUBLIC_URL`。供应商、Agent、Audience Sync 和语义评估服务的凭据通过服务器环境配置，测试没有发送真实用户消息。

## 实现边界

Content Optimizer 当前根据作者配置的组件和实际回执优化，30 次曝光是本项目的探索策略；Braze 的私有内容生成与优化算法尚未建立等价证据。结构规则和可配置语义连接器已实现，真实供应商连接及设备展示仍需相应环境验收。代码和页面证据不构成整个产品已经达到逐状态、逐像素 1:1 的结论。

worker 对每个阶段应用 `limit`。连接器的可重试错误最多重试三次；已接受的异步 Agent 使用稳定任务 ID 查询完成结果。崩溃后停留在 Processing 的外部请求需要对账，系统保留该状态以避免重复发送。

## 规则来源

- [Braze Canvas 创建、入场与退出](https://www.braze.com/docs/user_guide/messaging/canvas/create_a_canvas)
- [退出条件与 Delay 时点](https://www.braze.com/docs/user_guide/messaging/canvas/create_a_canvas/exit_criteria)
- [Winning Path](https://www.braze.com/docs/user_guide/messaging/canvas/canvas_components/experiment_step/winning_path)
- [A/B 检验公开方法](https://www.braze.com/docs/user_guide/messaging/ab_testing/faq)
- [Test Canvas 支持的步骤](https://www.braze.com/docs/user_guide/messaging/canvas/testing_canvases/preview_user_paths)
