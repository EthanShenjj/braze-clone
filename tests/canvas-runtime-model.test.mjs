import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasTriggerMatches,canvasNextEntryAt,canvasAssignedVariant,canvasActionPathDecision,canvasWinningPathDecision,canvasOptimizerDecision} from '../lib/canvas-runtime-model.ts';

test('broad interaction triggers include their recorded machine-open, alias and button subtypes',()=>{
 const base={kind:'message',at:'2026-11-12T10:00:00Z',campaignId:'c1'};
 for(const [wanted,actual] of [['opened_email','opened_email_machine'],['opened_email','opened_email_other'],['clicked_email','clicked_alias_email'],['clicked_iam','clicked_iam_button_1'],['clicked_iam','clicked_iam_button_2'],['clicked_alias_any','clicked_alias_email']])assert.equal(canvasTriggerMatches({id:'t',type:'Interact With Campaign',interaction:wanted},{...base,interaction:actual}),true,`${wanted} includes ${actual}`);
 assert.equal(canvasTriggerMatches({id:'t',type:'Interact With Campaign',interaction:'opened_email_other'},{...base,interaction:'opened_email_machine'}),false);
});

test('custom entry only accepts the configured event and its typed property predicates in the current workspace',()=>{
 const trigger={id:'checkout',type:'Perform Custom Event',eventName:'checkout',propertiesEnabled:true,propertyFilters:[{id:'cart',operator:'AND',rules:[{id:'price',field:'cart.total',operator:'greater_than',value:'10'},{id:'country',field:'country',operator:'equals',value:'US'}]}]};
 const event={id:'e1',kind:'custom',name:'checkout',at:'2026-11-12T10:00:00.000Z',workspaceId:'w1',userId:'u1',properties:{cart:{total:12},country:'US'}};
 assert.equal(canvasTriggerMatches(trigger,event,{workspaceId:'w1',userId:'u1'}),true);
 assert.equal(canvasTriggerMatches(trigger,{...event,name:'view'}),false);
 assert.equal(canvasTriggerMatches(trigger,{...event,properties:{cart:{total:9},country:'US'}}),false);
 assert.equal(canvasTriggerMatches(trigger,{...event,workspaceId:'foreign'},{workspaceId:'w1'}),false);
 assert.equal(canvasTriggerMatches(trigger,{...event,userId:'other'},{userId:'u1'}),false);
});

test('entry activity, purchase, profile and subscription triggers accept their actual fact kinds and reject unrelated facts',()=>{
 const at='2026-11-12T10:00:00.000Z';
 const cases=[
  [{type:'Start Session',specificApp:true,appId:'ios'},{kind:'session',appId:'ios'},true],
  [{type:'Start Session',specificApp:true,appId:'ios'},{kind:'session',appId:'web'},false],
  [{type:'View product'},{kind:'custom',name:'ecommerce.product_viewed'},true],
  [{type:'Update cart'},{kind:'custom',name:'ecommerce.cart_updated'},true],
  [{type:'Start checkout'},{kind:'custom',name:'ecommerce.checkout_started'},true],
  [{type:'Place order'},{kind:'purchase',name:'ecommerce.order_placed'},true],
  [{type:'Cancel order'},{kind:'custom',name:'ecommerce.order_cancelled'},true],
  [{type:'Refund order'},{kind:'custom',name:'ecommerce.order_refunded'},true],
  [{type:'Place order'},{kind:'purchase',name:'arbitrary-purchase'},false],
  [{type:'Change Custom Attribute Value',attribute:'tier',attributeMode:'specific',value:'gold'},{kind:'attribute',attribute:'tier',previousValue:'silver',value:'gold'},true],
  [{type:'Change Custom Attribute Value',attribute:'tier',attributeMode:'any'},{kind:'attribute',attribute:'tier',previousValue:'gold',value:'gold'},false],
  [{type:'Change Custom Attribute Value',attribute:'tier'},{kind:'attribute',attribute:'country',previousValue:'US',value:'UK'},false],
  [{type:'Update Subscription Status',subscriptionType:'email',subscriptionState:'opted_in'},{kind:'subscription',subscriptionType:'email',subscriptionState:'opted_in'},true],
  [{type:'Update Subscription Status',subscriptionType:'email',subscriptionState:'opted_in'},{kind:'subscription',subscriptionType:'email',subscriptionState:'unsubscribed'},false],
  [{type:'Update Subscription Group Status',subscriptionType:'sms',subscriptionState:'subscribed',subscriptionGroupId:'group1',updateSource:'REST API'},{kind:'subscription_group',subscriptionType:'sms',subscriptionState:'subscribed',subscriptionGroupId:'group1',updateSource:'REST API'},true],
  [{type:'Update Subscription Group Status',subscriptionGroupId:'group1',updateSource:'REST API'},{kind:'subscription_group',subscriptionGroupId:'group2',updateSource:'REST API'},false],
  [{type:'Update Subscription Group Status',subscriptionGroupId:'group1',updateSource:'REST API'},{kind:'subscription_group',subscriptionGroupId:'group1',updateSource:'SDK'},false],
  [{type:'Add an Email Address'},{kind:'email_added',previousValue:null,value:'test@example.com'},true],
  [{type:'Add an Email Address'},{kind:'email_added',previousValue:'old@example.com',value:'new@example.com'},false],
  [{type:'Perform Conversion Event'},{kind:'conversion'},true],
  [{type:'Perform Exception Event For Campaign',campaignId:'c1'},{kind:'exception',campaignId:'c1'},true],
  [{type:'Perform Exception Event For Campaign',campaignId:'c1'},{kind:'exception',campaignId:'foreign'},false],
  [{type:'Perform Back in Stock Event'},{kind:'back_in_stock'},true],
  [{type:'Perform Price Drop Event'},{kind:'price_drop'},true],
  [{type:'Perform Custom Event'},{kind:'custom',name:'any'},true],
  [{type:'unknown'},{kind:'custom',name:'unknown'},false],
 ];
 for(const [trigger,event,want] of cases)assert.equal(canvasTriggerMatches({id:'t',...trigger},{at,...event}),want,JSON.stringify({trigger,event}));
});

test('message interactions apply campaign, previous step, explicit Canvas and specific interaction targets',()=>{
 const base={kind:'message',at:'2026-11-12T10:00:00.000Z',campaignId:'campaign1',canvasId:'canvas1',stepId:'step1',interaction:'clicked_email',alias:'offer',buttonId:'button1',pageId:'page1'};
 const trigger={id:'t',type:'Interact With Campaign',campaignId:'campaign1',interaction:'clicked_email'};
 assert.equal(canvasTriggerMatches(trigger,base),true);
 assert.equal(canvasTriggerMatches(trigger,{...base,campaignId:'foreign'}),false);
 assert.equal(canvasTriggerMatches({...trigger,interaction:'opened_email'},base),false);
 assert.equal(canvasTriggerMatches({...trigger,type:'Interact With Step',stepScope:'previous'},base,{canvasId:'canvas1',previousStepId:'step1'}),true);
 assert.equal(canvasTriggerMatches({...trigger,type:'Interact With Step',stepScope:'previous'},{...base,canvasId:'foreign'},{canvasId:'canvas1',previousStepId:'step1'}),false);
 assert.equal(canvasTriggerMatches({...trigger,type:'Interact With Step',stepScope:'previous'},base),false);
 assert.equal(canvasTriggerMatches({id:'t',type:'Interact With Step',stepScope:'other',canvasId:'canvas1',stepId:'step1',interaction:'clicked_email'},base),true);
 assert.equal(canvasTriggerMatches({id:'t',type:'Interact With Step',stepScope:'other',canvasId:'canvas2',stepId:'step1',interaction:'clicked_email'},base),false);
 assert.equal(canvasTriggerMatches({id:'t',type:'Interact With Campaign',interaction:'clicked_alias_any',alias:'offer'},{...base,interaction:'clicked_alias_any'}),true);
 assert.equal(canvasTriggerMatches({id:'t',type:'Interact With Campaign',interaction:'clicked_alias_any',alias:'other'},{...base,interaction:'clicked_alias_any'}),false);
 assert.equal(canvasTriggerMatches({...trigger,buttonId:'other'},base),false);
 assert.equal(canvasTriggerMatches({...trigger,pageId:'other'},base),false);
});

test('inbound, landing page and geographic triggers honor the saved channel, conditions and boundaries',()=>{
 const at='2026-11-12T10:00:00.000Z';
 const cases=[
  [{type:'Interact with Landing Page',landingPageId:'page1',interaction:'form'},{kind:'landing_page',landingPageId:'page1',interaction:'form'},true],
  [{type:'Interact with Landing Page',landingPageId:'page1',interaction:'survey'},{kind:'landing_page',landingPageId:'page1',interaction:'form'},false],
  [{type:'Send an SMS inbound message',subscriptionGroupId:'sms1',keywordCategory:'opt_in'},{kind:'inbound',channel:'sms',subscriptionGroupId:'sms1',keywordCategory:'opt_in'},true],
  [{type:'Send an SMS inbound message',subscriptionGroupId:'sms1',keywordCategory:'opt_in'},{kind:'inbound',channel:'sms',subscriptionGroupId:'sms1',keywordCategory:'opt_out'},false],
  [{type:'Send a WhatsApp inbound message',subscriptionGroupId:'wa1',bodyCondition:'text',bodyOperator:'contains',bodyValue:'Help'},{kind:'inbound',channel:'whatsapp',subscriptionGroupId:'wa1',body:'please HELP me'},true],
  [{type:'Send a WhatsApp inbound message',bodyCondition:'flow',flowId:'f1'},{kind:'inbound',channel:'whatsapp',flowId:'f2'},false],
  [{type:'Send a WhatsApp inbound message',bodyCondition:'flow',flowId:'f1'},{kind:'inbound',channel:'whatsapp',flowId:'f1'},true],
  [{type:'Send a WhatsApp inbound message',bodyCondition:'contact'},{kind:'inbound',channel:'whatsapp',contact:true},true],
  [{type:'Send a WhatsApp inbound message',bodyCondition:'contact'},{kind:'inbound',channel:'whatsapp',contact:false},false],
  [{type:'Send a LINE inbound message',bodyCondition:'text',bodyOperator:'equals',bodyValue:'Yes'},{kind:'inbound',channel:'line',body:'YES'},true],
  [{type:'Send a LINE inbound message'},{kind:'inbound',channel:'sms'},false],
  [{type:'Trigger a Geofence',geofenceSetId:'fence1',geofenceEnter:true,geofenceExit:false},{kind:'geofence',geofenceSetId:'fence1',geofenceTransition:'enter'},true],
  [{type:'Trigger a Geofence',geofenceSetId:'fence1',geofenceEnter:true,geofenceExit:false},{kind:'geofence',geofenceSetId:'fence1',geofenceTransition:'exit'},false],
  [{type:'Enter a Location',latitude:0,longitude:0,radius:1,radiusUnit:'km'},{kind:'location',latitude:0,longitude:0.005},true],
  [{type:'Enter a Location',latitude:0,longitude:0,radius:1,radiusUnit:'km'},{kind:'location',latitude:0,longitude:0.02},false],
  [{type:'Enter a Location',locationMode:'polygon',polygon:'[[0,0],[0,2],[2,2],[2,0]]'},{kind:'location',latitude:1,longitude:1},true],
  [{type:'Enter a Location',locationMode:'polygon',polygon:'[[0,0],[0,2],[2,2],[2,0]]'},{kind:'location',latitude:3,longitude:1},false],
  [{type:'Enter a Location',locationMode:'polygon',polygon:'bad json'},{kind:'location',latitude:1,longitude:1},false],
 ];
 for(const [trigger,event,want] of cases)assert.equal(canvasTriggerMatches({id:'t',...trigger},{at,...event}),want,JSON.stringify({trigger,event}));
});

const entry={type:'scheduled',timing:'designated',frequency:'Once',startDate:'2026-11-12',startTime:'10:00',localTimeZone:false,triggers:[],timeZone:'UTC',endEnabled:false,endDate:'',endTime:''};
test('scheduled entries advance strictly after the cursor, keep their cadence and stop at the configured end',()=>{
 const cases=[
  [{timing:'immediate'},'2026-11-12T09:00:00.000Z','2026-11-12T09:00:00.000Z'],
  [{},'2026-11-12T09:00:00.000Z','2026-11-12T10:00:00.000Z'],
  [{},'2026-11-12T10:00:00.000Z',null],
  [{frequency:'Daily'},'2026-11-12T10:00:00.000Z','2026-11-13T10:00:00.000Z'],
  [{frequency:'Weekly'},'2026-11-13T10:00:00.000Z','2026-11-19T10:00:00.000Z'],
  [{frequency:'Daily',endEnabled:true,endDate:'2026-11-13',endTime:'10:00'},'2026-11-12T10:00:00.000Z','2026-11-13T10:00:00.000Z'],
  [{frequency:'Daily',endEnabled:true,endDate:'2026-11-13',endTime:'09:59'},'2026-11-12T10:00:00.000Z',null],
  [{frequency:'Monthly',startDate:'2026-01-31'},'2026-01-31T10:00:00.000Z','2026-02-28T10:00:00.000Z'],
  [{frequency:'Monthly',startDate:'2026-01-31'},'2026-02-28T10:00:00.000Z','2026-03-31T10:00:00.000Z'],
  [{frequency:'Monthly',startDate:'2028-01-31'},'2028-01-31T10:00:00.000Z','2028-02-29T10:00:00.000Z'],
  [{type:'action'},'2026-11-12T09:00:00.000Z',null],
  [{type:'api'},'2026-11-12T09:00:00.000Z',null],
  [{startDate:'2026-02-30'},'2026-11-12T09:00:00.000Z',null],
 ];
 for(const [patch,after,want] of cases)assert.equal(canvasNextEntryAt({...entry,...patch},after),want,JSON.stringify({patch,after}));
});

test('local schedules preserve wall time through DST gaps and folds and use the user zone only when selected',()=>{
 const cases=[
  [{frequency:'Daily',startDate:'2026-03-07',startTime:'02:30',localTimeZone:true},'2026-03-07T07:30:00.000Z','America/New_York','2026-03-08T07:30:00.000Z'],
  [{frequency:'Daily',startDate:'2026-03-07',startTime:'02:30',localTimeZone:true},'2026-03-08T07:30:00.000Z','America/New_York','2026-03-09T06:30:00.000Z'],
  [{frequency:'Daily',startDate:'2026-10-31',startTime:'01:30',localTimeZone:true},'2026-10-31T05:30:00.000Z','America/New_York','2026-11-01T05:30:00.000Z'],
  [{frequency:'Daily',startDate:'2026-10-31',startTime:'01:30',localTimeZone:true},'2026-11-01T05:30:00.000Z','America/New_York','2026-11-02T06:30:00.000Z'],
  [{localTimeZone:true},'2026-11-12T00:00:00.000Z','Asia/Shanghai','2026-11-12T02:00:00.000Z'],
  [{localTimeZone:false},'2026-11-12T00:00:00.000Z','Asia/Shanghai','2026-11-12T10:00:00.000Z'],
  [{timeZone:'Company time - Eastern Time (US & Canada)'},'2026-11-12T00:00:00.000Z','Asia/Shanghai','2026-11-12T15:00:00.000Z'],
 ];
 for(const [patch,after,zone,want] of cases)assert.equal(canvasNextEntryAt({...entry,...patch},after,zone),want,JSON.stringify({patch,after,zone}));
});

test('variant assignment is weighted, stable across retries and catalog order, and never chooses a zero weight variant',()=>{
 const variants=[{id:'a',name:'A',weight:25},{id:'b',name:'B',weight:75},{id:'disabled',name:'Disabled',weight:0}];
 assert.equal(canvasAssignedVariant('welcome','user1',variants)?.id,'b');
 assert.equal(canvasAssignedVariant('welcome','user1',[variants[2],variants[1],variants[0]])?.id,'b');
 assert.equal(canvasAssignedVariant('welcome','user1',variants)?.id,'b');
 assert.equal(canvasAssignedVariant('welcome','any',[{id:'only',name:'Only',weight:100}])?.id,'only');
 assert.equal(canvasAssignedVariant('welcome','u',[]),null);
 assert.equal(canvasAssignedVariant('welcome','u',[{id:'bad',name:'Bad',weight:-1}]),null);
 assert.equal(canvasAssignedVariant('welcome','u',[{id:'bad',name:'Bad',weight:0}]),null);
 const counts={a:0,b:0};
 for(let id=0;id<1000;id++)counts[canvasAssignedVariant('welcome',`u${id}`,variants).id]++;
 assert.ok(counts.a>=200&&counts.a<=300,`expected 25% allocation within 5%, got ${counts.a}`);
});

const actionConfig={evaluationValue:1,evaluationUnit:'Hours',rankedPaths:false,paths:[{id:'high',name:'Checkout',nextNodeId:'buy',triggers:[{id:'t1',type:'Perform Custom Event',eventName:'checkout'}]},{id:'low',name:'View',nextNodeId:'browse',triggers:[{id:'t2',type:'Perform Custom Event',eventName:'view'}]},{id:'everyone_else',name:'Everyone Else',exit:true}]};
const actionEvents=[{id:'late',kind:'custom',name:'checkout',at:'2026-11-12T10:30:00.000Z',workspaceId:'w1',userId:'u1'},{id:'early',kind:'custom',name:'view',at:'2026-11-12T10:10:00.000Z',workspaceId:'w1',userId:'u1'}];
test('Action Paths advance on the first actual event and hold ranked paths to the full window',()=>{
 const context={workspaceId:'w1',userId:'u1'};
 assert.deepEqual(canvasActionPathDecision(actionConfig,'2026-11-12T10:00:00.000Z','2026-11-12T10:05:00.000Z',actionEvents,context),{status:'waiting',deadline:'2026-11-12T11:00:00.000Z',nextPath:null,at:null});
 const first=canvasActionPathDecision(actionConfig,'2026-11-12T10:00:00.000Z','2026-11-12T10:40:00.000Z',actionEvents,context);
 assert.equal(first.nextPath?.id,'low');assert.equal(first.eventId,'early');assert.equal(first.at,'2026-11-12T10:10:00.000Z');
 assert.deepEqual(canvasActionPathDecision({...actionConfig,rankedPaths:true},'2026-11-12T10:00:00.000Z','2026-11-12T10:40:00.000Z',actionEvents,context),{status:'waiting',deadline:'2026-11-12T11:00:00.000Z',nextPath:null,at:null});
 const ranked=canvasActionPathDecision({...actionConfig,rankedPaths:true},'2026-11-12T10:00:00.000Z','2026-11-12T11:00:00.000Z',actionEvents,context);
 assert.equal(ranked.nextPath?.id,'high');assert.equal(ranked.at,'2026-11-12T11:00:00.000Z');
 const fallback=canvasActionPathDecision(actionConfig,'2026-11-12T10:00:00.000Z','2026-11-12T11:00:00.000Z',[{...actionEvents[0],at:'2026-11-12T09:59:59.000Z'},{...actionEvents[1],workspaceId:'foreign'},{...actionEvents[0],at:'2026-11-12T11:00:01.000Z'}],context);
 assert.equal(fallback.nextPath?.id,'everyone_else');assert.equal(fallback.at,'2026-11-12T11:00:00.000Z');
 assert.equal(canvasActionPathDecision({...actionConfig,evaluationValue:5,evaluationUnit:'Minutes'},'2026-11-12T10:00:00.000Z','2026-11-12T10:05:00.000Z',[],context).deadline,'2026-11-12T10:05:00.000Z');
});

test('Winning Path waits for the experiment window, then chooses the best actual rate even with few observations',()=>{
 const config={winningPath:true,experimentWindowDays:1,paths:[{id:'b',name:'B',weight:50},{id:'a',name:'A',weight:50},{id:'disabled',name:'Disabled',weight:0}]};
 const input={startedAt:'2026-11-12T10:00:00.000Z',now:'2026-11-13T10:00:00.000Z',minExposuresPerPath:2,exposures:[{id:'a1',userId:'u1',pathId:'a',at:'2026-11-12T10:01:00.000Z'},{id:'a2',userId:'u2',pathId:'a',at:'2026-11-12T10:02:00.000Z'},{id:'b1',userId:'u3',pathId:'b',at:'2026-11-12T10:01:00.000Z'},{id:'b2',userId:'u4',pathId:'b',at:'2026-11-12T10:02:00.000Z'}],conversions:[{exposureId:'a1',at:'2026-11-12T10:03:00.000Z'},{exposureId:'a1',at:'2026-11-12T10:04:00.000Z'},{exposureId:'b1',at:'2026-11-12T10:00:00.000Z'},{exposureId:'b2',at:'2026-11-14T10:00:00.000Z'},{exposureId:'foreign',at:'2026-11-12T10:03:00.000Z'}]};
 const early=canvasWinningPathDecision(config,{...input,now:'2026-11-13T09:59:59.000Z'});
 assert.equal(early.status,'waiting');assert.equal(early.reason,'window');assert.equal(early.winnerPathId,null);
 const missing=canvasWinningPathDecision(config,{...input,exposures:input.exposures.slice(0,3)});
 assert.equal(missing.status,'assigned');assert.equal(missing.winnerPathId,'a');
 const winner=canvasWinningPathDecision(config,input);
 assert.deepEqual(winner,{status:'assigned',deadline:'2026-11-13T10:00:00.000Z',winnerPathId:'a',decidedAt:'2026-11-13T10:00:00.000Z',reason:null,significance:'not_evaluated',scores:[{pathId:'b',exposures:2,conversions:0,conversionRate:0},{pathId:'a',exposures:2,conversions:1,conversionRate:0.5}],allocations:[{pathId:'b',weight:0},{pathId:'a',weight:100},{pathId:'disabled',weight:0}]});
 const persisted=canvasWinningPathDecision(config,{...input,conversions:[{exposureId:'b1',at:'2026-11-12T11:00:00.000Z'},{exposureId:'b2',at:'2026-11-12T11:00:00.000Z'}],state:{winnerPathId:'a',decidedAt:'2026-11-13T10:00:00.000Z'}});
 assert.equal(persisted.winnerPathId,'a');assert.equal(persisted.decidedAt,'2026-11-13T10:00:00.000Z');
 const tie=canvasWinningPathDecision(config,{...input,conversions:[]});
 assert.equal(tie.winnerPathId,'b');
 assert.equal(canvasWinningPathDecision(config,{...input,minExposuresPerPath:undefined}).winnerPathId,'a');
});

test('Winning Path only keeps the configured mix when that fallback is selected and significance is absent or negative',()=>{
 const config={winningPath:true,winningPathFallback:'mix',experimentWindowDays:1,paths:[{id:'b',name:'B',weight:25},{id:'a',name:'A',weight:75}]};
 const input={startedAt:'2026-11-12T10:00:00.000Z',now:'2026-11-13T10:00:00.000Z',exposures:[{id:'a1',userId:'u1',pathId:'a',at:'2026-11-12T11:00:00.000Z'},{id:'b1',userId:'u2',pathId:'b',at:'2026-11-12T11:00:00.000Z'}],conversions:[{exposureId:'a1',at:'2026-11-12T12:00:00.000Z'}]};
 const result=canvasWinningPathDecision(config,input);
 assert.equal(result.status,'assigned');assert.equal(result.winnerPathId,null);assert.equal(result.decidedAt,'2026-11-13T10:00:00.000Z');assert.equal(result.reason,'data');assert.equal(result.significance,'not_evaluated');assert.deepEqual(result.allocations,[{pathId:'b',weight:25},{pathId:'a',weight:75}]);
 const negative=canvasWinningPathDecision(config,{...input,statisticallySignificant:false});
 assert.equal(negative.status,'assigned');assert.equal(negative.winnerPathId,null);assert.equal(negative.significance,'not_significant');
 const significant=canvasWinningPathDecision(config,{...input,statisticallySignificant:true});
 assert.equal(significant.winnerPathId,'a');assert.equal(significant.significance,'significant');assert.deepEqual(significant.allocations,[{pathId:'b',weight:0},{pathId:'a',weight:100}]);
 const defaultBest=canvasWinningPathDecision({...config,winningPathFallback:'best'},{...input,statisticallySignificant:false});
 assert.equal(defaultBest.winnerPathId,'a');assert.equal(defaultBest.significance,'not_significant');
});

test('a stale or malformed Winning Path state cannot backdate a newly computed decision',()=>{
 const config={winningPath:true,experimentWindowDays:1,paths:[{id:'a',name:'A',weight:50},{id:'b',name:'B',weight:50}]};
 const result=canvasWinningPathDecision(config,{startedAt:'2026-11-12T10:00:00.000Z',now:'2026-11-13T10:00:00.000Z',minExposuresPerPath:1,exposures:[{id:'a1',userId:'u1',pathId:'a',at:'2026-11-12T11:00:00.000Z'},{id:'b1',userId:'u2',pathId:'b',at:'2026-11-12T11:00:00.000Z'}],conversions:[],state:{winnerPathId:'a',decidedAt:'2026-11-12T10:30:00.000Z'}});
 assert.equal(result.decidedAt,'2026-11-13T10:00:00.000Z');
});
test('Winning Path calculates pairwise Pearson significance before deciding whether to keep the mix',()=>{
 const sample=counts=>({startedAt:'2026-11-12T10:00:00Z',now:'2026-11-13T10:00:00Z',exposures:counts.flatMap(([pathId])=>Array.from({length:100},(_,i)=>({id:pathId+i,userId:pathId+i,pathId,at:'2026-11-12T11:00:00Z'}))),conversions:counts.flatMap(([pathId,converted])=>Array.from({length:converted},(_,i)=>({exposureId:pathId+i,at:'2026-11-12T12:00:00Z'})))});
 const config={winningPath:true,winningPathFallback:'mix',experimentWindowDays:1,paths:[{id:'a',name:'A',weight:50},{id:'b',name:'B',weight:50}]};
 const clear=canvasWinningPathDecision(config,sample([['a',40],['b',10]]));assert.equal(clear.significance,'significant');assert.equal(clear.winnerPathId,'a');
 const close=canvasWinningPathDecision(config,sample([['a',20],['b',18]]));assert.equal(close.significance,'not_significant');assert.equal(close.winnerPathId,null);
 const three=canvasWinningPathDecision({...config,paths:[{id:'a',name:'A',weight:34},{id:'b',name:'B',weight:33},{id:'c',name:'C',weight:33}]},sample([['a',40],['b',10],['c',39]]));assert.equal(three.significance,'not_significant');assert.equal(three.winnerPathId,null,'the leader must outperform every other path');
 const empty=canvasWinningPathDecision(config,{...sample([['a',40]]),exposures:[],conversions:[]});assert.equal(empty.significance,'not_evaluated');
});

test('Content Optimizer chooses defined component combinations using actual rates and keeps incomplete data in exploration',()=>{
 const config={channel:'email',optimizationEvent:'clicks',optimizerComponents:[{id:'subject',type:'Subject',variants:[{id:'s1',value:'Hello {{first_name}}'},{id:'s2',value:'Welcome'}]},{id:'body',type:'Body Content',variants:[{id:'b1',value:'Shop now'},{id:'b2',value:'Read more'}]}]};
 const outcomes=[{selections:{subject:'s1',body:'b1'},exposures:100,opens:90,clicks:5},{selections:{subject:'s2',body:'b2'},exposures:50,opens:10,clicks:10},{selections:{subject:'s2',body:'b1'},exposures:1,opens:1,clicks:1},{selections:{subject:'invented',body:'b1'},exposures:100,opens:100,clicks:100}];
 const selected=canvasOptimizerDecision(config,'canvas1','u1',outcomes);
 assert.equal(selected.status,'optimized');assert.deepEqual(selected.selections,{body:'b2',subject:'s2'});assert.deepEqual(selected.components,{'Body Content':'Read more',Subject:'Welcome'});assert.equal(selected.exposures,50);assert.equal(selected.outcomes,10);assert.equal(selected.rate,0.2);
 const opens=canvasOptimizerDecision({...config,optimizationEvent:'opens'},'canvas1','u1',outcomes);
 assert.deepEqual(opens.components,{'Body Content':'Shop now',Subject:'Hello {{first_name}}'});assert.equal(opens.rate,0.9);
 const exploring=canvasOptimizerDecision(config,'canvas1','u1',[]);
 assert.equal(exploring.status,'exploring');assert.equal(exploring.rate,null);assert.equal(exploring.exposures,0);assert.equal(exploring.outcomes,0);
 assert.deepEqual(exploring.selections,{body:'b1',subject:'s2'});
 assert.deepEqual(canvasOptimizerDecision(config,'canvas1','u1',[]).selections,{body:'b1',subject:'s2'});
 assert.equal(canvasOptimizerDecision({...config,optimizerComponents:[]},'canvas1','u1',outcomes).status,'unavailable');
 assert.equal(canvasOptimizerDecision(config,'canvas1','u1',[{selections:{subject:'s1',body:'b1'},exposures:50,opens:90,clicks:100}]).status,'exploring');
});

test('relative event-property conditions evaluate at the recorded event time so replay does not change routing',()=>{
 const trigger={id:'t',type:'Perform Custom Event',eventName:'checkout',propertiesEnabled:true,propertyFilters:[{id:'g',operator:'AND',rules:[{id:'recent',field:'viewedAt',operator:'less_than_ago',value:'2',timeUnit:'hours'}]}]};
 assert.equal(canvasTriggerMatches(trigger,{kind:'custom',name:'checkout',at:'2020-01-01T10:00:00.000Z',properties:{viewedAt:'2020-01-01T09:00:00.000Z'}}),true);
 assert.equal(canvasTriggerMatches(trigger,{kind:'custom',name:'checkout',at:'2020-01-01T10:00:00.000Z',properties:{viewedAt:'2020-01-01T07:00:00.000Z'}}),false);
});

test('conversion actions keep the current Canvas scope and campaign conversion interactions use the actual conversion fact',()=>{
 const fact={kind:'conversion',at:'2026-11-12T10:00:00.000Z',canvasId:'canvas1',campaignId:'campaign1'};
 assert.equal(canvasTriggerMatches({id:'t',type:'Perform Conversion Event'},fact,{canvasId:'canvas1'}),true);
 assert.equal(canvasTriggerMatches({id:'t',type:'Perform Conversion Event'},fact,{canvasId:'foreign'}),false);
 assert.equal(canvasTriggerMatches({id:'t',type:'Interact With Campaign',campaignId:'campaign1',interaction:'conversion'},fact),true);
 assert.equal(canvasTriggerMatches({id:'t',type:'Interact With Campaign',campaignId:'foreign',interaction:'conversion'},fact),false);
});
