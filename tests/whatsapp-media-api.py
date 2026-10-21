"""Local media upload and immutable preview regression checks."""
import base64
import json
import os
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from uuid import uuid4
BASE = os.environ.get('BASE_URL', 'http://127.0.0.1:3001')
def request(path, data=None, content_type='application/json', method=None):
    if isinstance(data, dict): data = json.dumps(data).encode()
    try:
        with urlopen(Request(BASE + path, data=data, headers={'Content-Type':content_type}, method=method)) as r:
            body = r.read()
            return r.status, json.loads(body) if r.headers.get_content_type()=='application/json' and body else body
    except HTTPError as e:
        body = e.read()
        return e.code, body

def multipart(name, mime, contents):
    boundary = 'wa' + uuid4().hex
    data = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: {mime}\r\n\r\n').encode() + contents + f'\r\n--{boundary}--\r\n'.encode()
    return request('/api/whatsapp/media',data,'multipart/form-data; boundary='+boundary)

png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/u8AAAAASUVORK5CYII=')
records = []
try:
    status, media = multipart('regression.png','image/png',png)
    assert status==201, (status,media)
    records.append(('whatsapp-media',media['id']))
    assert request(media['url'])==(200,png)
    status, library = request('/api/whatsapp/media')
    assert any(item['id']==media['id'] for item in library['data'])
    assert multipart('unsafe.svg','image/svg+xml',b'<svg/>')[0]==400
    assert multipart('empty.png','image/png',b'')[0]==400
    assert multipart('large.png','image/png',b'0'*(5*1024*1024+1))[0]==400
    variant={'id':'v1','name':'Variant 1','mode':'template','businessAccount':'demo_waba','subscriptionGroup':'WhatsApp updates','templateId':'abandoned_onboarding','language':'English','headerType':'image','headerUrl':media['url'],'variables':[{'key':'1','label':'Name','value':'{{${first_name}}}','fallback':'friend'},{'key':'2','label':'Steps','value':'2','fallback':''}]}
    status, preview = request('/api/whatsapp/preview', {'config':{'whatsappVariants':[variant]},'variantId':'v1','profile':{'first_name':'Alex'}})
    assert status==200, (status,preview)
    records.append(('whatsapp-preview-share',preview['url'].split('/')[-1]))
    status, html = request(preview['url'])
    assert status==200 and b'Hi Alex.' in html and b'Finish now' in html and b'Remind me later' in html
    assert request('/api/whatsapp/preview',{'config':{'whatsappVariants':[variant]},'variantId':'missing'})[0]==400
    assert request('/api/whatsapp/preview',{'config':{'whatsappVariants':[variant]},'variantId':'v1','profile':[]})[0]==400
    print('PASS: media upload/library/read, unsupported/empty/oversize rejection, rendered preview URL and invalid variant/profile rejection')
finally:
    for kind, resource_id in records: request('/api/resources/'+kind+'?id='+resource_id,method='DELETE')
