# Unlayer 邮件编辑器迁移验收（2026-10-28）

## 接入范围

- 使用官方 `react-email-editor@2.1.3` 和 `https://editor.unlayer.com/embed.js`，固定 Builder `1.489.0`。
- Campaign 新建拖拽邮件、已有 Beefree 邮件、邮件模板均进入 Unlayer；已有 GrapesJS/MJML 草稿保留原编辑器。
- 保存 `emailUnlayerJson`、`emailUnlayerVersion` 和完整 HTML；变体保存对应 `unlayerJson` 等字段。
- 可选公开 Project ID，基础编辑不需要 Cloud API Key。服务端 `@unlayer/sdk` 与浏览器 Builder 不同，本次不调用 Cloud API。
- 移除 Beefree 依赖、token route 和凭证配置示例。旧设计 JSON 继续保留用于恢复。

## 验证结果

使用独立 SQLite 测试数据库 `/private/tmp/braze-unlayer-20261028.sqlite`，未改动本地工作数据和生产邮件数据。

| 检查 | 结果 |
| --- | --- |
| 模型测试 | `node --experimental-strip-types --test tests/unlayer-template.test.mjs`，5/5 通过 |
| TypeScript | `tsc --noEmit` 通过；构建类型检查通过 |
| 生产构建 | Node 22 + `next build` 通过 |
| 实际 SDK 操作 | 在 Chrome 打开官方 iframe，拖入 Heading、修改内容和主题并保存成功 |
| 导出与重开 | API 同时存有设计 JSON 和 5499 字节 HTML；重新打开显示已保存内容 |
| Liquid | HTML 保留 `{{${first_name}}}`；应用预览解析为 `Welcome Sofia — Unlayer QA` |
| 变体隔离 | 实际创建并保存第二变体；第二变体主题、内容和 JSON 独立，主配置仍指向首个变体 |
| 旧 Beefree 迁移 | HTML 内容、head CSS、Liquid 和退订链接在 Unlayer 中显示；保存后原 Beefree JSON 与原 HTML 备份完整 |
| 模板保存与应用 | 在模板编辑器保存主题，使用模板创建新 Campaign；新 Campaign 主题和设计一致，保留 Unlayer JSON |

发现并修复编辑容器只有 150px 高的问题；补上外层容器的明确高度。模板验收还修复了来自 Campaign 的模板内首个变体镜像未同步的问题，防止应用后恢复旧主题或旧设计。

首次远程 iframe 曾加载超时；用官方原生 JavaScript 示例也复现自动启动未就绪，而点击创建后可用。最终在 Campaign 和模板入口提前加载 SDK，再由编辑入口点击创建实例，已验证无需等待超时或点击重试即可打开。若用户在脚本尚未就绪时进入，先显示加载状态，脚本完成后提供“Open email editor”按钮。最终加载失败或超过 60 秒时有明确错误和重试入口；保存按钮在设计加载完成前禁用。导出超时和服务端保存失败保留编辑器内容并显示错误；保存期间出现新编辑时继续提示未保存，阻止保存后直接离开。

## 迁移限制

Beefree JSON 与 Unlayer JSON 不兼容。旧邮件以一个 HTML 内容块导入，可以编辑 HTML 或添加新的原生内容块，无法自动恢复原 Beefree 的逐块编辑结构。无 HTML 的旧设计、损坏的 Unlayer JSON 会阻止加载，避免用空设计覆盖原内容。

## 官方参考

- [React component](https://docs.unlayer.com/builder/react-component)
- [Load and save designs](https://docs.unlayer.com/builder/load-and-save-designs)
- [Export HTML](https://docs.unlayer.com/builder/export-html)
- [Cloud SDK](https://docs.unlayer.com/sdk)
