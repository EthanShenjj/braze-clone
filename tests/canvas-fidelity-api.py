"""Canvas fidelity acceptance against an isolated localhost production server."""
import json,os,uuid
from urllib.request import Request,urlopen
from urllib.error import HTTPError
base=os.environ.get('BASE_URL','http://127.0.0.1:3220')
assert base.startswith(('http://127.0.0.1:','http://localhost:'))
prefix='canvas_fidelity_'+uuid.uuid4().hex[:8]
def api(path,method='GET',body=None,status=200):
    request=Request(base+path,method=method,headers={'Content-Type':'application/json'},data=None if body is None else json.dumps(body).encode())
    try:
        with urlopen(request) as response: code,result=response.status,json.load(response)
    except HTTPError as error: code,result=error.code,json.load(error)
    assert code==status,(path,code,result)
    return result
users=[{'id':prefix+'_us','email':prefix+'_us@example.test','country':'US'},{'id':prefix+'_gb','email':prefix+'_gb@example.test','country':'GB'}]
api('/api/users','POST',{'rows':users})
canvas=api('/api/canvases','POST',{'name':prefix+' acceptance'},201)
condition={'id':'country','field':'country','operator':'equals','value':'US'}
def node(id,kind,config=None): return {'id':id,'label':id,'kind':kind,'x':610,'y':{'entry':190,'branch':725,'gold':920,'basic':920}.get(id,725),'config':config or {}}
branch=node('branch','branch',{'segmentIds':[],'filterGroups':[{'id':'g','operator':'AND','exclude':False,'rules':[condition]}]})
graph={'nodes':[node('entry','entry'),branch,node('gold','update',{'updateMode':'ui','updates':[{'id':'u','attribute':'tier','action':'update','value':'gold'}]}),node('basic','update',{'updateMode':'json','updateJson':'{"attributes":[{"tier":"basic"}]}'} )],'edges':[['entry','branch'],['branch','gold'],['branch','basic']],'variants':[{'id':'v1','name':'Variant 1','weight':100}]}
saved=api('/api/canvases/'+canvas['id']+'/graph','PUT',{'graph':graph,'updatedAt':canvas['updatedAt']})
loaded=api('/api/canvases/'+canvas['id'])
assert all(loaded['graph'][key]==graph[key] for key in ['nodes','edges','variants'])
wizard=loaded['canvas']['wizard'];wizard['entry']['timing']='immediate';wizard['audience']['filters']=[{'id':'ids','field':'id','operator':'is_any_of','value':json.dumps([row['id'] for row in users])}]
configured=api('/api/canvases/'+canvas['id'],'PATCH',{'wizard':wizard,'updatedAt':saved['updatedAt']})
for user,expected in zip(users,[True,False]):
    assert api('/api/canvases/steps/preview','POST',{'node':branch,'workspaceId':'local','lookup':user['id']})['matches']==expected
preview=api('/api/canvases/steps/preview','POST',{'node':graph['nodes'][2],'lookup':users[0]['id']})
assert preview['after']['tier']=='gold'
assert 'tier' not in api('/api/users?q='+users[0]['id']+'&limit=1')['data'][0]['attributes']
run=api('/api/canvases/'+canvas['id']+'/launch','POST',{},201)
assert run['entered']==2 and run['completed']==2
for user,tier in zip(users,['gold','basic']): assert api('/api/users?q='+user['id']+'&limit=1')['data'][0]['attributes']['tier']==tier
context=node('context','context',{'contextVariables':[{'id':'n','name':'score','type':'Number','value':'12'},{'id':'a','name':'items','type':'Array','value':'["x","y"]'}]})
assert api('/api/canvases/steps/preview','POST',{'node':context,'lookup':users[0]['id']})['context']=={'score':12,'items':['x','y']}
api('/api/canvases/steps/preview','POST',{'node':node('bad','update',{'updateMode':'json','updateJson':'{'}),'lookup':users[0]['id']},400)
space=api('/api/resources/workspaces','POST',{'name':prefix+' destination','status':'Active','data':{}},201)
copied=api('/api/canvases/'+canvas['id'],'POST',{'action':'copy_to_workspace','workspaceId':'local','targetWorkspaceId':space['id']},201)
assert copied['workspaceId']==space['id'] and copied['status']=='Draft' and copied['wizard']['audience']['filters']==[]
assert copied['tags']==[]
api('/api/canvases/'+canvas['id'],'PATCH',{'workspaceId':space['id'],'name':'wrong workspace'},404)
api('/api/canvases/'+canvas['id'],'POST',{'action':'copy_to_workspace','targetWorkspaceId':'missing'},400)
# Dedicated brief upload, download and persistence.
boundary='canvas_fidelity_'+uuid.uuid4().hex
payload=(f'--{boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\ncanvas\r\n--{boundary}\r\nContent-Disposition: form-data; name="workspaceId"\r\n\r\nlocal\r\n--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="canvas-brief.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n').encode()+b'canvas brief fixture'+f'\r\n--{boundary}--\r\n'.encode()
with urlopen(Request(base+'/api/campaign-briefs',data=payload,headers={'Content-Type':'multipart/form-data; boundary='+boundary})) as response: brief=json.load(response)
with urlopen(base+brief['url']) as response: assert response.read()==b'canvas brief fixture'
reloaded=api('/api/canvases/'+canvas['id']);wizard=reloaded['canvas']['wizard'];wizard['brief']=brief
api('/api/canvases/'+canvas['id'],'PATCH',{'wizard':wizard,'updatedAt':reloaded['updatedAt']})
assert api('/api/canvases/'+canvas['id'])['canvas']['wizard']['brief']['name']=='canvas-brief.xlsx'
with open('/private/tmp/canvas-fidelity-fixtures.json','w') as file:json.dump({'canvasId':canvas['id'],'workspaceId':space['id'],'name':prefix,'users':[row['id'] for row in users]},file)
print('Canvas API acceptance passed: full branch rules, real user updates, dry-run preview, typed Context, graph/variant reload, isolated workspace copy, scope rejection and XLSX brief upload/download/persistence.')
# Version snapshots restore previous graphs and reject stale or foreign-workspace restores.
versioned=api('/api/canvases','POST',{'name':prefix+' versions'},201)
first=api('/api/canvases/'+versioned['id']+'/graph','PUT',{'graph':graph,'updatedAt':versioned['updatedAt']})
changed=json.loads(json.dumps(graph));changed['nodes'][2]['label']='Renamed update'
second=api('/api/canvases/'+versioned['id']+'/graph','PUT',{'graph':changed,'updatedAt':first['updatedAt']})
versions=api('/api/canvases/'+versioned['id']+'/versions')['data'];prior=next(row for row in versions if row['graph']==graph)
api('/api/canvases/'+versioned['id']+'/versions?workspaceId='+space['id'],status=404)
api('/api/canvases/'+versioned['id']+'/versions','POST',{'versionId':prior['id'],'updatedAt':first['updatedAt']},409)
restored=api('/api/canvases/'+versioned['id']+'/versions','POST',{'versionId':prior['id'],'updatedAt':second['updatedAt']})
assert restored['graph']==graph
assert api('/api/canvases/steps/preview','POST',{'node':branch,'workspaceId':space['id'],'lookup':users[0]['id']})=={'found':False}
quiet=api('/api/canvases/quiet-hours?workspaceId='+space['id'])
assert quiet['configured']==False
quiet=api('/api/canvases/quiet-hours','POST',{'workspaceId':space['id'],'start':'23:00','end':'08:00','updatedAt':quiet['updatedAt']})
assert quiet['configured'] and quiet['start']=='23:00'
api('/api/canvases/quiet-hours','POST',{'workspaceId':space['id'],'start':'23:00','end':'08:00','updatedAt':None},409)
api('/api/canvases/quiet-hours','POST',{'workspaceId':space['id'],'start':'01:00','end':'23:00','updatedAt':quiet['updatedAt']},409)

def run_graph(label,journey,send=None,audience=None):
    result=api('/api/canvases','POST',{'name':prefix+' '+label},201)
    saved=api('/api/canvases/'+result['id']+'/graph','PUT',{'graph':journey,'updatedAt':result['updatedAt']})
    wizard=result['wizard'];wizard['entry']['timing']='immediate';wizard['audience']['filters']=[{'id':'ids','field':'id','operator':'is_any_of','value':json.dumps(audience or [row['id'] for row in users])}]
    if send:wizard['send'].update(send)
    api('/api/canvases/'+result['id'],'PATCH',{'wizard':wizard,'updatedAt':saved['updatedAt']})
    return result['id'],api('/api/canvases/'+result['id']+'/launch','POST',{},201)

# Audience Paths and Experiment Paths route using explicit bindings even when edge order differs.
path_graph=json.loads(json.dumps(graph));path_graph['nodes'][1]={'id':'branch','label':'Audience Paths','kind':'audience_paths','x':650,'y':725,'config':{'paths':[{'id':'us','name':'US','filterGroups':[{'id':'g','operator':'AND','exclude':False,'rules':[condition]}],'nextNodeId':'gold'},{'id':'everyone_else','name':'Everyone Else','nextNodeId':'basic'}]}};path_graph['edges']=[['entry','branch'],['branch','basic'],['branch','gold']]
path_id,path_run=run_graph('audience paths',path_graph);assert path_run['completed']==2
assert {trace['userId']:trace['steps'][-1]['nodeId'] for trace in path_run['traces']}=={users[0]['id']:'gold',users[1]['id']:'basic'}
path_graph['nodes'][1]['kind']='experiment_paths';path_graph['nodes'][1]['config']={'paths':[{'id':'p1','name':'One','weight':0,'nextNodeId':'gold'},{'id':'p2','name':'Two','weight':100,'nextNodeId':'basic'}]}
_,experiment=run_graph('experiment paths',path_graph);assert all(trace['steps'][-1]['nodeId']=='basic' for trace in experiment['traces'])

# Controlled clock and queue assertions apply exclusively to the dedicated temporary SQLite fixture.
database=os.environ.get('BRAZE_DATABASE_PATH','')
if database:
    import sqlite3
    from datetime import datetime,timedelta,timezone
    assert database.startswith('/private/tmp/') and 'canvas-fidelity' in database
    db=sqlite3.connect(database)
    def clock(value):
        db.execute("INSERT INTO demo_state VALUES ('simulated_time',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",(value,));db.commit()
    clock('2026-12-01T12:00:00.000Z')
    context_graph={'nodes':[node('entry','entry'),context,node('delay','delay',{'delayMode':'duration','delayValue':1,'delayUnit':'Hours','personalizeDelay':True,'delayExpression':'{{canvas_context.score}}'}),node('finish','update',{'updateMode':'ui','updates':[{'id':'u','attribute':'resumed_context','action':'update','value':'true'}]})],'edges':[['entry','context'],['context','delay'],['delay','finish']]}
    context_id,context_run=run_graph('context delay',context_graph)
    assert context_run['completed']==0 and api('/api/canvases/'+context_id)['runs'][0]['nextDueAt']=='2026-12-02T00:00:00.000Z',context_run
    api('/api/demo','POST',{'action':'advance'})
    assert api('/api/canvases/'+context_id)['runs'][0]['completed']==2
    assert db.execute("SELECT count(*) FROM resources WHERE type='canvas-context' AND json_extract(data_json,'$.canvasId')=?",(context_id,)).fetchone()[0]==2
    for user in users:assert api('/api/users?q='+user['id']+'&limit=1')['data'][0]['attributes']['resumed_context']==True
    clock('2026-12-03T12:00:00.000Z')
    message_graph={'nodes':[node('entry','entry'),node('message','message',{'channel':'push','message':'Acceptance push'})],'edges':[['entry','message']]}
    quiet_id,quiet_run=run_graph('quiet delivery',message_graph,{'quietEnabled':True,'quietMode':'custom','quietStart':'11:00','quietEnd':'13:00','quietFallback':'next_available'})
    assert quiet_run['messages']==0 and api('/api/canvases/'+quiet_id)['runs'][0]['nextDueAt']=='2026-12-03T13:00:00.000Z',quiet_run
    clock('2026-12-02T13:30:00.000Z');api('/api/demo','POST',{'action':'advance'})
    assert api('/api/canvases/'+quiet_id)['runs'][0]['messages']==2
    clock('2026-12-04T12:00:00.000Z')
    abort_id,abort_run=run_graph('quiet abort',message_graph,{'quietEnabled':True,'quietMode':'custom','quietStart':'11:00','quietEnd':'13:00','quietFallback':'abort'})
    assert abort_run['completed']==2 and abort_run['messages']==0
    assert db.execute("SELECT count(*) FROM message_events WHERE campaign_id=? AND event_type='quiet_hours_aborted'",(abort_id,)).fetchone()[0]==2
    rate_users=[{'id':prefix+'_rate_'+str(index),'email':prefix+'_rate_'+str(index)+'@example.test'} for index in range(6)]
    api('/api/users','POST',{'rows':rate_users})
    rate_graph=json.loads(json.dumps(message_graph));rate_graph['nodes'].append(node('second','message',{'channel':'push','message':'Second push'}));rate_graph['edges'].append(['message','second'])
    rate_id,rate_run=run_graph('rate delivery',rate_graph,{'rateEnabled':True,'rateMode':'shared','ratePerMinute':10},[row['id'] for row in rate_users])
    assert rate_run['messages']==10 and rate_run['completed']==5,rate_run
    api('/api/demo','POST',{'action':'advance'})
    assert api('/api/canvases/'+rate_id)['runs'][0]['messages']==12
    db.close()
print('Canvas extended acceptance passed: versions and conflict/scope guards, workspace quiet hours, explicit ranked path bindings, Experiment allocation, persisted Context and personalized delay resume, quiet-hour defer/abort, and real per-minute rate queues.')
