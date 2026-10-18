"""End-to-end checks against the isolated local test database. Restores workspace settings."""
import copy
import json
from uuid import uuid4
from urllib.request import urlopen, Request
from email_preferences_test_helpers import request


def main():
    original = request('/api/email-preferences')[1]
    prefs = copy.deepcopy(original['data'])
    cid = 'cmp_email_runtime_' + uuid4().hex[:8]
    user_id = 'user_runtime_' + uuid4().hex[:8]
    def save(value):
        version = request('/api/email-preferences')[1]['updatedAt']
        status, result = request('/api/email-preferences', 'PUT', {'data': value, 'expectedUpdatedAt': version})
        assert status == 200, result
    try:
        prefs['sending'].update(requireListedAddresses=True,requireBcc=True,defaultBccId='archive',prefixTestSubject=True,movePixelToTop=True,resubscribe=True,unsubscribeMode='custom',unsubscribeUrl="{% if ${country} == 'US' %}https://us.example.test/unsubscribe{% else %}https://global.example.test/unsubscribe{% endif %}")
        prefs['sending']['bcc']=[{'id':'archive','address':'archive@example.test'}]
        prefs['pages']['footer']={'enabled':True,'html':'<footer>For {{${first_name} | upcase}} <a href="{{${unsubscribe_url}}}">Unsubscribe</a></footer>','plainText':'Thanks {{${first_name}}}'}
        prefs['pages']['unsubscribe']={'enabled':True,'html':'<h1>Bye {{${first_name}}}</h1>'}
        prefs['pages']['optIn']={'enabled':True,'html':'<h1>Subscribed {{${first_name}}}</h1>'}
        save(prefs)
        status,campaign=request('/api/campaigns','POST',{'id':cid,'name':'Runtime integration','channel':'email','subject':'Hello {{${first_name}}}','body':'<html><head><style>.offer{color:red}</style></head><body><p class="offer">Offer</p><a href="https://shop.example.test/item" data-link-alias="Offer">Shop</a>{{${email_footer}}}</body></html>'})
        assert status==201,campaign
        bad=copy.deepcopy(campaign['config']);bad['emailSending']['fromAddress']='unlisted@example.test'
        assert request('/api/campaigns/'+cid,'PATCH',{'config':bad})[0]==400
        bad=copy.deepcopy(campaign['config']);bad['emailSending']['bcc']='No BCC address'
        assert request('/api/campaigns/'+cid,'PATCH',{'config':bad})[0]==400
        aliases=request('/api/resources/link-aliases')[1]['data']
        alias=next(row for row in aliases if row['name']=='Offer' and row['data'].get('campaignId')==cid)
        assert alias['status']=='Active'
        status,test=request('/api/campaigns/'+cid+'/test','POST',{'recipient':'user_2','mode':'existing'})
        assert status==200,test
        message=test['message'];assert message['subject'].startswith('[TEST] Hello Customer 2')
        assert message['bcc']=='archive@example.test'
        assert '{{' not in message['html'] and 'For CUSTOMER 2' in message['html']
        assert 'color: red' in message['html'] and message['html'].index('data-open-tracking') < message['html'].index('class="offer"')
        assert 'List-Unsubscribe' in message['headers'] and 'https://' in message['headers']['List-Unsubscribe']
        assert test['capability']['delivered'] is False
        assert 'multipart/alternative' in message['mime'] and 'List-Unsubscribe:' in message['mime']
        assert 'Thanks Customer 2' in message['text']
        # A tracked link resolves to a token, rather than a user-controlled redirect parameter.
        assert '/api/email-tracking/res_' in message['html']
        before=request('/api/reports/overview')[1]['clicked']
        assert request('/api/campaigns/'+cid+'/events','POST',{'event':'clicked','userId':'user_2','attributes':{'bot':True,'alias':'Offer'}})[0]==200
        assert request('/api/reports/overview')[1]['clicked']==before
        assert request('/api/campaigns/'+cid+'/events','POST',{'event':'clicked','userId':'user_2','attributes':{'alias':'Offer','userAgent':'Mozilla/5.0 Safari'}})[0]==200
        assert request('/api/reports/overview')[1]['clicked']==before+1
        user=request('/api/users?q=user_2&limit=1')[1]['data'][0]
        assert user['attributes']['recentLinkClicks'][0]['alias']=='Offer'
        prefs['removeBotClicks']=False;save(prefs)
        assert request('/api/reports/overview')[1]['clicked']==before+1,'Removed bot clicks must not return when disabled'
        assert request('/api/users','POST',{'rows':[{'id':user_id,'email':'before@example.test','first_name':'Runtime','subscribed':'false'}]})[0]==200
        status,updated=request('/api/users','PATCH',{'id':user_id,'email':'after@example.test'})
        assert status==200 and updated['subscribed'] is True,updated
        status, own_test=request('/api/campaigns/'+cid+'/test','POST',{'recipient':user_id,'mode':'existing'})
        assert status==200,own_test
        tokens=request('/api/resources/email-subscription-token')[1]['data']
        own_tokens=[row for row in tokens if row['data'].get('userId')==user_id]
        for action, expected in [('unsubscribe','Bye Runtime'),('optIn','Subscribed Runtime')]:
            token=next(row for row in own_tokens if row['data']['action']==action)
            with urlopen('http://127.0.0.1:3100/email/subscription/'+token['id']) as response:
                assert 'Confirm' in response.read().decode()
            with urlopen(Request('http://127.0.0.1:3100/email/subscription/'+token['id'],data=b'',method='POST')) as response:
                assert expected in response.read().decode()
            own=request('/api/users?q='+user_id)[1]['data'][0]
            assert own['subscribed']==(action=='optIn')
        for uid in ['user_2','user_3']:
            status,preview=request('/api/email-preferences/preview','POST',{'kind':'footer','html':'{{custom_attribute.${first_name} | default: "fallback"}} {{${first_name} | upcase}} <a href="{{${unsubscribe_link}}}">Unsubscribe</a>','userId':uid})
            assert status==200 and 'CUSTOMER '+uid.split('_')[1] in preview['html'] and '{{' not in preview['html'],preview
        status,shared=request('/api/email-preferences/share','POST',{'html':'<h1>Shared</h1><script>alert(1)</script>'})
        assert status==200
        with urlopen('http://127.0.0.1:3100'+shared['url']) as response:
            rendered=response.read().decode();assert 'Shared' in rendered and '<script>' not in rendered
        assert request('/api/email-preferences/preview','POST',{'kind':'footer','html':'{% if %}','userId':'user_2'})[0]==400
        print('PASS: enforced sender/BCC, Liquid preview, footer/plaintext, compiled test, aliases, bot reports, resubscription, safe shared preview')
    finally:
        save(original['data'])
        for row in request('/api/resources/link-aliases')[1]['data']:
            if row['data'].get('campaignId') == cid: request('/api/resources/link-aliases?id='+row['id'],'DELETE')
        request('/api/campaigns/'+cid,'DELETE')

if __name__=='__main__':main()
