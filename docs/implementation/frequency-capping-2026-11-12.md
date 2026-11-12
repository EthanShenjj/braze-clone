# 全局频控实现与验收（2026-11-12）

已完成工作区规则配置、Campaign / Canvas 的频控偏好，以及运行时共享配额检查。配置写入 SQLite，验收使用独立的 `/private/tmp/frequency-capping-*` 数据库。

## 使用入口

- 全局配置：`/frequency-capping-rules`，支持 `workspaceId` 参数，并兼容 Braze 原生全局消息设置路径。
- Campaign：Schedule Delivery → Delivery Controls → Frequency Capping。
- Canvas：Send Settings → Frequency Capping，该偏好应用于画布中的消息步骤。

全局页支持启用、添加、编辑、删除规则、保存、回退、消息分类创建，以及标签和分类筛选。活动页展示当前规则并提供管理入口。关闭活动频控后，可选择“仍计入发送额度”或“不计入额度”，默认不计入。

## 配置逻辑

| 项目 | 当前实现 |
| --- | --- |
| 默认上限 | 每工作区 10 条，前后端共同限制 |
| 可配置上限 | `workspaces.data.frequencyCappingRuleLimit`，合法范围 1–15，默认 10 |
| 渠道 | 全渠道、Push、Email、SMS/MMS/RCS、Webhook、WhatsApp、LINE、KakaoTalk |
| 时间窗口 | 分钟、天、周，最短 1 分钟，最长 30 天 |
| 分钟窗口 | 滚动窗口，边界到期即释放 |
| 天／周窗口 | 接收者时区内、包含当天的最近 N 个自然日，一周按最近 7 个自然日处理 |
| 时区 | 用户 `timezone` / `time_zone`，缺失或无效时使用 UTC，支持夏令时 |
| 多规则关系 | 所有适用规则都必须满足，任意一条达到上限即跳过 |
| 筛选关系 | 规则内 Tag 与 Category 为 AND，父标签包含子标签 |
| 共享范围 | 同工作区、同用户的 Campaign 与 Canvas 消息共享，工作区之间隔离 |
| 多渠道任务 | 同一逻辑派发在全渠道规则中计一次，各渠道规则分别计数 |
| 不适用渠道 | In-App、Content Cards、Banner、Feature Flag 不占用额度 |

天／周计算是本项目明确采用的语义，不把未验证的 Braze 服务端周起始日规则当作事实。历史消息的标签／分类筛选按所属活动当前设置重新匹配。

## API 与运行时

- `GET /api/frequency-capping?workspaceId=...` 返回配置、版本、规则额度、可编辑能力和标签目录。
- `PUT /api/frequency-capping` 使用 `expectedUpdatedAt` 乐观并发控制；非法规则返回 400，只读返回 403，版本冲突返回 409。
- 通用资源写入入口同样校验条数、窗口、标签、分类与只读能力。版本随写入单调增加。活动分类不能跨工作区引用，跨工作区复制时清除原分类。
- `frequency_dispatches` 持久化额度。发送前通过 SQLite 写事务检查并预占，成功派发或供应商接受后确认，失败、静默时段延后、仅准备消息时释放。未完成预占 5 分钟后过期。
- Campaign 发起流程（含定时／触发发送）、Webhook 重试、Canvas 消息步骤与 SMS 队列处理均接入检查。队列发送前读取当前规则和画布偏好重新判断。
- Canvas 命中频控时记录 `frequency_capped` 并继续后续步骤。
- 测试消息不占额度。兼容读取历史 `message_events`，新派发使用标识避免重复计数。
- 外部 API Campaign 的事件接收接口仍是归因入口，无法阻止系统外已经完成的发送。真实供应商能力沿用现有项目配置。
- 可编辑能力沿用本项目工作区能力字段，本次没有新增身份认证系统。

## 关键文件

- `lib/frequency-capping-model.ts`：规则、偏好、校验、时间窗口。
- `lib/frequency-capping-store.ts`：工作区配置、版本、共享计数与预占事务。
- `lib/braze-store.ts`：Campaign、Canvas、队列与重试接入。
- `app/api/frequency-capping/route.ts`：配置 API。
- `app/ui/frequency-capping-workspace.tsx`：全局配置页。
- `app/ui/frequency-capping-controls.tsx`：复用控件、摘要、跨页更新。

## 验收结果

- Node 测试全量 **497 / 497** 通过，频控专项 **14 / 14** 通过。
- 独立数据库 HTTP 验收 **43 项** 通过：400/403/409、10/15 条额度、标签隔离、持久化、Canvas 命中后继续、Campaign / Canvas 共享额度、豁免与不计数。
- TypeScript 检查通过，`next build` 生产构建通过。
- 页面操作验证：10 条时禁止新增，规则保存后刷新保留，Revert 恢复数值与单位，任务与画布开关及计数偏好保存后刷新保留。
- 截图位于 `docs/audits/frequency-capping-2026-11-12/implemented-global-rules.jpg`、`implemented-campaign-policy.jpg`、`implemented-canvas-policy.jpg`。
- 未调用真实消息供应商，测试服务已停止。本次生成的构建缓存已清理以释放磁盘空间。
