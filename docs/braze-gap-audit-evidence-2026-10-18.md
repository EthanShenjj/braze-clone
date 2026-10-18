# Braze 差距检查证据与复现步骤

日期：2026-10-18（Asia/Shanghai）。对应[优化方案](</Users/ethanshen/Desktop/LLM/untitled folder/braze-clone/docs/braze-optimization-plan-2026-10-18.md>)。

## 1. 环境与范围

- 当前工作区含此前未提交修改；本轮以现有文件为准。
- 本地 Node 22.22.3，Next.js 16.3.5，服务为 `http://127.0.0.1:3100`。
- 使用 `BRAZE_DATABASE_PATH=/private/tmp/braze-gap-audit-20261018.sqlite`，与项目 `.data` 数据库隔离。
- 本地全部发送探测为合成用户和模拟事件；没有调用真实邮件或 Push 服务。
- 原版使用用户已打开的 Chrome；没有在 Braze 提交创建、保存、归档、订阅修改或发送。
- 本文保存可复现步骤和非敏感结果摘要，不记录收件人 token，不声称已保存统一视口截图。

## 2. 原版页面观察记录

### B01：Subscription Pages and Footers

[参考页面](https://dashboard-09.braze.com/app_settings/app_settings/email_settings/subscription_pages_and_footers/6ad0b98fe4b4110085216601?locale=en)

已看到 Custom footer / Custom unsubscribe page / Custom opt-in page 三部分，均显示 View only，Enable 开关 disabled。不能验证编辑、保存和启用后的原版行为。

### B02：Canvas 列表

[参考列表](https://dashboard-09.braze.com/engagement/canvas/canvas/6ad0b98fe4b4110085216601?locale=en)

当前筛选 Draft，4 Results；包含状态、标签、Filters、Columns、Reset filters、搜索、名称与编辑时间排序、每页条数、行操作和 Create Canvas。

项目相同模块直接进入 LiveCanvas，没有独立列表。

### B03：Onboarding flow

[参考 Canvas](https://dashboard-09.braze.com/engagement/canvas/6ad0b99e485c580061eb1ee0/6ad0b98fe4b4110085216601?locale=en&version=flow&isEditing=true)

页面为 View Only，显示 Send Settings、Conversion Events、Entry Rules、重入与退出条件。示例包含 Experiment 两条 50% 路径、多组 Goal segmentation、带 1 day 窗口的 Feature engagement 和多条消息节点。

打开 Goal segmentation 配置，已看到多组及 Everyone Else，条件包含 Segments、Filters、Add filter group、Add exclusion group、User Lookup，以及组退出 Canvas 的选项。没有提交修改。

### B04：订阅组管理与创建

[参考列表](https://dashboard-09.braze.com/users/subscription_groups/subscription_groups/6ad0b98fe4b4110085216601?locale=en)

上半区包含 Subscription group timeseries、组选择、Last 30 Days、Calculate today’s statistics；当前无时间序列数据。下半区包含状态与渠道筛选、搜索、Name / Channel / ID / Description / Status 列、行操作、分页。

实际列表包含 LINE、SMS/MMS/RCS 和 WhatsApp 组。Create email subscription group 弹窗只有 Name / Description，另有提示说明 SMS、WhatsApp 的创建流程不同。检查后取消，未保存。

### B05：Email Preference Centers

[参考列表](https://dashboard-09.braze.com/users/subscription_groups/preference_centers/6ad0b98fe4b4110085216601?locale=en)

本轮正常加载，显示 Custom Email Preference Centers 空列表；列为 Name / Description / Type / Status / Last Edited / Created by，带 Create New。

打开新建页后看到 Details、Name、Add Description、Liquid、API ID、Page Previews、Launch Editor、Save as draft、Launch preference center。名称为空时保存和发布 disabled；说明 Liquid 在发布后生成，API ID 在保存后生成。没有填写或提交。

历史文档中的“偏好中心页面当前异常”不能继续作为本轮限制。

## 3. 本地运行探测

以下步骤均在独立审计数据库运行。HTTP 请求采用 JSON，不含外部账号凭据。

| 用例 | 步骤摘要 | 实际结果 |
| --- | --- | --- |
| R01 部分更新 | 创建一个 Email 组，只 PATCH `{status:"Archived"}` | HTTP 400；`Provided value cannot be bound to SQLite parameter 2.` |
| R02 全局退订 | 将 user_1 全局 subscribed=false，加入该 Email 组且组状态 subscribed；查询估算并发布选组 Email，controlGroup=0 | 估算 matching=1000 / reachable=1；运行 eligible=1 / delivered=1 |
| R03 归档组 | 使用完整 name/description/channel/status 请求成功归档该组，重新估算并创建另一 Email 活动发布 | 归档 HTTP 200；估算 reachable=1；运行 delivered=1 |
| R04 公共读取 | GET `/api/preference-centers/pc_marketing_preferences/public?user=user_1`，不传 token | HTTP 200，返回 user 对象及 email 字段 |
| R05 展示组全取消 | 将 user_1 恢复全局 subscribed=true；以有效测试凭据提交两个展示组均为 false | POST 200；SQLite 查询全局 subscribed 仍为 1。结合 UI chooseAll(false) 代码，确认当前全取消没有全局动作 |
| R06 延迟与重入 | 保存 Entry(reEntry=none) → Update → Delay(24h) → Push Message，连续运行两次 | 两次 entered=10，首次 messages=10；所有四步 at 完全相同 |
| R07 User Update | R06 的 Update 配置 lifecycle=AUDIT_UPDATED，运行后读取 SQLite | 该值的用户计数为 0；首个轨迹用户 user_1 的 lifecycle 仍为 All Users |

R02/R03 的运行摘要还返回 failed=999。这里 999 个未送达用户主要来自组资格等跳过情形，不能解释为真实服务商发送失败；方案要求进一步拆分失败、抑制和等待指标。

R05 的探测脚本曾以不匹配种子邮箱的搜索条件查询，得到空结果；最终结论使用隔离 SQLite 中 `user_1` 的直接读取，不以该空查询作证据。

### R01 复现接口

1. POST `/api/subscription-groups`，创建 `channel=Email` 的审计组。
2. PATCH `/api/subscription-groups/:id`，请求体仅含 `status=Archived`。
3. 读取 HTTP 状态和错误；组没有成功归档。
4. 当前 PATCH handler 为缺省字段设置 undefined；store 将该对象展开覆盖 current，然后将 undefined 传给 SQLite。

### R02/R03 复现接口

1. PATCH `/api/users`，传入 `id=user_1`、`subscribed=false`。
2. PATCH `/api/subscription-groups/:id/members`，设置 `userId=user_1`、`state=subscribed`。
3. GET `/api/audience/estimate?subscriptionGroupId=:id`。
4. POST `/api/campaigns`，提供独立 ID、Email 名称/主题/正文、All Users 和配置 `subscriptionGroupId=:id`、`controlGroup=0`。
5. POST `/api/campaigns/:id/launch`，读取运行摘要。
6. 将组用完整字段 PATCH 为 Archived，另建活动重复上述步骤。

### R06/R07 运行数据摘要

测试图的四个节点配置为：

| 节点 | 关键配置 |
| --- | --- |
| entry | `kind=entry`，`reEntry=none` |
| update | `kind=update`，`attribute=lifecycle`，`value=AUDIT_UPDATED` |
| delay | `kind=delay`，`durationHours=24` |
| message | `kind=message`，`channel=push`，合成正文 |

先 PUT `/api/canvas` 保存，再连续 POST `/api/canvas` 两次。首次首个用户轨迹的四个时间戳均为 `2026-10-18T05:38:43.738Z`，证明当前实现没有等待 24h。该 UTC 时间相当于客户端时区 2026-10-18 13:38:43.738。

只读查询确认：

```sql
SELECT id, subscribed, lifecycle FROM users WHERE id = 'user_1';
-- subscribed = 1, lifecycle = 'All Users'

SELECT count(*) FROM users WHERE lifecycle = 'AUDIT_UPDATED';
-- 0

SELECT entered_count, message_count FROM canvas_runs;
-- 两条记录均为 10, 10
```

## 4. 本地页面与代码核对

- Canvas 实际组件为 LiveCanvas；有图操作、Inspector、Execution、保存和 Launch，入口没有列表。
- 本地订阅组列表显示 `5 Subscribers`，此处 5 实际是组条数；列缺少 API ID。
- 本地创建弹窗提供 Email/SMS/WhatsApp 下拉，原版 Email 创建弹窗没有此渠道选择。
- 本地组成员加载参数固定 `limit=20`，界面未提供访问后续成员的分页。
- 中心搭建器的示例预览写死 Carla Rodriguez；分享链接固定使用 user_1 调试。
- Canvas openFullEditor 的关联修改仅在前端历史中；运行器没有读取 linkedCampaignId。
- 中心已有版本记录和提交事件，不能写成“没有版本、没有审计”；缺口是独立发布快照、冲突处理及完整业务事件语义。
- 中心 token 使用无密钥固定哈希，公共 GET 只在 token 非空时比较；报告未公开任何实际 token。

## 5. 验证结果与未验证项

已运行 `npm run test:canvas`，4/4 通过：种子图可发布、孤立分支、循环与空消息、非分支多出口校验。

未运行本轮全量构建和全部邮件偏好回归；未修改业务代码，所以也不将历史“构建通过”当成本轮结果。上述 Canvas 测试不覆盖本次发现的等待、重入、Update 或资格问题。

未完成：统一视口截图测量、原版受限编辑态保存、原版发布与真实收件、真实渠道状态回流，以及其他后台模块的逐页验收。
