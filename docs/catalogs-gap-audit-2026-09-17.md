# Catalogs 1:1 差异复核（2026-09-17）

## 修复结果（2026-09-17）

本表中已确认的当前账号可见流程已经实现并经过本地 SQLite API 与浏览器回归：`Gaming` 现为独立深链接页面，可抽取用户并生成 3 条结果预览；`Create recommendation` 会创建持久化记录并进入三步页面；Catalogs 的搜索、排序、空状态、只读 Settings 展开、页签和首屏路由均已更新。Catalogs 也恢复了试用横条和 230px 侧栏，不再用 Catalogs 专用样式覆盖全局框架。

仍然不能列为“已验证”的项目只包括当前 **View only** 账号无法打开的界面：可编辑账号的创建目录、导入、schema 管理、Selection 编辑/删除和真实订阅写入。它们不再用通用占位界面冒充为已复刻功能。

基准：已登录外部 Chrome 中当前账号可见的 `Catalogs` 列表、`Sample_Catalog` 的 Preview / Selections / Settings、`Gaming` Selection 详情，以及 `Create recommendation` 入口。对照线上复刻版 `braze-clone.vercel.app` 和本地代码。当前账号为 **View only**，因此不能据此断定可编辑账号的创建、导入与删除界面长什么样；这些流程需要另外取得有权限的参考页面。

| 优先级 | 页面 / 操作 | Braze 实测 | 当前复刻版 | 差异性质 |
|---|---|---|---|---|
| P0 | `Gaming` Selection | 打开 `/dashboard/catalogs/{catalogId}/selection/Gaming/{workspaceId}` 独立页，含名称、描述、过滤条件、随机排序、结果上限 3、用户选择、随机用户、生成预览和结果表 | 点击后打开右侧抽屉，固定列出 6 条 Gaming 项目；没有 Selection URL、用户预览与上限 | 页面结构、数据语义和流程均不符 |
| P0 | `Create recommendation` | 进入 Predictions 新标签页及三步表单：推荐详情、推荐类型/目录/Selection、订单事件与商品 ID 映射 | 只显示“本地演示不可用”提示 | 可见主操作未实现 |
| P1 | 全局框架 | Catalogs 页面保留紫色试用横条、约 230px 侧栏、Braze 原始导航图标、顶部支持/社区/语言/通知/账户入口 | Catalogs 专用 CSS 隐藏试用横条并把侧栏改为 194px；顶部图标与交互不全 | 明显视觉回退；不可通过遮罩算作一致 |
| P1 | Catalogs 列表搜索 | 输入后 Search 按钮启用；点击才查询；有 Clear Selection；无结果时显示说明与 Reset filters | 输入时立即过滤，放大镜只是装饰；无相同的无结果页面与重置操作 | 触发时机与状态不符 |
| P1 | Catalogs 列表排序 | `Items`、`Last updated` 是可点击列头，默认按最后更新降序 | 两列为纯文本，无法排序 | 可见交互缺失 |
| P1 | Settings 订阅展开 | `Show last 10 subscriptions` 显示含用户身份、订阅项目 ID、时间戳、订阅类型的空表；页面底部有 `Cancel` | 只追加“No active subscriptions.”，无表头与 Cancel | 展开状态与页面结构不符 |
| P1 | 目录 / 权限数据 | 当前账号只见一条 `Sample_Catalog`，且处于 View only；可见页没有创建入口 | 常规路由模拟一条目录，但 `/content/catalogs` 另显示 `Featured collection` 和创建控件；页面仍可显示 View only 标签 | 同一模块出现不一致的权限与数据视图 |
| P1 | 使用量 | 页面显示 Package Free、4KB / 500MB 及实际使用进度 | 使用量始终硬编码为 4KB；新增本地目录/项目后不变 | 数据联动缺失 |
| P1 | 详情深链接 / 首屏 | Braze 直接打开目录或 Selection URL 会加载对应页面并保留工作区标签 | 目录可深链接，但 Selection 没有独立 URL；Next 客户端状态初值为 Campaigns，直达其他页可能短暂显示 Campaigns | 路由与加载状态不符 |
| P2 | Catalogs 列表布局 | Search 位于结果数上方；表头、分页、Package 区域无本地卡片式边框；底部有 © Braze 2026 和政策链接；反馈为图标按钮 | 搜索与结果数同一行；Package 是卡片；缺底部版权/政策链接；反馈为文字按钮 | 视觉细节不符 |
| P2 | Settings 文案与链接 | 有说明链接、订阅上限及到期规则；Back in stock、Price drop、通知规则均为账号权限下的禁用态 | 主要区块和禁用态已在，但缺链接、上限后的说明及一些间距/布局 | 部分视觉和内容缺失 |

已接近的部分：列表列名与样例数值、Preview 的 31 条种子数据和字段、12 条分页、项目查看抽屉、只读状态的主体文案、Settings 四个主要区块。

尚未能做出“无遗漏”结论：该账号无法检查可编辑权限下的创建目录、导入、schema 管理、Selection 编辑/删除、推荐保存及通知订阅操作；也没有 1440×900、1280×800、1920×1080 的成对截图基线和差异报告。与其把这些标成已完成，应暂列 **未验证 / 未实现**。
