# GrapesJS 邮件编辑器与右侧栏 · 2026-10-28

## 实现

- Campaign 和 Email Templates 的拖拽入口统一使用本地 GrapesJS + MJML，移除运行入口对 Unlayer 远程脚本的预加载。不需要厂商账户配置。
- CONTENT：Basic Blocks 六项、Media 四项、Advanced 两项；三列组件卡片与可折叠分组。
- ROWS：11 种列宽预设，支持拖拽和点击插入，支持工作区 Content Blocks 的 Liquid 引用。
- 属性：文本、标题、列表、图片、按钮、分隔线、间隔、社交链接、菜单、HTML、行与列。提供颜色、字号、对齐、边距、链接、列宽等对应设置。
- SETTINGS：内容宽度、背景、字体、文字和链接颜色，更新实际 MJML 与导出 HTML。
- 画布 iframe 使用显式坐标转换处理侧栏拖拽；提供插入位置指示，支持撤销、重做、取消和清理事件监听。
- 保存失败或编辑器未就绪时不覆盖设计，不并发写入，保留较新未保存修改。主设计、其他变体和模板镜像分别保存。

## 旧设计

现有 GrapesJS 项目直接恢复。已有导出 HTML 的 Unlayer／Beefree 邮件导入为一个 HTML 块，保留原设计 JSON 和迁移前 HTML；不会无损转换为独立原生块。只有厂商 JSON、缺少 HTML 的记录会显示错误并禁用保存，仍可返回。

## 参考与边界

- [Braze 拖拽编辑器说明](https://www.braze.com/docs/user_guide/channels/email/drag_and_drop)
- [Content 面板参考](https://www.braze.com/docs/assets/img/dnd/dnd_content.png)
- [Rows 面板参考](https://www.braze.com/docs/assets/img/dnd/dnd_rows.png)
- [GrapesJS 自定义 Block Manager](https://grapesjs.com/docs/modules/Blocks.html#customization)

Braze 实际 Beefree iframe 本次仍停在加载状态，基础布局按官方截图对照。不同内核的图标、富文本编辑和部分高级属性仍有差异；本记录不表示 Braze 全部高级交互或逐像素 1:1 验收已完成。

## 验证

- Node 22 + Next.js 最终生产构建、TypeScript 检查通过。
- 18 项测试通过：迁移、Liquid／CSS 保留、变体隔离、行宽总和、XML void tags 修复、拖拽坐标／索引／取消逻辑等。
- Chrome 实际验证：标题编辑，25/75 行插入、40/60 列宽调整，组件和行从右侧拖入，撤销／重做，保存后重开。
- 浏览器和实际 API 记录共同验证：HTML、MJML、GrapesJS 项目 JSON 同时持久化，Liquid 原样保留。
- 内置浏览器验证：旧 Unlayer HTML 迁移保留厂商 JSON，缺失 HTML 的记录不被覆盖，错误时可返回；新模板保存并应用至新 Campaign 后仍能继续编辑保存。
- 所有有数据写入的验收使用隔离 SQLite：`/private/tmp/braze-grapes-sidebar-20261028.sqlite`。
