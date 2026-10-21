"""Local WhatsApp snapshot tests. No messages are dispatched to a provider."""
import copy
import json
import os
from uuid import uuid4
from urllib.request import Request, urlopen
from urllib.error import HTTPError
BASE = os.environ.get('BASE_URL', 'http://127.0.0.1:3001')
def req(path, body=None, method=None):
    request = Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, method=method, headers={'Content-Type':'application/json'})
    try:
        with urlopen(request) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except HTTPError as error: return error.code, json.load(error)

cid = 'cmp_wa_regression_' + uuid4().hex[:10]
variant = {'id':'wa_1','name':'Variant 1','mode':'template','businessAccount':'demo_waba','subscriptionGroup':'WhatsApp updates','templateId':'order_update_en','language':'English (US)','headerType':'none','variables':[{'key':'1','label':'Order','value':'{{${first_name}}}','fallback':'friend'},{'key':'2','label':'Status','value':'packed','fallback':''}],'buttonUrl':'https://example.com/orders/{{1}}'}
config = {'subscriptionGroupId':'sg_whatsapp_updates','whatsappVariants':[variant]}
status, campaign = req('/api/campaigns', {'id':cid,'name':cid,'channel':'whatsapp','status':'Draft','schedule':'One time','audience':'All Users','conversion':'Start Session','body':'Your order is packed.','config':config})
assert status == 201, campaign
payload = {'campaignId':cid,'config':config,'variantId':'wa_1','recipients':['user_1','user_2']}
status, result = req('/api/whatsapp/test', payload)
assert status == 200, result
assert len(result['tests']) == 2 and result['capability'] == {'mode':'simulation','delivered':False}
assert all('{{' not in row['message'] for row in result['tests'])
assert result['tests'][0]['message'] != result['tests'][1]['message']
status, result = req('/api/whatsapp/test', {**payload,'override':True,'profile':{'first_name':'Override'}})
assert status == 200 and all('Override' in row['message'] for row in result['tests']), result
for patch in [{'config':{**config,'subscriptionGroupId':'sg_sms_alerts'}},{'variantId':'missing'},{'recipients':[]},{'profile':[]},{'campaignId':'missing'}]:
    status, result = req('/api/whatsapp/test', {**payload,**patch})
    assert status == 400, (patch,status,result)
for update in [{'templateId':'unknown'},{'variables':[]},{'mode':'response','responseLayout':'text','responseBody':'Hello','conversationWindowOpen':False},{'mode':'response','responseLayout':'quick_reply','responseBody':'Hello','conversationWindowOpen':True,'quickReplies':['A','A']}]:
    bad = {**config,'whatsappVariants':[{**variant,**update}]}
    status, result = req('/api/whatsapp/test', {**payload,'config':bad})
    assert status == 400, (update,status,result)
status, result = req(f'/api/campaigns/{cid}/test', {'recipient':'user_1'})
assert status == 200 and result['tests'][0]['message'], result
_, canvas = req('/api/canvases', {'name':'WhatsApp API ' + uuid4().hex[:8]})
canvas_id = canvas['id']
status, result = req('/api/whatsapp/test', {**payload,'campaignId':None,'canvasId':canvas_id,'nodeId':'wa_step'})
assert status == 200, result
# An expired/closed reply cannot be launched from a saved Canvas either.
graph = {'nodes':[{'id':'entry','kind':'entry','label':'Entry','x':0,'y':0},{'id':'wa_step','kind':'message','label':'WhatsApp','x':200,'y':200,'config':{**config,'channel':'whatsapp','message':'Hi','whatsappVariants':[{**variant,'mode':'response','responseLayout':'text','responseBody':'Hi','conversationWindowOpen':False}]}}], 'edges':[['entry','wa_step']]}
assert req(f'/api/canvases/{canvas_id}/graph', {'graph':graph}, 'PUT')[0] == 200
status, result = req(f'/api/canvases/{canvas_id}/launch', {}, 'POST')
assert status == 422 and '24-hour' in result['error'], result
req(f'/api/canvases/{canvas_id}', {'status':'Archived'}, 'PATCH')
req(f'/api/campaigns/{cid}', None, 'DELETE')
print('PASS: WhatsApp recipient rendering, overrides, variants, subscription-group validation, campaign and Canvas test routes, and closed-window launch rejection')
