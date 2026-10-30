"""Isolated channel integration regression. Refuses non-local hosts or live delivery."""
import copy,json,os,time,uuid
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from urllib.parse import urlparse

BASE=os.environ.get('BASE_URL','http://127.0.0.1:3228').rstrip('/')
assert urlparse(BASE).hostname in ('127.0.0.1','localhost'),'Use an isolated local test server.'
RUN=uuid.uuid4().hex[:8]
CHECKS=[]
COUNTERS={}
def request(path,method='GET',body=None,headers=None):
    h={'Content-Type':'application/json',**(headers or {})}
    req=Request(BASE+path,method=method,data=None if body is None else json.dumps(body).encode(),headers=h)
    try:
        with urlopen(req,timeout=120) as response:return response.status,json.load(response)
    except HTTPError as error:
        try:return error.code,json.load(error)
        except Exception:return error.code,{'error':'Non-JSON response'}
def ok(path,method='GET',body=None,headers=None):
    status,payload=request(path,method,body,headers)
    assert 200<=status<300,(path,status,payload)
    return payload
def check(label,condition):
    assert condition,label
    CHECKS.append(label)
def draft(channel,config=None,body='Hello {{${first_name} | default: "friend"}}'):
    COUNTERS[channel]=COUNTERS.get(channel,0)+1
    c={'id':f'cmp_complete_{RUN}_{channel}_{COUNTERS[channel]}','name':f'Channel completion {channel}','channel':channel,'subject':'Your message','body':body,'schedule':'One time','status':'Draft','config':{'controlGroup':0,**(config or {})}}
    return ok('/api/campaigns','POST',c)

caps=ok('/api/messages/capability')
assert not any(c['enabled'] for c in caps['channels']),'Disable live delivery before running this regression.'
line_group=ok('/api/subscription-groups','POST',{'name':f'LINE regression {RUN}','channel':'LINE'})
ok(f'/api/subscription-groups/{line_group["id"]}/members','PATCH',{'userId':'user_1','state':'subscribed'})
check('LINE groups can be created and subscribed',line_group['channel']=='LINE')
fixtures={}
for channel in ('email','iam','push','banner','content','sms','webhook','whatsapp','line','multichannel'):
    config={}
    if channel=='email':config={'emailEditorMode':'html','emailSending':{'fromName':'QA','fromAddress':'qa@example.com'},'emailPlainText':'Independent plaintext','emailPlainTextCustomized':True}
    if channel=='sms':config={'subscriptionGroupId':'sg_sms_alerts','smsVariants':[{'id':'sms_a','name':'A','body':'First variant'},{'id':'sms_b','name':'B','body':'Selected variant'}],'variantSplits':[25,75],'channelValues':{'messageType':'SMS','appendStop':True}}
    if channel=='banner':config={'channelValues':{'placement':'qa_home','priority':'Medium','editorMode':'html','html':'<div>Banner preview</div>'}}
    if channel=='content':config={'channelValues':{'cardType':'Classic','creationMode':'first_impression','expirationDays':7,'removalEvent':'custom_event','removalEventName':'remove_qa_card'}}
    if channel=='line':config={'subscriptionGroupId':line_group['id'],'channelValues':{'lineMessages':[{'type':'Text','text':'LINE {{${first_name}}}'}]}}
    if channel=='webhook':config={'channelValues':{'webhookVariants':[{'id':'webhook_a','name':'A','method':'POST','url':'https://example.com/webhook','bodyType':'json','body':'{"message":"hello"}','headers':[]}]}}
    if channel=='multichannel':config={'channelValues':{'channels':['Email','Push notification'],'rule':'Send all channels at once'},'multichannelMessages':{'email':{'name':'Embedded email','channel':'email','subject':'Embedded subject','body':'<p>Embedded email</p>','config':{'emailSending':{'fromAddress':'qa@example.com'}}},'push':{'name':'Embedded push','channel':'push','subject':'Push','body':'Embedded push','config':{}}}}
    fixtures[channel]=draft(channel,config)
    saved=ok('/api/campaigns/'+fixtures[channel]['id'])
    check(channel+' draft persists its complete configuration',saved['config']==fixtures[channel]['config'])

sms=fixtures['sms']
test=ok(f'/api/campaigns/{sms["id"]}/test','POST',{'recipient':'+15550001111','variantId':'sms_b','mode':'custom','customUser':{'first_name':'Ada'}})
check('SMS tests preserve phone number and selected variant',test['recipient']=='+15550001111' and test['variantId']=='sms_b' and test['message']['message'].startswith('Selected variant'))
check('unconfigured delivery is prepared, never falsely delivered',test['capability']['status']=='prepared' and test['capability']['delivered'] is False)
email=fixtures['email']
test=ok(f'/api/campaigns/{email["id"]}/test','POST',{'recipient':'qa@example.com','mode':'custom','customUser':{'first_name':'Ada'}})
check('email test compiles independent plaintext',test['message']['text']=='Independent plaintext')

probe=copy.deepcopy(fixtures['banner']);probe['id']=f'cmp_complete_{RUN}_bad_banner';probe['schedule']='API-triggered';ok('/api/campaigns','POST',probe)
status,p= request(f'/api/campaigns/{probe["id"]}/launch','POST',{})
check('Banner rejects unsupported API-triggered delivery',status==400 and 'scheduled' in p['error'].lower())
probe=copy.deepcopy(sms);probe['id']=f'cmp_complete_{RUN}_bad_sms';probe['config']['smsVariants'][0]['body']='A'*1601;probe['body']='A'*1601;ok('/api/campaigns','POST',probe)
check('SMS publication rejects length overflow',request(f'/api/campaigns/{probe["id"]}/launch','POST',{})[0]==400)

query={'name':'Audience QA','channel':'email','config':{'audienceGroups':[{'id':'group','operator':'OR','exclude':False,'rules':[{'id':'us','field':'country','operator':'equals','value':'US'},{'id':'cn','field':'country','operator':'equals','value':'CN'}]}]}}
estimate=ok('/api/campaigns/audience-preview','POST',{'campaign':query,'lookup':'user_1'})
check('audience preview returns computed eligibility',estimate['matching']>0 and isinstance(estimate['lookup']['matchesFilters'],bool))
query['config']['audienceGroups'].append({'id':'exclude','operator':'OR','exclude':True,'rules':query['config']['audienceGroups'][0]['rules']})
check('exclusion groups affect the actual estimate',ok('/api/campaigns/audience-preview','POST',{'campaign':query})['matching']==0)

locked=draft('email',{'controlGroup':100,'conversionEvents':[{'type':'Starts Session','app':'','deadline':3,'unit':'Days'}]},'Lock test')
ok(f'/api/campaigns/{locked["id"]}/launch','POST',{})
status,_=request(f'/api/campaigns/{locked["id"]}','PATCH',{'config':{'controlGroup':100,'conversionEvents':[{'type':'Makes Purchase','app':'','deadline':3,'unit':'Days'}]}})
check('launched conversion definitions are immutable on the API',status==400)

key=ok('/api/workspace/api-keys','POST',{'action':'create','name':f'Channel regression {RUN}','scopes':['users.track','events.track','campaigns.trigger']})['key']
authorization={'Authorization':'Bearer '+key}
trigger=draft('sms',{'subscriptionGroupId':'sg_sms_alerts','controlGroup':100,'delivery':{'timing':'now'}},'Triggered message')
trigger=ok('/api/campaigns/'+trigger['id'],'PATCH',{'schedule':'API-triggered'})
ok('/api/campaigns/'+trigger['id']+'/launch','POST',{})
queued=ok('/api/campaigns/'+trigger['id']+'/trigger','POST',{'userIds':['user_1']},authorization)
check('API-triggered Campaigns enqueue eligible users',queued['queued']==1)
processed=ok('/api/campaigns/process','POST',{}, {'Authorization':'Bearer local-channel-regression-worker'})
check('the authenticated worker processes persisted delivery jobs',any(row['status']=='Completed' for row in processed['results']))

app=ok('/api/resources/app-settings','POST',{'name':f'SDK channel QA {RUN}','status':'Active','data':{'platform':'Web','packageId':'qa.example.com','apiIdentifier':'channel-qa-'+RUN,'sdkAuthentication':'Optional'}})
sdk_headers={'X-App-Identifier':'channel-qa-'+RUN}
card=fixtures['content'];ok('/api/campaigns/'+card['id']+'/launch','POST',{})
feed=ok('/api/sdk?userId=user_1',headers=sdk_headers)
cards=[c for c in feed['content_cards'] if c['data']['campaignId']==card['id']]
check('first-impression cards materialize in the authenticated SDK feed',len(cards)==1)
ok('/api/sdk','POST',{'external_id':'user_1','message_id':cards[0]['id'],'receipt':'impression'},sdk_headers)
ok('/api/sdk','POST',{'external_id':'user_1','event':'remove_qa_card'},sdk_headers)
feed=ok('/api/sdk?userId=user_1',headers=sdk_headers)
check('configured removal events remove cards without recreating them',not any(c['data']['campaignId']==card['id'] for c in feed['content_cards']))

artifact=Path(os.environ.get('ARTIFACT_DIR','docs/implementation/campaign-channel-completion-2026-10-28'))
artifact.mkdir(parents=True,exist_ok=True)
(artifact/'api-results.json').write_text(json.dumps({'checks':CHECKS,'count':len(CHECKS),'baseUrl':BASE,'liveDelivery':False},ensure_ascii=False,indent=2))
(artifact/'fixtures.json').write_text(json.dumps({k:{'id':v['id'],'url':BASE+'/engagement/campaigns/'+v['id']+'?locale=en&step=compose'} for k,v in fixtures.items()},indent=2))
print(json.dumps({'passed':len(CHECKS),'artifact':str(artifact)},ensure_ascii=False))
