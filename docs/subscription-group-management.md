# Subscription Group Management（订阅组管理）

本地复刻位于 Audience → **Subscription Group Management**，并使用与 Braze 可见入口一致的深链接：

`/users/subscription_groups/{workspaceId}?locale=en`

Email Preference Centers 使用：

`/users/subscription_groups/preference_centers/{workspaceId}?locale=en`

## 已实现的交互闭环

- 列表按名称、描述、Channel（Email、SMS、WhatsApp）和状态筛选。
- 创建、编辑、归档和重新激活 subscription group。
- 每个组维护独立的用户订阅状态；同一用户可以在 Promotions 中退订，同时仍订阅 Product updates。
- Subscriber 明细支持搜索与状态筛选，点击状态标签可切换 `subscribed` / `unsubscribed`。
- Email Preference Center 可以选择多个 Email subscription group，并保存为独立资源。
- Campaign → Target Audiences 在“Send to these users”不是 `all` 时，可选择与渠道匹配的 subscription group。预估人数、模拟发布、`suppressed` 事件和报表均读取该组的实际成员状态。
- 所有订阅组、成员关系、偏好中心和审计记录均保存到本地 SQLite；重启服务后数据仍存在。

## 数据模型

| 表 | 作用 | 关键字段 |
| --- | --- | --- |
| `subscription_groups` | 分组定义 | `name`、`channel`、`status` |
| `subscription_group_memberships` | 用户在特定组中的状态 | `group_id`、`user_id`、`state`、`updated_at` |
| `preference_centers` | 用户可见的偏好中心配置 | `group_ids_json`、`status` |
| `audit_log` | 操作记录 | `entity_type`、`action`、`detail_json` |

`users.subscribed` 保留为原来的工作区级演示状态。Campaign 未选 Subscription group 时沿用它；选中分组后，资格判断切换为 `subscription_group_memberships.state = 'subscribed'`。

## 本地 API

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` / `POST` | `/api/subscription-groups` | 查询、创建分组 |
| `GET` / `PATCH` | `/api/subscription-groups/:id` | 读取、编辑或归档分组 |
| `GET` / `PATCH` | `/api/subscription-groups/:id/members` | 读取成员、变更其订阅状态 |
| `GET` / `POST` | `/api/preference-centers` | 查询、创建偏好中心 |

## 与真实发送能力的边界

真实 Braze 需要渠道配置、用户身份解析和下游投递商回执。本工程不会对外发邮件、短信或 WhatsApp 消息；Campaign 发布只产生本地执行记录和事件。该限制在界面和 API 语义中保持明确。

当前参考账号的 Email Preference Centers 页面本身显示“An unexpected error occurred”。本地实现保留该入口与表格结构，但提供完整的离线操作，用于演示订阅配置与 Campaign 资格判断。
