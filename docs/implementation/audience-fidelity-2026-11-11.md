# Campaign / Canvas 受众条件补齐

日期：2026-11-11。范围：修复本轮受众下拉差异清单，包含目录、条件表单、候选资源、保存重载和实际受众计算。

## 已实现

| 原差异 | 最终行为 |
| --- | --- |
| Campaign 条件固定禁用、属性不存在即禁用 | 16 个分类、6 个 Other Filters、126 个固定条件入口均可进入；属性、事件等候选按工作区真实数据加载 |
| Segment/CSV 菜单直接列出 Segment 名称 | 恢复 Segment Membership、Braze Segment Extensions、Updated/Imported from CSV 三个子项，选中后配置 Included / Not included 及相应资源 |
| 通用文本编辑器不能表达条件 | 共用类型化条件编辑器：文本、数字、日期、布尔、枚举、多值、位置范围及专用资源级联；每种条件保存自己的操作符、值与参数 |
| 国家、语言及日期设置不完整 | 国家 250 项（ISO 国家及 XK）、语言搜索；国家六类比较与复选多选；年龄和会话次数各自三类比较；日期四类比较、hours/days/weeks 相对时间和双月日期弹层 |
| Campaign 互动菜单不完整 | 23 类 Campaign 互动，含 push notification button 和 push story page；按渠道筛选 Campaign、真实按钮/页面候选；保留标签互动原有 21 项 |
| SMS 条件层级缺失 | Invalid Phone Number、Phone Number、Last Sent Specific Inbound Keyword Category；最后一项依次选择 SMS subscription group、Opt-in / Opt-out / Help，再配置时间 |
| Canvas 只有标签相关条件和三个基础字段 | Entry、Exclusion、Exit 均接入完整目录与共享编辑器；分群改为可搜索多选和已选项标签；旧规则兼容 |
| 选项可见但不参与匹配 | Campaign、Canvas 与 Segment 共用实际规则计算；支持成员资源、消息/Canvas Step 互动、别名、问卷、落地页、cohort、位置及画像类型化比较 |
| CSV 导入不能用于受众 | 成功导入记录保存实际 userIds 和 workspaceId；候选读取真实导入记录，成员规则按实际用户判断；失败导入不会记录成成功 |
| 保存丢失参数、引用缺少校验 | 持久化 value2、timeUnit、params 等完整条件；拒绝无效日期、空多选、失效资源与跨工作区引用；Canvas 入场、排除、退出和分群复用采用一致计算 |

## 验证结果

- 全量 Node 测试 **376 / 376 通过**；最后一处用户提示优化后，相关匹配及互动测试 **14 / 14 通过**（属于前述用例子集）。
- Next.js 生产构建通过，包括 TypeScript 检查。
- 生产模式 HTTP 验收通过：导入三名测试用户 → CSV 成员条件 → US / GB 多选 → 保存分群 → Campaign / Canvas 均匹配两名；排除及退出分别减少到一名；保存重载、跨工作区和非法规则校验通过。
- 浏览器验收：完整 Campaign / Canvas 目录、国家比较和复选、双月日期弹层、日期保存重载、分群搜索多选、实际两人受众、CSV 候选及 23 类互动级联。
- `git diff --check` 通过。

浏览器及 HTTP 验收使用隔离 SQLite 数据库，关闭消息投递；没有向 Braze 源站保存修改。源站检查结束时已 Revert，Save / Revert 处于禁用状态。

## 对照证据与适用范围

源站：Demo – ittor 工作区 `6af4374c46d3080087f1c5d2`，使用现有 Campaign / Segment 编辑界面检查。源站 Canvas 种子为 View Only，不能将本轮结果表述为整套 Canvas 页面逐像素一致；本轮完成的是上述受众差异清单及其实际计算。

外部 cohort、Canvas 消息、按钮、页面等候选必须已有对应工作区数据。实现支持这些数据和规则，不会生成占位候选，也不代表已经连接所有外部提供方。

截图、AX 快照、日志和校验清单见 [验收证据](../audits/audience-completion-2026-11-11/README.md)。

## 主要代码

- `lib/campaign-filter-catalog.ts`、`app/ui/campaign-audience.tsx`：目录、搜索及键盘交互。
- `lib/audience-rule-schema.ts`、`app/ui/audience-rule-editor.tsx`：类型化编辑器和专用资源选择。
- `app/ui/audience-date-picker.tsx`：双月日期弹层。
- `app/ui/canvas-wizard.tsx`、`lib/canvas-wizard-model.ts`：Canvas 三类受众条件、分群多选及完整参数保存。
- `lib/audience-rule-model.ts`、`lib/braze-store.ts`：规则校验、工作区范围、候选与实际匹配。
- `lib/tag-interactions.ts`：Campaign 23 项和标签 21 项互动。
- `app/api/users/route.ts`、`app/ui/module-workspaces.tsx`：真实导入成员记录。
- `tests/audience-*.test.mjs`、`tests/campaign-interactions.test.mjs`、`tests/canvas-wizard-audience.test.mjs`、`tests/audience-system-api.py`：规则、持久化和接口验收。

本轮修改尚未提交或远程部署。本地生产预览运行于 `http://127.0.0.1:3212`。
