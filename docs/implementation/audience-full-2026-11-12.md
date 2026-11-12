# Audience 全范围复刻与验收（2026-11-12）

本轮覆盖 Braze Audience 菜单 10 个入口，以及 Segment Insights 和用户详情 6 个页签。以 Demo – ittor 与 Live – ittor 已观察页面为依据。**没有把无法查看的配置声明为已完成像素级核验。**

## 实现与证据

| 模块 | 已实现内容 | 源站证据 / 核验边界 |
|---|---|---|
| Segments | 列表、过滤/列选择/星标、创建编辑、分组 AND/OR、排除组、应用选择、标签、用户检查、真实引用和统计、保存及原生路径恢复 | source-02 至 source-12；Operator 使用真实可选服务，未配置时返回不可用 |
| Segment Insights | 多分群选择、基线、列选择/排序、真实使用/购买指标、工作区隔离 | source-insights；Demo/Live 源站数据加载报错，成功数据行外观未核验 |
| Segment Extensions | 源站套餐引导页及相关入口 | source-13 / source-support；当前账户未开放编辑器 |
| Global Control Group | 比例 1–15%、标签例外、启停、真实人数、导出/报告、Campaign/Canvas 排除 | source-subscriptions-17 至 21；Demo 权限门禁与 Live 可编辑状态分别核对 |
| Suppression Lists | 列表、状态/创建者/列过滤、名称与描述创建；动态受众规则、标签例外、人数估算、保存/启停/归档与发送前校验 | source-live-support-01 至 03；详情根据官方文档补齐，未在源站创建记录 |
| Subscription Groups | Email 创建、详情/状态、真实订阅历史图表、日期选择；SMS 语言/必需关键字/自定义关键字/回复及个性化；LINE/WhatsApp 元数据 | source-14 至 19 与 source-subscriptions；Live 无已有组，部分详情沿 Demo 核对 |
| Email Preference Centers | 列表排序、原始 SVG 插图、详情、草稿/发布、两页、行/列/块、样式、语言、订阅组、公开页面实际提交 | source-20 至 26；Preview 操作受浏览器策略阻止，不重复尝试；未观察属性面板明确属于推断实现 |
| Search Users | 精确标识符/别名/邮箱/电话/推送 token 查询，Overview、Engagement、Messaging History、Event History、Commerce、Feature Flags Eligibility | source-28 至 42；事件属性沿源站显示权限门禁；未伪造设备、购买、功能开关或 Braze ID |
| Manage Audience | 规则、定时设置、真实重复用户预览/下载、事务合并、实际历史、删除记录权限页 | source-live-support-04 至 06；本地确认与执行实现经过事务测试，未执行源站合并 |
| Import Users | 三种 CSV 类型、原始样例、预解析/校验/复核/执行、实际用户与事件写入、幂等历史与受众成员 | source-import-01 至 05；未向源站上传文件，上传后步骤未核验；遵守源站所示试用限制 |
| Locations | 列表、应用开关、绘制/编辑围栏、半径/经纬度/分析/冷却/Android 参数、标签、保存回读、原生新建路径 | source-support Locations；地图投影与全球瓦片已补，地图提供方配置见下文 |

## 数据与运行行为

- 用户、事件、分群、订阅、偏好中心、标签、GCG 与统计使用同一工作区范围；旧 local 路径兼容，新源站路径可恢复编辑对象。
- 旧订阅组表已事务迁移：不同工作区允许同名组，同一工作区拒绝重名；保留 ID、成员、配置与已有索引/触发器，并核对外键完整性。
- SQLite 中用户 ID 仍为全局主键。同一 ID 不能在两个工作区各建一份，跨工作区导入会拒绝冲突，不会悄悄移动用户。
- 去重合并使用预览指纹检测过期数据，并迁移已有用户关联。退订状态采用保守合并，失败事务回滚。定时任务依赖已有 `/api/campaigns/process` 调度器被运行环境调用。
- Operator 需要配置真实 AI 服务，未配置时明确不可用。
- 地图使用 Web Mercator 投影；已观察的纽约底图保留源站快照，其余位置按当前视口加载瓦片。`NEXT_PUBLIC_MAP_TILE_URL` 可配置授权底图，默认使用 OpenStreetMap，外观与源站 Mapbox 有差异。没有批量下载或预取瓦片。
- 地名查询需要显式设置 HTTPS `MAP_GEOCODING_URL`（Nominatim 格式的结果数组）和可选 `MAP_GEOCODING_API_KEY`；未配置仍可输入经纬度。不会默认调用公共 Nominatim 地址服务。

地图提供方说明：[OSM 瓦片使用政策](https://operations.osmfoundation.org/policies/tiles/)，[地理编码服务政策](https://operations.osmfoundation.org/policies/nominatim/)。抑制名单详情行为参考：[Braze 官方文档](https://braze.com/docs/user_guide/audience/suppression_lists)。

## 源站空白分群清理

检查 Create with Operator 时，源站意外自动创建了 `(unnamed)`（ID `6af5250fd8512f008c15c8b7`）。已向用户说明并获得对该记录的归档授权。归档前核对 Campaigns / Segments / Canvases 均无引用，随后完成可恢复归档。

- Active 列表从 10 项变为 9 项。
- Archived 列表唯一结果为该 `(unnamed)`，状态 Archived。
- 证据：`source-cleanup-01-no-references.ax.txt`、`source-cleanup-02-active-nine.*`、`source-cleanup-03-archived-target.*`。
- 未删除其他记录，未执行源站导入、合并、订阅修改或最终保存。

## 验证记录

本地测试均使用隔离数据库 `/private/tmp/braze-audience-full-20261112.sqlite`，不改默认演示库，不调用发送提供方。最终测试与构建结果在收尾时补入下方。

- 最终全量单测：450 / 450 通过。初次唯一失败来自新增工作区隔离后旧交互测试的跨工作区 fixture，已修正为真实独立用户及事件。
- 受众 API 联调：通过 CSV 成员关系、动态候选、类型化条件、Campaign/Canvas 一致性、分群复用、保存重载、排除/退出与无效规则拒绝。
- 地图投影 3 项、抑制模型 3 项通过。
- 新增管理 HTTP 联调通过：工作区导入、用户联系状态、订阅组、偏好版本、围栏、抑制标签例外、合并确认、过期指纹拒绝与退订迁移。
- 隔离生产构建通过，包含最后的订阅组迁移。逐页验收发现的表头、下拉框、旧导入计数和准确插图已定点修正后重建。
- 浏览器阶段截图 `local-*` 来自开发服务；最终 `final-*` 截图来自生产构建。开发热更新过程中出现的中间态不作为生产完成截图。

## 尚未完成源站逐项核验的范围

1. 受权限/套餐控制的 Segment Extensions 编辑器、用户 Event History 属性与删除用户配置。
2. 源站 Segment Insights 成功加载后的数据行状态。
3. Preference Preview 及未观察的块属性面板。
4. Import 文件上传后的复核/完成页面。
5. Suppression List 创建后的详情、启停确认，以及 Merge 最终确认页（功能已根据文档/数据模型实现，不称为源站截图一致）。
6. Mapbox 底图与地名搜索服务配置，地图渲染不声称与 Mapbox 1:1。

本报告与截图保留上述界限，后续可以在具备相应权限或可用服务后继续核验。

## 最终验收结果

- Node 22.22.3：全量 **450 / 450** 测试通过。
- Next 16.3.5：最后生产构建与 TypeScript 检查通过。
- 两组 HTTP 集成回归通过，包含同名订阅组隔离与真实合并确认。
- 浏览器生产验收覆盖 10 个 Audience 入口、分群洞察、用户详情、偏好编辑器；已核对分群原生编辑 URL、草稿/围栏刷新回读、抑制条件保存和用户分群查询清除。
- 最终截图 `final-01` 至 `final-20`；完整日志位于同一审计目录的 `verification-*.txt`。
- 本地生产预览：`http://127.0.0.1:3213/engagement/segmenter/segmenter/local?locale=en`，使用 `.next-audience-final` 与隔离数据库。
- 本轮没有执行 Git 提交或远端部署；工作区还包含此前任务与其他任务的修改，保持原样。

截图总计 **137 张**（源站 97、开发阶段 20、最终生产验收 20）；最终截图全部配套 AX/DOM。早期源站文本缺项在 manifest 与 README 中明确列出。临时视口覆盖已清除，生产预览标签页已保留。
