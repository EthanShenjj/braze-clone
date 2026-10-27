import json, os, re, time
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

BASE=os.environ.get('BASE_URL','http://127.0.0.1:3100')
OUT=Path('docs/audits/workspace-repair-2026-10-27/runtime-results.json')
ART=Path('docs/audits/workspace-repair-2026-10-27')
ART.mkdir(parents=True, exist_ok=True)

def slug(label): return re.sub(r'[\s/]+','-',label.lower())

groups={
 'top':['Canvas','Campaigns','Segments','Getting Started','Performance Overview','AI Decisioning','Agent Console','Messaging','Audience','Content','Analytics','Partner Integrations','Data Settings','Settings'],
 'messaging':['Canvas','Campaigns','Feature Flags','Landing Pages','Surveys','Banners','Content Calendar','Messaging Diagnostics'],
 'audience':['Segments','Segment Extensions','Global Control Group','Suppression Lists','Subscription Group Management','Email Preference Centers','Search Users','Manage Audience','Import Users','Locations'],
 'content':['Media Library','Banner Templates','Canvas Templates','Content Blocks','Email Link Templates','Email Templates','In-App Message Templates','Webhook Templates','Content Calendar','Promotion Codes','Catalogs','Brand Guidelines'],
 'analytics':['Report Builder','Custom Events Report','Global Control Group Report','Query Builder','Engagement Reports','Revenue Report','Segment Insights','Dashboard Builder','Email Performance','Push Performance','SMS/MMS/RCS Performance','Conversions'],
 'partners':['Technology Partners','Currents','Data Sharing','Solutions Partners'],
 'data':['Custom Attributes','Custom Events','Catalogs','Import Users','Promotion Codes','Products','Cloud Data Ingestion','Data Transformation'],
 'settings':['App Settings','APIs and Identifiers','Message Activity Log','Event User Log','Internal Groups','Exports Log','Tag Management','Email Preferences','Frequency Capping Rules','Push Settings','Approval Workflow','Localization Settings','Banner Placements','Brand Guidelines','Messaging Rate Limits','Billing','User Management'],
 'agents':['Canvas Step Agents','Data Agents','Catalog Agents'],
}
key_overrides={'performance-overview':'performance','agent-console':'agents','partner-integrations':'partners','data-settings':'data'}
route_overrides={
 'campaigns':'/engagement/campaigns/campaigns?start=0&limit=12&sortby=last_edited&sortdir=-1&display=list',
 'canvas':'/engagement/canvas','getting-started':'/home','performance':'/analytics/performance-overview','agents':'/agent-console','messaging':'/messaging','audience':'/audience','content':'/content','analytics':'/analytics','partners':'/partner-integrations','data':'/data-settings','settings':'/settings','segments':'/audience/segments','landing-pages':'/messaging/landing-pages','search-users':'/audience/search-users','global-control-group':'/engagement/global_message_settings/global-control-settings/6aa75e37db69160082adb7ae','subscription-group-management':'/users/subscription_groups/6aa75e37db69160082adb7ae?locale=en','email-preference-centers':'/users/subscription_groups/preference_centers/6aa75e37db69160082adb7ae?locale=en','catalogs':'/dashboard/catalogs/6aa75e37db69160082adb7ae?locale=en','content-calendar':'/messaging/content-calendar','messaging-diagnostics':'/messaging/diagnostics','email-preferences':'/app_settings/app_settings/email_settings/sending_configuration/6ad0b98fe4b4110085216601?locale=en'
}
entries=[]; seen=set()
for group,labels in groups.items():
 for label in labels:
  key=key_overrides.get(slug(label),slug(label))
  if key in seen: continue
  seen.add(key); entries.append({'group':group,'label':label,'key':key,'path':route_overrides.get(key,'/'+key)})

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True, executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE', '/Users/ethanshen/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell'))
 page=browser.new_page(viewport={'width':1440,'height':900}, device_scale_factor=1)
 current_console=[]; current_page_errors=[]
 page.on('console', lambda msg: current_console.append({'type':msg.type,'text':msg.text}) if msg.type in ('error','warning') else None)
 page.on('pageerror', lambda exc: current_page_errors.append(str(exc)))
 results=[]
 for index,item in enumerate(entries):
  current_console.clear(); current_page_errors.clear(); start=time.time()
  response=None; nav_error=''
  try:
   response=page.goto(BASE+item['path'],wait_until='networkidle',timeout=30000)
  except PlaywrightTimeoutError:
   try: page.wait_for_load_state('domcontentloaded',timeout=3000)
   except Exception as exc: nav_error=str(exc)
  except Exception as exc: nav_error=str(exc)
  page.wait_for_load_state('networkidle')
  try:
   metrics=page.evaluate('''() => ({
     title: document.title,
     headings: [...document.querySelectorAll('h1,h2')].slice(0,8).map(x=>x.textContent.trim()).filter(Boolean),
     bodyText: document.body.innerText.slice(0,700),
     buttons: document.querySelectorAll('button').length,
     inputs: document.querySelectorAll('input,select,textarea').length,
     genericResource: !!document.querySelector('.resource-workspace') && !!document.querySelector('.domain-config'),
     moduleWorkspace: !!document.querySelector('.module-workspace'),
     notFound: [...document.querySelectorAll('h1,h2')].some(h => /^(404|This page could not be found[.]?|Page not found)$/i.test(h.textContent.trim())),
     horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
     viewport: [window.innerWidth, window.innerHeight],
     scroll: [document.documentElement.scrollWidth,document.documentElement.scrollHeight]
   })''')
  except Exception as exc:
   metrics={'headings':[],'bodyText':'','buttons':0,'inputs':0,'genericResource':False,'moduleWorkspace':False,'notFound':True,'horizontalOverflow':False,'error':str(exc)}
  result={**item,'status':response.status if response else None,'elapsedMs':round((time.time()-start)*1000),'navError':nav_error,'console':list(current_console),'pageErrors':list(current_page_errors),**metrics}
  results.append(result)
  if item['key'] in {'campaigns','canvas','segments','global-control-group','catalogs','email-preferences','technology-partners','products','billing','feature-flags','cloud-data-ingestion','data-transformation','app-settings','landing-pages','user-management','email-performance','custom-events-report'}:
   page.screenshot(path=str(ART/f"{index:02d}-{item['key']}.png"),full_page=False)

 OUT.write_text(json.dumps({'generatedAt':'2026-10-27','baseUrl':BASE,'pages':results,'campaignChannels':[]},ensure_ascii=False,indent=2))
 channels=['email','push','iam','content','banner','sms','webhook','whatsapp','line','multichannel','operator','feature','api']
 channel_results=[]
 for channel in channels:
  cid=f'cmp_audit_{channel}'
  try:
   created=page.request.post(BASE+'/api/campaigns',data={'id':cid,'name':f'Audit {channel}','channel':channel,'status':'Draft','schedule':'One time','sent':0,'edited':'Oct 27, 2026','audience':'All Users','conversion':'Make Purchase','config':{}},timeout=10000)
   created_status=created.status
  except Exception as exc:
   channel_results.append({'channel':channel,'created':None,'status':None,'navError':f'create failed: {exc}','console':[],'pageErrors':[],'headings':[],'bodyText':'','buttons':0,'inputs':0,'horizontalOverflow':False})
   continue
  current_console.clear(); current_page_errors.clear(); nav_error=''; response=None; start=time.time()
  try: response=page.goto(f'{BASE}/engagement/campaigns/{cid}?step=compose',wait_until='networkidle',timeout=30000)
  except PlaywrightTimeoutError:
   try: page.wait_for_load_state('domcontentloaded',timeout=3000)
   except Exception as exc: nav_error=str(exc)
  except Exception as exc: nav_error=str(exc)
  page.wait_for_load_state('networkidle')
  metrics=page.evaluate('''() => ({headings:[...document.querySelectorAll('h1,h2')].slice(0,12).map(x=>x.textContent.trim()).filter(Boolean), bodyText:document.body.innerText.slice(0,1000), buttons:document.querySelectorAll('button').length, inputs:document.querySelectorAll('input,select,textarea').length, horizontalOverflow:document.documentElement.scrollWidth>window.innerWidth+2})''')
  channel_results.append({'channel':channel,'created':created_status,'status':response.status if response else None,'elapsedMs':round((time.time()-start)*1000),'navError':nav_error,'console':list(current_console),'pageErrors':list(current_page_errors),**metrics})
  OUT.write_text(json.dumps({'generatedAt':'2026-10-27','baseUrl':BASE,'pages':results,'campaignChannels':channel_results},ensure_ascii=False,indent=2))
  if channel in {'email','push','iam','sms','webhook','whatsapp'}: page.screenshot(path=str(ART/f'campaign-{channel}.png'),full_page=False)
 browser.close()
OUT.write_text(json.dumps({'generatedAt':'2026-10-27','baseUrl':BASE,'pages':results,'campaignChannels':channel_results},ensure_ascii=False,indent=2))
print(json.dumps({'pages':len(results),'generic':sum(1 for r in results if r['genericResource']),'notFound':[r['key'] for r in results if r['notFound']],'httpFailures':[r['key'] for r in results if r['status'] and r['status']>=400],'consolePages':[r['key'] for r in results if r['console'] or r['pageErrors']],'overflow':[r['key'] for r in results if r['horizontalOverflow']],'channels':len(channel_results),'channelFailures':[r['channel'] for r in channel_results if r['status'] and r['status']>=400 or r['navError'] or r['pageErrors']]},ensure_ascii=False,indent=2))
