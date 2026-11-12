import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasEditorConfig,canvasDelayDue,canvasStepDefaults,canvasStepIssues,canvasUpdatedProfile,canvasActionTriggers,canvasMaxRoutes,connectCanvasRoute,removeCanvasStep} from '../lib/canvas-step-model.ts';
import {normalizeCanvasWizard,defaultCanvasWizard,canvasWizardIssues} from '../lib/canvas-wizard-model.ts';
import {initialCanvasGraph,isCanvasGraph,validateCanvasGraph} from '../lib/canvas-model.ts';
import {canvasListMatches,emptyCanvasListFilters,canvasStatuses} from '../lib/canvas-list-model.ts';
const node=(kind,config={})=>({id:'n',kind,label:kind,x:600,y:725,config});
test('legacy delay and attribute drafts retain their settings in the new editor',()=>{
 const delay=canvasEditorConfig(node('delay',{durationHours:2}));assert.equal(delay.delayValue,2);assert.equal(delay.delayUnit,'Hours');assert.equal(canvasDelayDue(delay,'2026-11-12T00:00:00Z'),'2026-11-12T02:00:00.000Z');
 assert.equal(canvasEditorConfig(node('update',{attribute:'plan',value:'paid'})).updates[0].value,'paid');
 assert.equal(canvasEditorConfig(node('branch',{attribute:'country',value:'US'})).filterGroups[0].rules[0].value,'US');
});
test('duration, calendar, weekday and late-entry delay modes use the requested timezone',()=>{
 assert.equal(canvasDelayDue({...canvasStepDefaults('delay'),delayValue:2,delayUnit:'Weeks'},'2026-11-12T00:00:00Z'),'2026-11-26T00:00:00.000Z');
 assert.equal(canvasDelayDue({delayMode:'date',delayDate:'2026-11-12',delayTime:'12:00',delayTimezone:'company'},'2026-11-12T00:00:00Z'),'2026-11-12T17:00:00.000Z');
 assert.equal(canvasDelayDue({delayMode:'weekday',delayWeekday:1,delayTime:'12:00',delayTimezone:'UTC',lateBehavior:'next_week'},'2026-11-16T13:00:00Z'),'2026-11-23T12:00:00.000Z');
 assert.equal(canvasDelayDue({delayMode:'weekday',delayWeekday:1,delayTime:'12:00',delayTimezone:'UTC',lateBehavior:'same_day'},'2026-11-16T13:00:00Z'),'2026-11-16T13:00:00.000Z');
 assert.equal(canvasDelayDue({delayMode:'duration',delayValue:1,delayUnit:'Days',specificTime:true,delayTime:'12:00',delayTimezone:'UTC'},'2026-11-12T13:00:00Z'),'2026-11-14T12:00:00.000Z');
});
test('invalid calendar dates do not throw while validating a draft',()=>{
 for(const delayDate of ['2026-02-30','2026-99-99',''])assert.ok(canvasStepIssues(node('delay',{delayMode:'date',delayDate,delayTime:'12:00'})).length);
 assert.equal(isCanvasGraph({nodes:[node('update',[])],edges:[]}),false);
});
test('user update UI and Braze attributes JSON apply changes without replacing unrelated data',()=>{
 const before={plan:'free',obsolete:'old',visits:2,tags:['a'],keep:true};
 const after=canvasUpdatedProfile(before,{updates:[{attribute:'plan',action:'update',value:'paid'},{attribute:'obsolete',action:'remove',value:''},{attribute:'visits',action:'increment',value:'3'},{attribute:'tags',action:'append',value:'["a","b"]'}]});
 assert.deepEqual(after,{plan:'paid',visits:5,tags:['a','b'],keep:true});assert.equal(before.plan,'free');
 assert.deepEqual(canvasUpdatedProfile(before,{updateMode:'json',updateJson:'{"attributes":[{"plan":"vip","obsolete":null,"external_id":"other"}]}'}),{plan:'vip',visits:2,tags:['a'],keep:true});
 assert.deepEqual(canvasStepIssues(node('update',{updateMode:'json',updateJson:'{"attributes":[{"plan":"vip"}]}',updates:[{attribute:'',value:''}]})),[]);
 assert.throws(()=>canvasUpdatedProfile(before,{updates:[{attribute:'visits',action:'increment',value:'NaN'}]}),/numeric/);
});
test('audience groups and experimental paths retain their independent configurations',()=>{
 const paths=canvasStepDefaults('experiment_paths');assert.deepEqual(canvasStepIssues(node('experiment_paths',paths)),[]);assert.equal(canvasMaxRoutes(node('experiment_paths',paths)),2);
 paths.paths[0].weight=70;assert.match(canvasStepIssues(node('experiment_paths',paths)).join(' '),/100%/);
 assert.equal(new Set(canvasActionTriggers.map(row=>row.type)).size,21);assert.ok(canvasActionTriggers.some(row=>row.type==='Interact With Step'));
});
test('Context variables require complete typed values and unique names',()=>{
 assert.ok(canvasStepIssues(node('context',canvasStepDefaults('context'))).length);
 assert.deepEqual(canvasStepIssues(node('context',{contextVariables:[{id:'a',name:'score',type:'Number',value:'7'}]})),[]);
 assert.match(canvasStepIssues(node('context',{contextVariables:[{name:'a',type:'Number',value:'7'},{name:'a',type:'String',value:'x'}]})).join(' '),/unique/);
});
test('brief and quiet-hour modes survive normalization; legacy custom times are retained',()=>{
 const config=structuredClone(defaultCanvasWizard);config.brief={id:'brief_one',name:'brief.xlsx',size:20,type:'application/octet-stream',url:'https://untrusted.test'};config.send.quietEnabled=true;config.send.quietMode='custom';
 const normalized=normalizeCanvasWizard(config);assert.equal(normalized.brief.url,'/api/campaign-briefs/brief_one');assert.equal(normalized.send.quietMode,'custom');
 delete config.send.quietMode;assert.equal(normalizeCanvasWizard(config).send.quietMode,'custom');
 config.send.quietMode='custom';config.send.quietStart='01:00';config.send.quietEnd='23:00';assert.ok(canvasWizardIssues(config,initialCanvasGraph).some(issue=>issue.title==='Invalid quiet hours'));
});
test('Canvas list advanced filters evaluate actual flags, Segment IDs and date ranges',()=>{
 const item={status:'Idle',wizard:{audience:{segmentIds:['seg_1']}},targetSegment:'old-name',experience:'Canvas Flow',createdAt:'2026-11-01',updatedAt:'2026-11-12',expiredInteractionData:true,optimizedWithAI:false,exceedsTargetingComplexity:true};
 assert.ok(canvasStatuses.includes('Idle'));
 assert.equal(canvasListMatches(item,{...emptyCanvasListFilters,targetSegment:'seg_1',expiredInteractions:true,complexTargeting:true,dateField:'updatedAt',from:'2026-11-12'}),true);
 assert.equal(canvasListMatches(item,{...emptyCanvasListFilters,optimized:true}),false);
 assert.equal(canvasListMatches(item,{...emptyCanvasListFilters,dateField:'createdAt',from:'2026-11-02'}),false);
});
test('named branch routes can merge and deleting their destination preserves variants',()=>{
 let graph={nodes:[{...node('entry'),id:'entry'},{...node('branch',{attribute:'country',value:'US'}),id:'branch'},{...node('update',{attribute:'tier',value:'gold'}),id:'update'}],edges:[['entry','branch']],variants:[{id:'v',name:'Variant 1',weight:100}]};
 graph=connectCanvasRoute(graph,'branch','update',1);graph=connectCanvasRoute(graph,'branch','update',0);
 assert.deepEqual(graph.nodes[1].config.branchTargets,{yes:'update',no:'update'});assert.deepEqual(validateCanvasGraph(graph),[]);
 graph=removeCanvasStep(graph,'update');assert.deepEqual(graph.variants,[{id:'v',name:'Variant 1',weight:100}]);assert.deepEqual(graph.nodes[1].config.branchTargets,{});assert.equal(graph.edges.length,1);
 assert.match(validateCanvasGraph(graph).join(' '),/two routes/);
});
test('path connection IDs survive rank changes and target deletion',()=>{
 let graph={nodes:[{...node('audience_paths',canvasStepDefaults('audience_paths')),id:'paths'},{...node('update'),id:'one'},{...node('update'),id:'two'}],edges:[]};
 graph=connectCanvasRoute(graph,'paths','one',0);graph=connectCanvasRoute(graph,'paths','two',1);
 graph.nodes[0].config.paths.reverse();assert.deepEqual(graph.nodes[0].config.paths.map(path=>path.nextNodeId),['two','one']);
 graph=removeCanvasStep(graph,'two');assert.equal(graph.nodes[0].config.paths[0].nextNodeId,undefined);assert.equal(graph.nodes[0].config.paths[1].nextNodeId,'one');
});
