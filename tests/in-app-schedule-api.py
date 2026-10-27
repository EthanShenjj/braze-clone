"""IAM schedule persistence and metadata contract; isolated localhost only."""
import copy, json, os, uuid
from urllib.request import Request,urlopen
from urllib.error import HTTPError
base=os.environ.get('BASE_URL','http://127.0.0.1:3215')
assert base.startswith(('http://127.0.0.1:','http://localhost:'))
checks=[]
def api(path,body=None,method=None,status=200):
 req=Request(base+path,method=method or ('POST' if body is not None else 'GET'),headers={'Content-Type':'application/json'},data=None if body is None else json.dumps(body).encode())
 try:
  with urlopen(req,timeout=60) as r: code,value=r.status,json.load(r)
 except HTTPError as e:code,value=e.code,json.load(e)
 assert code==status,(path,code,value)
 return value
key=uuid.uuid4().hex[:8];uid='schedule_api_'+key
api('/api/workspace/profiles',{'action':'apply','rows':[{'external_id':uid,'email':uid+'@example.com'}]})
api('/api/workspace/profiles',{'action':'track','userId':uid,'name':key+'_account_opened','properties':{'account_type':'savings','balance':1500,'verified':True}})
metadata=api('/api/workspace/delivery-metadata')
event=next(row for row in metadata['events'] if row['name']==key+'_account_opened')
assert event['properties']=={'account_type':'string','balance':'number','verified':'boolean'}
assert 'savings' not in json.dumps(event) and uid not in json.dumps(metadata)
checks.append('event options aggregate names and types without exposing profile property values')
source=api('/api/campaigns/cmp_iam');source['id']='cmp_schedule_api_'+key;source['status']='Draft';source['name']='Schedule API QA'
delivery={'schemaVersion':2,'iamTriggers':[{'id':'custom','type':'Perform Custom Event','eventName':key+'_account_opened','filtersEnabled':True,'filterGroups':[{'id':'g1','match':'any','conditions':[{'id':'c1','property':'balance','operator':'gt','value':'500','valueType':'number'}]}]},{'id':'session','type':'Start Session','specificApp':False}], 'delayMode':'delay','delayValue':30,'delayUnit':'seconds','delayMinutes':.5,'startDate':'2026-10-27','sendTime':'09:00','endEnabled':True,'endTime':'2026-10-29T09:00','timezone':'Company time','reeligible':True,'reentryValue':2,'reentryUnit':'hours','reentryDays':2/24,'iamPriority':'High'}
source['config']={**source.get('config',{}),'delivery':delivery}
api('/api/campaigns',source,status=201)
assert api('/api/campaigns/'+source['id'])['config']['delivery']==delivery
checks.append('multiple triggers, property groups, second precision and re-entry interval persist unchanged')
bad=copy.deepcopy(delivery);bad['iamTriggers']=[]
api('/api/campaigns/'+source['id'],{'config':{**source['config'],'delivery':bad}},'PATCH')
result=api('/api/campaigns/'+source['id']+'/launch',{},status=400)
assert 'trigger' in result['error'].lower()
assert api('/api/campaigns/'+source['id'])['status']=='Draft'
checks.append('server prevents launching a draft with no triggers')
bad=copy.deepcopy(delivery);bad['endTime']='2026-10-26T09:00'
api('/api/campaigns/'+source['id'],{'config':{**source['config'],'delivery':bad}},'PATCH')
result=api('/api/campaigns/'+source['id']+'/launch',{},status=400)
assert 'end time' in result['error'].lower()
checks.append('server prevents launching an invalid campaign interval')
api('/api/campaigns/'+source['id'],{'config':source['config']},'PATCH')
print(json.dumps({'passed':len(checks),'checks':checks,'campaignId':source['id']},indent=2))
