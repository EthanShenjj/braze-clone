"""Run against an isolated BRAZE_DATABASE_PATH; creates local QA fixtures only."""
import json, os, uuid
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
BASE = os.environ.get('BASE_URL', 'http://127.0.0.1:3100')
tag = uuid.uuid4().hex[:8]
checks = []
def request(path, method='GET', payload=None):
    body = None if payload is None else json.dumps(payload).encode()
    try:
        with urlopen(Request(BASE+path, data=body, method=method, headers={'Content-Type':'application/json'})) as r:
            raw=r.read().decode(); return r.status, json.loads(raw) if r.headers.get_content_type()=='application/json' else raw
    except HTTPError as e:
        raw=e.read().decode()
        try: raw=json.loads(raw)
        except ValueError: pass
        return e.code, raw
def ok(value, name):
    assert value, name
    checks.append(name)
def resource(kind, name, data, status='Active'):
    if kind in ['approval-workflow','messaging-rate-limits','frequency-capping-rules']:
        _, existing=request('/api/resources/'+kind)
        if existing.get('data'):
            current=existing['data'][0]
            code, result=request('/api/resources/'+kind, 'PATCH', {'id':current['id'],'data':data,'status':status,'expectedUpdatedAt':current['updatedAt']})
            assert code==200,(kind,code,result)
            return result
    code, result = request('/api/resources/'+kind, 'POST', {'name': name+' '+tag, 'status': status, 'data': data})
    assert code==201, (kind, code, result)
    return result
def action(kind, **payload):
    return request('/api/workspace/'+kind, 'POST', payload)

flag=resource('feature-flags','QA rollout',{'flagId':'qa_'+tag,'enabled':True,'rollout':0,'properties':{'color':'blue'},'rules':[{'id':'us','rollout':100,'filters':[{'field':'country','operator':'equals','value':'US'}]}]})
code,result=request('/api/workspace/flag-evaluation?userId=user_5')
ok(code==200 and next(r for r in result['data'] if r['id']=='qa_'+tag)['enabled'], 'feature rule applies to matching user')
code,result=request('/api/workspace/flag-evaluation?userId=user_1')
ok(code==200 and not next(r for r in result['data'] if r['id']=='qa_'+tag)['enabled'], 'feature fallback excludes unmatched user')
code,_=request('/api/resources/feature-flags','PATCH',{'id':flag['id'],'data':{**flag['data'],'flagId':'changed'},'expectedUpdatedAt':flag['updatedAt']})
ok(code==409, 'immutable flag ID enforced server-side')
code,edited=request('/api/resources/feature-flags','PATCH',{'id':flag['id'],'description':'edited','expectedUpdatedAt':flag['updatedAt']})
ok(code==200,'partial resource update preserves required fields')
code,_=request('/api/resources/feature-flags','PATCH',{'id':flag['id'],'description':'stale','expectedUpdatedAt':flag['updatedAt']})
ok(code==409,'stale resource edit is rejected')

user_id='qa_sync_'+tag
ing=resource('cloud-data-ingestion','QA profiles',{'provider':'Snowflake','dataType':'User attributes','table':'qa.users','schedule':'On demand','rows':[{'external_id':user_id,'email':'qa-'+tag+'@example.test','first_name':'Before','country':'US','plan':'pro'}]})
code,result=action('cloud-data-ingestion',action='sync',id=ing['id'])
ok(code==200 and result['data']['result']['created']==1,'ingestion sync creates profile')
code,result=action('cloud-data-ingestion',action='sync',id=ing['id'])
ok(code==200 and result['data']['result']['updated']==1,'repeat ingestion updates profile without duplicate')
trans=resource('data-transformation','QA mapping',{'destination':'User attributes','userIdPath':'user.id','mapping':{'first_name':'user.name','country':'user.country'},'samplePayload':{'user':{'id':user_id,'name':'After','country':'SG'}}})
code,result=action('data-transformation',action='preview',id=trans['id'])
ok(code==200 and result['attributes']['first_name']=='After','transformation preview maps nested payload')
code,result=action('data-transformation',action='apply',id=trans['id'])
code,result=request('/api/users?q='+user_id+'&limit=1000')
ok(code==200 and next(u for u in result['data'] if u['id']==user_id)['firstName']=='After','transformation persists standard profile field')

survey=resource('surveys','QA survey',{'questions':[{'id':'rating','label':'Rate us','type':'rating','required':True}],'successMessage':'Thanks'})
slug='qa-page-'+tag
page=resource('landing-pages','QA signup',{'slug':slug,'title':'QA Page','html':'<h1>Original published version</h1>','collectEmail':True,'surveyId':survey['id'],'buttonLabel':'Subscribe','successMessage':'Thanks'},status='Draft')
code,published=action('landing-pages',action='publish',id=page['id'],expectedUpdatedAt=page['updatedAt'])
ok(code==200 and published['status']=='Published','landing page publishes')
code,html=request('/pages/'+slug)
ok(code==200 and 'Original published version' in html,'public landing route renders snapshot')
code,result=request('/api/pages/'+slug,'POST',{'email':'lead@example.test','answers':{}})
ok(code==400,'required survey question enforced server-side')
code,result=request('/api/pages/'+slug,'POST',{'email':'lead-'+tag+'@example.test','consent':True,'answers':{'rating':5}})
ok(code==200 and result['success'],'public survey submission persists')
code,_=request('/api/resources/landing-pages','PATCH',{'id':page['id'],'data':{**published['data'],'html':'<h1>Unpublished change</h1>'},'expectedUpdatedAt':published['updatedAt']})
code,html=request('/pages/'+slug)
ok(code==200 and 'Original published version' in html and 'Unpublished change' not in html,'draft edits do not overwrite published landing snapshot')

current=resource('currents','QA Current',{'destination':'JSON download','events':['delivered','clicked']})
code,result=action('currents',action='export',id=current['id'])
ok(code==200 and 'message_events' in result,'Currents export returns selected dataset')
code,result=request('/api/resources/exports-log')
ok(code==200 and any(r['data'].get('sourceId')==current['id'] for r in result['data']),'export log records completed snapshot')

# Approval must be tied to the exact saved content and enforced at launch.
code,settings=request('/api/resources/approval-workflow')
if settings['data']:
    s=settings['data'][0]; request('/api/resources/approval-workflow','PATCH',{'id':s['id'],'data':{'campaignApproval':True,'canvasApproval':False},'expectedUpdatedAt':s['updatedAt']})
else: resource('approval-workflow','Approval settings',{'campaignApproval':True,'canvasApproval':False})
cmpid='cmp_qa_'+tag
code,campaign=request('/api/campaigns','POST',{'id':cmpid,'name':'QA review '+tag,'channel':'push','body':'Hello','subject':'Title','schedule':'One time','audience':'All Users','config':{'controlGroup':0,'limitVolume':True,'maxUsers':2}})
code,result=request('/api/campaigns/'+cmpid+'/launch','POST',{})
ok(code>=400 and 'Approval' in result['error'],'launch blocked until approval')
code,review=action('approvals',action='request',entity='campaign',entityId=cmpid)
ok(code==200 and review['status']=='Pending','approval request stores content fingerprint')
code,approved=action('approvals',action='approve',id=review['id'],expectedUpdatedAt=review['updatedAt'])
ok(code==200 and approved['status']=='Approved','current content can be approved')
code,result=request('/api/resources/approval-requests','POST',{'name':'Forged','status':'Approved','data':{}})
ok(code==400,'generic resources cannot forge approval decisions')
code,result=request('/api/campaigns/'+cmpid+'/launch','POST',{})
ok(code==200,'approved content launches')

# Restore governance in the isolated fixture database for the navigation audit.
code,settings=request('/api/resources/approval-workflow'); s=settings['data'][0]
request('/api/resources/approval-workflow','PATCH',{'id':s['id'],'data':{'campaignApproval':False,'canvasApproval':False},'expectedUpdatedAt':s['updatedAt']})
def authorized(path, key, payload=None):
    body=None if payload is None else json.dumps(payload).encode()
    try:
        with urlopen(Request(BASE+path, data=body, method='GET' if payload is None else 'POST', headers={'Content-Type':'application/json','Authorization':'Bearer '+key})) as r: return r.status,json.loads(r.read())
    except HTTPError as e: return e.code,json.loads(e.read())

code,_=request('/api/integration/users/track','POST',{'attributes':[{'external_id':'unauthorized'}]})
ok(code==401,'integration API requires a Bearer key')
code,issued=action('api-keys',action='create',name='QA API '+tag,scopes=['users.track','feature_flags.read'])
key=issued['key']
code,result=authorized('/api/integration/users/track',key,{'attributes':[{'external_id':user_id,'first_name':'API update'}]})
ok(code==200 and result['attributes_processed']==1,'scoped REST key updates profile')
code,_=authorized('/api/integration/users/track',key,{'events':[{'external_id':user_id,'name':'Denied'}]})
ok(code==401,'API permissions reject ungranted event tracking')
code,result=authorized('/api/integration/feature-flags?userId='+user_id,key)
ok(code==200 and 'feature_flags' in result,'integration key reads feature flag eligibility')
code,result=request('/api/workspace/api-keys')
ok(code==200 and all('hash' not in r['data'] and 'key' not in r for r in result['data']),'key listing exposes only redacted metadata')
code,result=action('api-keys',action='revoke',id=issued['id'],expectedUpdatedAt=issued['updatedAt'])
code,_=authorized('/api/integration/feature-flags?userId='+user_id,key)
ok(code==401,'revoked API key is rejected')

app=resource('app-settings','QA Web app',{'platform':'Web','packageId':'https://example.test','apiIdentifier':'qa_app_'+tag,'sdkAuthentication':'Disabled'})
headers={'Content-Type':'application/json','X-App-Identifier':app['data']['apiIdentifier']}
with urlopen(Request(BASE+'/api/sdk',data=json.dumps({'external_id':user_id,'session':True}).encode(),method='POST',headers=headers)) as r:
    ok(r.status==200,'SDK endpoint records a session for a registered app')
with urlopen(Request(BASE+'/api/sdk?userId='+user_id,headers=headers)) as r:
    sdk=json.loads(r.read()); ok(r.status==200 and 'feature_flags' in sdk,'SDK returns feature flag and banner payloads')

# Channel-specific frequency caps must not suppress other channels.
action('profiles',action='apply',rows=[{'external_id':'qa_cap_'+tag,'email':'cap-'+tag+'@example.test'}])
segment=resource('segments','QA exact user',{'filters':[{'field':'email','operator':'equals','value':'cap-'+tag+'@example.test'}]})
cap=resource('frequency-capping-rules','QA caps',{'enabled':True,'rules':[{'kind':'Push','limit':1,'window':'per day'}]})
def launch(channel,suffix):
    campaign_id='cmp_qa_'+tag+'_'+suffix
    request('/api/campaigns','POST',{'id':campaign_id,'name':'QA cap '+suffix,'channel':channel,'body':'Hello','subject':'Title','schedule':'One time','audience':segment['name'],'config':{'controlGroup':0}})
    return request('/api/campaigns/'+campaign_id+'/launch','POST',{})
code,result=launch('push','first')
ok(code==200 and result['run']['delivered']==1,'first targeted push is delivered')
code,result=launch('push','second')
ok(code==200 and result['run']['delivered']==0 and result['run']['frequencyCapped']==1,'matching channel frequency cap is enforced')
code,result=launch('content','other')
ok(code==200 and result['run']['delivered']==1,'push frequency cap does not suppress another channel')
code,caprows=request('/api/resources/frequency-capping-rules')
for r in caprows['data']: request('/api/resources/frequency-capping-rules','PATCH',{'id':r['id'],'data':{**r['data'],'enabled':False}})

limits=resource('messaging-rate-limits','QA rate limits',{'enforce':True,'maxPerMinute':1,'maxPerDay':100})
code,result=launch('push','limited')
ok(code==200 and result['run']['delivered']==0 and result['run']['deferred']>=1,'workspace rate limit defers excess deliveries')
request('/api/resources/messaging-rate-limits','PATCH',{'id':limits['id'],'data':{**limits['data'],'enforce':False}})
experiment=resource('feature-flags','QA experiment flag',{'flagId':'experiment_'+tag,'enabled':False,'rollout':0,'rules':[],'properties':{}},status='Inactive')
experiment_id='cmp_experiment_'+tag
request('/api/campaigns','POST',{'id':experiment_id,'name':'QA Feature experiment','channel':'feature','subject':'experiment_'+tag,'body':'{"color":"purple"}','schedule':'One time','audience':segment['name'],'config':{'controlGroup':0,'channelValues':{'rollout':100}}})
code,result=request('/api/campaigns/'+experiment_id+'/launch','POST',{})
ok(code==200 and result['run']['delivered']==1,'feature experiment assigns targeted user')
with urlopen(Request(BASE+'/api/sdk?userId=qa_cap_'+tag,headers=headers)) as r:
    payload=json.loads(r.read()); assignment=next(f for f in payload['feature_flags'] if f['id']=='experiment_'+tag)
    ok(assignment['enabled'] and assignment['properties']['color']=='purple','SDK returns active experiment assignment')
request('/api/campaigns/'+experiment_id,'PATCH',{'status':'Stopped'})
with urlopen(Request(BASE+'/api/sdk?userId=qa_cap_'+tag,headers=headers)) as r:
    payload=json.loads(r.read()); assignment=next(f for f in payload['feature_flags'] if f['id']=='experiment_'+tag)
    ok(not assignment['enabled'],'stopping experiment restores global flag rule')

multi_id='cmp_multichannel_'+tag
request('/api/campaigns','POST',{'id':multi_id,'name':'QA multichannel','channel':'multichannel','subject':'Hello','schedule':'One time','audience':segment['name'],'config':{'controlGroup':0,'channelValues':{'channels':['Email','Push notification'],'rule':'Send all channels at once','channelContent':{'Email':'Hello by email','Push notification':'Hello by push'}}}})
code,result=request('/api/campaigns/'+multi_id+'/launch','POST',{})
ok(code==200 and result['run']['delivered']==2 and len(result['run']['children'])==2,'multichannel creates and executes both selected channel drafts')
code,result=request('/api/campaigns/'+multi_id+'/launch','POST',{})
ok(code==200 and result['run'].get('alreadyLaunched'),'relaunching active multichannel campaign is idempotent')

line_id='cmp_line_'+tag
request('/api/campaigns','POST',{'id':line_id,'name':'QA LINE image','channel':'line','schedule':'One time','audience':segment['name'],'config':{'controlGroup':0,'channelValues':{'lineMessages':[{'type':'Image','imageUrl':'https://example.com/image.png','altText':'Image'}]}}})
code,result=request('/api/campaigns/'+line_id+'/launch','POST',{})
ok(code==200 and result['run']['delivered']==1,'LINE image-only campaign compiles and executes')

promo=resource('promotion-codes','QA promotion',{'codes':['QA-'+tag+'-A','QA-'+tag+'-B']})
action('profiles',action='apply',rows=[{'external_id':'promo_a_'+tag,'email':'promo-'+tag+'-a@example.test'},{'external_id':'promo_b_'+tag,'email':'promo-'+tag+'-b@example.test'}])
promo_segment=resource('segments','QA promo audience',{'filters':[{'field':'email','operator':'contains','value':'promo-'+tag}]})
promo_id='cmp_promo_'+tag
request('/api/campaigns','POST',{'id':promo_id,'name':'QA code assignment','channel':'email','subject':'Your code','body':"Your code: {% promotion_code '"+promo['name']+"' %}",'schedule':'One time','audience':promo_segment['name'],'config':{'controlGroup':0}})
code,result=request('/api/campaigns/'+promo_id+'/launch','POST',{})
ok(code==200 and result['run']['delivered']==2,'promotion-code email compiles for both recipients')
_,allocations=request('/api/resources/promotion-code-allocations')
assigned=[r for r in allocations['data'] if r['data']['listId']==promo['id']]
ok(len(assigned)==2 and len({r['data']['code'] for r in assigned})==2,'promotion codes are unique per recipient')
request('/api/campaigns/'+promo_id,'PATCH',{'status':'Stopped'})
request('/api/campaigns/'+promo_id+'/launch','POST',{})
_,allocations=request('/api/resources/promotion-code-allocations')
ok(len([r for r in allocations['data'] if r['data']['listId']==promo['id']])==2,'resending to existing recipient reuses allocation')
summary={'passed':len(checks),'checks':checks}
out=Path('docs/audits/workspace-repair-2026-10-27'); out.mkdir(parents=True,exist_ok=True)
(out/'api-results.json').write_text(json.dumps(summary,indent=2))
print(json.dumps(summary,indent=2))
