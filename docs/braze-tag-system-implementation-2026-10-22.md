# Braze 标签体系优化实现记录

日期：2026-10-22。

本次实现以 [标签体系研究文档](braze-tag-system-architecture-2026-10-22.md) 中已确认的产品行为为依据，保留现有 Campaign、Canvas 和资源接口的兼容格式。研究文档中的「建议架构」不等同于本次已实现内容，也不是 Braze 的内部数据库设计。

## 已实现范围

| 入口 / 能力 | 当前行为 |
| --- | --- |
| Settings → Tag Management | 搜索、创建、重命名、Nest Tag Under、查看资源引用；中英文界面 |
| 标签层级 | 父级使用稳定标签 ID；展示完整路径；拒绝自身、后代和不存在的父级 |
| Campaign 编辑 | 统一目录选择、搜索、新建、移除、数量提示；服务端校验最多 175 个 |
| Campaign 列表 | 行选择、当前页全选、Tag As、标签展示和既有标签筛选 |
| Campaign 批量打标签 | 所选 Campaign 共享全部原有标签与新增标签的合集；超限或任一任务不存在时整体回滚 |
| Canvas 编辑器 / 详情弹窗 | 使用相同选择器替代独立候选和逗号输入框；服务端与浏览器草稿均校验上限 |
| Segment 编辑器 | 接入相同目录和 175 个标签上限；保留已有过滤器和其他元数据 |
| 全局对照组 | 重命名同步排除设置并更新设置版本；不改变启用状态、种子或分组人数 |
| GCG 排除候选 | 继续只提供活跃 Campaign / Canvas 直接使用的标签；字典独有、Segment 独有标签不能成为候选 |
| 模板与 Content Block | 标签赋值要求目录中已存在该标签；未知名称不会被隐式创建 |
| 旧名称提交 | 重命名后通过别名解析到稳定 ID 对应的新名称；旧草稿不会重新建立旧标签 |
| 删除 | 版本校验；存在资源、规则或子标签引用时阻止；删除后拒绝旧草稿静默重建 |
| 兼容与迁移 | 导入既有任务和排除规则中的标签；保留旧目录 ID；重复执行不重复创建 |

Campaign 批量合并的例子：A 原来是 `Promo`，B 原来是 `Transactional`，对二者执行 Tag As `Launch` 后，两个任务都会具有 `Promo`、`Transactional`、`Launch`。这与逐个任务单独追加标签的效果不同。

## 实际数据结构

- 目录沿用 SQLite `resources`，其中 `type = 'tag-management'`，稳定 ID 不随名称变化。
- 父级保存在目录记录的 `data.parentId`；路径按父级关系计算，不用字符串前缀推断关系。
- 添加目录名称唯一索引，当前按精确名称区分大小写。这个唯一性规则是本项目的兼容策略，未宣称为 Braze 的全部命名规则。
- `tag_aliases` 将历史名称映射到标签 ID；删除的标签保留名称失效标记。
- 任务仍通过 `campaign.config.tags` 和 `resource.data.tags` 输出名称数组，兼容已有界面、模拟发送和导出。
- 使用位置从实际任务关联和 GCG 排除设置计算。此次没有引入研究文档建议的独立 `resource_tag` / `rule_tag_reference` 关系表。
- 重命名在一个 SQLite 事务中更新任务、资源、排除设置、目录和审计记录；批量 Campaign 标签操作同样使用事务。

## 接口

| 接口 | 用途 |
| --- | --- |
| `GET /api/tags` | 返回目录、路径、使用位置、历史名称解析表 |
| `POST /api/tags` | 创建标签，可指定 `parentId` |
| `PATCH /api/tags/:id` | 重命名 / 移动层级；必须提供 `expectedUpdatedAt` |
| `DELETE /api/tags/:id?expectedUpdatedAt=...` | 删除无引用的标签，并进行版本校验 |
| `POST /api/tags/campaigns` | `{ ids, tags }`；执行 Campaign 共享合集操作 |
| `POST /api/tags/resolve` | 校验浏览器 Canvas 草稿标签并解析历史名称 |

旧的 `/api/resources/tag-management` 写接口转入相同校验逻辑，不能绕过版本或引用检查。通用资源 PATCH / DELETE 还会验证 URL 资源类型与记录类型一致。

## 明确边界

1. 原站标签管理页的全部交互和像素布局尚未逐项验证，因此此次交付是已确认逻辑的实现与界面优化，不宣称全部能力已经 1:1 完成。
2. 删除时阻止有引用标签、保留失效名称、大小写敏感唯一性均为本项目当前策略。Braze 的删除级联、名称复用、同名叶子标签规则仍需原站进一步验证。
3. 标签嵌套只组织目录。父标签不隐式匹配子标签，也不自动豁免子标签任务的 GCG 限制。
4. 当前批量共享合集行为仅实现于已核实的 Campaign。Canvas / Segment 的批量交互及其精确合并语义仍未补齐。
5. Report Builder 的标签维度、按标签进行动态任务筛选及标签权限矩阵未在本次补齐。
6. 归档任务仍计入引用保护；原站删除政策未确认前不自动移除历史引用。
7. 浏览器 Canvas 草稿独立保存在 localStorage，保存时会向目录解析标签；它们不因此成为服务端活跃任务，也不进入 GCG 候选或服务端引用统计。服务端无法据此阻止删除仅浏览器草稿使用的标签，草稿下次保存会明确报错并要求移除失效名称。
8. 保留现有 SQLite 部署方式。Vercel 临时目录不是持久、跨实例数据库；本次未改造生产持久化或多工作区隔离。

## 验证

自动验证覆盖：175 / 176 边界、空值与重复、旧数据迁移幂等、稳定 ID、重命名联动、过期版本、层级循环、名称冲突、引用删除保护、别名解析、Campaign 共享合并、批量失败回滚、模板已有标签约束及历史异常 JSON。

运行命令：

```sh
node --experimental-transform-types --test tests/*.test.mjs
npm run build
BASE_URL=http://127.0.0.1:3210 python3 tests/tag-system-api.py
BASE_URL=http://127.0.0.1:3210 BRAZE_TEST_DATABASE_PATH=/tmp/braze-tags-20261022.sqlite python3 tests/global-control-api.py
```

API 验证必须针对隔离的本地数据库运行。脚本会创建测试任务和标签，不能用于生产环境。
