# Campaign / Canvas 受众条件下拉复核

> 后续处理：本页保留修复前的核查结论。该清单的目录、条件编辑器、Canvas 接入与实际匹配差异已完成修复；见 [实现及验收记录](../../implementation/audience-fidelity-2026-11-11.md) 和 [修复后截图快照](../audience-completion-2026-11-11/README.md)。

日期：2026-11-11。结论：**完整受众条件下拉尚未与 Braze 1:1 对齐**。

本轮只读核对当前 Braze Campaign（Demo – ittor / Newsletter Welcome），并检查当前代码与本地生产模式 Canvas。没有提交源站或本地资源修改。

## 已确认差异

| 项目 | Braze / 参考行为 | 当前实现 | 结论 |
| --- | --- | --- | --- |
| Campaign 顶层分类 | 当前源站16个分类及6个 Other Filters | 名称与顺序已覆盖 | 顶层目录对齐，不代表全部功能对齐 |
| Segment or CSV membership | 子菜单有 Segment Membership、Braze Segment Extensions、Updated/Imported from CSV | `choices()`直接展开已有Segment名称；后两类没有在该目录实现 | 子菜单结构、选项缺失 |
| Canvas Step 条件 | 源站搜索可以找到 Received Message from Canvas Step、Last Received Message from Specific Canvas Step | 代码固定 `unavailable`；同类Canvas互动/转化等也存在固定禁用 | 显示名称不等于可用能力 |
| Campaign 条件可用性 | 应按源站条件和实际数据源规则判断 | 静态目录有27个叶项固定unavailable，另有40个按属性存在与否禁用的叶项 | 不能宣称完整下拉一致；此计数是本地代码统计，不是Braze总条件数 |
| Campaign 选中后的编辑器 | 条件有各自的比较方式、候选字段、日期/时间及特定设置 | 除标签消息条件等特例，许多条件共用equals/contains/greater than等通用比较器与文本值 | 配置字段和交互尚未完整复刻 |
| Canvas 条件目录 | 完整Canvas源站目录本轮未验证；此前种子Canvas为View Only | 本地选择器显式启用 `tagReceiptsOnly`，只显示Retargeting下3个标签消息条件；另设国家/生命周期/邮件订阅状态3个profile条件 | 明确是受限目录，不能作为完整Braze Canvas受众条件交付 |
| Canvas Segment选择 | 需单独核对源站搜索、多选及操作方式 | 当前是原生multiple select，提示按Command/Control多选 | 尚未验收为1:1 |
| 标签消息条件 | 已逐项核对接收、最近接收及21类互动选项 | 前轮已实现共享控件和后端判断 | 此部分覆盖不能推导为整个受众目录覆盖 |

静态目录统计：16个分类、6个Other Filters、120个静态叶节点；动态数据（Segment、事件、属性、任务及变体等）会继续展开，所以120不是源站/本地运行时总选项数。

## 代码位置

- `app/ui/campaign-audience.tsx`：FilterCatalog的分类、动态选项与不可用判断；通用受众规则编辑器。
- `app/ui/canvas-wizard.tsx`：FilterRows里的 `tagReceiptsOnly` 与3种profile字段，以及原生Segment多选。
- `lib/campaign-filter-catalog.ts`：静态目录、27个固定unavailable叶项及属性依赖。

## 截图与可访问性快照

每组包含JPG与AX文本：

1. [源站Campaign完整顶层分类](source-campaign-categories.jpg)
2. [源站Segment/CSV三个子选项](source-membership-submenu.jpg)
3. [源站Canvas Step条件搜索结果](source-canvas-step-options.jpg)
4. [本地Canvas只开放Retargeting分类](local-canvas-categories.jpg)

前轮347项测试用于已实现逻辑的回归，不是对完整下拉、每个子选项及其配置表单的逐项一致性验收。本次未修改应用代码，未重新运行构建或测试。
