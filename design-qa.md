> **后续严格复查（2026-10-17）：尚未达到完整 1：1。** 下文 passed 为原限定范围验收记录；最新差异及优先级见 [邮件偏好差异检查报告](docs/email-preferences-gap-audit-2026-10-17.md)。

# Email Preferences 复刻验收

日期：2026-10-17。范围：邮件偏好设置内容区域及其本地编辑、保存和预览；复用现有应用侧栏、账户菜单与工作区框架。

## 参考与证据

- 用户给出的 URL 为 Tag Management；在已登录的外部 Chrome 中，从 Settings → Email Preferences 找到真实页面：`/app_settings/app_settings/email_settings/{tab}/6ad0b98fe4b4110085216601?locale=en`。
- 六个参考标签页均已截图。原始证据在 `/private/tmp/braze-email-preferences-reference/`（sending-top、subscription、editor-top、editor-section-0…7、aliases、bots、warming、warming-new）。
- 编辑态参考 [Braze Email Preferences 官方手册](https://www.braze.com/docs/user_guide/administer/global/workspace_settings/email_preferences)。参考账号为 View only；自定义 Edit settings / Save changes / Cancel 属于本地可编辑扩展，不能声称其编辑态已与原账号逐像素比对。
- 本地入口：`http://127.0.0.1:3100/email-preferences?locale=en`；真实路径形式亦可直接刷新。
- 原图 2880×1740，2 倍密度；先缩至 1440×870，再移除 121px 浏览器工具栏。实际网页约 1440×749 CSS px。本地截图为 1440×750、1 倍密度。
- 全景比较均按同一内容区域对齐：参考裁剪 `(260,211)–(1440,870)`，本地裁剪 `(260,90)–(1440,749)`。没有将浏览器边框或像素密度差异计为设计问题。
- 同图左右对比（左 Braze，右本地）：[发送设置](docs/email-preferences/comparison-sending.png)、[订阅页面与页脚](docs/email-preferences/comparison-subscription.png)、[编辑器样式](docs/email-preferences/comparison-editor.png)、[链接别名](docs/email-preferences/comparison-aliases.png)、[Bot Filtering](docs/email-preferences/comparison-bots.png)、[IP Warming](docs/email-preferences/comparison-warming.png)。
- 字段细节：[放大比较](docs/email-preferences/comparison-fields.png)。本地全景：[preview.png](docs/email-preferences/preview.png)。窄屏：[390×844](docs/email-preferences/mobile.png)。

## 发现、修复与复查

1. **P2，已修复：全局样式面板高度过大。** 首轮本地右栏 640px，参考同视口约 450px，面板底边超出首屏。改为随视口计算的内部滚动区；最终编辑器对比中底边和主要区域比例已对齐。
2. **P2，已修复：订阅设置及链接别名页纵向间距偏大。** 收紧说明文字、段落和筛选区间距；订阅三个区块、表头和空结果区的位置经重新截图复查。
3. **P2，已修复：Bot Filtering 卡片过高。** 单独对齐 24px 内边距、标题说明及分隔线间距，保留左右两栏结构；最终对比不再出现首轮大面积空白。
4. **P2，已修复：390px 下顶部工具栏溢出。** 收拢次要图标与搜索按钮；DOM 验证 `document.documentElement.scrollWidth === window.innerWidth === 390`，发送设置和全局样式均通过。
5. **P3，已修复：IP Warming 标题被通用字号覆盖。** 增加作用域内字号规则；还原源页面插图、圆角白卡和主要按钮。
6. **P3，保留：字体与基础控件细节。** 使用项目现有字体栈、Lucide 通用图标和原生 select；参考专用字体、下拉分隔线及部分图标的笔画存在细微差异。新增 Edit settings 入口是有意扩展。因此本次不是“所有像素完全一致”的声明。

## 五项视觉检查

- **字体：** 检查 24/18/16/14/13px 层级、粗细、行高与换行；字体回退差异如上记录。
- **布局：** 检查标签顺序、页面留白、卡片边界、内导航宽度、表格与内部滚动；发送地址字段另做放大比较。
- **颜色：** 对齐浅灰画布、白卡、深紫标签下划线、浅紫 View only、灰色禁用开关、紫色编辑控件；保留参考默认 #1871D8 / #101B24 等配置值。
- **图像：** IP Warming 与 Content Block Width 直接复用源截图中的插图裁片，没有改画插图；缩放保持比例。
- **内容：** 六个页签、三个订阅区块、九组样式、主要说明文案及空状态已核对。发送地址为截图基准数据，可在本地编辑。

## 行为验证

- 发送人、Reply-To、BCC 配置；默认地址；缺失默认 BCC 阻止保存。
- 开关设置与 HTML 编辑；缺失退订 URL / 大小超限验证；HTML/Preview 切换；隔离 iframe 预览；恢复默认。
- 修改后保存、刷新恢复；未保存切换页签的保留/放弃提示。
- 标题、正文、列表、按钮、图标、移动端、模板与内容块宽度配置；按钮内边距保存后重开恢复。
- 链接别名搜索、状态筛选、选择和停用；通过隔离样本验证停用持久化，样本已清理。
- IP Warming 空状态、新建入口与 More Info 展开；按参考权限保持只读与禁用下一步。
- 新邮件获得发送身份、基础样式及标题/正文/按钮默认主题；旧邮件保留自身配置。
- 模型及路由单元测试 12 项通过；接口回归通过，覆盖错误输入、保存、冲突、无覆盖旧邮件；TypeScript 与生产构建通过。
- 曾在开发热更新引入新字段时出现旧内存状态缺少 padding 的错误；已补齐持久主题兼容归一化，刷新后的完整配置与旧主题模型回归通过。

## 范围与未验证项

- 参考账号没有邮件偏好设置编辑权限；可见只读态用于视觉验收，编辑规则按官方文档实现。
- 手机仅验证本地可用性，未获取 Braze 手机参考图，不作手机逐像素一致声明。
- IP Warming 是参考只读界面，没有新增真实发送服务商或 IP 预热执行引擎。Bot Filtering 保存工作区配置，没有新增外部 Bot 识别服务。
- 九组全局样式均可编辑保存；目前已有 GrapesJS 标题、正文和按钮组件消费对应默认值。独立列表/图标组件及 Canvas、模板、Content Block 编辑器未在本次扩展消费端。
- 自定义页脚和订阅页面支持配置、HTML 预览与 snippet 复制；真实退订跳转和邮件投递仍由现有订阅/发送体系负责，本次未引入对外投递服务。

## 完成清单

- [x] 取得已登录参考页面并捕获六个标签页。
- [x] 实现独立设置页和 SQLite/API 持久化，不新增数据库表。
- [x] 修复发现的 P2 布局问题，重截并放在同图中复查。
- [x] 验证桌面/窄屏、保存/刷新、校验/冲突和关键空状态。
- [x] 保留字体、权限和真实邮件服务范围差异的明确记录。

final result: passed（所述内容区域与本地配置流程；不代表整个 Braze 产品或真实投递能力完成）

## 2026-10-17 差异修复复核

已按严格审查的 22 项意见落实修复。证据与边界见 `docs/email-preferences-fix-report-2026-10-17.md`。本地功能回归通过；源账号无权限的编辑态、真实邮件投递和 Braze 私有 Bot 识别库不计为已验证的 1:1 范围。
