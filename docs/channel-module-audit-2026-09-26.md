# A/B 集成缺口修复（2026-09-26 第二轮）

## 发布引擎接入（此前"页面有但执行不用"的断点）

- `launchCampaign` 现在应用自建 Segment 的筛选条件（`savedSegmentFilters` + `audienceFilterClauses`，与估算共用 SQL 生成）；估算与实际发送人数一致。
- Suppression Lists 条目（邮箱/域名）在发送模拟中排除对应收件人。
- Frequency Capping 规则（启用后按渠道/窗口统计近 N 天 delivered 事件）超额用户记为 `frequency_capped`。
- 静默时段（Schedule 中的起止时间）内发送记为 `deferred`；执行快照与启动返回值携带 `deferred`/`frequencyCapped`/`suppressionListHits`。
- 受众筛选与估算新增 `attr:<key>` 自定义属性条件（`json_extract`），分群构建器的字段下拉按真实用户属性动态生成（含高频取值提示）。

## 展示与编辑器链路

- Brand Guidelines 保存后作为新建邮件（无已存样式时）的默认字体/链接色/文字色。
- Campaign 标签菜单合并 Tag Management 页创建的标签。
- Preview & Test 按 Locale 应用 subject/preheader 翻译（zh→zh-CN 别名），并接收当前 Variant 索引。
- Push 编辑器：凭证横幅读 Push Settings 的 iOS/Android 状态；语言标签页 + 按语言的 Title/Message 翻译（回退英文）；图片素材可从 Media Library 选择。
- Banner 编辑器的 Placement 下拉读 Banner Placements 设置页注册的值。
- LINE：Flex message 类型提供 JSON 编辑器 + 校验 + 预览。
- Multichannel：每个选中渠道独立内容（orchestration fallback 说明更新）。
- Operator：按目标文本生成——检测渠道（push/sms/whatsapp）、折扣百分比、优惠码、主题（welcome/back/offer/launch/event），产出各渠道文案。
- API campaign：新增 `POST /api/campaigns/[id]/events`（白名单事件类型，写入 message_events + 审计），编辑器内可直接记录外部事件。

## 报表差异化

- `/api/reports/overview` 增加按渠道计数与按活动聚合（delivered/opened/clicked/failed）。
- 12 个报表入口按主题渲染不同指标集与维度表：Performance/Engagement/Conversions/Revenue=活动明细表；Email/Push/SMS Performance/Custom Events=渠道对比表；GCG Report=治疗组 vs 控制组；Segment Insights=逐分群可达表；Dashboard Builder=已保存报表定义。

## Canvas

- Message 步骤：subject 字段 + "Open in full editor"（创建/复用 `cmp_canvas_<node>` 关联草稿并写入 linkedCampaignId）。
- Entry 步骤：Re-entry（一次/1 天/7 天/每次）与画布级转化事件（类型 + 截止天数）。

## 核实后无需修改

- Catalogs 的创建向导、CSV 导入、Selection 编辑器在 `catalog-studio.tsx` 中已完整（旧审计所指为未被路由使用的死代码）。
- 偏好中心的设计面板已含页面背景/品牌色/字体/宽度等品牌化能力。

## 验证

tsc 通过；4 个单测套件全绿；`tests/e2e_smoke.py` 通过；专项 E2E 验证：自建分群筛选接入发布（GB 分群只发给 GB 可达用户）、抑制名单减少发送量、渠道对比/活动明细表渲染、Canvas 打开完整编辑器、外部事件记录进活动日志。
