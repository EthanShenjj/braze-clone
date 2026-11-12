"""Frequency-capping acceptance; only runs against a disposable localhost database."""
import json, os, sqlite3, uuid
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError
base = os.environ.get('BASE_URL', 'http://127.0.0.1:3235')
database = os.environ['BRAZE_DATABASE_PATH']
assert base.startswith(('http://127.0.0.1:', 'http://localhost:'))
assert database.startswith('/private/tmp/') and 'frequency-capping' in database
prefix = 'frequency_' + uuid.uuid4().hex[:8]
checks = 0
def api(path, method='GET', body=None, status=200):
    global checks
    request = Request(base + path, method=method, headers={'Content-Type': 'application/json'}, data=None if body is None else json.dumps(body).encode())
    try:
        with urlopen(request, timeout=120) as response: code, result = response.status, json.load(response)
    except HTTPError as error: code, result = error.code, json.load(error)
    assert code == status, (path, code, result)
    checks += 1
    return result
def rule(id='all', **patch): return {'id': id, 'type': 'any', 'messages': 1, 'seconds': 86400, **patch}
def save(rules, workspace='local', enabled=True, categories=None):
    old = api('/api/frequency-capping?workspaceId=' + workspace)
    return api('/api/frequency-capping', 'PUT', {'workspaceId': workspace, 'expectedUpdatedAt': old['updatedAt'], 'settings': {'enabled': enabled, 'rules': rules, 'categories': categories or []}})
old = api('/api/frequency-capping?workspaceId=local')
saved = save([rule()])
api('/api/frequency-capping', 'PUT', {'workspaceId': 'local', 'expectedUpdatedAt': old['updatedAt'], 'settings': {'enabled': False, 'rules': [], 'categories': []}}, 409)
for bad in [[rule(str(i)) for i in range(11)], [rule(type='iam')], [rule(messages=0)], [rule(seconds=31 * 86400)], [rule('duplicate'), rule('duplicate')]]:
    api('/api/frequency-capping', 'PUT', {'workspaceId': 'local', 'expectedUpdatedAt': saved['updatedAt'], 'settings': {'enabled': True, 'rules': bad, 'categories': []}}, 400)
assert api('/api/frequency-capping?workspaceId=local')['updatedAt'] == saved['updatedAt']
space = api('/api/resources/workspaces', 'POST', {'name': prefix+' scoped', 'data': {'frequencyCappingRuleLimit': 15}}, 201)['id']
assert api('/api/frequency-capping?workspaceId='+space)['capabilities']['maxRules'] == 15
remote = save([rule(str(i)) for i in range(15)], space)
api('/api/frequency-capping', 'PUT', {'workspaceId': space, 'expectedUpdatedAt': remote['updatedAt'], 'settings': {'enabled': True, 'rules': [rule(str(i)) for i in range(16)], 'categories': []}}, 400)
readonly = api('/api/resources/frequency-capping-rules', 'POST', {'name': prefix+' readonly', 'data': {'workspaceId': prefix+'_readonly', 'canEdit': False, 'enabled': True, 'rules': [rule()]}}, 201)
assert api('/api/frequency-capping?workspaceId='+prefix+'_readonly')['capabilities']['canEdit'] is False
api('/api/resources/frequency-capping-rules', 'PATCH', {'id': readonly['id'], 'data': {'workspaceId': prefix+'_readonly', 'canEdit': True, 'enabled': False, 'rules': []}}, 403)
api('/api/resources/frequency-capping-rules?id='+readonly['id'], 'DELETE', status=403)
api('/api/frequency-capping', 'PUT', {'workspaceId': prefix+'_readonly', 'expectedUpdatedAt': readonly['updatedAt'], 'settings': {'enabled': False, 'rules': [], 'categories': []}}, 403)
tag = api('/api/tags', 'POST', {'name': prefix+' Promotions', 'workspaceId': 'local'}, 201)
tag = tag.get('tag', tag.get('data', tag))
category = {'id': prefix+'_category', 'name': 'Promotions'}
save([rule('tagged', tagId=tag['id'], categoryId=category['id'])], categories=[category])
saved = api('/api/frequency-capping?workspaceId=local')
assert saved['settings']['rules'][0]['tagId'] == tag['id']
api('/api/frequency-capping', 'PUT', {'workspaceId': space, 'expectedUpdatedAt': remote['updatedAt'], 'settings': {'enabled': True, 'rules': [rule(tagId=tag['id'])], 'categories': []}}, 400)
user = prefix+'_user'
api('/api/users', 'POST', {'rows': [{'id': user, 'email': user+'@example.test', 'timezone': 'UTC'}]})
db = sqlite3.connect(database)
def clock():
    value = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    db.execute("INSERT INTO demo_state VALUES ('simulated_time',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (value,)); db.commit()
def canvas(label, policy=None, count=2):
    clock()
    result = api('/api/canvases', 'POST', {'name': prefix+' '+label}, 201)
    nodes = [{'id': 'entry', 'kind': 'entry', 'label': 'Entry', 'x': 600, 'y': 190, 'config': {}}]
    for i in range(count): nodes.append({'id': 'push'+str(i), 'kind': 'message', 'label': 'Push '+str(i), 'x': 600, 'y': 400+i*200, 'config': {'channel': 'push', 'message': 'Acceptance message', 'subject': 'Hello'}})
    nodes.append({'id': 'finish', 'kind': 'update', 'label': 'After messages', 'x': 600, 'y': 1100, 'config': {'updateMode': 'ui', 'updates': [{'id': 'mark', 'attribute': label, 'action': 'update', 'value': 'yes'}]}})
    graph = {'nodes': nodes, 'edges': [[nodes[i]['id'], nodes[i+1]['id']] for i in range(len(nodes)-1)], 'variants': [{'id': 'v1', 'name': 'Variant 1', 'weight': 100}]}
    graph_saved = api('/api/canvases/'+result['id']+'/graph', 'PUT', {'graph': graph, 'updatedAt': result['updatedAt']})
    wizard = result['wizard']; wizard['entry']['timing'] = 'immediate'
    wizard['audience']['filters'] = [{'id': 'id', 'field': 'id', 'operator': 'is_any_of', 'value': json.dumps([user])}]
    wizard['send'].update(policy or {})
    api('/api/canvases/'+result['id'], 'PATCH', {'wizard': wizard, 'updatedAt': graph_saved['updatedAt']})
    assert api('/api/canvases/'+result['id'])['canvas']['wizard']['send']['frequencyCapping'] == wizard['send']['frequencyCapping']
    run = api('/api/canvases/'+result['id']+'/launch', 'POST', {}, 201)
    return result['id'], run
save([rule()])
canvas_id, run = canvas('limited')
assert run['messages'] == 1 and run['completed'] == 1, run
assert db.execute("SELECT count(*) FROM message_events WHERE campaign_id=? AND event_type='frequency_capped'", (canvas_id,)).fetchone()[0] == 1
assert json.loads(db.execute('SELECT attributes_json FROM users WHERE id=?', (user,)).fetchone()[0])['limited'] == 'yes'
campaign_id = prefix+'_campaign'
campaign = {'id': campaign_id, 'name': campaign_id, 'channel': 'push', 'subject': 'Hello', 'body': 'Frequency acceptance', 'config': {'controlGroup': 0, 'audienceGroups': [{'id': 'g', 'operator': 'AND', 'exclude': False, 'rules': [{'id': 'id', 'field': 'id', 'operator': 'is_any_of', 'value': json.dumps([user])}]}], 'delivery': {'frequencyCapping': True}}}
api('/api/campaigns', 'POST', campaign, 201)
result = api('/api/campaigns/'+campaign_id+'/launch', 'POST', {})
assert result['run']['frequencyCapped'] == 1, result
exempt_id, exempt_run = canvas('exempt', {'frequencyCapping': False, 'excludeFromFrequencyCount': True})
assert exempt_run['messages'] == 2 and exempt_run['completed'] == 1
assert db.execute('SELECT count(*) FROM frequency_dispatches WHERE entity_id=?', (exempt_id,)).fetchone()[0] == 0
assert api('/api/frequency-capping?workspaceId='+space)['settings']['rules'] == remote['settings']['rules']
save([rule('daily', messages=3), rule('push', type='push', messages=1), rule('promo', type='push', seconds=604800, messages=2, tagId=tag['id'])], categories=[category])
with open('/private/tmp/frequency-capping-fixtures.json', 'w') as file: json.dump({'canvasId': canvas_id, 'campaignId': campaign_id, 'tagId': tag['id'], 'userId': user, 'workspaceId': space}, file)
db.close()
print(f'PASS: {checks} HTTP checks; version conflict, strict validation, 10/15 rule limits, read-only guards, scoped tags, persistence, Canvas skip/advance, Campaign/Canvas shared quota and exemption.')
