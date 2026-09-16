# 浏览器回归测试

执行命令：

```bash
python3 /Users/ethanshen/.codex/plugins/cache/anthropic-agent-skills/example-skills/local/skills/webapp-testing/scripts/with_server.py \
  --server "npm run dev" --port 3000 -- python3 tests/e2e_smoke.py
```

测试覆盖真实 URL 的 Campaign 列表、Campaign 创建与发布 API、Email Compose 深链接、活动日志，以及报表事件联动。运行时会在 `tests/artifacts/` 生成 1440×900 的本地视觉基线截图。

这些截图是本项目的回归基线，不是 Braze 官方页面参考图。开始逐页视觉验收前，应从当前账号可访问页面采集对应分辨率的参考截图，并以像素差异阈值替换本地基线。
