"""Browser workflows for the isolated workspace repair fixture database."""
import json, os, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:3100')
OUT=Path('docs/audits/workspace-repair-2026-10-27'); OUT.mkdir(parents=True,exist_ok=True)
tag=uuid.uuid4().hex[:8]
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/Users/ethanshen/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell')
    context=browser.new_context(viewport={'width':1440,'height':900})
    page=context.new_page(); errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('dialog',lambda d:d.accept())
    def goto(path):
        page.goto(BASE+path,wait_until='networkidle',timeout=30000)
    def run(name,fn):
        errors.clear()
        try:
            fn()
            assert not errors,errors
            page.screenshot(path=str(OUT/(name+'.png')),full_page=False)
            results.append({'name':name,'passed':True})
        except Exception as e:
            page.screenshot(path=str(OUT/(name+'-failed.png')),full_page=False)
            results.append({'name':name,'passed':False,'error':str(e)})
        (OUT/'interaction-results.json').write_text(json.dumps(results,indent=2))
    def feature():
        goto('/feature-flags')
        page.get_by_role('button',name='Create feature flag',exact=True).click()
        dialog=page.get_by_role('dialog')
        dialog.get_by_label('Name *',exact=True).fill('UI feature '+tag)
        dialog.get_by_label('ID',exact=True).fill('ui_'+tag)
        dialog.get_by_label('Enable feature flag',exact=True).check()
        dialog.get_by_label('Everyone else rollout (%)',exact=True).fill('25')
        dialog.get_by_role('button',name='Create feature flag',exact=True).click()
        dialog.wait_for(state='hidden')
        page.reload(wait_until='networkidle')
        assert page.get_by_role('button',name='UI feature '+tag,exact=True).is_visible()
        page.get_by_label('Preview user',exact=True).select_option('user_1')
        page.get_by_role('button',name='Evaluate',exact=True).click()
        page.locator('strong').filter(has_text='UI feature '+tag).locator('..').get_by_text('Everyone else · 25% rollout',exact=True).wait_for()
    run('ui-feature-flag',feature)
    def landing():
        goto('/messaging/landing-pages')
        page.get_by_role('button',name='Create landing page',exact=True).click()
        d=page.get_by_role('dialog')
        d.get_by_label('Name *',exact=True).fill('UI signup '+tag)
        d.get_by_label('URL slug',exact=True).fill('ui-signup-'+tag)
        d.get_by_label('Page title',exact=True).fill('UI signup page')
        d.get_by_label('Page HTML',exact=True).fill('<h1>Browser signup QA</h1><p>Join our updates.</p>')
        d.get_by_role('button',name='Create landing page',exact=True).click(); d.wait_for(state='hidden')
        row=page.get_by_role('row').filter(has_text='UI signup '+tag)
        row.get_by_role('button',name='Publish',exact=True).click()
        row.get_by_role('link',name='View page',exact=True).wait_for()
        href=row.get_by_role('link',name='View page',exact=True).get_attribute('href')
        goto(href)
        page.get_by_role('heading',name='Browser signup QA',exact=True).wait_for()
        page.get_by_label('Email address',exact=True).fill('browser-'+tag+'@example.test')
        page.get_by_label('I agree to receive email updates.',exact=True).check()
        page.get_by_role('button',name='Subscribe',exact=True).click()
        page.get_by_text('Thank you for subscribing.',exact=True).wait_for()
    run('ui-landing-publish-submit',landing)
    def template():
        goto('/push-templates')
        page.get_by_role('button',name='Create template',exact=True).click()
        page.get_by_label('Template name *',exact=True).fill('UI push '+tag)
        page.get_by_label('Title',exact=True).fill('Hello from template')
        page.get_by_label('Message',exact=True).fill('Saved message body '+tag)
        page.get_by_role('button',name='Save template',exact=True).click()
        page.get_by_text('Template saved.',exact=True).wait_for()
        page.get_by_role('button',name='Back to templates',exact=True).click()
        row=page.get_by_role('row').filter(has_text='UI push '+tag)
        row.get_by_role('button',name='Use template',exact=True).click()
        page.wait_for_url('**/engagement/campaigns/**')
        page.wait_for_load_state('networkidle')
        cid=page.url.split('/engagement/campaigns/')[1].split('?')[0]
        saved=page.request.get(BASE+'/api/campaigns/'+cid).json()
        assert saved['subject']=='Hello from template' and saved['body']=='Saved message body '+tag,saved
    run('ui-template-campaign',template)
    def csv_import():
        goto('/import-users')
        page.get_by_label('CSV content',exact=True).fill('external_id,email,first_name,country\nui_'+tag+',ui-'+tag+'@example.test,"Ada, UI",SG')
        page.get_by_role('button',name='Validate & preview',exact=True).click()
        page.get_by_text('1 valid rows',exact=True).wait_for()
        page.get_by_role('button',name='Import 1 users',exact=True).click()
        page.get_by_text('Import completed.',exact=False).wait_for()
        result=page.request.get(BASE+'/api/users?q=ui_'+tag+'&limit=1000').json()
        assert next(u for u in result['data'] if u['id']=='ui_'+tag)['firstName']=='Ada, UI'
    run('ui-csv-import',csv_import)
    def content_block():
        goto('/content-blocks')
        page.get_by_role('button',name='Create content block',exact=True).click()
        d=page.get_by_role('dialog')
        d.get_by_label('Name',exact=True).fill('ui_footer_'+tag)
        d.get_by_label('HTML / Liquid',exact=True).fill('<p>Hello {{${first_name}}}</p>')
        d.get_by_role('button',name='Save content block',exact=True).click(); d.wait_for(state='hidden')
        row=page.get_by_role('row').filter(has_text='ui_footer_'+tag)
        row.get_by_role('button',name='Edit',exact=True).click()
        d=page.get_by_role('dialog')
        d.get_by_label('HTML / Liquid',exact=True).fill('<p>Updated reusable content</p>')
        d.get_by_role('button',name='Save content block',exact=True).click(); d.wait_for(state='hidden')
        page.reload(wait_until='networkidle')
        assert page.get_by_text('<p>Updated reusable content</p>',exact=True).is_visible()
    run('ui-content-block-edit',content_block)
    def report():
        goto('/email-performance')
        page.get_by_role('button',name='Save report',exact=True).click()
        d=page.get_by_role('dialog')
        d.get_by_label('Report name',exact=True).fill('UI email report '+tag)
        d.get_by_role('button',name='Save report',exact=True).click(); d.wait_for(state='hidden')
        page.reload(wait_until='networkidle')
        assert page.get_by_label('Saved reports',exact=True).get_by_role('option',name='UI email report '+tag,exact=True).count()==1
    run('ui-report-persistence',report)
    def settings():
        goto('/messaging-rate-limits')
        checkbox=page.get_by_label('Enable workspace messaging rate limits',exact=True)
        checkbox.check()
        page.get_by_label('Messages per minute',exact=True).fill('250')
        page.get_by_role('button',name='Save changes',exact=True).click()
        page.get_by_text('Messaging Rate Limits saved.',exact=True).wait_for()
        page.reload(wait_until='networkidle')
        assert page.get_by_label('Enable workspace messaging rate limits',exact=True).is_checked()
        assert page.get_by_label('Messages per minute',exact=True).input_value()=='250'
        page.get_by_label('Enable workspace messaging rate limits',exact=True).uncheck()
        page.get_by_role('button',name='Save changes',exact=True).click()
        page.get_by_text('Messaging Rate Limits saved.',exact=True).wait_for()
    run('ui-settings-persistence',settings)
    responsive=[]
    for width,height in [(1280,800),(1920,1080)]:
        page.set_viewport_size({'width':width,'height':height})
        for path in ['/feature-flags','/technology-partners','/cloud-data-ingestion','/email-performance','/content-calendar','/approval-workflow','/app-settings']:
            goto(path)
            responsive.append({'viewport':[width,height],'path':path,'overflow':page.evaluate('document.documentElement.scrollWidth > innerWidth + 2')})
    (OUT/'responsive-results.json').write_text(json.dumps(responsive,indent=2))
    browser.close()
print(json.dumps({'passed':sum(r['passed'] for r in results),'failed':[r for r in results if not r['passed']],'responsiveOverflows':[r for r in responsive if r['overflow']]},indent=2))
if any(not r['passed'] for r in results) or any(r['overflow'] for r in responsive): raise SystemExit(1)
