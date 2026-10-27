"""Traditional IAM regression checks against an isolated localhost database."""
import copy,json,os,uuid
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
base=os.environ.get('BASE_URL','http://127.0.0.1:3210')
assert base.startswith(('http://127.0.0.1:','http://localhost:'))
def api(path,method='GET',body=None,status=200):
 req=Request(base+path,method=method,headers={'Content-Type':'application/json'},data=None if body is None else json.dumps(body).encode())
 try:
  with urlopen(req) as response: code,result=response.status,json.load(response)
 except HTTPError as error: code,result=error.code,json.load(error)
 assert code==status,(path,code,result)
 return result
# Read a UI-saved fixture if provided; otherwise create an independent native message.
source=api('/api/campaigns/'+Path('/tmp/braze-iam-browser-fixture.txt').read_text().strip())
original=source['config']['iamVariants'][0]
v=copy.deepcopy(original);v['id']='native';v['name']='Native API QA';v['editorMode']='traditional';v['pages']=v['pages'][:1];v['pages'][0]['styleOverrides']={};v['pages'][0]['buttons']=[{'id':'cta','text':'Continue','behavior':'log_event','href':'','style':'primary','eventName':'clicked_{{${country}}}'}]
v['traditional']={'messageType':'Modal','layout':'Image & text','orientation':'Any','iosDevices':'All iOS devices','closeBehavior':'Wait for user','closeAfterSeconds':5,'bodyAction':{'id':'body','text':'Body','behavior':'dismiss','href':'','style':'primary'},'emailPlaceholder':'Enter your email address','termsText':'Terms','termsUrl':'https://example.com/terms','headerColor':'#ffffff','headerOpacity':100,'headerAlignment':'left','bodyAlignment':'center','buttonDesigns':[{'background':'#ffffff','color':'#008294','borderColor':'#008294','opacity':100},{'background':'#008294','color':'#ffffff','borderColor':'#008294','opacity':100}]}
id='cmp_native_qa_'+uuid.uuid4().hex[:8]
api('/api/campaigns','POST',{'id':id,'name':'Native API QA','channel':'iam','status':'Draft','schedule':'Action-based','config':{'iamVariants':[original,v]}},201)
assert api('/api/campaigns/'+id)['config']['iamVariants']==[original,v]
assert api('/api/iam/preview','POST',{'variant':v,'mode':'custom','profile':{'country':'US'}})['variant']['pages'][0]['buttons'][0]['eventName']=='clicked_US'
record=api('/api/iam/test','POST',{'campaignId':id,'variant':v,'recipients':['native-qa'],'override':True,'profile':{'country':'GB'}})
assert record['capability']['delivered'] is False
assert record['tests'][0]['variant']['pages'][0]['buttons'][0]['eventName']=='clicked_GB'
saved=api('/api/resources/in-app-message-templates','POST',{'name':'Traditional native template QA','data':{'variant':v}},201)
assert saved['data']['variant']==v
bad=copy.deepcopy(v);bad['traditional']['closeAfterSeconds']=61
api('/api/iam/preview','POST',{'variant':bad,'mode':'custom','validateOnly':True},400)
api('/api/resources/in-app-message-templates','POST',{'name':'Invalid native QA','data':{'variant':bad}},400)
# Upload real PNG bytes, then verify stored bytes and reject a forged MIME type.
def upload(content,expected):
 boundary='iamqa'+uuid.uuid4().hex
 body=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="qa.png"\r\nContent-Type: image/png\r\n\r\n'.encode()+content+f'\r\n--{boundary}--\r\n'.encode())
 req=Request(base+'/api/iam/media',method='POST',headers={'Content-Type':'multipart/form-data; boundary='+boundary},data=body)
 try:
  with urlopen(req) as response: code,result=response.status,json.load(response)
 except HTTPError as error: code,result=error.code,json.load(error)
 assert code==expected,(code,result)
 return result
png=(Path(__file__).parent.parent/'public/braze-iam/onboarding-1.png').read_bytes()
image=upload(png,201)
with urlopen(base+image['url']) as response:
 assert response.headers['Content-Type']=='image/png'
 assert response.headers['X-Content-Type-Options']=='nosniff'
 assert response.read()==png
assert any(row['id']==image['id'] for row in api('/api/iam/media')['data'])
upload(b'<script>not an image</script>',400)
upload(b'x'*(5*1024*1024+1),400)
print('Traditional IAM API checks passed:',id)
