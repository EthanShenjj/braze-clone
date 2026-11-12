import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync,mkdtempSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
registerHooks({resolve(specifier,context,nextResolve){
 if(specifier==='server-only')return{url:'data:text/javascript,export {}',shortCircuit:true};
 if(specifier.startsWith('@/'))return nextResolve(new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,context);
 if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const candidate=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(candidate.pathname)&&existsSync(fileURLToPath(candidate)+'.ts'))return nextResolve(candidate.href+'.ts',context);}
 return nextResolve(specifier,context);
}});
process.env.BRAZE_DATABASE_PATH=join(mkdtempSync(join(tmpdir(),'audience-users-')),'test.sqlite');
const store=await import('../lib/braze-store.ts');
const users=await import('../lib/audience-users-store.ts');
const management=await import('../lib/audience-management-store.ts');
const model=await import('../lib/audience-users-model.ts');
const {DatabaseSync}=await import('node:sqlite');
store.applyProfileRows([{external_id:'profile_a',email:'profile-a@example.test',first_name:'Profile',country:'FR',attributes:{braze_id:'braze-profile-a',phone:'+1 (555) 010-0012',user_aliases:[{alias_name:'reader',alias_label:'newsletter'}],devices:[{device_id:'device-a',platform:'iOS',app_id:'profile-app',model:'Tablet',push_token:'device-push-token'}]}},{external_id:'profile_remote',email:'profile-r@example.test',attributes:{workspaceId:'remote'}}]);

test('lookup uses actual identifiers, aliases, phones and push tokens and enforces workspace',()=>{
 for(const term of ['profile_a','braze-profile-a','PROFILE-A@EXAMPLE.TEST','newsletter:reader','reader','+15550100012','device-push-token'])assert.deepEqual(users.findAudienceUsers(term).data.map(row=>row.id),['profile_a'],term);
 for(const term of ['','Profile','profile-a@','device-a'])assert.equal(users.findAudienceUsers(term).total,0,term);
 assert.equal(users.findAudienceUsers('profile_remote').total,0);
 assert.equal(users.findAudienceUsers('profile_remote','remote').total,1);
 assert.throws(()=>users.audienceUserDetail('profile_a','remote'),/workspace/);
 assert.equal(model.profileDevices({}).length,0);
 assert.equal(model.profileDevices({devices:[{model:'Known model'}]})[0].id,'');
});

test('profile data aggregates actual scoped activity without mixing currencies or same-name flags',()=>{
 const recent=new Date(Date.now()-86400000).toISOString();
 store.createResource({type:'user-events',name:'session_start',data:{userId:'profile_a',createdAt:recent}});
 store.createResource({type:'user-events',name:'session_start',data:{userId:'profile_a',createdAt:recent,workspaceId:'remote'}});
 store.createResource({type:'user-events',name:'read_article',data:{userId:'profile_a',createdAt:recent}});
 store.createResource({type:'user-events',name:'purchase',data:{userId:'profile_a',createdAt:recent,price:999,currency:'USD'}});
 store.createResource({type:'user-events',name:'purchase',data:{userId:'profile_a',createdAt:recent,productId:'book',price:12,quantity:2,currency:'USD'}});
 store.createResource({type:'user-events',name:'purchase',data:{userId:'profile_a',createdAt:recent,productId:'course',price:10,quantity:1,currency:'EUR'}});
 const flagData={flagId:'profile-local-flag',enabled:true,rollout:100,properties:{owner:'local'},rules:[]};
 store.createResource({type:'feature-flags',name:'Same feature name',status:'Active',data:flagData});
 store.createResource({type:'feature-flags',name:'Same feature name',status:'Active',data:{...flagData,flagId:'profile-remote-flag',workspaceId:'remote',properties:{owner:'remote'}}});
 const result=users.audienceUserDetail('profile_a');
 assert.equal(result.session.count,1);
 assert.equal(result.customEvents.find(row=>row.name==='read_article').count,1);
 assert.deepEqual([...result.commerce.lifetimeRevenue].sort((a,b)=>a.currency.localeCompare(b.currency)),[{currency:'EUR',amount:10},{currency:'USD',amount:24}]);
 assert.equal(result.commerce.purchases.length,2);
 assert.equal(result.flags.length,1);assert.equal(result.flags[0].properties.owner,'local');
});

test('message history scopes and filters before pagination or global event volume',()=>{
 store.upsertCampaign({id:'cmp_profile_local',name:'Local profile messages',channel:'email',config:{workspaceId:'local'}});
 store.upsertCampaign({id:'cmp_profile_remote',name:'Remote profile messages',channel:'email',config:{workspaceId:'remote'}});
 const db=new DatabaseSync(process.env.BRAZE_DATABASE_PATH),insert=db.prepare('INSERT INTO message_events VALUES (?,?,?,?,?,?,?)'),old=new Date(Date.now()-86400000).toISOString(),now=new Date().toISOString();
 insert.run('profile-history-local','cmp_profile_local','email','profile_a','sent',old,'{}');
 insert.run('profile-history-remote','cmp_profile_remote','email','profile_a','sent',now,'{}');
 db.exec('BEGIN');for(let i=0;i<10005;i++)insert.run('profile-noise-'+i,'cmp_profile_local','email','user_2','sent',now,'{}');db.exec('COMMIT');db.close();
 const history=users.audienceUserDetail('profile_a').messages;
 assert.deepEqual(history.map(row=>row.id),['profile-history-local']);
 assert.equal(model.historyFilterKey('email','sent'),'email:Send');
});

test('contact updates persist actual states, exact membership and valid segment checks',()=>{
 const local=management.createManagedSubscriptionGroup({name:'Profile local group',channel:'Email'}),remote=management.createManagedSubscriptionGroup({name:'Profile remote group',channel:'Email'},'remote');
 users.updateAudienceUser('profile_a',{action:'email-subscription',state:'unsubscribed'});assert.equal(store.getUser('profile_a').emailSubscriptionStatus,'unsubscribed');
 users.updateAudienceUser('profile_a',{action:'push-subscription',state:'opted_in'});assert.equal(store.getUser('profile_a').attributes.push_subscription_status,'opted_in');
 users.updateAudienceUser('profile_a',{action:'group-subscription',state:'subscribed',groupId:local.id});assert.equal(users.audienceUserDetail('profile_a').groups.find(row=>row.id===local.id).state,'subscribed');
 assert.throws(()=>users.updateAudienceUser('profile_a',{action:'group-subscription',state:'subscribed',groupId:remote.id}),/workspace/);
 assert.throws(()=>users.updateAudienceUser('profile_a',{action:'email-subscription',state:'bad'}),/valid/);
 const segment=store.createResource({type:'segments',name:'Profile segment',status:'Active',data:{filters:[{field:'country',operator:'equals',value:'FR'}]}});
 assert.equal(users.checkUserSegment('profile_a',segment.id).matches,true);
 store.applyProfileRows([{external_id:'profile_a',country:'US'}]);assert.equal(users.checkUserSegment('profile_a',segment.id).matches,false);
});
