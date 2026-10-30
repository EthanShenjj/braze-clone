import type { MessageDraft } from "./campaign-shared.ts";
import { resolveCampaignTiming, triggerEventName } from "./campaign-form-model.ts";
import { scheduleTriggers,type InAppTrigger } from "./in-app-schedule.ts";
function zonedParts(date:Date,zone:string){const values=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(date).map(p=>[p.type,p.value]));return{year:Number(values.year),month:Number(values.month),day:Number(values.day),hour:Number(values.hour),minute:Number(values.minute),second:Number(values.second)};}
export function zonedDateTime(date:string,time:string,zone="UTC"){
 const [year,month,day]=date.split("-").map(Number),[hour,minute]=time.split(":").map(Number),target=Date.UTC(year,month-1,day,hour,minute);let value=target;
 for(let i=0;i<4;i++){const p=zonedParts(new Date(value),zone),represented=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second),delta=target-represented;if(!delta)break;value+=delta;}
 return new Date(value);
}
export function nextScheduledTime(campaign:MessageDraft,from=new Date(),profile:Record<string,unknown>={},nextOccurrence=false){
 const d=(campaign.config?.delivery??{}) as Record<string,unknown>,timing=resolveCampaignTiming(campaign),zone=String(d.localTime||timing==="intelligent"?profile.time_zone??profile.timezone??d.timezone??"UTC":d.timezone??"UTC");
 const validZone=zone==="Company time"||zone==="User local time"?"UTC":zone;
 if(timing==="now"&&!nextOccurrence)return from;
 const today=zonedParts(from,validZone),date=String(d.startDate??`${today.year}-${String(today.month).padStart(2,"0")}-${String(today.day).padStart(2,"0")}`),bestHour=profile.best_send_hour,hasBestHour=bestHour!==undefined&&bestHour!==null&&Number.isFinite(Number(bestHour))&&Number(bestHour)>=0&&Number(bestHour)<=23,hour=timing==="intelligent"&&hasBestHour?Number(bestHour):null,time=hour!==null?`${String(Math.floor(hour)).padStart(2,"0")}:00`:String(timing==="intelligent"&&d.intelligentFallback==="custom"?d.intelligentFallbackTime??"10:00":timing==="intelligent"?d.intelligentPopularTime??d.sendTime??"10:00":d.sendTime??"10:00");
 let result=zonedDateTime(date,time,validZone);const frequency=String(d.frequency??"One time");
 if(frequency==="One time")return result<from&&!nextOccurrence?from:result;
 for(let n=0;n<370;n++){
  const p=zonedParts(result,validZone),dayOfWeek=new Date(Date.UTC(p.year,p.month-1,p.day)).getUTCDay();
  if(result>from&&(!nextOccurrence||result.getTime()>from.getTime())&&(frequency!=="Weekly"||dayOfWeek===Number(d.weekday??1)))return result;
  const nextDate=new Date(Date.UTC(p.year,p.month-1,p.day+(frequency==="Monthly"?0:1)));if(frequency==="Monthly")nextDate.setUTCMonth(nextDate.getUTCMonth()+1);
  result=zonedDateTime(nextDate.toISOString().slice(0,10),time,validZone);
 }
 throw new Error("Could not determine the next scheduled time.");
}
export function inQuietHours(date:Date,delivery:Record<string,unknown>,zone="UTC"){
 if(delivery.quietHours!==true)return false;const p=zonedParts(date,zone),time=`${String(p.hour).padStart(2,"0")}:${String(p.minute).padStart(2,"0")}`,start=String(delivery.quietStart??"22:00"),end=String(delivery.quietEnd??"08:00");return start<=end?time>=start&&time<end:time>=start||time<end;
}
export function nextAllowedDeliveryTime(at:Date,delivery:Record<string,unknown>,zone="UTC"){
 if(!inQuietHours(at,delivery,zone))return at;
 const parts=zonedParts(at,zone),day=new Date(Date.UTC(parts.year,parts.month-1,parts.day)),end=String(delivery.quietEnd??"08:00");
 let value=zonedDateTime(day.toISOString().slice(0,10),end,zone);if(value<=at){day.setUTCDate(day.getUTCDate()+1);value=zonedDateTime(day.toISOString().slice(0,10),end,zone);}
 for(let minute=0;minute<180;minute++){if(!inQuietHours(value,delivery,zone))return value;value=new Date(value.getTime()+60000);}throw new Error("Choose a valid quiet-hours interval.");
}
export function triggerMatches(trigger:InAppTrigger,event:{name:string;properties?:Record<string,unknown>;productId?:string}){
 const p=event.properties??{};
 const kind=trigger.type==="Start Session"?event.name==="session_start"&&(!trigger.specificApp||p.appId===trigger.appId):trigger.type==="Perform Custom Event"?event.name===trigger.eventName:trigger.type==="Make Purchase"?Boolean(event.productId)||event.name==="purchase":trigger.type==="Interact With Campaign"?["opened","clicked"].includes(event.name)&&(!trigger.specificCampaign||p.campaignId===trigger.campaignId)&&(!trigger.interaction||trigger.interaction===event.name):event.name===trigger.type||event.name===triggerEventName(trigger.type);
 if(!kind)return false;if(!trigger.filtersEnabled)return true;
 return (trigger.filterGroups??[]).every(g=>{const matches=g.conditions.map(c=>{const actual=p[c.property];if(c.operator==="exists")return actual!==undefined;if(c.operator==="does_not_exist")return actual===undefined;if(c.operator==="greater_than")return Number(actual)>Number(c.value);if(c.operator==="less_than")return Number(actual)<Number(c.value);if(c.operator==="contains")return String(actual??"").includes(c.value);return ["not_equals","is_not"].includes(c.operator)?String(actual)!==c.value:String(actual)===c.value;});return g.match==="any"?matches.some(Boolean):matches.every(Boolean);});
}
export function campaignTriggeredBy(campaign:MessageDraft,event:Parameters<typeof triggerMatches>[1]){const d=(campaign.config?.delivery??{}) as Record<string,unknown>;return scheduleTriggers(d).some(t=>triggerMatches(t,event));}
export function deliveryScheduleIssues(campaign:MessageDraft){
 const d=(campaign.config?.delivery??{}) as Record<string,unknown>,issues:string[]=[];
 if(d.schemaVersion!==3)return issues;
 if(campaign.schedule==="Action-based"){
  const triggers=scheduleTriggers(d);if(!triggers.length)issues.push("Add at least one trigger.");
  for(const t of triggers){if(t.type==="Perform Custom Event"&&!t.eventName?.trim())issues.push("Choose a custom event.");if(t.type==="Start Session"&&t.specificApp&&!t.appId)issues.push("Choose an app for the session trigger.");if(t.type==="Interact With Campaign"&&t.specificCampaign&&!t.campaignId)issues.push("Choose a campaign for the interaction trigger.");if(t.filtersEnabled&&(!t.filterGroups?.length||t.filterGroups.some(g=>!g.conditions.length||g.conditions.some(c=>!c.property.trim()||!["exists","does_not_exist"].includes(c.operator)&&!c.value.trim()))))issues.push("Complete the trigger property filters.");}
  if(!Number.isFinite(Number(d.delayMinutes??0))||Number(d.delayMinutes??0)<0||d.delayMode==="delay"&&Number(d.delayMinutes??0)<=0)issues.push("Enter a delay greater than zero.");
 }
 if((campaign.schedule??"One time")==="One time"&&resolveCampaignTiming(campaign)!=="now"||campaign.schedule==="Action-based"){
  if(!d.startDate||!d.sendTime)issues.push("Set the campaign start date and time.");
  else try{if(!Number.isFinite(zonedDateTime(String(d.startDate),String(d.sendTime),String(d.timezone??"UTC")).getTime()))issues.push("Invalid campaign date or time.");}catch{issues.push("Choose a valid campaign time zone.");}
 }
 if(resolveCampaignTiming(campaign)==="intelligent"&&d.intelligentFallback==="custom"&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(d.intelligentFallbackTime??"10:00")))issues.push("Choose a valid Intelligent Timing fallback time.");
 if(d.endEnabled){const end=campaignEndTime(d);if(!Number.isFinite(end.getTime()))issues.push("Set a valid campaign end time.");else if(d.startDate&&d.sendTime){try{if(end<=zonedDateTime(String(d.startDate),String(d.sendTime),String(d.timezone??"UTC")))issues.push("Set an end time after the campaign start.");}catch{}}}
 if(d.reeligible&&(!Number.isFinite(Number(d.reentryDays??1))||Number(d.reentryDays??1)<=0))issues.push("Enter a re-eligibility interval greater than zero.");
 if(d.quietHours&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(d.quietStart??"22:00"))||!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(d.quietEnd??"08:00"))||String(d.quietStart??"22:00")===String(d.quietEnd??"08:00")))issues.push("Choose a valid quiet-hours interval.");
 return [...new Set(issues)];
}

export function isWithinCampaignDuration(campaign:MessageDraft,at=new Date()) {
 const d=(campaign.config?.delivery??{}) as Record<string,unknown>;
 if(d.startDate&&d.sendTime){try{if(at<zonedDateTime(String(d.startDate),String(d.sendTime),String(d.timezone??"UTC")))return false;}catch{return false;}}
 if(d.endEnabled){const end=campaignEndTime(d);if(!Number.isFinite(end.getTime())||at>=end)return false;}
 return true;
}

function campaignEndTime(delivery:Record<string,unknown>){
 const raw=String(delivery.endTime??"");
 try{return /[zZ]$|[+-]\d\d:\d\d$/.test(raw)?new Date(raw):zonedDateTime(raw.slice(0,10),raw.slice(11,16),String(delivery.timezone??"UTC"));}catch{return new Date(NaN);}
}
