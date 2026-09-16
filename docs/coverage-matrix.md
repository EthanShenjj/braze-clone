# 页面与交互覆盖清单

本清单原为本地演示版本的目标索引，并不代表实际完成度。2026-09-16 的代码审计已确认，多数二级页面仍是通用占位页；请以 [复刻缺口审计](replication-audit.md) 为当前完成度基线。后续每一页必须按“未开始 / 原型 / 页面已还原 / 交互已还原 / 验收通过”更新，不能把菜单可进入视作完成。

| 业务域 | 覆盖页面 | 可操作能力 |
|---|---|---|
| 全局 | 侧栏、二级抽屉、页面标签、搜索、试用条、通知、Operator | 展开收起、导航、页面切换、生成 Operator 草稿 |
| Campaigns | 列表、搜索、状态筛选、排序、创建菜单、编辑器、测试、审核、发布、停止 | 所有 13 个创建入口、五步流程、变体切换、本地保存与模拟发布 |
| Canvas | Canvas 列表入口、节点画布、节点添加、选择、改名、保存、发布 | 可编辑的本地节点图及模拟进入事件 |
| Getting Started / Performance | 清单、进度、指标卡、时段筛选、柱状图 | 清单完成状态与模拟指标展示 |
| Messaging | Feature Flags、Landing Pages、Surveys、Banners、Content Calendar、Messaging Diagnostics | 通用资源列表、创建、筛选、日历、预览、诊断状态 |
| Audience | Segments、Extensions、Global Control Group、Suppression、Subscription、Preferences、Search、Import、Locations | 资源管理、分群条件、查询及本地状态提示 |
| Content | Media、各类模板、Content Blocks、Promotion Codes、Catalogs、Brand Guidelines | 资源创建、筛选、素材与目录预览 |
| Analytics | 报表、查询、仪表盘、Email/Push/SMS、Conversions | 时段筛选、指标、图表与报表保存反馈 |
| Agent / Integrations / Data / Settings | 当前账号可见的全部二级菜单 | 抽屉、资源页、连接/设置状态及本地保存反馈 |

## Campaign 验收场景

1. 创建 Email 活动，填入名称、主题、内容和受众；保存后刷新页面，活动仍出现在列表中。
2. 打开 Push、SMS、Webhook、In-app message、Content Card、Banner、WhatsApp、LINE、Multichannel、Operator、Feature flag experiment 和 API campaign，确认每一入口都能进入独立草稿。
3. 切换五个步骤，修改内容，Review Summary 中应读取相同的活动数据。
4. 在 Review Summary 发布活动，活动状态改为 Active、发送数增加，并在分析页显示模拟指标。
5. 在活动列表中选择 Active 活动的更多操作，状态改为 Stopped。
6. 从 Canvas 添加节点、选中节点并修改名称，然后保存或发布。

## 视觉校验基线

实施视觉回归时以 1440×900 为主，另检查 1280×800 与 1920×1080。动态日期、随机 ID 与模拟指标可遮罩；导航、布局、状态、抽屉、菜单、滚动与编辑器区域不得遮罩。
