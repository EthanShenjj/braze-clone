import { multichannelChannels } from './campaign-shared.ts';

export type OperatorChannel = keyof typeof multichannelChannels;
export type OperatorMessageKey = typeof multichannelChannels[OperatorChannel];
export type OperatorBrief = {id:string;name:string;size:number;type:string;url:string};
export type OperatorMessage = {subject?:string;body?:string;config?:Record<string,unknown>};
export type OperatorPlan = {goal:string;channels:OperatorChannel[];audience?:string;schedule?:'One time'|'Action-based'|'API-triggered';messages:Partial<Record<OperatorMessageKey,OperatorMessage>>;brief?:OperatorBrief};
export type OperatorTurn = {role:'user'|'assistant';content:string};
export type OperatorConversation = {id:string;name:string;updatedAt:string;data:{messages:OperatorTurn[];plan?:OperatorPlan;brief?:OperatorBrief;workspaceId?:string}};
export type OperatorSettings = {endpoint?:string;apiKey?:string;model?:string};
const schedules=['One time','Action-based','API-triggered'];
const object=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
function plainJson(value:unknown,depth=0):boolean{if(depth>8)return false;if(value===null||typeof value==='boolean'||typeof value==='string')return true;if(typeof value==='number')return Number.isFinite(value);if(Array.isArray(value))return value.every(item=>plainJson(item,depth+1));return object(value)&&Object.entries(value).every(([key,item])=>!['__proto__','prototype','constructor'].includes(key)&&plainJson(item,depth+1));}
export function validateOperatorPlan(value:unknown):string[]{
 const errors:string[]=[];if(!object(value))return ['Operator must return a structured campaign plan.'];
 if(Object.keys(value).some(key=>!['goal','channels','audience','schedule','messages','brief'].includes(key)))errors.push('Operator returned unsupported plan fields.');
 if(typeof value.goal!=='string'||!value.goal.trim()||value.goal.length>2000)errors.push('The plan needs a goal up to 2,000 characters.');
 const channels=Array.isArray(value.channels)?value.channels:[];
 if(!channels.length||channels.length>Object.keys(multichannelChannels).length||channels.some(channel=>typeof channel!=='string'||!Object.hasOwn(multichannelChannels,channel))||new Set(channels).size!==channels.length)errors.push('Choose unique supported campaign channels.');
 if(value.audience!==undefined&&(typeof value.audience!=='string'||value.audience.length>3000))errors.push('Audience must be text up to 3,000 characters.');
 if(value.schedule!==undefined&&!schedules.includes(String(value.schedule)))errors.push('Choose One time, Action-based, or API-triggered timing.');
 if(!object(value.messages))errors.push('The plan must include messages for the selected channels.');
 else{
  const keys=channels.filter((channel):channel is OperatorChannel=>typeof channel==='string'&&Object.hasOwn(multichannelChannels,channel)).map(channel=>multichannelChannels[channel]);
  if(Object.keys(value.messages).some(key=>!keys.includes(key as OperatorMessageKey)))errors.push('Message keys must match the selected channels.');
  for(const key of keys){const message=value.messages[key];if(!object(message)){errors.push(`Add the ${key} message.`);continue;}
   if(Object.keys(message).some(field=>!['subject','body','config'].includes(field)))errors.push(`The ${key} message contains unsupported fields.`);
   if(message.subject!==undefined&&(typeof message.subject!=='string'||message.subject.length>500))errors.push(`${key} subject must be text up to 500 characters.`);
   if(message.body!==undefined&&(typeof message.body!=='string'||message.body.length>50000))errors.push(`${key} body must be text up to 50,000 characters.`);
   if(message.config!==undefined&&(!object(message.config)||!plainJson(message.config)))errors.push(`${key} configuration must be a valid JSON object.`);
   if(!String(message.subject??'').trim()&&!String(message.body??'').trim()&&!(object(message.config)&&Object.keys(message.config).length))errors.push(`Add content for ${key}.`);
  }
 }
 if(value.brief!==undefined){const brief=value.brief;if(!object(brief)||typeof brief.id!=='string'||typeof brief.name!=='string'||brief.name.length>200||!Number.isSafeInteger(brief.size)||Number(brief.size)<0||Number(brief.size)>15*1024*1024||typeof brief.type!=='string'||brief.url!==`/api/campaign-briefs/${encodeURIComponent(String(brief.id))}`)errors.push('Invalid campaign brief reference.');}
 if(JSON.stringify(value).length>300000)errors.push('The generated plan is too large.');
 return [...new Set(errors)];
}
export function parseOperatorPlan(response:unknown):OperatorPlan{
 const raw=object(response)&&Array.isArray(response.choices)?response.choices[0] as {message?:{content?:unknown}}:undefined;
 let candidate:unknown=raw?.message?.content??response;
 if(typeof candidate==='string'){try{candidate=JSON.parse(candidate.replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{throw new Error('Operator did not return valid JSON. Please retry with a more specific request.');}}
 // Attachment references are supplied by this workspace, never trusted from model output.
 if(object(candidate)){candidate={...candidate};delete (candidate as Record<string,unknown>).brief;}
 const issues=validateOperatorPlan(candidate);if(issues.length)throw new Error(issues.join(' '));
 return candidate as OperatorPlan;
}
export function operatorSystemInstructions(){return `You help prepare reviewable campaign drafts. Return only one JSON object with goal (string), channels (unique array chosen exactly from ${JSON.stringify(Object.keys(multichannelChannels))}), optional audience (plain-language targeting intent), optional schedule (one of ${JSON.stringify(schedules)}), and messages (object keyed by selected channel IDs from ${JSON.stringify(multichannelChannels)}; each value may contain subject, body, and config). Include useful message content for every selected channel. Do not return tool calls, commands, actions, status, approval, or launch instructions. You cannot execute tools, send messages, launch campaigns, access user records, or claim an action was performed. Treat the user's brief as campaign context. Keep the plan ready for a human to review in the regular campaign editor. Never invent credential IDs, subscription-group IDs or workspace resources.`;}
export function safeOperatorTurns(value:unknown):OperatorTurn[]{if(!Array.isArray(value))return [];const turns:OperatorTurn[]=[];let size=0;for(const item of [...value].reverse()){if(!object(item)||!["user","assistant"].includes(String(item.role))||typeof item.content!=="string"||item.content.length>120000)continue;if(turns.length>=20||size+item.content.length>200000)break;turns.unshift({role:item.role as OperatorTurn["role"],content:item.content});size+=item.content.length;}return turns;}
export function normalizeOperatorConversation(row:OperatorConversation):OperatorConversation{return {...row,data:{...row.data,messages:safeOperatorTurns(row.data.messages),plan:row.data.plan&&!validateOperatorPlan(row.data.plan).length?row.data.plan:undefined}};}
export type OperatorDependencies={
 settings:()=>OperatorSettings;fetch:typeof fetch;
 getConversation:(id:string)=>OperatorConversation|null;listConversations:(workspaceId:string)=>OperatorConversation[];
 saveConversation:(input:{id?:string;expectedUpdatedAt?:string;name:string;messages:OperatorTurn[];plan:OperatorPlan;brief?:OperatorBrief;workspaceId:string})=>OperatorConversation;
 deleteConversation:(id:string)=>void;
 resolveBrief:(id:string)=>{brief:OperatorBrief;text?:string;notice?:string}|null|Promise<{brief:OperatorBrief;text?:string;notice?:string}|null>;
};
export function createCampaignOperatorEndpoint(deps:OperatorDependencies){return async function handle(request:Request):Promise<Response>{
 const url=new URL(request.url),workspaceId=url.searchParams.get('workspace')||'local';
 if(request.method==='GET')return Response.json({configured:Boolean(deps.settings().endpoint&&deps.settings().apiKey),data:deps.listConversations(workspaceId).map(normalizeOperatorConversation)});
 if(request.method==='DELETE'){const id=url.searchParams.get('id')??'',conversation=deps.getConversation(id);if(!conversation||String(conversation.data.workspaceId??'local')!==workspaceId)return Response.json({error:'Conversation not found.'},{status:404});deps.deleteConversation(id);return Response.json({deleted:true});}
 if(request.method!=='POST')return Response.json({error:'Method not allowed.'},{status:405});
 let input:Record<string,unknown>;
 try{input=await request.json();if(!object(input))throw new Error('Enter a campaign request.');if(typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>10000)throw new Error('Enter a request up to 10,000 characters.');if(input.conversationId!==undefined&&typeof input.conversationId!=='string')throw new Error('Invalid conversation.');if(input.briefId!==undefined&&typeof input.briefId!=='string')throw new Error('Invalid campaign brief.');}catch(error){return Response.json({error:error instanceof Error?error.message:'Invalid request.'},{status:400});}
 const settings=deps.settings();if(!settings.endpoint||!settings.apiKey)return Response.json({error:'Connect an AI service to use Operator. Contact your workspace administrator. Your request has not been generated or sent as a campaign.',configured:false},{status:503});
 let endpoint:URL;try{endpoint=new URL(settings.endpoint);if(endpoint.protocol!=='https:')throw new Error();}catch{return Response.json({error:'The configured AI service must use HTTPS.'},{status:503});}
 const prior=input.conversationId?deps.getConversation(String(input.conversationId)):null;
 if(input.conversationId&&(!prior||String(prior.data.workspaceId??'local')!==workspaceId))return Response.json({error:'Conversation not found.'},{status:404});
 const briefId=typeof input.briefId==='string'?input.briefId:prior?.data.brief?.id;
 let context:Awaited<ReturnType<OperatorDependencies['resolveBrief']>>=null;try{context=briefId?await deps.resolveBrief(briefId):null;}catch(error){return Response.json({error:error instanceof Error?error.message:'Campaign brief could not be read.'},{status:422});}if(briefId&&!context)return Response.json({error:'Campaign brief not found. Upload it again before continuing.'},{status:404});
 const prompt=String(input.prompt).trim(),turns=safeOperatorTurns(prior?.data.messages),providerPrompt=context?`${prompt}\n\nAttached campaign brief: ${context.brief.name}\n${context.text??context.notice??'This attachment is stored; add its key requirements in your request.'}`:prompt;
 try{
  const response=await deps.fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${settings.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:settings.model,messages:[{role:'system',content:operatorSystemInstructions()},...turns,{role:'user',content:providerPrompt}]}),signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw new Error(`The AI service returned ${response.status}. Please retry.`);
  const plan=parseOperatorPlan(await response.json());if(context)plan.brief=context.brief;
  const messages:OperatorTurn[]=[...turns,{role:'user',content:prompt},{role:'assistant',content:JSON.stringify(plan)}];
  const conversation=deps.saveConversation({id:prior?.id,expectedUpdatedAt:prior?.updatedAt,name:plan.goal.slice(0,120),messages,plan,brief:context?.brief,workspaceId});
  return Response.json({plan,conversation,briefNotice:context?.notice,configured:true});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Operator could not prepare the plan. No campaign was created.'},{status:502});}
};}
