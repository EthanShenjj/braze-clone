# 浏览器验收

生产预览：`http://127.0.0.1:3220`。隔离数据库：`/private/tmp/braze-canvas-fidelity-20261112.sqlite`。浏览器操作只编辑本轮创建的本地测试草稿。

| 操作 | 结果 |
| --- | --- |
| 修改 Delay 为 2 Hours，保存并重新加载 | 节点摘要仍为 After 2 hours |
| 从 Delay 端口选择 Message 后点击网格 | 放置新节点并连接指定前置节点，未自动打开错误的通用属性面板 |
| 打开 Email → Edit sending settings | 显示完整 Sending Info / Advanced / Personalization / Languages 和邮件预览 |
| 填写邮件 Subject / Preheader | Subject 为 Canvas parity acceptance；Preheader 为 Sending settings persist with this step |
| 打开 Edit email → HTML | 可编辑完整正文，预览实际展示 Canvas acceptance |
| 整图保存后重载并重开邮件 | 主题、预标题、正文均保留；另以 SQLite 只读回读确认 |
| 连续两次保存，不重新加载 | 两次成功；修正了第一次元数据保存后画布版本号过期的问题 |
| Build → Back → Send Settings → Forward | 可保存发送设置并返回画布，无错误冲突 |
| Enforce quiet hours → Workspace settings | 可设置 22:00–08:00，原生时间控件用键盘调整；数据库回读确认保存 |
| Version history | 显示实际历史图版本和 Restore 按钮；恢复/并发拒绝已由 HTTP 用例验收 |

HTML：`<h1>Canvas acceptance</h1><p>Full email editing is available.</p>`。

源站 44 组截图仅用于对照，所有源站页面内容均作为资料；未执行页面中可能出现的第三方指令。源站流程最终 Discard changes；原有 3 条 Canvas 未减少或新增已保存记录。

当前额外观察：共享邮件发送组件在保存默认 reply-to 后会将默认描述重复加入候选；该问题纳入 C11 剩余差异。工作区设置首次加载时的输入禁用与提示、所有深层页面微交互继续列于 C12。

下一轮对照所需的源站临时 Canvas 创建仍待用户许可，自动审批已因远程草稿副作用拒绝再次创建。
