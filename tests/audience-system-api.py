"""Run against an isolated localhost database. No delivery/provider calls."""
import json, os, uuid
from urllib.request import Request, urlopen
from urllib.error import HTTPError
base=os.environ.get('BASE_URL','http://127.0.0.1:3212')
assert base.startswith(('http://127.0.0.1:','http://localhost:'))
prefix='audience_qa_'+uuid.uuid4().hex[:8]
def api(path,method='GET',body=None,status=200):
    request=Request(base+path,method=method,headers={'Content-Type':'application/json'},data=None if body is None else json.dumps(body).encode())
    try:
        with urlopen(request) as response: code,result=response.status,json.load(response)
    except HTTPError as error: code,result=error.code,json.load(error)
    assert code==status,(path,code,result)
    return result
rows=[{'id':prefix+'_a','email':prefix+'a@example.test','country':'US'},{'id':prefix+'_b','email':prefix+'b@example.test','country':'GB'},{'id':prefix+'_c','email':prefix+'c@example.test','country':'CN'}]
imported=api('/api/users','POST',{'rows':rows})
assert imported['imported']==3 and set(imported['userIds'])=={row['id'] for row in rows}
record=api('/api/resources/import-users','POST',{'name':prefix+' CSV import','status':'Active','data':{'workspaceId':'local','userIds':imported['userIds'],'completed':True,'header':['id','email','country'],'rows':[[row['id'],row['email'],row['country']] for row in rows],'imported':3,'skipped':0}},201)
caps=api('/api/campaigns/form-capabilities?workspaceId=local')
assert record['id'] in [row['id'] for row in caps['csvImports']]
assert record['id'] not in [row['id'] for row in api('/api/campaigns/form-capabilities?workspaceId='+prefix)['csvImports']]
rules=[{'id':'csv','field':'membership:csv','operator':'equals','value':'true','params':{'importId':record['id']}},{'id':'country','field':'country','operator':'is_any_of','value':json.dumps(['US','GB'])}]
segment=api('/api/resources/segments','POST',{'name':prefix+' imported US and GB','status':'Active','data':{'workspaceId':'local','filters':rules}},201)
campaign={'name':prefix+' full conditions','channel':'push','audience':'All Users','config':{'workspaceId':'local','audienceGroups':[{'id':'group','operator':'AND','exclude':False,'rules':rules}]}}
preview=api('/api/campaigns/audience-preview','POST',{'campaign':campaign,'lookup':rows[0]['id']})
assert preview['matching']==2 and preview['lookup']['matchesFilters']
canvas=api('/api/canvases','POST',{'name':prefix+' audience Canvas'},201)
criteria={'segmentIds':[segment['id']],'filters':[],'filterOperator':'AND','exclusionFilters':[],'exitSegmentIds':[],'exitFilters':[]}
saved=api('/api/canvases/'+canvas['id'],'PATCH',{'wizard':{'audience':criteria},'updatedAt':canvas['updatedAt']})
loaded=api('/api/canvases/'+canvas['id'])['canvas']
assert loaded['wizard']['audience']['segmentIds']==[segment['id']]
result=api('/api/canvases/audience-preview','POST',{'audience':loaded['wizard']['audience'],'workspaceId':'local','lookup':rows[1]['id']})
assert result['matching']==2 and result['lookup']['matchesFilters']
direct={**criteria,'segmentIds':[],'filters':rules}
assert api('/api/canvases/audience-preview','POST',{'audience':direct})['matching']==2
excluded={**direct,'exclusionFilters':[{'id':'no-gb','field':'country','operator':'equals','value':'GB'}]}
assert api('/api/canvases/audience-preview','POST',{'audience':excluded})['matching']==1
exit_criteria={**direct,'exitFilters':[{'id':'exit-us','field':'country','operator':'equals','value':'US'}]}
assert api('/api/canvases/audience-preview','POST',{'audience':exit_criteria})['matching']==1
for invalid in [dict(rules[0],params={'importId':'missing'}),{'id':'bad-date','field':'created_at','operator':'greater_than','value':'2026-02-30'},{'id':'bad-multi','field':'country','operator':'is_any_of','value':'[]'}]:
    bad={**campaign,'config':{'audienceGroups':[{'id':'invalid','operator':'AND','exclude':False,'rules':[invalid]}]}}
    api('/api/campaigns/audience-preview','POST',{'campaign':bad},400)
wrong={**rules[0],'params':{'importId':record['id']}}
api('/api/canvases/audience-preview','POST',{'audience':{**direct,'filters':[wrong]},'workspaceId':prefix},400)
with open('/private/tmp/audience-ui-fixtures.json','w') as file: json.dump({'canvasId':canvas['id'],'segmentId':segment['id'],'importId':record['id'],'name':prefix},file)
print('Audience API checks passed: actual CSV membership, scoped candidates, typed conditions, Campaign/Canvas parity, Segment reuse, saved/reloaded configuration, exclusions/exits and invalid-rule rejection.')
