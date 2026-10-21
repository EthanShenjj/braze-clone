# 浏览器回归测试

执行命令：

```bash
python3 /Users/ethanshen/.codex/plugins/cache/anthropic-agent-skills/example-skills/local/skills/webapp-testing/scripts/with_server.py \
  --server "npm run dev" --port 3000 -- python3 tests/e2e_smoke.py
```

测试覆盖真实 URL 的 Campaign 列表、Campaign 创建与发布 API、Email Compose 深链接、活动日志，以及报表事件联动。运行时会在 `tests/artifacts/` 生成 1440×900 的本地视觉基线截图。

Webhook 专项回归：

```bash
python3 /Users/ethanshen/.codex/plugins/cache/anthropic-agent-skills/example-skills/local/skills/webapp-testing/scripts/with_server.py \
  --server "npm run dev" --port 3000 -- python3 tests/webhook_e2e.py
```

它验证结构化请求编辑、四种 HTTP 方法、Liquid 与翻译预览、敏感 Header 脱敏、测试发送的安全关闭状态，以及 attempt 审计记录。

SMS 编辑器专项回归：

```bash
python3 /Users/ethanshen/.codex/plugins/cache/anthropic-agent-skills/example-skills/local/skills/webapp-testing/scripts/with_server.py \
  --server "npm run dev" --port 3000 -- python3 tests/sms_editor_e2e.py
```

它验证订阅组、Liquid 个性化参数、消息变体、联系人卡片和测试发送入口。

这些截图是本项目的回归基线，不是 Braze 官方页面参考图。开始逐页视觉验收前，应从当前账号可访问页面采集对应分辨率的参考截图，并以像素差异阈值替换本地基线。

Canvas SMS 本轮补充：

```bash
npm run test:sms
BASE_URL=http://127.0.0.1:3001 python3 tests/canvas-sms-api.py
```

模型测试覆盖 GSM-7 扩展字符、中文/emoji 分段、Liquid 语言分支和短链接预览。接口测试会创建并归档自己的 Canvas，验证逐收件人渲染、属性覆盖、错误校验，以及只读预览快照与 HTML 转义。需要 Node 22 或更新版本启动本地服务器。

浏览器实测和原站视觉对照见项目根目录 `design-qa.md`。Canvas 中新增 Message 后可直接选择 SMS/MMS/RCS，Done 回填节点，Canvas Save 持久化配置。测试发送仅生成本地事件；投递时间配置会保存，但没有接入智能调度或真实运营商。Operator 使用本地内容检查。当前原站账号未启用 MMS，因此联系人卡片页复刻其权限提示。

WhatsApp 补充回归：

```bash
npm run test:whatsapp
BASE_URL=http://127.0.0.1:3001 python3 tests/whatsapp-api.py
BASE_URL=http://127.0.0.1:3001 python3 tests/whatsapp-media-api.py
```

覆盖自建模板注册与审批状态、必填变量、Liquid 和兜底、按钮参数、回复选项、逐用户测试渲染、订阅组校验及关闭会话窗口的 Canvas 发布拦截。测试只产生本地模拟记录。Canvas 中新增 Message → WhatsApp 即可编辑，Done 回填节点后使用 Canvas Save 保存。已完成原站授权采集与并排视觉对照，报告见 `docs/whatsapp-reference/qa.md`。Canvas 编辑器覆盖模板列表、8 种响应布局入口、Carousel 卡片、媒体库和预览链接；Flow 与 Product 按未配置状态展示。媒体上传与预览快照有独立 HTTP 回归。
