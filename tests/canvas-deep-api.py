"""Deep Canvas acceptance. All writes and controlled time use a disposable local DB."""
import json, os, sqlite3, uuid
from urllib.request import Request, urlopen
from urllib.error import HTTPError
base=os.environ.get('BASE_URL','http://127.0.0.1:3221')
database=os.environ['BRAZE_DATABASE_PATH']
assert base.startswith(('http://127.0.0.1:','http://localhost:'))
assert database.startswith('/private/tmp/') and 'canvas-fidelity-deep' in database
prefix='canvas_deep_'+uuid.uuid4().hex[:8]
def api(path,method='GET',body=None,status=200):
    request=Request(base+path,method=method,headers={'Content-Type':'application/json'},data=None if body is None else json.dumps(body).encode())
    try:
        with urlopen(request) as response: code,result=response.status,json.load(response)
    except HTTPError as error: code,result=error.code,json.load(error)
    assert code==status,(path,code,result)
    return result
users=[{'id':prefix+'_us','email':prefix+'_us@example.test','country':'US'}, {'id':prefix+'_gb','email':prefix+'_gb@example.test','country':'GB'}]
api('/api/users','POST',{'rows':users})
db=sqlite3.connect(database)
def clock(at):
    db.execute("INSERT INTO demo_state VALUES ('simulated_time',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",(at,));db.commit()
def attributes(id,patch):
    value=json.loads(db.execute('SELECT attributes_json FROM users WHERE id=?',(id,)).fetchone()[0]);value.update(patch)
    db.execute('UPDATE users SET attributes_json=? WHERE id=?',(json.dumps(value),id));db.commit()
def node(id,kind,config=None): return {'id':id,'kind':kind,'label':id,'x':610,'y':190 if id=='entry' else 725,'config':config or {}}
def graph(config,marker,delay=False):
    nodes=[node('entry','entry'),node('message','message',{'channel':'push','message':'Canvas deep acceptance',**config}),node('finish','update',{'updateMode':'ui','updates':[{'id':'u','attribute':marker,'action':'update','value':'yes'}]})]
    edges=[['entry','message'],['message','finish']]
    if delay:nodes.append(node('delay','delay',{'delayMode':'duration','delayValue':1,'delayUnit':'Hours'}));edges=[['entry','delay'],['delay','message'],['message','finish']]
    return {'nodes':nodes,'edges':edges,'variants':[{'id':'v1','name':'Variant 1','weight':100}]}
def configure(label,journey,ids=None,workspace='local',conversion=None):
    result=api('/api/canvases','POST',{'name':prefix+' '+label,'workspaceId':workspace},201)
    saved=api('/api/canvases/'+result['id']+'/graph','PUT',{'graph':journey,'updatedAt':result['updatedAt'],'workspaceId':workspace})
    wizard=result['wizard'];wizard['entry']['timing']='immediate';wizard['audience']['filters']=[{'id':'ids','field':'id','operator':'is_any_of','value':json.dumps(ids or [row['id'] for row in users])}]
    if conversion is not None:wizard['conversionEvents']=conversion
    configured=api('/api/canvases/'+result['id'],'PATCH',{'workspaceId':workspace,'wizard':wizard,'updatedAt':saved['updatedAt']})
    return result['id'],configured
def launch(id): return api('/api/canvases/'+id+'/launch','POST',{},201)
def attrs(id): return json.loads(db.execute('SELECT attributes_json FROM users WHERE id=?',(id,)).fetchone()[0])
validation={'deliveryValidationEnabled':True,'deliveryFilterGroups':[{'id':'g','operator':'AND','exclude':False,'rules':[{'id':'country','field':'country','operator':'equals','value':'US'}]}]}
clock('2026-12-10T12:00:00.000Z')
for behavior in ['exit','skip']:
    marker='deep_'+behavior
    id,_=configure('validation '+behavior,graph({**validation,'deliveryFailure':behavior},marker))
    result=launch(id);assert result['entered']==2 and result['completed']==2 and result['messages']==1,result
    assert attrs(users[0]['id'])[marker]=='yes'
    assert (marker in attrs(users[1]['id']))==(behavior=='skip')
    events=db.execute("SELECT data_json FROM message_events WHERE campaign_id=? AND event_type='suppressed'",(id,)).fetchall()
    assert any(json.loads(row[0]).get('reason')=='delivery_validation' for row in events)
# Re-check at message send, after a preceding delay and a profile change.
id,_=configure('delayed validation',graph({**validation,'deliveryFailure':'exit'},'deep_delayed',True),[users[0]['id']])
assert launch(id)['messages']==0
db.execute('UPDATE users SET country=? WHERE id=?',('GB',users[0]['id']));db.commit()
api('/api/demo','POST',{'action':'advance'})
assert api('/api/canvases/'+id)['runs'][0]['completed']==1
assert 'deep_delayed' not in attrs(users[0]['id'])
db.execute('UPDATE users SET country=? WHERE id=?',('US',users[0]['id']));db.commit()
# Per-profile optimal times are stored once, then resume without scheduling another day.
clock('2026-12-11T12:00:00.000Z');attributes(users[0]['id'],{'best_send_hour':14,'timezone':'UTC'})
id,_=configure('optimal timing',graph({'intelligentTiming':True},'deep_optimal'),[users[0]['id']]);assert launch(id)['messages']==0
assert api('/api/canvases/'+id)['runs'][0]['nextDueAt']=='2026-12-11T14:00:00.000Z'
assert db.execute("SELECT count(*) FROM resources WHERE type='canvas-send-time' AND json_extract(data_json,'$.canvasId')=?",(id,)).fetchone()[0]==1
api('/api/demo','POST',{'action':'advance'})
assert api('/api/canvases/'+id)['runs'][0]['completed']==1 and attrs(users[0]['id'])['deep_optimal']=='yes'
assert db.execute("SELECT count(*) FROM resources WHERE type='canvas-send-time' AND json_extract(data_json,'$.canvasId')=?",(id,)).fetchone()[0]==1
# Custom fallback is user-local; validation is re-evaluated at its actual due time.
clock('2026-12-12T12:00:00.000Z');attributes(users[1]['id'],{'timezone':'America/New_York'})
id,_=configure('custom fallback',graph({'intelligentTiming':True,'intelligentFallback':'custom','intelligentFallbackTime':'10:00',**validation,'deliveryFailure':'skip'},'deep_custom'),[users[1]['id']]);assert launch(id)['messages']==0
assert api('/api/canvases/'+id)['runs'][0]['nextDueAt']=='2026-12-12T15:00:00.000Z'
api('/api/demo','POST',{'action':'advance'})
assert api('/api/canvases/'+id)['runs'][0]['completed']==1 and attrs(users[1]['id'])['deep_custom']=='yes'
# Popular fallback must exclude other workspaces' profile history and best hours.
space=api('/api/resources/workspaces','POST',{'name':prefix+' scoped','status':'Active','data':{}},201)['id']
scoped=[{'id':prefix+'_scoped','email':prefix+'_scoped@example.test','workspaceId':space}, {'id':prefix+'_popular','email':prefix+'_popular@example.test','workspaceId':space,'best_send_hour':'16'}]
api('/api/users','POST',{'rows':scoped,'workspaceId':space})
clock('2026-12-13T12:00:00.000Z')
id,_=configure('popular scoped',graph({'intelligentTiming':True},'deep_popular'),[scoped[0]['id']],space);assert launch(id)['messages']==0
assert api('/api/canvases/'+id)['runs'][0]['nextDueAt']=='2026-12-13T16:00:00.000Z'
# Optimizer editor data and typed conversion properties persist without claiming an AI provider exists.
components=[{'id':'subject','type':'Subject','variants':[{'id':'a','value':'Hello {{first_name}}'},{'id':'b','value':'Welcome'}]}]
journey={'nodes':[node('entry','entry'),node('optimizer','optimizer',{'channel':'email','optimizerComponents':components,'optimizationEvent':'clicks','subject':"{% message_component 'Subject' %}",'message':'<p>Welcome</p>'})],'edges':[['entry','optimizer']]}
conversions=[{'id':'c','type':'Performs Custom Event','eventName':'purchase','appScope':'all','deadline':3,'unit':'Days','propertiesEnabled':True,'propertyFilters':[{'id':'props','operator':'AND','rules':[{'id':'amount','field':'amount','operator':'greater_than','value':'10'}]}]}, {'id':'a','type':'Starts Session','appScope':'specific','appIds':['web-app'],'deadline':2,'unit':'Hours'}]
id,_=configure('optimizer persistence',journey,conversion=conversions)
loaded=api('/api/canvases/'+id);assert loaded['graph']['nodes'][1]['config']['optimizerComponents']==components
assert loaded['canvas']['wizard']['conversionEvents'][0]['propertyFilters']==conversions[0]['propertyFilters']
assert loaded['canvas']['wizard']['conversionEvents'][1]['appIds']==['web-app']
blocked=api('/api/canvases/'+id+'/launch','POST',{},422);assert 'optimizer' in str(blocked).lower() or 'provider' in str(blocked).lower(),blocked
for resource in ['canvas-send-time','canvas-context']:
    api('/api/resources/'+resource,'POST',{'name':'forged','data':{}},400)
    api('/api/resources/'+resource,'PATCH',{'id':'forged','data':{}},400)
    api('/api/resources/'+resource+'?id=forged','DELETE',status=400)
optimizer_id=id
# Event-property suggestions use actual events and do not cross workspace boundaries.
for scope,properties in [('local',{'amount':20,'currency':'USD'}),(space,{'foreign_property':True})]:
    db.execute('INSERT INTO resources VALUES (?,?,?,?,?,?,?)',(prefix+scope,'user-events','purchase','Active','','2026-12-13T12:00:00.000Z',json.dumps({'workspaceId':scope,'userId':users[0]['id'],'properties':properties})))
db.commit()
caps=api('/api/campaigns/form-capabilities?workspaceId=local')
assert set(caps['eventProperties']['purchase'])=={'amount','currency'}
assert api('/api/campaigns/form-capabilities?workspaceId='+space)['eventProperties']['purchase']==['foreign_property']
# Deep Action Paths drafts retain the exact subtype configuration even though runtime is unavailable.
triggers=[{'id':'campaign','type':'Interact With Campaign','interaction':'opened_email'}, {'id':'sub','type':'Update Subscription Group Status','subscriptionType':'line','subscriptionState':'subscribed','updateSource':'REST API'}, {'id':'primary','type':'Perform Conversion Event'}, {'id':'commerce','type':'View product','eventName':'ecommerce.product_viewed','propertiesEnabled':True,'propertyFilters':[{'id':'p','operator':'AND','rules':[{'id':'price','field':'price','operator':'greater_than','value':'10'}]}]}]
action_graph={'nodes':[node('entry','entry'),node('actions','action_paths',{'evaluationValue':1,'evaluationUnit':'Days','rankedPaths':True,'paths':[{'id':'group_1','name':'Group 1','triggers':triggers},{'id':'everyone_else','name':'Everyone Else'}]})],'edges':[['entry','actions']]}
action_id,_=configure('action subtype persistence',action_graph)
assert api('/api/canvases/'+action_id)['graph']['nodes'][1]['config']['paths'][0]['triggers']==triggers
with open('/private/tmp/canvas-deep-fixtures.json','w') as file:json.dump({'canvasId':optimizer_id,'actionCanvasId':action_id,'workspaceId':space,'prefix':prefix,'users':[row['id'] for row in users]},file)
db.close()
print('PASS: exit/skip advancement, delayed audience revalidation, persisted optimal time resume, user-local fallback, workspace-isolated popular fallback, optimizer and conversion full-state reload, provider launch guard, runtime record write guards, workspace-scoped event properties and Action Paths subtype reload.')
