import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasRatePresets,canvasCustomRateValid,canvasOptimizerComponentTypes,canvasOptimizerComponents,canvasOptimizerCombinations,canvasComponentSnippet,canvasOptimizerIssues,canvasLongestDuration,formatCanvasDuration,canvasDeliverySettings,canvasDeliveryIssues,canvasPropertyGroupsMatch} from '../lib/canvas-builder-model.ts';
import {canvasConversionCatalog,canvasConversionIssues,normalizeCanvasConversions,canvasConversionMatches} from '../lib/canvas-conversion-model.ts';
import {canvasActionInteractions,canvasSubscriptionUpdateSources,canvasTriggerIssues} from '../lib/canvas-action-model.ts';
import {normalizeCanvasWizard,canvasWizardIssues,defaultCanvasWizard} from '../lib/canvas-wizard-model.ts';
const node=(id,kind,config={})=>({id,kind,label:id,x:600,y:200,config});
const rule=(field,value,operator='equals')=>({id:field,field,value,operator});
const groups=rules=>[{id:'g',operator:'AND',rules}];
test('source rate presets and custom dialog accept the full observed range',()=>{
 assert.deepEqual(canvasRatePresets,[10,25,50,100,250,500,1000,2500,5000,10000,25000,50000,100000,250000,500000,1000000]);
 assert.equal(canvasCustomRateValid(1000),true);assert.equal(canvasCustomRateValid(1000000),true);
 for(const value of [999,1000001,1000.5,NaN,Infinity])assert.equal(canvasCustomRateValid(value),false);
 const wizard=structuredClone(defaultCanvasWizard);wizard.send.rateEnabled=true;wizard.send.ratePerMinute=1000000;
 assert.equal(canvasWizardIssues(wizard,{nodes:[],edges:[]}).some(row=>row.step==='sendSettings'),false);
});
test('optimizer has seven real component types, Liquid snippet, and nonempty variant validation',()=>{
 assert.deepEqual(canvasOptimizerComponentTypes,['Subject','Preheader','Sender Name','Body Header','Body Content','Primary CTA','Image']);
 assert.equal(canvasComponentSnippet('Subject'),"{% message_component 'Subject' %}");
 const components=[{id:'s',type:'Subject',variants:[{id:'1',value:'Hello {{first_name}}'},{id:'2',value:'Welcome'}]},{id:'p',type:'Preheader',variants:[{id:'3',value:'One'},{id:'4',value:'Two'},{id:'5',value:'Three'}]}];
 assert.equal(canvasOptimizerCombinations([]),0);assert.equal(canvasOptimizerCombinations(components),6);
 assert.deepEqual(canvasOptimizerIssues({channel:'email',optimizerComponents:components,optimizationEvent:'clicks'}),[]);
 assert.match(canvasOptimizerIssues({channel:'email',optimizerComponents:[{...components[0],variants:[{id:'1',value:' '},{id:'2',value:'Only one'}]}]}).join(' '),/2 variants/);
 assert.match(canvasOptimizerIssues({channel:'whatsapp',optimizerComponents:components}).join(' '),/Choose Email/);
 assert.match(canvasOptimizerIssues({channel:'email',optimizerComponents:[components[0],components[0]]}).join(' '),/only once/);
});
test('malformed saved components and delivery groups can be edited without crashing',()=>{
 assert.doesNotThrow(()=>canvasOptimizerIssues({optimizerComponents:[null,{variants:[null,{value:12}]}]}));
 assert.equal(canvasOptimizerComponents({optimizerComponents:[null]})[0].variants.length,0);
 assert.doesNotThrow(()=>canvasDeliveryIssues({deliveryValidationEnabled:true,deliveryFilterGroups:[null,{rules:[null]}]}));
 assert.ok(canvasDeliveryIssues({deliveryValidationEnabled:true,deliveryFilterGroups:[{rules:[null]}]}).length);
});
test('maximum duration follows the longest connected route and flags dynamic delays and loops',()=>{
 const graph={nodes:[node('entry','entry'),node('a','delay',{durationHours:2}),node('b','delay',{durationHours:5}),node('c','delay',{durationHours:1}),node('disconnected','delay',{durationHours:900})],edges:[['entry','a'],['entry','b'],['a','c']]};
 assert.equal(canvasLongestDuration(graph).seconds,5*3600);assert.equal(formatCanvasDuration(90061),'1 day 1 hour 1 minute 1 second');
 graph.nodes[2].config.personalizeDelay=true;assert.equal(canvasLongestDuration(graph).seconds,3*3600);assert.equal(canvasLongestDuration(graph).personalized,true);
 graph.edges.push(['c','a']);assert.equal(canvasLongestDuration(graph).cycle,true);
 assert.equal(canvasLongestDuration({nodes:[node('entry','entry'),node('a','action_paths',{evaluationValue:5,evaluationUnit:'Minutes'})],edges:[['entry','a']]}).seconds,300);
});
test('delivery settings retain legacy drafts and require a valid custom fallback time',()=>{
 const value=canvasDeliverySettings({intelligentTiming:true,timingFallback:'custom',timingTime:'09:15',deliveryValidation:true,messageQuietHours:false,deliverySegmentIds:['a',null],deliveryFilterGroups:[{id:'g',operator:'OR',exclude:true,rules:[rule('country','US')]}]});
 assert.equal(value.intelligentFallback,'custom');assert.equal(value.intelligentFallbackTime,'09:15');assert.equal(value.deliveryValidationEnabled,true);assert.equal(value.deliveryFailure,'exit');assert.equal(value.messageQuietHours,false);assert.deepEqual(value.deliverySegmentIds,['a']);assert.equal(value.deliveryFilterGroups[0].exclude,true);
 assert.equal(canvasDeliveryIssues({intelligentTiming:true,intelligentFallback:'custom',intelligentFallbackTime:'25:00'}).length,1);
 assert.equal(canvasDeliveryIssues({intelligentTiming:false,intelligentFallback:'custom',intelligentFallbackTime:'25:00'}).length,0);
});
test('conversion drafts retain app choices and property groups through normalization',()=>{
 assert.equal(canvasConversionCatalog.length,9);
 const wizard=normalizeCanvasWizard({conversionEvents:[{id:'e',type:'View product',appScope:'all',deadline:3,unit:'Days',propertiesEnabled:true,propertyFilters:groups([rule('price','10','greater_than')])},{id:'a',type:'Starts Session',appScope:'specific',appIds:['ios'],deadline:2,unit:'Hours'}]});
 assert.equal(wizard.conversionEvents[0].eventName,'ecommerce.product_viewed');assert.equal(wizard.conversionEvents[0].propertyFilters[0].rules[0].value,'10');assert.deepEqual(wizard.conversionEvents[1].appIds,['ios']);
 assert.ok(canvasConversionIssues({...wizard.conversionEvents[1],appIds:[]}).length);
 assert.match(canvasConversionIssues({id:'c',type:'Performs Custom Event',appScope:'all',deadline:3,unit:'Days'}).join(' '),/custom conversion/);
 assert.doesNotThrow(()=>normalizeCanvasConversions([null,{id:'a',type:'Starts Session',propertyFilters:[null,{rules:[null]}]}]));
});
test('conversion matching respects entry window, specific app, actual event name and typed properties',()=>{
 const entered='2026-11-12T00:00:00.000Z',event={id:'c',type:'Performs Custom Event',eventName:'checkout',deadline:2,unit:'Hours',appScope:'specific',appIds:['web'],propertiesEnabled:true,propertyFilters:groups([rule('price','10','greater_than'),rule('order.country','US')])};
 const activity={name:'checkout',at:'2026-11-12T01:00:00.000Z',appId:'web',properties:{price:12,order:{country:'US'}}};
 assert.equal(canvasConversionMatches(event,activity,entered),true);
 for(const patch of [{name:'viewed'},{appId:'ios'},{at:'2026-11-11T23:00:00.000Z'},{at:'2026-11-12T03:00:00.000Z'},{properties:{price:9,order:{country:'US'}}}])assert.equal(canvasConversionMatches(event,{...activity,...patch},entered),false);
 assert.equal(canvasPropertyGroupsMatch({'order.country':'US'},groups([rule('order.country','US')])),true);
 assert.equal(canvasPropertyGroupsMatch({},groups([rule('__proto__.polluted','yes')])),false);
});
test('deep action options match source catalogs and validate conditional fields',()=>{
 assert.equal(canvasActionInteractions.length,29);assert.equal(new Set(canvasActionInteractions.map(row=>row.id)).size,29);
 assert.deepEqual(canvasSubscriptionUpdateSources,['Canvas User Update Step','CSV Import','List-Unsubscribe','Preference Center','REST API','SDK','Shopify','Subscription Page']);
 assert.deepEqual(canvasTriggerIssues({id:'p',type:'Perform Conversion Event'}),[]);
 assert.ok(canvasTriggerIssues({id:'c',type:'Interact With Campaign',interaction:'opened_email'}).length);
 assert.deepEqual(canvasTriggerIssues({id:'c',type:'Interact With Campaign',interaction:'opened_email',campaignId:'email'}),[]);
 assert.match(canvasTriggerIssues({id:'g',type:'Update Subscription Group Status',subscriptionType:'LINE',subscriptionState:'subscribed',subscriptionGroupId:'line'}).join(' '),/update source/);
 assert.match(canvasTriggerIssues({id:'a',type:'Change Custom Attribute Value',attribute:'tier',attributeMode:'specific'}).join(' '),/attribute value/);
 assert.ok(canvasTriggerIssues({id:'loc',type:'Enter a Location',locationMode:'polygon',polygon:'[[0,0],[1,1]]'}).length);
 assert.deepEqual(canvasTriggerIssues({id:'loc',type:'Enter a Location',locationMode:'polygon',polygon:'[[0,0],[1,1],[0,1]]'}),[]);
});
