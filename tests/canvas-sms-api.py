"""SMS test preparation validates groups, renders recipients, and records local-only results."""
import json
import os
from uuid import uuid4
from urllib.request import Request, urlopen
from urllib.error import HTTPError

BASE = os.environ.get('BASE_URL', 'http://127.0.0.1:3001')
def request(path, body=None, method=None):
    req = Request(BASE + path, data=json.dumps(body).encode() if body is not None else None,
                  headers={'Content-Type': 'application/json'}, method=method)
    try:
        with urlopen(req) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        return error.code, json.load(error)

_, canvas = request('/api/canvases', {'name': 'SMS API regression ' + uuid4().hex[:8]})
canvas_id = canvas['id']
config = {'nodeId': 'sms_regression', 'message': "Hi {{${first_name} | default: 'friend'}} https://example.com", 'subscriptionGroupId': 'sg_sms_alerts', 'recipients': ['user_1', 'user_2'], 'linkShortening': True}
status, result = request(f'/api/canvases/{canvas_id}/sms-test', config)
assert status == 200, result
assert len(result['tests']) == 2
assert result['capability'] == {'mode': 'simulation', 'delivered': False}
assert all('https://brz.ai/XXXXXXXX' in row['message'] for row in result['tests'])
assert all('{{' not in row['message'] for row in result['tests'])
status, result = request(f'/api/canvases/{canvas_id}/sms-test', {**config, 'override': True, 'profile': {'first_name': 'Override'}})
assert status == 200 and all(row['message'].startswith('Hi Override') for row in result['tests']), result
for patch in [{'subscriptionGroupId': ''}, {'subscriptionGroupId': 'sg_email_promotions'}, {'message': ''}, {'recipients': []}, {'message': '{% if %}broken'}, {'profile': []}]:
    status, result = request(f'/api/canvases/{canvas_id}/sms-test', {**config, **patch})
    assert status == 400, (patch, status, result)
status, result = request('/api/canvases/missing/sms-test', config)
assert status == 400
request(f'/api/canvases/{canvas_id}', {'status': 'Archived'}, 'PATCH')
status, preview = request('/api/sms/preview', {'message': 'Snapshot <script>alert(1)</script>'})
assert status == 200 and preview['url'].startswith('/sms/preview/')
with urlopen(BASE + preview['url']) as response:
    page = response.read().decode()
assert '&lt;script&gt;alert(1)&lt;/script&gt;' in page
assert request('/api/sms/preview', {'message': ''})[0] == 400
print('PASS: SMS local test rendering, overrides, validation, and simulation-only result')
