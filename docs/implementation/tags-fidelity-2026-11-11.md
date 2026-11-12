# Braze 标签能力复刻与验收 — 2026-11-11

本轮范围：标签管理、受众（Segment）标签、Campaign 与 Canvas 中的标签应用，以及按带标签消息的接收/互动记录筛选受众。代码已实现并完成本地验收；未将整个 Campaign、Segment 或 Canvas 的所有页面标为像素级一致。

## 源站与证据

只读检查 Demo – ittor 工作区 `6af4374c46d3080087f1c5d2`，没有提交源站标签、资源或受众修改。查看筛选编辑器时产生的未保存条件已 Revert，Save/Revert 恢复禁用。

- [Manage Tags](https://dashboard-09.braze.com/app_settings/app_settings/tags/6af4374c46d3080087f1c5d2?locale=en)
- [Segments](https://dashboard-09.braze.com/engagement/segmenter/segmenter/6af4374c46d3080087f1c5d2?locale=en)
- [Campaigns](https://dashboard-09.braze.com/engagement/campaigns/6af4374c46d3080087f1c5d2?locale=en)
- [Canvas](https://dashboard-09.braze.com/engagement/canvas/canvas/6af4374c46d3080087f1c5d2?locale=en)
- [Braze 官方标签管理说明](https://www.braze.com/docs/user_guide/administer/global/workspace_settings/tags)

截图与可访问性快照成对存储于 `docs/audits/tags-fidelity-2026-11-11/`；完整文件索引见该目录 `manifest.json`。

## 本轮补齐的差异

| 范围 | 修复结果 | 源站快照 | 本地快照 |
| --- | --- | --- | --- |
| 标签管理页面 | Manage Tags、Add New Tag、搜索、排序、九类资源列、每页10/20/40/60/100与分页 | source-01 | local-16 / local-20 |
| 标签创建/编辑 | Create/Edit Tag 弹窗、名称、Nest Tag Under、可搜索父标签选择、脏状态按钮 | source-02–05 | local-01–03 / local-12 |
| 删除使用中的标签 | 显示各类关联数；服务端删除时移除直接关联，并保留已失效的受众规则引用供用户显式修正 | source-06 | local-17；API回归验证实际删除 |
| 多处标签选择 | 统一可搜索多选、勾选、移除、行内创建和键盘交互；重命名跨页/跨标签页同步 | source-14 / 16–17 | local-04 / 12–14 |
| Segment 元数据 | 创建、修改、保存/重载标签；不把组织标签写成用户属性或改变受众成员 | source-12–17 | local-04–07 |
| 列表筛选 | Campaign、Segment 使用完整标签库；Canvas 使用已关联 Canvas 的候选标签；多选与独立移除筛选条件 | source-08–09 / 25 | local-05 / 09 |
| 批量 Tag as | 预填所选资源标签并集，完整集合编辑，支持移除/清空、原子写入及错误反馈 | source-10 / 13 / 26 | local-06 / 08；API、浏览器存储回归 |
| 接收过带标签消息 | Comparison has/has not、标签选择、过期互动数据提示；依据真实送达事件计算 | source-18–20 | local-07；真实SQL回归 |
| 最近接收带标签消息 | Tag、after/before日期、less/more相对时间与hours/days/weeks | source-21–24 | local-07 |
| 带标签互动 | 先选21种具体Interaction，再选Performed interaction true/false及Tag；可搜索自定义下拉 | source-27–29 | local-11 / 18 |
| Campaign 使用 | 标签筛选、批量应用、清空、改名后资源与筛选同步；保留工作区 | source-25–26 | local-08–09 |
| Canvas 使用 | 基础设置标签、列表筛选/批量编辑，入口/排除/退出条件共用标签筛选器，真实人数和用户匹配计算 | source-07–11；共享受众筛选器18–29 | local-10–11 / 14 / 18–19 |
| 数据一致性 | 工作区隔离、稳定标签ID、乐观锁、改名别名、删除墓碑、175个标签上限、回滚及审计 | — | 单元/集成/API回归 |

## 关键行为与数据连接

- Segment 标签属于资源元数据，Campaign/Canvas 标签也各自独立；受众组织标签不会自动成为消息标签。
- 受众规则引用稳定标签ID。改名更新显示及直接资源关联，已保存的规则保持同一引用。删除后，规则不能静默匹配全体用户，也不会自动复活已删标签。
- 标签消息规则查询实际 `message_events`，同时匹配资源所在工作区与当前标签关联。测试、模拟、机器人和已过滤记录不会混入结果。
- Interaction 分渠道、事件、按钮及机器打开类型；普通送达不能算作“浏览”。兼容已有 SDK 将 impression 标为 delivered 的记录，但要求 SDK 标记。
- Segment 预览、Campaign 定向和 Canvas 定向共用后端判断。Canvas 修复了原先仅使用已选 Segment 第一条条件的问题，入口、排除、退出条件均可使用标签消息条件。
- 浏览器 Canvas 草稿与服务端 Canvas 都按工作区处理；批量更新先验证全体资源，再写入。浏览器草稿不会覆盖未选草稿或修改流程图。

## 验证

- 全量模型与集成测试：**347/347 通过**，包含新增标签生命周期、互动、受众、Canvas 定向与工作区隔离测试。
- TypeScript：生产构建内检查通过。
- Next.js 生产构建：通过。
- 本地生产模式 HTTP 回归：标签创建/嵌套/冲突、改名传播、批量合并/替换/清空、上限、级联删除、工作区隔离、受众保存、互动条件、Canvas人数/用户匹配、失效引用拒绝均通过。
- 浏览器验收：创建 Lifecycle 与嵌套 Onboarding，给受众、两个任务与一个 Canvas 应用；将 Onboarding 改名为 Welcome 后，管理表显示1个Canvas、2个Campaign、1个Segment，已打开画布中的条件自动显示新名称。生产模式重载后条件仍存在。
- 使用临时SQLite数据库；未触发真实消息发送。测试与构建日志保存在证据目录。

复现命令（Node 22）：

```sh
node --experimental-transform-types --test tests/*.test.mjs
node node_modules/next/dist/bin/next build
BASE_URL=http://127.0.0.1:3211 python3 tests/tag-system-api.py
```

## 尚未获得源站验证的边界

以下项目明确保留，不标为已证实的1:1行为：

1. **有子标签的父标签删除规则**：源站样本没有嵌套标签，且本轮不在源站创建数据。当前实现要求先移动子标签，避免凭空推断级联删除策略。
2. **Segment 多标签 OR 与批量替换语义**：源站 Segment 样本均未带标签，未执行源站保存。当前按已验证的 Canvas 多选 OR 和预填可移除标签编辑器实现，属于有依据的推断。
3. **Canvas 入口/退出筛选器整体布局**：源站种子 Canvas 为 View Only；本轮共享已验证的标签受众控件与后端语义，未宣称整个 Canvas 创建向导逐像素一致。
4. **日期弹层**：标签最近接收日期的字段与比较条件已实现；日历弹层仍使用浏览器原生日历，没有标记为 Braze 日历弹层1:1。

本轮没有重新部署远程站点；本地生产模式验收地址为 `http://127.0.0.1:3211`。
