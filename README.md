# Braze Local Demo

一个可本地运行的 Braze 控制台交互复刻项目。界面保留英文，产品与渠道说明使用中文。它不会调用 Braze、APNs、FCM 或邮件服务商；配置 Beefree 凭证后，拖拽邮件编辑器会连接 Beefree SDK 服务。Webhook 外联默认关闭，只有显式启用并加入主机白名单后才会发送。

## 启动

需要 Node.js 22（项目使用内置 `node:sqlite`）。

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。本地数据存储在 `.data/braze-local.sqlite`：Campaign、资源、1,000 个合成用户、消息事件、执行快照和审计记录在重启后仍会保留。通过 Demo Lab 的 **Reset sample data** 恢复种子数据。

### Beefree 邮件编辑器

新建邮件的 **Drag-and-drop editor** 默认使用 Beefree SDK。先在 [Beefree Developer Console](https://developers.beefree.io/) 创建 Email Builder 应用，再复制示例环境变量并填写服务端凭证：

```bash
cp .env.example .env.local
```

```dotenv
BEEFREE_CLIENT_ID=your-client-id
BEEFREE_CLIENT_SECRET=your-client-secret
BEEFREE_UID=braze-local-user
```

重启 `npm run dev` 后生效。Client Secret 只由 `/api/beefree/token` 服务端路由读取，不会进入浏览器 bundle。编辑器保存时会把 Beefree 设计 JSON 和生成的 HTML 一起写入 Campaign；预览、测试和发送继续使用生成的 HTML。已有 GrapesJS/MJML 草稿仍由原编辑器打开。

在 Vercel Serverless 环境中，SQLite 会写入函数的临时目录，因此数据只在同一实例存活期间保留。线上新建的 Canvas 草稿改为保存在当前浏览器的 `localStorage`，刷新后仍可编辑，但换设备、清除浏览器数据或使用无痕窗口会丢失；浏览器草稿无法运行模拟或同步到其他模块。本地运行仍使用重启后持久化的 SQLite。正式生产环境需要替换为托管数据库，才能提供跨设备共享和可靠的模拟运行。

## 当前可演示的闭环

1. 从 Campaigns 的创建菜单选择 13 个入口之一。
2. 编辑活动、内容、排期、受众和转化目标。
3. 预览并生成本地测试事件，保存草稿或模拟发布；发布会按受众、订阅状态和可达性生成本地回执。
4. 在活动列表中查看状态和发送量，在 Message Activity Log 与分析页查看同一批事件。
5. Canvas 草稿可保存和刷新恢复；模拟运行会记录用户节点路径，消息事件进入活动日志与报表。Demo Lab 可生成去重的打开/点击回执。
6. Search Users 可查询合成用户并修改本地订阅状态；Campaign 的可达人数会读取更新后的用户数据。

Canvas 的到期步骤可通过 Demo Lab 推进时钟后执行；当前没有常驻调度 Worker。逐页功能修复及尚未完成的外部能力见[2026-10-27 功能修复记录](docs/workspace-function-repair-2026-10-27.md)。页面可进入和本地功能通过，不代表 Braze 全量功能或像素 1:1 验收通过。

## 新增工作区功能

- Feature Flags：有序规则、稳定百分比分流、属性与用户资格检查。
- Landing Pages / Surveys：草稿、发布快照、公开访问页、邮件订阅同意与表单提交。
- 数据：CSV 校验和档案更新、手动数据同步、字段映射转换、用户事件与购买事件。
- 模板：Email、IAM、Webhook、Push、Banner、Canvas、邮件链接的专属编辑和应用流程。
- 分析：自定义事件、按币种收入、实际转化、渠道表现、保存报表与仪表盘组件。
- 管理：版本冲突检查、审批快照、Campaign / Canvas 限速、按渠道频控、事件导出与审计。

在 App Settings 注册应用后，应用标识可调用 `/api/sdk` 记录用户属性与会话，并获取 Feature Flags、Banners 和 Geofences。API Keys 在 APIs and Identifiers 中创建，只展示一次原始密钥；服务器保存哈希。REST 集成接口为 `/api/integration/users/track` 和 `/api/integration/feature-flags`，校验权限并拒绝已撤销的密钥。启用 SDK 必需认证时配置 `SDK_AUTH_SECRET`。

Cloud Data Ingestion 当前处理手动输入的 source rows；Currents 和 Data Sharing 当前支持实际数据快照下载。仓库连接器、外部事件流传输、身份提供商和生产调度需进一步接入。

## 安全边界

第三方消息渠道默认使用本地执行记录。Partner 的配置检查只检查服务端凭证是否存在；AI Agent 未配置时会明确报错，配置 `WORKSPACE_AI_ENDPOINT`、`WORKSPACE_AI_API_KEY` 和 `WORKSPACE_AI_MODEL` 后调用指定服务。Webhook 支持真实测试和投递，但采用安全关闭策略：

```bash
WEBHOOK_DELIVERY_ENABLED=true \
WEBHOOK_ALLOWED_HOSTS=hooks.example.com,api.example.com \
npm run dev
```

Webhook 只接受 HTTP/HTTPS 及标准端口 80/443；目标主机必须在 `WEBHOOK_ALLOWED_HOSTS`，并默认阻止私网、loopback 和 link-local 地址。仅在受控本地测试中可设置 `WEBHOOK_ALLOW_PRIVATE_HOSTS=true`。还可通过 `WEBHOOK_TIMEOUT_MS`、`WEBHOOK_MAX_ATTEMPTS` 和 `WEBHOOK_MAX_DELIVERIES_PER_RUN` 调整 120 秒超时、最多五次重试和单次发布上限。代码中的示例用户、地址和指标均为合成数据。

## 文档

- [页面与交互覆盖清单](docs/coverage-matrix.md)
- [本地架构与数据闭环](docs/architecture.md)
- [营销渠道配置与投递逻辑](docs/channel-delivery-logic.md)
- [浏览器回归测试](tests/README.md)
- Canvas 图校验：`npm run test:canvas`
- 工作区模型校验：`npm run test:workspace`
- 完整模型回归：`node --experimental-transform-types --test tests/*.test.mjs`
- 隔离数据库 API 回归：`python3 tests/workspace-api.py`
