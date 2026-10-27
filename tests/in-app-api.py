"""IAM snapshot tests. Run only against an isolated local server."""
import copy,json,os,uuid,sqlite3
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
base=os.environ.get('BASE_URL','http://127.0.0.1:3210')
assert base.startswith(('http://127.0.0.1:','http://localhost:'))
def api(path,method='GET',body=None,status=200):
 req=Request(base+path,method=method,headers={'Content-Type':'application/json'},data=None if body is None else json.dumps(body).encode())
 try:
  with urlopen(req) as response:code,result=response.status,json.load(response)
 except HTTPError as error:code,result=error.code,json.load(error)
 assert code==status,(path,code,result)
 return result
pages=json.loads((Path(__file__).parent.parent/'lib/in-app-source-pages.json').read_text())[:5]
global_style={'displayType':'Modal','maxWidth':450,'backgroundColor':'#101828','backgroundImageEnabled':False,'backgroundImageUrl':'','borderWidth':0,'borderColor':'#ffffff','borderRadius':8,'fontFamily':'Arial','contentAlignment':'center','textColor':'#E4D6A2','buttonColor':'#E4D6A2','buttonTextColor':'#101828','closeAccessibleName':'Close Message','closePosition':'Inside modal','closeSize':15,'closeColor':'#c4c4c4','closeBackgroundColor':'#000000','closeBackgroundOpacity':0,'closeBorderColor':'#ffffff','closeBorderWidth':0,'closeRadius':0,'overlayColor':'#333333','overlayOpacity':75,'slideupPosition':'bottom'}
variant={'id':'welcome','name':'Welcome Message','sendTo':'Both Mobile Apps & Web Browsers','accessibilityLanguage':'en','pages':pages,'global':global_style,'keyValuePairs':[{'id':'source','key':'source','value':'iam'}]}
id='cmp_iam_qa_'+uuid.uuid4().hex[:8]
campaign=api('/api/campaigns','POST',{'id':id,'name':'Onboarding IAM','channel':'iam','status':'Draft','schedule':'Action-based','subject':pages[0]['title'],'body':pages[0]['body'],'config':{'iamVariants':[variant]}},201)
assert api('/api/campaigns/'+id)['config']['iamVariants']==[variant]
preview=copy.deepcopy(variant);preview['pages'][0]['title']='Hello {{${first_name} | upcase}}';preview['keyValuePairs'][0]['value']='{{${user_id}}}';preview['accessibilityLanguageLiquid']='{{${language}}}'
result=api('/api/iam/preview','POST',{'variant':preview,'mode':'custom','profile':{'first_name':'Ari','user_id':'qa','language':'ja'}})
assert result['variant']['pages'][0]['title']=='Hello ARI'
assert result['variant']['accessibilityLanguage']=='ja'
assert result['variant']['keyValuePairs'][0]['value']=='qa'
assert api('/api/campaigns/'+id)['config']['iamVariants']==[variant], 'Preview mutated saved draft'
users=api('/api/users?limit=2')['data'];u=users[0]
existing=api('/api/iam/preview','POST',{'variant':preview,'mode':'existing','userId':u['id']})
assert existing['variant']['pages'][0]['title']=='Hello '+u['firstName'].upper()
api('/api/iam/preview','POST',{'variant':preview,'mode':'existing','userId':'missing_user'},400)
prepared=api('/api/iam/test','POST',{'campaignId':id,'variant':preview,'recipients':[u['id'],u['id']],'override':True,'profile':{'first_name':'Override','language':'en'}})
assert prepared['capability']['delivered'] is False
assert len(prepared['tests'])==1
assert prepared['tests'][0]['variant']['pages'][0]['title']=='Hello OVERRIDE'
assert any(row['id']==prepared['id'] for row in api('/api/resources/in-app-message-tests')['data'])
connection=sqlite3.connect(os.environ.get('IAM_TEST_DATABASE','/tmp/braze-iam-20261027.sqlite'))
assert connection.execute("SELECT count(*) FROM message_events WHERE campaign_id=? AND event_type='test_prepared'",(id,)).fetchone()[0]==1
connection.close()
assert api('/api/campaigns/'+id)['status']=='Draft'
assert api('/api/campaigns/'+id)['config']['iamVariants']==[variant], 'Test mutated saved draft'
before=len(api('/api/resources/in-app-message-tests')['data'])
bad=copy.deepcopy(preview);bad['pages'][-1]['body']='{% if true %}unfinished'
api('/api/iam/test','POST',{'campaignId':id,'variant':bad,'recipients':[u['id'],users[1]['id']]},400)
assert len(api('/api/resources/in-app-message-tests')['data'])==before,'Invalid batch wrote partial test records'

api('/api/iam/preview','POST',{'variant':bad,'mode':'custom','validateOnly':True},400)
api('/api/resources/in-app-message-templates','POST',{'name':'Invalid template','data':{'variant':bad}},400)
api('/api/campaigns/'+id,'PATCH',{'config':{'iamVariants':[bad]}})
api('/api/campaigns/'+id+'/launch','POST',status=400)
assert api('/api/campaigns/'+id)['status']=='Draft'
api('/api/campaigns/'+id,'PATCH',{'config':{'iamVariants':[variant]}})

api('/api/iam/test','POST',{'campaignId':id,'variant':variant,'recipients':[]},400)
api('/api/iam/test','POST',{'campaignId':'missing','variant':variant,'recipients':[u['id']]},400)
api('/api/iam/test','POST',{'campaignId':'cmp_email','variant':variant,'recipients':[u['id']]},400)
legacy=api('/api/campaigns/'+id+'/test','POST',{'recipient':u['id'],'mode':'custom','customUser':{'first_name':'Legacy'}})
assert legacy['capability']['delivered'] is False
stored=api('/api/resources/in-app-message-templates','POST',{'name':'IAM snapshot QA','data':{'schemaVersion':1,'variant':preview,'pages':preview['pages'],'global':preview['global']}},201)
assert next(row for row in api('/api/resources/in-app-message-templates')['data'] if row['id']==stored['id'])['data']['variant']==preview
print('IAM API checks passed. Browser fixture:',base+'/engagement/campaigns/'+id+'?locale=en&step=compose')
Path('/tmp/braze-iam-browser-fixture.txt').write_text(id)
