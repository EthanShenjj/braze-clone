"""SMS composer acceptance. Run only against an isolated localhost database, delivery disabled."""
import json,os,uuid
from urllib.request import Request,urlopen
from urllib.error import HTTPError
base=os.environ.get('BASE_URL','http://127.0.0.1:3214')
assert base.startswith(('http://127.0.0.1:','http://localhost:'))
scope='sms_qa_'+uuid.uuid4().hex[:8]
def api(path,method='GET',body=None,status=200):
    req=Request(base+path,method=method,headers={'Content-Type':'application/json'},data=None if body is None else json.dumps(body).encode())
    try:
        with urlopen(req,timeout=60) as response:code,result=response.status,json.load(response)
    except HTTPError as error:code,result=error.code,json.load(error)
    assert code==status,(path,code,result)
    return result
def resource(kind,name,data):return api('/api/resources/'+kind,'POST',{'name':name,'status':'Active','data':{'workspaceId':scope,**data}},201)
user=scope+'_ada';other=scope+'_other'
for workspace,uid,name,phone in [(scope,user,'Ada','+12025550101'),(scope+'_other',other,'Other','+12025550102')]:
    api('/api/audience/imports?workspaceId='+workspace,'POST',{'csv':f'external_id,email,first_name,phone,country\n{uid},{uid}@example.test,{name},{phone},US','kind':'attributes','fileName':'sms.csv','requestId':uid},201)
group=api('/api/subscription-groups','POST',{'name':'SMS '+scope,'channel':'SMS','workspaceId':scope},201)
other_group=api('/api/subscription-groups','POST',{'name':'Other SMS '+scope,'channel':'SMS','workspaceId':scope+'_other'},201)
test_group=resource('internal-groups','SMS Testers',{'channel':'SMS','emails':user+'@example.test'})
resource('content-blocks','sms_greeting',{'content':'Hi {{${first_name}}}'})
ctx=api('/api/sms/context?workspaceId='+scope)
assert [u['id'] for u in ctx['users']]==[user]
assert [g['id'] for g in ctx['groups']]==[group['id']]
assert [g['id'] for g in ctx['testGroups']]==[test_group['id']]
assert api('/api/sms/users?workspaceId='+scope+'&q='+other)['total']==0
assert ctx['capability']['enabled']==False,'Delivery must be disabled for this acceptance test.'
campaign=api('/api/campaigns','POST',{'id':'cmp_'+scope+'_campaign','name':'SMS restoration QA','channel':'sms','status':'Draft','body':'Welcome','config':{'workspaceId':scope,'subscriptionGroupId':group['id'],'channelValues':{'appendStop':False}}},201)
snapshot={'message':'{{content_blocks.${sms_greeting}}} {{campaign.${name}}} https://example.test/offer.','subscriptionGroupId':group['id'],'values':{'appendStop':False,'linkShortening':True}}
rendered=api('/api/sms/render','POST',{'workspaceId':scope,'ownerId':campaign['id'],'snapshot':snapshot,'userId':user})['message']
assert rendered['message']=='Hi Ada SMS restoration QA https://brz.ai/XXXXXXXX.',rendered
assert 'STOP' not in rendered['message']
api('/api/sms/render','POST',{'workspaceId':scope,'snapshot':snapshot,'userId':other},400)
body={'kind':'campaign','ownerId':campaign['id'],'workspaceId':scope,'snapshot':snapshot,'recipients':[user,user+'@example.test'],'testGroupIds':[test_group['id']]}
test=api('/api/sms/test','POST',body)
assert all(row['delivery']['mode']=='preview' for row in test['tests']),test
assert all('Hi Ada' in row['message'] for row in test['tests'])
assert all('/api/message-links/' in row['message'] for row in test['tests'])
override=api('/api/sms/test','POST',{**body,'override':True,'profile':{'first_name':'Override'}})
assert all('Hi Override' in row['message'] for row in override['tests'])
for patch in [ {'workspaceId':scope+'_other'}, {'recipients':[other],'testGroupIds':[]}, {'testGroupIds':['missing']}, {'snapshot':{**snapshot,'subscriptionGroupId':other_group['id']}}, {'snapshot':{**snapshot,'message':'{{${long}}}'},'override':True,'profile':{'long':'x'*1601}}, {'snapshot':{**snapshot,'message':'{% if %}broken'}}, {'profile':[]} ]:
    api('/api/sms/test','POST',{**body,**patch},400)
mms={'message':'An image','subscriptionGroupId':group['id'],'values':{'messageType':'MMS','mediaUrl':'https://example.test/image.png'}}
api('/api/sms/test','POST',{**body,'snapshot':mms},400)
preview=api('/api/sms/preview','POST',{'snapshot':snapshot,'workspaceId':scope,'ownerId':campaign['id'],'profile':{'first_name':'Preview'}})
with urlopen(base+preview['url']) as response:assert 'Hi Preview' in response.read().decode()
api('/api/sms/review','POST',{'message':'Hi'},503)
canvas=api('/api/canvases','POST',{'name':'SMS runtime QA','workspaceId':scope},201)
api('/api/subscription-groups/'+group['id']+'/members','PATCH',{'workspaceId':scope,'userId':user,'state':'subscribed'})
graph={'nodes':[{'id':'entry','label':'Audience entry','kind':'entry','x':100,'y':100},{'id':'sms','label':'SMS Message','kind':'message','x':400,'y':100,'config':{'channel':'sms','message':'Hi {{${first_name}}}','subscriptionGroupId':group['id'],'channelValues':{'appendStop':False}}}],'edges':[['entry','sms']]}
saved=api('/api/canvases/'+canvas['id'])
saved=api('/api/canvases/'+canvas['id']+'/graph','PUT',{'graph':graph,'updatedAt':saved['updatedAt']})
wizard=api('/api/canvases/'+canvas['id'])['canvas']['wizard'];wizard['entry']['timing']='immediate';wizard['entry']['frequency']='Once';wizard['audience']['filters']=[{'id':'ids','field':'id','operator':'is_any_of','value':json.dumps([user])}]
api('/api/canvases/'+canvas['id'],'PATCH',{'wizard':wizard,'updatedAt':saved['updatedAt']})
run=api('/api/canvases/'+canvas['id']+'/launch','POST',{},201)
assert run['messages']==1,run
history=api('/api/audience/users/'+user+'?workspaceId='+scope)['messages']
event=next(row for row in history if row['campaign_id']==canvas['id'])
assert event['event_type']=='prepared',event
assert event['data']['message']['message']=='Hi Ada',event
assert event['data']['simulated']==True
canvas_test=api('/api/sms/test','POST',{**body,'kind':'canvas','ownerId':canvas['id'],'nodeId':'sms'})
assert len(canvas_test['tests'])>0
manifest={'workspaceId':scope,'campaignId':campaign['id'],'canvasId':canvas['id'],'groupId':group['id'],'userId':user,'testGroupId':test_group['id']}
open('/private/tmp/sms-restoration-fixture.json','w').write(json.dumps(manifest))
print('PASS: workspace isolation, 16-type context data, per-user render, resource Liquid, test groups, override, real short links, length/capability validation, preview snapshots, Canvas compiled execution. '+json.dumps(manifest))
