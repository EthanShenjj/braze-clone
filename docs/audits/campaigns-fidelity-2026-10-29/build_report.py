"""Build the local audit ledger and screenshot gallery without changing product code."""
from pathlib import Path
from datetime import datetime, timezone, timedelta
from collections import Counter
import csv
import hashlib
import html
import json
from PIL import Image

ROOT = Path(__file__).resolve().parent
FINDINGS = json.loads((ROOT / 'findings.json').read_text())
TOPICS = {
    '00': ('首次加载记录', '最初 Braze 列表曾加载受阻；后续已恢复，正常列表见 01。此图不用于判定缺失。'),
    '01': ('Campaigns 列表', '状态、列、排序、分页和全局布局对比。记录条数、名称和账号数据不同，不作为缺陷。'),
    '02': ('列表高级筛选', '原版筛选目录与本地简化面板。'),
    '03': ('列表列配置', '列目录、全选及复选语义差异。'),
    '04': ('创建活动菜单', '渠道入口、分组、图标与可见布局。'),
    '05': ('公共发送计划', '类型、默认 Timing、控制项；默认立即发送与 Review 不一致已复现。IAM 有独立发送计划组件。'),
    '06': ('目标受众', '分群、筛选、查询、A/B、抑制名单及人口统计。'),
    '07': ('转化设置', '类型目录、事件说明与默认值；原版截图部分为浏览器中文翻译，语言本身不计差异。'),
    '08': ('Review Summary', 'Agentic Standards、摘要和步骤状态；本地旧草稿默认值不一致。'),
    '09': ('公共 Campaign Details', 'Campaign brief 区块、ID、详情卡。'),
    '10': ('邮件发送设置', '发送设置入口已存在；核对身份字段、权限状态、Liquid 和布局。'),
    '11': ('状态筛选目录', '原版 Archived / Idle 与本地选项范围。'),
    '12': ('行操作与跨工作区复制', 'Copy to workspace 的首步弹窗已截图；未执行复制。'),
    '13': ('批量操作', '原版 Archive 与 Tag as；未执行归档。'),
    '14': ('IAM 优先级', '本地 Schedule 内已有优先级管理；列表入口和弹窗结构仍不一致。'),
    '15': ('邮件 Advanced', '附件、Headers、Extras，与本地高级设置对照。'),
    '16': ('邮件 HTML 编辑器', '代码、预览、功能导航与工具状态。'),
    '17': ('Gmail Promotion 缺失页', '保存原版完整配置界面；本地没有对应页面。'),
    '18': ('Push 编辑与平台设置', '同时预览、语言、iOS/Android 高级字段；未验证真实推送。'),
    '19': ('Scheduled 频率', '原版 Once/Daily/Weekly/Monthly。核心周期选项在本地存在，不记为整项缺失。'),
    '20': ('Intelligent Timing', 'fallback、quiet hours 与投递预览。'),
    '21': ('Action-Based', '原版 22 项触发器目录与周期配置；本地公共组件仅四类。'),
    '22': ('API-Triggered 发送计划', '原版 Campaign ID 与 API 示例区。注意这不是独立的 API Campaign 类型。'),
    '23': ('IAM Traditional', '独立平台点击行为、Dark mode、颜色配置与 Settings。Accessibility 和 KVP 本地均存在。截图含不同滚动位置。'),
    '24': ('Banner', 'Placement 字段本地已存在；差异在选择流程、全屏外壳、积木和工具栏。'),
    '25': ('Content Card', '设备预览、平台行为、语言、Accessibility；本地生命周期控制已存在。'),
    '26': ('SMS / MMS / RCS', '当前订阅组能力门槛及 Contact Card 状态。原版真实 MMS/RCS 深层编辑被账号能力限制。'),
    '27': ('Webhook', '初始模板页、Credential、代码字段、请求预览与部署提示。未执行外部请求。'),
    '28': ('WhatsApp', '订阅组、WABA、八种布局、Text response 及语言/URL preview。八种布局不应误记为全部缺失。'),
    '29': ('LINE', 'Launch editor、全屏积木与工具栏；本地五条消息堆栈已存在。'),
    '30': ('Multichannel', '渠道选择、渠道标签、子变体与表单结构。'),
    '31': ('Multichannel 旧预览缺陷', '当前 Push 内容与公共预览/测试弹窗不一致的本地复现。'),
    '32': ('邮件 Drag-and-drop', '原版外层导航可见，但 Bee iframe 持续停留加载进度，Done 禁用。只比较外层，不验收内部积木及拖拽行为。'),
    '33': ('API Campaign', '独立配置页与普通五步流程的差异；另有本地创建菜单底部裁切截图。'),
    '34': ('Feature Flag Experiment', '原版四步实验与本地五步活动流程；原账号无 flags，属性深层分支待验证。'),
    '35': ('BrazeAI Operator', '右侧 AI 对话与本地 operator 活动类型的差异。原版面板主要由像素截图证明，DOM 未完整收录。'),
    '36': ('Active Campaign Analytics', '原版活动详情、性能表和历史趋势；本地 Active 活动名称进入编辑器。'),
    '37': ('Funnel Report 试用限制', '原版提示免费试用不可用。此图仅记录权限门槛，不代表已检验漏斗页内容。'),
    '38': ('活动变更记录缺失页', '按类别/用户筛选的变更表；当前原版为空记录状态。'),
    '39': ('Campaign Monitoring 缺失页', '阈值、时段与 Email/Webhook 通知配置；未保存。'),
    '40': ('User Lookup 弹窗', '原版 ID 查询弹窗与本地行内查询入口差异；未查询真实用户。'),
    '41': ('受众筛选目录', '原版类别菜单与本地固定字段表单。截图只显示当前视口的菜单部分，完整条目见 DOM。'),
    '42': ('Calculation Queue 缺失弹窗', '原版计算队列当前为空，列名及弹窗已保存。'),
    '43': ('受众统计展开状态', '精确人数、最近计算、渠道占比和 LTV 展开区域。'),
}

BLOCKERS = {'00-braze-list-loading-blocker', '32-braze-email-drag', '32-braze-email-drag-loading-blocker'}
GATES = {'37-braze-funnel-trial-gate'}

def check_image(path):
    data = path.read_bytes()
    assert data[:3] == b'\xff\xd8\xff' and data[-2:] == b'\xff\xd9', path
    with Image.open(path) as img:
        assert img.format == 'JPEG', path
        width, height = img.size
        img.verify()
    with Image.open(path) as img:
        img.load()
    return width, height, data

snapshots = []
for path in sorted(ROOT.glob('*.jpg')):
    stem = path.stem
    dom = ROOT / (stem + '.dom.txt')
    assert dom.exists() and dom.stat().st_size > 0, dom
    width, height, data = check_image(path)
    status = 'loading-record' if stem in BLOCKERS else 'account-gate' if stem in GATES else 'captured-viewport'
    snapshots.append({
        'id': stem, 'topic': stem[:2], 'topic_title': TOPICS[stem[:2]][0],
        'source': 'Braze' if '-braze-' in stem else 'Local',
        'image': path.name, 'mime_type': 'image/jpeg', 'dom': dom.name,
        'width': width, 'height': height, 'bytes': len(data),
        'sha256': hashlib.sha256(data).hexdigest(),
        'saved_at': datetime.fromtimestamp(path.stat().st_mtime, timezone(timedelta(hours=8))).isoformat(),
        'status': status,
        'note': TOPICS[stem[:2]][1],
        'findings': [f['id'] for f in FINDINGS if stem in f['evidence']],
    })

by_id = {s['id']: s for s in snapshots}
for finding in FINDINGS:
    assert finding['evidence'], finding['id']
    for stem in finding['evidence']:
        assert stem in by_id, (finding['id'], stem)
assert len({f['id'] for f in FINDINGS}) == len(FINDINGS)
assert len(list(ROOT.glob('*.dom.txt'))) == len(snapshots)
(ROOT / 'snapshots.json').write_text(json.dumps(snapshots, ensure_ascii=False, indent=2) + '\n')

with (ROOT / 'findings.csv').open('w', encoding='utf-8-sig', newline='') as file:
    writer = csv.DictWriter(file, fieldnames=['id','area','priority','type','title','braze','local','reproduction','evidence','status'])
    writer.writeheader()
    for finding in FINDINGS:
        writer.writerow({**finding, 'evidence': ' | '.join(s + '.jpg' for s in finding['evidence'])})

def md_link(stem):
    return f'[{stem}.jpg]({stem}.jpg) / [DOM]({stem}.dom.txt)'

ledger = ['# Campaigns 复刻差异清单', '',
    '本轮检查于 2026-10-29 采集，2026-10-30 继续整理。以下为已观察到的页面差异，不等同于真实发送、后端能力或权限漏洞结论。所有条目当前均为 Open，本轮只记录未实施修复。', '',
    'P1：主要工作流、配置能力、页面缺失或会误导编辑结果的行为问题。P2：局部交互、视觉、文案与权限状态呈现差异。优先级针对 1:1 复刻验收，不是安全评级。', '',
    '每项包含原版行为、本地差异、复现入口、证据和复刻验收方向。截图为原始视口，页面下方字段可结合 DOM 快照查看。', '']
for area in dict.fromkeys(f['area'] for f in FINDINGS):
    ledger += [f'## {area}', '']
    for f in (f for f in FINDINGS if f['area'] == area):
        ledger += [f'### {f["id"]} [{f["priority"]}] {f["title"]}', '',
            f'- 类型 / 状态：{f["type"]} / {f["status"]}。',
            f'- 原版：{f["braze"]}',
            f'- 本地：{f["local"]}',
            f'- 复现入口：{f["reproduction"]}。',
            '- 证据：' + '；'.join(md_link(s) for s in f['evidence']) + '。',
            '- 验收方向：在相同渠道、消息类型和账号能力下，逐项恢复上述原版配置、入口和状态；行为缺陷需保证编辑、预览和摘要读取一致的数据。', '']
(ROOT / 'FINDINGS.md').write_text('\n'.join(ledger))

priorities = Counter(f['priority'] for f in FINDINGS)
source_counts = Counter(s['source'] for s in snapshots)
state_counts = Counter(s['status'] for s in snapshots)
area_counts = Counter(f['area'] for f in FINDINGS)
total_bytes = sum(s['bytes'] for s in snapshots)

readme = [
    '# Campaigns 对照 Braze 的复刻审计与截图归档', '',
    f'当前页面仍不满足 1:1 复刻。本轮记录 **{len(FINDINGS)} 项差异（P1 {priorities["P1"]} / P2 {priorities["P2"]}）**，保存 **{len(snapshots)} 张原始 JPEG 和 {len(snapshots)} 份同名 DOM 快照**。采集日期为 2026-10-29，2026-10-30 继续完成整理。', '',
    '[打开截图画廊](index.html) · [完整差异清单](FINDINGS.md) · [CSV 待办表](findings.csv) · [JSON 清单](findings.json) · [截图元数据与 SHA-256](snapshots.json)', '',
    '## 主要结论', '',
    '- 缺失的不只是样式：Gmail Promotion、跨工作区复制、统计队列、已上线活动分析/历史趋势、活动变更记录与监控设置，均缺少本地对应页面或入口。',
    '- API Campaign、Feature Flag Experiment、Operator 使用了与原版不同的创建流程；Banner、LINE 也没有复刻原版全屏编辑流程。',
    '- 已复现三类数据不一致：公共发送计划的默认 Timing 与 Review 不一致；旧草稿的转化编辑默认值与 Review 不一致；多渠道公共预览使用旧消息内容。',
    '- Email 发送设置、IAM 的 Accessibility/KVP/优先级管理、Banner Placement、Content Card 生命周期、LINE 五条消息堆栈，以及 WhatsApp 八种布局已存在；本报告没有把这些误记为整项缺失。', '',
    '## 范围与证据口径', '',
    '- 对照用户给出的 Braze 工作区与 IAM 草稿链接，使用已登录 Chrome 的独立审计标签；所有渠道、公共步骤和已上线 IAM 详情均通过可见界面检查。',
    '- 本地预览使用 127.0.0.1:3000 和隔离 SQLite：`/private/tmp/braze-channel-recheck-20261029.sqlite`。本轮本地交互仅用于复现与截图，未将应用代码修复混入审计。',
    '- 原版主要为 1440×749，本地普通活动约 1425×741，部分全屏页为 1440×749。未统一视口和完全相同数据，因此不报告像素相似度百分比。',
    '- 数据数量、账号名称、活动名、真实 provider 数据、试用天数和浏览器中英翻译不作为复刻问题。权限相关条目只记录当前可见状态，不推断后端权限缺陷。',
    '- 未发布/启动活动、未发测试消息、未提交外部 Webhook、未复制或归档原版活动、未保存告警；已打开的配置弹窗以取消或关闭退出。',
    '- 101 张指保存文件总数，不代表 101 个独立完整页面。截图是视口快照，不是整页长图；同一页不同状态可能有多张。DOM 补充未进入截图视口的字段，不能证明未呈现的像素样式。',
    f'- 当前有 {state_counts["captured-viewport"]} 张正常界面视口、{state_counts["loading-record"]} 张加载记录、{state_counts["account-gate"]} 张试用门槛记录。加载图不作为完整编辑器验收证据。', '',
    '原版参考：[用户指定 IAM 草稿](https://dashboard-09.braze.com/engagement/campaigns/6ae2d0de5e731b00885db684/6ad0b98fe4b4110085216601?locale=en) · [Campaigns 列表](https://dashboard-09.braze.com/engagement/campaigns/campaigns/6ad0b98fe4b4110085216601?locale=en) · [已上线 IAM 分析](https://dashboard-09.braze.com/engagement/campaigns/6ad0b99b485c580061eb1dca/6ad0b98fe4b4110085216601?page=-2&locale=en)', '',
    '## 差异分布', '',
    '| 区域 | 项数 |', '|---|---:|',
]
readme += [f'| {area} | {count} |' for area, count in area_counts.items()]
readme += [
    '', '## 最需要先复现的行为问题', '',
    '1. **CMP-018，Timing 默认值。** 打开缺少 `delivery.timing` 的 Audit email 草稿，Schedule 下拉显示立即发送，却展开日期与频率；不改配置转到 Review，摘要是 designated times / No upcoming messages scheduled。代码定位：`app/ui/campaign-schedule.tsx` 的默认 `now` 与条件 `d.timing !== "now"`，以及 `app/ui/dashboard.tsx` 的 Review 默认 `designated`。',
    '2. **CMP-032，转化默认值。** 使用没有 `config.conversionEvents`、旧字段为 Make Purchase 的草稿，Assign 显示 Starts Session，Review 显示 Made Purchase。代码定位：`app/ui/campaign-conversions.tsx` 与 `app/ui/dashboard.tsx` 中 `conversionEvents()` 的回退规则。',
    '3. **CMP-070，多渠道旧预览。** Audit multichannel 的 Push 表单是 Retained push / Push remains，公共 Preview and test 却显示旧 Audit title / Hello first_name。截图 30、31 可直接对照。', '',
    '## 尚未验证的分支', '',
    '| 分支 | 本轮状态 / 边界 |', '|---|---|',
    '| 邮件拖拽编辑器内部 | Bee iframe 持续加载，Done 禁用；已保存两张加载记录。外层导航可核对，内部积木、拖拽、行属性不判通过或缺失。 |',
    '| Funnel / Retention Report | Funnel 点击后提示免费试用不可用，已截图。Retention 同级入口可见但未进入，内部页面待有权限时检查。 |',
    '| MMS / RCS / Contact Card 的真实富媒体流程 | 原账号订阅组能力限制；只比较当前可见门槛，未检验有权限后的富媒体编辑。 |',
    '| Feature Flag 选中后的属性 | 原版无可用 flags，只验证空状态和步骤，后续属性分支待查。 |',
    '| WhatsApp / LINE 深层消息类型 | 初始流程、类型入口及主要编辑器已检查；Carousel、Flow、Product、Flex 等全部子属性和真实 provider 行为尚未穷举。 |',
    '| IAM 全部模板、Roku、Web 与自定义代码 | 本轮重点是传统 Mobile Modal 和现有本地编辑器；未穷举所有模板和平台组合。 |',
    '| 发送、审批、发布、停止、归档与复制提交 | 不执行最终提交；入口和可见配置可检验，执行结果不做结论。 |',
    '| Schedule 所有周期 / 时区 / 事件属性组合 | 主类型及主要目录已查，未穷举全部日期、时区、事件属性组合。 |',
    '| 空列表、无搜索结果、后端失败、离线和窄屏 | 未做完整状态矩阵；本轮以当前桌面视口和成功加载状态为主。 |',
    '| 键盘与辅助技术 | 已发现本地 Columns 用非按钮 span、部分排序缺少按钮语义、创建菜单底部不可见等风险；未做屏幕阅读器和完整 WCAG 验证。 |', '',
    '因此这份清单是本轮已进入页面中观察到的完整记录，不能宣称已穷尽 Braze 所有许可、模板与平台状态。继续验收应沿上述待验证分支补齐。', '',
    '## 截图主题索引', '',
    '| 编号 | 页面 / 状态 | 截图数量 | 查看 |', '|---|---|---:|---|',
]
for topic, (title, note) in TOPICS.items():
    group = [s for s in snapshots if s['topic'] == topic]
    if group:
        readme.append(f'| {topic} | {title} | {len(group)} | [画廊](index.html#topic-{topic}) · [首张]({group[0]["image"]}) |')
readme += ['', '## 缺失页面的原版截图示例', '',
    '邮件 Gmail Promotion：', '', '![Braze Gmail Promotion](17-braze-gmail-promotion.jpg)', '',
    '活动监控设置：', '', '![Braze Campaign Monitoring](39-braze-campaign-monitoring.jpg)', '',
    '## 文件校验', '',
    f'- Braze 截图 {source_counts["Braze"]} 张，本地截图 {source_counts["Local"]} 张；JPEG 总计约 {total_bytes / 1024 / 1024:.1f} MiB。',
    '- 每张 JPEG 均校验JPEG 文件签名、尺寸、完整性与可解码性；每张有非空同名 DOM。差异条目引用的所有证据文件均存在。',
    '- `snapshots.json` 保存原文件 SHA-256、尺寸、文件大小和保存时间。截图以工具返回的原始 JPEG 字节保存，未重编码、裁剪或修饰。`build_report.py` 仅生成本地报告，不访问 Braze 或修改应用。',
    '- 画廊的本地链接、图片数量、CSV 行数与内嵌 JavaScript 语法已检查。浏览器策略禁止自动导航到本地 `file://`，因此未完成画廊搜索和筛选的浏览器交互验收；HTML 文件可手动打开。',
    '- 重新生成：在本目录运行 `python3 build_report.py`。', '',
]
(ROOT / 'README.md').write_text('\n'.join(readme))

def esc(value):
    return html.escape(str(value), quote=True)

def card(s):
    status_labels = {'captured-viewport':'已截图', 'loading-record':'加载记录 · 内部未验收', 'account-gate':'账号能力受限'}
    return f'''<article class="shot" data-source="{s['source']}" data-state="{s['status']}">
      <header><strong>{esc(s['id'])}</strong><span class="badge {s['status']}">{status_labels[s['status']]}</span></header>
      <a href="{s['image']}" target="_blank" rel="noopener"><img loading="lazy" width="{s['width']}" height="{s['height']}" src="{s['image']}" alt="{esc(s['topic_title'])}，{s['source']}，{esc(s['id'])}"></a>
      <footer><span>{s['width']} × {s['height']}</span><a href="{s['image']}" target="_blank" rel="noopener">原始 JPEG ↗</a><a href="{s['dom']}" target="_blank" rel="noopener">DOM 快照 ↗</a></footer>
    </article>'''

sections = []
for topic, (title, note) in TOPICS.items():
    group = [s for s in snapshots if s['topic'] == topic]
    if not group:
        continue
    relevant = [f for f in FINDINGS if any(e[:2] == topic for e in f['evidence'])]
    search = ' '.join([topic, title, note] + [f['id'] + ' ' + f['title'] + ' ' + f['area'] for f in relevant]).lower()
    columns = []
    for source in ['Braze', 'Local']:
        shots = [s for s in group if s['source'] == source]
        contents = ''.join(card(s) for s in shots) if shots else '<p class="empty">本主题没有单独截图；请结合相关差异条目的对照证据。</p>'
        columns.append(f'<div class="column" data-source="{source}"><h3>{"Braze 原版" if source == "Braze" else "本地复刻"}</h3>{contents}</div>')
    issues = ''.join(f'''<details><summary><span class="priority {f['priority']}">{f['priority']}</span> {f['id']} · {esc(f['title'])}</summary><p><b>原版：</b>{esc(f['braze'])}</p><p><b>本地：</b>{esc(f['local'])}</p><p class="muted">入口：{esc(f['reproduction'])}</p></details>''' for f in relevant)
    sections.append(f'''<section class="topic" id="topic-{topic}" data-topic="{topic}" data-search="{esc(search)}"><div class="topic-heading"><span class="number">{topic}</span><div><h2>{esc(title)}</h2><p>{esc(note)}</p></div><a href="#top" class="top-link">回到顶部 ↑</a></div><div class="compare">{''.join(columns)}</div><div class="issues">{issues}</div></section>''')

options = ''.join(f'<option value="{topic}">{topic} · {esc(title)}</option>' for topic, (title, _) in TOPICS.items())
gallery = '''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Campaigns · Braze 复刻审计截图</title><style>
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f5f6f8;color:#17202c;font:15px/1.65 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:#5735ac;text-decoration:none}a:hover{text-decoration:underline}.wrap{max-width:1620px;margin:auto;padding:32px}.hero{padding:22px 0 26px}.eyebrow{font-size:12px;letter-spacing:.14em;color:#667085}h1{font-size:34px;line-height:1.25;letter-spacing:-.03em;margin:10px 0 15px}h2{font-size:22px;margin:0}h3{font-size:13px;color:#667085;margin:0 0 9px}.lead{max-width:1050px;color:#475467}.stats{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0}.stat{border:1px solid #e2e5ea;background:white;border-radius:10px;padding:12px 22px;min-width:150px}.stat b{font-size:27px;display:block;line-height:1.3}.stat span{font-size:12px;color:#667085}.links{display:flex;gap:22px;flex-wrap:wrap}.toolbar{position:sticky;top:0;z-index:2;background:rgba(245,246,248,.97);border-block:1px solid #dce0e6;padding:16px 0;display:flex;gap:12px;align-items:center;flex-wrap:wrap}.toolbar input,.toolbar select{padding:10px 13px;border:1px solid #cbd2db;border-radius:7px;background:white;color:#17202c;font:inherit}.toolbar input{flex:1;min-width:240px}.toolbar select{max-width:330px}.count{font-size:13px;color:#667085}.topic{background:white;border:1px solid #e1e5eb;border-radius:12px;margin:28px 0;padding:24px;scroll-margin-top:100px}.topic-heading{display:flex;gap:16px;margin:0 0 22px}.topic-heading p{margin:7px 0 0;color:#667085}.number{flex:none;display:grid;place-items:center;width:40px;height:40px;background:#eeebf6;border-radius:9px;color:#56329f;font-weight:700}.top-link{font-size:12px;margin-left:auto;white-space:nowrap}.compare{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px}.shot{border:1px solid #dfe4eb;border-radius:8px;overflow:hidden;margin-bottom:20px;background:white}.shot header{padding:10px 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #e5e8ed}.shot strong{font-size:12px;overflow-wrap:anywhere}.badge{font-size:10px;border-radius:4px;background:#edf5ef;color:#245c36;padding:2px 7px;white-space:nowrap}.loading-record,.account-gate{background:#fff3db;color:#7a5209}.shot img{display:block;width:100%;height:auto;background:#f0f1f3}.shot footer{padding:10px 12px;font-size:11px;display:flex;gap:15px;border-top:1px solid #e5e8ed}.shot footer span{color:#667085;margin-right:auto}.empty{padding:45px 20px;border:1px dashed #d7dce3;color:#818a98;text-align:center;border-radius:8px}.issues{margin-top:7px}details{border-top:1px solid #e5e8ed;padding:12px 0}summary{cursor:pointer;font-size:13px;font-weight:600}details p{font-size:13px;margin:9px 0}.priority{display:inline-block;min-width:28px;color:#81501e;background:#fff2df;border-radius:4px;text-align:center;margin-right:5px;font-size:11px}.P2{color:#456079;background:#eef3f8}.muted{color:#667085}.footer{margin:30px 0;color:#667085;font-size:12px}.hidden{display:none!important}@media(max-width:900px){.wrap{padding:18px}.compare{grid-template-columns:1fr}.topic{padding:16px}.toolbar{position:static}h1{font-size:27px}.top-link{display:none}}
</style></head><body><main class="wrap" id="top"><header class="hero"><div class="eyebrow">CAMPAIGNS FIDELITY AUDIT · 2026.10.29 — 10.30</div><h1>逐页对照 Braze，保留差异证据。</h1><p class="lead">当前仍未达到 1:1 复刻。以下保存原始截图与同名页面结构快照，点击图片查看原尺寸。每个主题下可以展开具体差异；账号数据、浏览器翻译与不同视口不计作产品缺陷。</p><div class="stats">''' + f'''<div class="stat"><b>{len(FINDINGS)}</b><span>差异条目 · 全部待处理</span></div><div class="stat"><b>{len(snapshots)}</b><span>原始截图 + 同名 DOM</span></div><div class="stat"><b>{priorities['P1']} / {priorities['P2']}</b><span>P1 / P2 · 复刻验收优先级</span></div><div class="stat"><b>3 + 1</b><span>加载记录 / 试用门槛记录</span></div></div>''' + '''<nav class="links"><a href="README.md">审计说明</a><a href="FINDINGS.md">完整差异清单</a><a href="findings.csv" download>下载 CSV</a><a href="snapshots.json">截图元数据</a></nav></header><div class="toolbar"><input id="search" type="search" placeholder="搜索页面、渠道、差异编号，例如 Email 或 CMP-018" aria-label="搜索截图主题"><select id="topic" aria-label="筛选主题"><option value="all">全部主题</option>''' + options + '''</select><select id="source" aria-label="筛选来源或受限状态"><option value="all">原版 + 本地</option><option value="Braze">只看 Braze</option><option value="Local">只看本地</option><option value="limited">只看加载 / 权限限制</option></select><span class="count" id="count"></span></div>''' + ''.join(sections) + '''<p class="footer">只读审计归档。截图不是整页长图；加载记录不用于内部编辑器验收。发送、发布、真实 provider、全部模板和平台组合的边界见审计说明。所有资源均从当前目录加载，无外部图片或脚本。</p></main><script>
const search=document.getElementById('search'),topic=document.getElementById('topic'),source=document.getElementById('source'),count=document.getElementById('count');
function filter(){let n=0,imgs=0;const q=search.value.trim().toLowerCase();document.querySelectorAll('.topic').forEach(section=>{const match=(!q||section.dataset.search.includes(q))&&(topic.value==='all'||section.dataset.topic===topic.value);let visibleShots=0;section.querySelectorAll('.shot').forEach(shot=>{const show=source.value==='all'||shot.dataset.source===source.value||(source.value==='limited'&&shot.dataset.state!=='captured-viewport');shot.classList.toggle('hidden',!show);if(show)visibleShots++});section.querySelectorAll('.column').forEach(col=>{const has=[...col.querySelectorAll('.shot')].some(s=>!s.classList.contains('hidden'));col.classList.toggle('hidden',source.value!=='all'&&!has)});const visible=match&&visibleShots>0;section.classList.toggle('hidden',!visible);if(visible){n++;imgs+=visibleShots}});count.textContent=n+' 个主题 · '+imgs+' 张截图'}
search.addEventListener('input',filter);topic.addEventListener('change',filter);source.addEventListener('change',filter);filter();
</script></body></html>'''
(ROOT / 'index.html').write_text(gallery)

result = {'findings': len(FINDINGS), 'priorities': dict(priorities), 'screenshots': len(snapshots), 'dom_snapshots': len(list(ROOT.glob('*.dom.txt'))), 'source_counts': dict(source_counts), 'capture_states': dict(state_counts), 'all_jpeg_verified_and_decoded': True, 'all_evidence_links_exist': True, 'gallery_browser_preview': 'Blocked by browser file:// protocol policy; static links and script syntax checked separately.'}
(ROOT / 'validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
