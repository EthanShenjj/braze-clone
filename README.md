# Braze Local Demo

一个可本地运行的 Braze 控制台交互复刻项目。界面保留英文，产品与渠道说明使用中文。它不会调用 Braze、APNs、FCM、邮件服务商或任何用户填写的 Webhook 地址。

## 启动

需要 Node.js 22（项目使用内置 `node:sqlite`）。

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。本地数据存储在 `.data/braze-local.sqlite`：Campaign、资源、1,000 个合成用户、消息事件、执行快照和审计记录在重启后仍会保留。通过 Demo Lab 的 **Reset sample data** 恢复种子数据。

在 Vercel Serverless 环境中，SQLite 会写入函数的临时目录，因此数据只在同一实例存活期间保留；本地运行才提供重启后的持久化数据。生产持久化需要替换为托管数据库。

## 当前可演示的闭环

1. 从 Campaigns 的创建菜单选择 13 个入口之一。
2. 编辑活动、内容、排期、受众和转化目标。
3. 预览并生成本地测试事件，保存草稿或模拟发布；发布会按受众、订阅状态和可达性生成本地回执。
4. 在活动列表中查看状态和发送量，在 Message Activity Log 与分析页查看同一批事件。
5. Canvas 草稿可保存和刷新恢复；模拟运行会记录用户节点路径，消息事件进入活动日志与报表。Demo Lab 可生成去重的打开/点击回执。
6. Search Users 可查询合成用户并修改本地订阅状态；Campaign 的可达人数会读取更新后的用户数据。

当前 Canvas 不具备真实调度 Worker；Demo Lab 的时钟推进只更新本地时钟。其他模块的逐项完成度见[渠道与模块审计](docs/channel-module-audit-2026-09-17.md)，菜单可进入不代表 1:1 验收通过。

## 安全边界

Webhook、AI、第三方渠道与连接测试均为本地模拟，不会向外部网络发送请求或消息。代码中的示例用户、地址和指标均为合成数据。

## 文档

- [页面与交互覆盖清单](docs/coverage-matrix.md)
- [本地架构与数据闭环](docs/architecture.md)
- [营销渠道配置与投递逻辑](docs/channel-delivery-logic.md)
- [浏览器回归测试](tests/README.md)
- Canvas 图校验：`npm run test:canvas`
