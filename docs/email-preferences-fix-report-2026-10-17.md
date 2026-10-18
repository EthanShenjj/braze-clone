# 邮件偏好设置修复复核

日期：2026-10-17。对应《邮件偏好设置与 Braze 差异检查报告》的 22 项意见。

## 本轮交付

22 项均已落实对应代码修改。验证范围为本地应用、可访问的 Braze 浏览态、官方文档规则，以及隔离 SQLite 数据库中的完整配置消费流程。**这不等于已通过 Braze 所有编辑态的像素级一致性认证，也不等于已向真实邮箱投递。**

| ID | 修复内容 | 验证 |
| --- | --- | --- |
| F01 | 统一侧栏、链接、语言切换的未保存导航保护；Chrome 历史导航提示；sessionStorage 保存草稿，包括未填完的表单。恢复时保留原设置版本，避免覆盖其他窗口的更新。 | Chrome 后退与侧栏跳转显示确认；Keep editing 保留内容；Discard 可继续导航。IAB 后退重新加载时草稿可恢复。 |
| F02 | 创建、更新和启动邮件、准备测试邮件均执行工作区 From/Reply-To/BCC 规则；编辑器不再无条件混入未列出的固定身份，要求 BCC 时禁用 No BCC。 | API 拒绝未列出的 From、缺失或未列出的 BCC；保留 Workspace default BCC 解析。 |
| F03 | 邮件编译解析 email_footer；订阅与退订 token 链接提供确认和自定义结果页；预览与实际编译读取相同工作区数据。 | HTML/纯文本页脚个性化、退订确认、订阅确认及用户状态变化通过 API 集成检查。 |
| F04 | 新邮件保存主题快照；H1–H6、段落、列表、按钮、图标和移动端样式进入 MJML/HTML；链接颜色和 spacing 进入导出；空白邮件使用段落默认值。Canvas 邮件、新模板及 Content Block 默认宽度接入同一配置。 | 默认值、类型排序、编译测试通过；浏览器显示 H2–H6、LIST、ICONS；已有邮件快照保留。 |
| F05 | GrapesJS Link Management 支持 alias 和 tracking，随邮件保存生成工作区别名；编译生成跟踪 token，点击事件进入用户最近 100 条链接点击记录；停用别名停止新增别名记录。 | 浏览器配置 alias 后保存，API 中邮件 HTML、配置及别名资源一致；事件和用户记录检查通过。 |
| F06 | 根据显式 bot 标识和本地 User-Agent 规则识别点击；过滤事件独立保存为 bot_clicked，报表不计入 clicked；关闭过滤不会恢复已移除的点击。 | Bot 点击不增加指标，人类点击增加指标；关闭开关不恢复已过滤点击。 |
| F07 | 编译接入顶部/底部像素、工作区和邮件级退订头、TEST/SEED、CSS inlining；用户更新邮箱接入恢复订阅规则。测试生成 HTML、纯文本、邮件头和 multipart MIME，可下载 .eml；界面明确为准备测试，不伪报真实投递成功。 | 单元/API 检查头部、像素位置、主题、CSS、MIME 和恢复订阅。公网链接使用 BRAZE_PUBLIC_URL 或 Vercel 域名。 |
| F08 | 去掉 John Doe 正则替换，使用 LiquidJS 的条件、过滤器和属性上下文；预览可选真实用户或随机用户，HTML 通过清理和 sandbox 渲染，允许 HTTPS 图片/样式/字体。 | 浏览器选择 user2 后渲染 Customer 2；API 验证不同用户、自定义属性、新旧退订变量及错误模板。 |
| F09 | 条件 Liquid 的各字面 URL 分支校验 HTTPS，编译时再次校验最终地址；拒绝非法分支和头部换行。 | HTTPS 的 if/else 通过；javascript 分支、头部注入被拒绝。 |
| F10 | 区分 Viewing 浏览模式和 View only 权限；GET 返回编辑权限，PUT 在只读部署中返回 403；资源通用写接口不能绕过专用偏好接口。IP Warming 保留无发布权限状态。 | 默认管理员可编辑；生产只读模式 GET canEdit=false，PUT=403；跨资源 PATCH/DELETE 无法绕过。 |
| F11 | 新增纯文本页脚编辑、真实用户 Preview & Test、有效期 7 天的共享预览。 | 页面入口、共享链接访问、脚本清理和编译纯文本检查通过。 |
| V01 | 使用实际 Aribau 常规/粗体字体资源，统一偏好页面与公共框架字体。 | 本地字体资源与 750/900 高度截图复核。 |
| V02 | 补 AI Decisioning、Home 文案、侧栏折叠入口、原版 logo/背景；Settings 选中态由页面路由确定；语言改为 globe 菜单。 | 页签切换和返回后 Settings 保持选中；公共框架截图复核。 |
| V03 | 订阅卡片高度随视口变化；内导航竖线随卡片延伸，长内容在右侧内部滚动。 | 1440×750、1440×900，另测 390×844 无页面横向溢出。 |
| V04 | 按钮字段顺序按原版重排；段落/列表的 spacing 分别命名；图标区按桌面、Block Padding、Icon Padding、Mobile 分组。 | 与已保存的原版 DOM 顺序逐项核对。 |
| V05 | 按钮预览改为 470px 高；补齐原版段落、嵌套列表样本、padding 示意图和图标移动预览及相关值绑定。 | 按钮样式截图及移动设置代码检查。 |
| V06 | IP Warming 新建增加嵌套 Sending information 卡片及三列，调整进度、权限说明与操作栏；禁用按钮使用灰色。 | 新建页、More Info 和三列布局浏览器检查。 |
| V07 | 新建使用 /ip_warming/new/{workspace}，Back、深链接、刷新均由路由决定。 | 浏览器确认 URL，刷新后恢复 Sending information。 |
| A01 | 页签实现 roving tabindex，方向键/Home/End 移动焦点，Enter/Space 激活。 | ArrowRight 从 Link Aliasing 聚焦 Bot Filtering，选中页签保持 Link Aliasing，符合手动激活模式。 |
| V08 | 统一 select 箭头，提供实际升/降序图标和 aria-sort、Status 说明、灰色禁用样式。 | 控件状态与 DOM 检查。 |
| V09 | 按 Aribau 重调徽标、下划线、卡片、空态间距。 | 750/900 高度截图复核；不同权限徽标文案按实际权限显示。 |
| V10 | 三个 here 按原版分别链接 Custom Footer 和 Email Subscriptions；Need help 改为展开式帮助。 | 原版页面 href 对照；修复帮助弹层中的嵌套段落标记。 |

## 自动验证

- Node 22：TypeScript 检查通过；Next.js 生产构建通过。
- 30 项单元检查通过：偏好设置、Liquid、运行时、MJML、Catalog 和导航。
- `tests/email-preferences-api.py`：保存、非法输入、版本冲突、新邮件默认值、已有主题保留。
- `tests/email-preferences-runtime-api.py`：发送限制、个性化预览、页脚、MIME、别名、Bot 指标、邮箱更新、自定义订阅页及共享预览。
- 浏览器操作后的 API 复核：别名确实写入邮件 HTML 和资源列表；旧 `<br>` 规范化为 `<br />`，画布没有 parsererror。

测试使用独立 `/private/tmp/braze-email-preferences-20261017.sqlite`，API 套件结束恢复工作区设置，没有修改参考 Braze 工作区。

## 截图证据

- [后退保护](email-preferences/fixes-2026-10-17/01-unsaved-history-guard.png)
- [订阅设置 1440×900](email-preferences/fixes-2026-10-17/02-subscription-1440x900.png)
- [按钮样式](email-preferences/fixes-2026-10-17/03-button-styling-1440x900.png)
- [IP Warming 新建](email-preferences/fixes-2026-10-17/04-ip-warming-new-1440x900.png)
- [编辑器别名及主题组件](email-preferences/fixes-2026-10-17/05-editor-aliases-and-blocks.png)
- [订阅设置 1440×750](email-preferences/fixes-2026-10-17/06-subscription-1440x750.png)
- [移动视口](email-preferences/fixes-2026-10-17/07-subscription-390x844.png)
- [生产只读模式 1440×900](email-preferences/fixes-2026-10-17/08-readonly-production-1440x900.png)

## 验收边界

1. 参考账号没有偏好设置编辑权限；源产品新增/保存弹窗的具体像素位置无法直接核验。新增功能按官方文档实现，没有把这部分称为编辑态完全一致。
2. 当前没有配置真实邮件服务商。生成的 MIME 可以检查和下载；测试行为明确为本地准备，不会向外部收件人投递。
3. Bot 的本地识别支持显式标识与可解释的 User-Agent 规则；没有声称获得 Braze 私有 IP/UA 识别库。过滤开关、持久化和统计消费已接通。
4. IP Warming 后四步在参考账号中禁用，本地保留相同权限限制。没有伪造可发布流程。
5. 本轮完成本地修复与验证，未执行新的提交或部署。
