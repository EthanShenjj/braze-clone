# SMS 源站配置核查快照

日期：2026-11-12。来源：Braze Demo – ittor，现有 Early Access SMS 草稿。

https://dashboard-09.braze.com/engagement/campaigns/6af4375320abdf005fc2ef31/6af4374c46d3080087f1c5d2?locale=en

每组包含截图 `.jpg`、完整可访问性树 `.ax.txt`、DOM 快照 `.dom.txt`：

1. `01-source-campaign-personalization`：展开的 16 类个性化选项。
2. `02-source-campaign-test`：Operator、测试组、个体收件人、覆盖属性、预览用户、预览链接。
3. `03-source-campaign-contact-card`：当前订阅组 MMS 未开通提示。
4. `04-source-campaign-compose`：正文、分段计数、链接缩短。
5. `05-source-campaign-languages`：多语言对话框及 Message / Image 字段选择。

仅只读检查；未插入片段、未保存草稿、未发送测试。MMS/RCS 完整高级分支未核验。Canvas 本次结论依照当前实现和既有 `docs/sms-reference/` 源站证据，未伪称为本次 Canvas 全分支截图。

完整差异清单：[sms-fidelity-2026-11-12.md](../../implementation/sms-fidelity-2026-11-12.md)。
