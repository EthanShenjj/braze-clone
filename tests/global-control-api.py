"""Use an isolated server/database, never production.
BASE_URL=http://127.0.0.1:3210 BRAZE_TEST_DATABASE_PATH=/tmp/braze-gcg-replica.sqlite python3 tests/global-control-api.py
"""
import csv
import io
import json
import os
import sqlite3
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

BASE = os.environ.get('BASE_URL', 'http://127.0.0.1:3210')
DATABASE = os.environ['BRAZE_TEST_DATABASE_PATH']
assert BASE.startswith(('http://127.0.0.1:', 'http://localhost:')), 'Local isolated server required'

def request(path, method='GET', payload=None):
    req = Request(BASE + path, data=None if payload is None else json.dumps(payload).encode(), method=method, headers={'Content-Type': 'application/json'})
    try:
        with urlopen(req) as response:
            body = response.read().decode()
            return response.status, json.loads(body) if 'application/json' in response.headers.get('Content-Type', '') else body
    except HTTPError as error:
        return error.code, json.loads(error.read())

def settings():
    status, data = request('/api/global-control-group')
    assert status == 200, data
    return data

def save(action, **values):
    return request('/api/global-control-group', 'PATCH', {'action': action, 'expectedUpdatedAt': settings()['updatedAt'], **values})

def members():
    status, text = request('/api/global-control-group/export')
    assert status == 200, text
    return {row['external_user_id'] for row in csv.DictReader(io.StringIO(text))}

def campaign(channel='push', tags=None, extra=None, active=False):
    value = {'id': 'cmp_gcg_' + uuid4().hex[:10], 'name': 'Global control regression', 'channel': channel, 'status': 'Active' if active else 'Draft', 'subject': 'Control test', 'body': 'Local control test', 'config': {'controlGroup': 0, 'tags': tags or [], **(extra or {})}}
    status, result = request('/api/campaigns', 'POST', value)
    assert status == 201, result
    return result['id']

def launch(identifier):
    status, result = request('/api/campaigns/' + identifier + '/launch', 'POST')
    assert status == 200, result
    return [dict(row) for row in conn.execute('SELECT * FROM message_events WHERE campaign_id=?', (identifier,))]

def delivered(rows):
    return {row['user_id'] for row in rows if row['event_type'] == 'delivered'}

def canvas(tags=None, delay=False):
    status, value = request('/api/canvases', 'POST', {'name': 'Control Canvas ' + uuid4().hex[:10], 'tags': tags or []})
    assert status == 201, value
    identifier = value['id']
    wizard = value['wizard']
    wizard['entry']['timing'] = 'immediate'
    wizard['audience']['filters'] = [{'id': 'all', 'field': 'country', 'operator': 'is_not', 'value': '__not_a_country__'}]
    status, value = request('/api/canvases/' + identifier, 'PATCH', {'wizard': wizard})
    assert status == 200, value
    nodes = [ {'id': 'entry', 'kind': 'entry', 'label': 'Entry', 'x': 100, 'y': 100}, {'id': 'send', 'kind': 'message', 'label': 'Push', 'x': 500, 'y': 100, 'config': {'channel': 'push', 'message': 'Control test'}} ]
    edges = [['entry', 'send']]
    if delay:
        nodes.insert(1, {'id': 'delay', 'kind': 'delay', 'label': 'Wait', 'x': 300, 'y': 100, 'config': {'durationHours': 24}})
        edges = [['entry', 'delay'], ['delay', 'send']]
    state = request('/api/canvases/' + identifier)[1]
    status, value = request('/api/canvases/' + identifier + '/graph', 'PUT', {'graph': {'nodes': nodes, 'edges': edges}, 'updatedAt': state['updatedAt']})
    assert status == 200, value
    return identifier

def enter(identifier):
    status, result = request('/api/canvases/' + identifier + '/launch', 'POST')
    assert status == 201, result
    return {trace['userId'] for trace in result['traces']}

assert not settings()['settings']['enabled'], 'Start with a fresh isolated database'
conn = sqlite3.connect('file:' + DATABASE + '?mode=ro', uri=True)
conn.row_factory = sqlite3.Row
tag = 'Transactional_' + uuid4().hex[:8]
draft_tag = 'Draft_' + uuid4().hex[:8]
campaign(tags=[tag], active=True)
campaign(tags=[draft_tag])
assert tag in settings()['availableTags'] and draft_tag not in settings()['availableTags']
assert save('update-exclusions', exclusionTags=[draft_tag])[0] == 400
assert save('update-exclusions', exclusionTags=[tag])[0] == 200
assert not settings()['settings']['enabled'], 'Editing exclusions must not enable holdout'
for value in [0, 16, 5.5, '5', None]:
    assert save('enable', percentage=value)[0] == 400
assert save('enable', percentage=15)[0] == 200
initial = settings()
control = members()
assert len(control) == initial['counts']['control'] > 0
assert 0 < initial['counts']['sample'] < initial['counts']['treatment']
assert initial['counts']['total'] == initial['counts']['control'] + initial['counts']['treatment']
assert save('enable', percentage=5)[0] == 409
assert save('update-exclusions', exclusionTags=[])[0] == 200
assert members() == control, 'Tag updates must not reshuffle membership'
assert request('/api/global-control-group', 'PATCH', {'action': 'disable', 'expectedUpdatedAt': initial['updatedAt']})[0] == 409
assert request('/api/resources/global-control-group', 'POST', {'name': 'Bypass', 'data': {'enabled': True}})[0] == 400
rows1 = launch(campaign())
rows2 = launch(campaign())
assert delivered(rows1) == delivered(rows2)
assert not delivered(rows1) & control
assert {row['user_id'] for row in rows1 if row['event_type'] == 'global_control'}
assert not {row['user_id'] for row in rows1 if row['event_type'] == 'control'} & control
ab = launch(campaign(extra={'controlGroup': 50}))
assert {row['user_id'] for row in ab if row['event_type'] == 'control'}
assert not {row['user_id'] for row in ab if row['event_type'] == 'control'} & control
unexempt = request('/api/audience/estimate?engagement=campaign&channel=push')[1]
assert unexempt['reachable'] == len(delivered(rows1))
untagged_canvas = canvas()
assert not enter(untagged_canvas) & control
assert save('update-exclusions', exclusionTags=[tag])[0] == 200
exempt = launch(campaign(tags=['another', tag]))
assert delivered(exempt) & control
# SMS and WhatsApp use the same global guard before their provider preparation.
for channel, group, config in [('sms', 'sg_sms_alerts', {}), ('whatsapp', 'sg_whatsapp_updates', {'whatsappVariants': [{'id': 'wa_control', 'name': 'Variant 1', 'mode': 'response', 'responseLayout': 'text', 'responseBody': 'Local control test', 'conversationWindowOpen': True}]})]:
    assert not delivered(launch(campaign(channel, extra={'subscriptionGroupId': group, **config}))) & control
    assert delivered(launch(campaign(channel, [tag], {'subscriptionGroupId': group, **config}))) & control

assert request('/api/audience/estimate?engagement=campaign&channel=push&tag=' + tag)[1]['reachable'] > unexempt['reachable']
# Canvas-only tags must also be candidates and grant the same exemption.
canvas_tag = 'Canvas_' + uuid4().hex[:8]
exempt_canvas = canvas([canvas_tag])
assert request('/api/canvases/' + exempt_canvas, 'PATCH', {'status': 'Active'})[0] == 200
assert canvas_tag in settings()['availableTags']
assert save('update-exclusions', exclusionTags=[tag, canvas_tag])[0] == 200
entered = enter(exempt_canvas)
first_reachable = {row[0] for row in conn.execute('SELECT id FROM users WHERE reachable=1 ORDER BY id LIMIT 10')}
assert entered == first_reachable
# Exemptions do not override unsubscribe. Ensure the target remains reachable.
user_id = next(row['id'] for row in conn.execute('SELECT id FROM users WHERE reachable=1') if row['id'] in control)
assert request('/api/users', 'PATCH', {'id': user_id, 'subscribed': False})[0] == 200
email = launch(campaign('email', [tag]))
assert user_id not in delivered(email)
assert next(row for row in email if row['user_id'] == user_id)['event_type'] == 'suppressed'
assert request('/api/users?q=' + user_id)[1]['data'][0]['globalControlGroup'] is True
# New users are bucketed automatically without changing existing members.
assert request('/api/users', 'POST', {'rows': [{'id': 'gcg_new_' + uuid4().hex[:12] + str(i), 'email': 'gcg' + str(i) + '@example.test'} for i in range(100)]})[0] == 200
assert control <= members()
assert settings()['counts']['total'] == initial['counts']['total'] + 100
assert request('/api/global-control-group/report')[1]['deliveries']['control'] > 0
# API campaigns are exempt; Content Cards still obey holdout.
assert delivered(launch(campaign('api'))) & control
assert not delivered(launch(campaign('content'))) & control
# Existing delayed users are rechecked if their Canvas tag exemption is removed.
waiting_canvas = canvas([canvas_tag], delay=True)
waiting = enter(waiting_canvas)
current_first = {row[0] for row in conn.execute('SELECT id FROM users WHERE reachable=1 ORDER BY id LIMIT 10')}
assert waiting == current_first
assert save('update-exclusions', exclusionTags=[tag])[0] == 200
assert request('/api/demo', 'POST', {'action': 'advance'})[0] == 200
resumed = [dict(row) for row in conn.execute('SELECT * FROM message_events WHERE campaign_id=?', (waiting_canvas,))]
assert not delivered(resumed) & control
assert save('disable')[0] == 200
assert not settings()['settings']['enabled'] and settings()['counts']['control'] == 0
assert request('/api/global-control-group/export')[0] == 409
assert delivered(launch(campaign())) & control
assert save('enable', percentage=15)[0] == 200
assert members() != control, 'Recreating a group must reshuffle users'
assert save('disable')[0] == 200
assert save('update-exclusions', exclusionTags=[])[0] == 200
print('PASS: stable global membership; Campaign/Canvas holdout; any-tag exemption; active-tag picker; estimates; subscription safety; new users; API exception; pending sends; CSV; lifecycle; concurrency')
