"""Audience management HTTP regression; run only against an isolated localhost DB."""
import json, os, uuid
from urllib.request import Request, urlopen
from urllib.error import HTTPError

base=os.environ.get('BASE_URL','http://127.0.0.1:3213')
assert base.startswith(('http://127.0.0.1:','http://localhost:'))
scope='audience_full_'+uuid.uuid4().hex[:8]

def api(path,method='GET',body=None,status=200):
    request=Request(base+path,method=method,headers={'Content-Type':'application/json'},data=None if body is None else json.dumps(body).encode())
    try:
        with urlopen(request) as response: code,result=response.status,json.load(response)
    except HTTPError as error: code,result=error.code,json.load(error)
    assert code==status,(path,code,result)
    return result

def resource(kind,name,data,status='Active'):
    return api('/api/resources/'+kind,'POST',{'name':name,'status':status,'data':{'workspaceId':scope,**data}},201)

uid=scope+'_user'
imported=api('/api/audience/imports?workspaceId='+scope,'POST',{'csv':f'external_id,email,country\n{uid},{uid}@example.test,US','kind':'attributes','fileName':'audience-qa.csv','requestId':scope},201)
assert imported['data']['userIds']==[uid]
assert imported['id'] not in [row['id'] for row in api('/api/audience/imports?workspaceId=local')['data']]
assert api('/api/audience/users?q='+uid+'&workspaceId='+scope)['total']==1
assert api('/api/audience/users?q='+uid+'&workspaceId=local')['total']==0
profile='/api/audience/users/'+uid+'?workspaceId='+scope
assert api(profile)['user']['attributes']['workspaceId']==scope
api('/api/audience/users/'+uid+'?workspaceId=local',status=404)
api(profile,'PATCH',{'action':'push-subscription','state':'opted_in'})
assert api(profile)['user']['attributes']['push_subscription_status']=='opted_in'

group=api('/api/subscription-groups','POST',{'name':scope+' email','channel':'Email','workspaceId':scope},201)
other_group=api('/api/subscription-groups','POST',{'name':scope+' email','channel':'Email','workspaceId':scope+'_other'},201)
assert other_group['id']!=group['id']
api('/api/subscription-groups','POST',{'name':scope+' email','channel':'Email','workspaceId':scope},400)
api(profile,'PATCH',{'action':'group-subscription','groupId':other_group['id'],'state':'subscribed'},404)
api(profile,'PATCH',{'action':'group-subscription','groupId':group['id'],'state':'unsubscribed'})
assert next(row for row in api(profile)['groups'] if row['id']==group['id'])['state']=='unsubscribed'
center=api('/api/preference-centers?workspaceId='+scope,'POST',{'name':scope+' center','groupIds':[group['id']],'config':{}},201)
saved=api('/api/preference-centers/'+center['id']+'?workspaceId='+scope,'PATCH',{'name':scope+' edited','expectedVersion':center['version']})
assert api('/api/preference-centers/'+center['id']+'?workspaceId='+scope)['name']==saved['name']
api('/api/preference-centers/'+center['id']+'?workspaceId=local',status=404)

fence={'id':'fence','name':'QA point','radius':300,'latitude':40.98,'longitude':-74.03,'analyticsEnter':True,'analyticsExit':False,'cooldownEnter':30,'cooldownExit':60,'notificationResponsiveness':5000}
geo=resource('geofence-sets',scope+' geofence',{'geofences':[fence]})
assert next(row for row in api('/api/resources/geofence-sets?workspaceId='+scope)['data'] if row['id']==geo['id'])['data']['geofences']==[fence]

rules=[{'id':'r','field':'country','operator':'equals','value':'US'}]
groups=[{'id':'g','operator':'AND','exclude':False,'rules':rules}]
api('/api/tags','POST',{'name':'Shipping confirmation','workspaceId':scope},201)
supp=resource('audience-suppression-lists',scope+' suppression',{'audienceGroups':groups,'exceptionTags':['Shipping confirmation']})
campaign={'name':scope+' preview','channel':'push','config':{'workspaceId':scope}}
preview=api('/api/campaigns/audience-preview','POST',{'campaign':campaign,'lookup':uid})
assert not preview['lookup']['eligible'] and any(supp['name'] in reason for reason in preview['lookup']['reasons']),preview
campaign['config']['tags']=['Shipping confirmation']
assert api('/api/campaigns/audience-preview','POST',{'campaign':campaign,'lookup':uid})['lookup']['eligible']
api('/api/resources/audience-suppression-lists','POST',{'name':'Empty active','status':'Active','data':{'workspaceId':scope}},400)

# Confirmed merging is restricted to the current reviewed workspace snapshot.
api(profile,'PATCH',{'action':'email-subscription','state':'unsubscribed'})
second=scope+'_duplicate'
api('/api/audience/imports?workspaceId='+scope,'POST',{'csv':f'external_id,email,country\n{second},{uid}@example.test,US','kind':'attributes','fileName':'duplicate.csv','requestId':scope+'_duplicate'},201)
preview=api('/api/audience/duplicates/preview','POST',{'workspaceId':scope})
assert preview['duplicateCount']==1
api('/api/audience/duplicates/merge','POST',{'workspaceId':scope,'expectedFingerprint':preview['fingerprint'],'previewId':preview['previewId']},400)
api('/api/audience/duplicates/merge','POST',{'workspaceId':scope,'expectedFingerprint':'stale','previewId':preview['previewId'],'confirmed':True},409)
merged=api('/api/audience/duplicates/merge','POST',{'workspaceId':scope,'expectedFingerprint':preview['fingerprint'],'previewId':preview['previewId'],'confirmed':True})
assert merged['profilesMerged']==1 and merged['history']['status']=='Completed'
winner=merged['merges'][0]['winnerId']
result=api('/api/audience/users/'+winner+'?workspaceId='+scope)
assert result['user']['emailSubscriptionStatus']=='unsubscribed'
assert next(row for row in result['groups'] if row['id']==group['id'])['state']=='unsubscribed'
print('Audience full HTTP checks passed: scoped imports, profile/contact state, subscription membership, versioned preferences, geofences, dynamic suppression/tag exceptions, reviewed merge confirmation, stale snapshot rejection and conservative subscription migration.')
