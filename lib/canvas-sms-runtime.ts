import {zonedDateTime} from './campaign-scheduling.ts';
/** The first optimal local time at or after entry, within the next local day. */
export function canvasSmsDeliveryTime(config:Record<string,unknown>,at:string,profile:Record<string,unknown>,popularTime='17:00'){
 if(!config.intelligentTiming)return at;
 const best=profile.best_send_hour,hasBest=best!==undefined&&best!==null&&Number.isFinite(Number(best))&&Number(best)>=0&&Number(best)<24;
 const time=hasBest?`${String(Math.floor(Number(best))).padStart(2,'0')}:00`:(config.intelligentFallback??config.timingFallback)==='custom'?String(config.intelligentFallbackTime??config.timingTime??'17:00'):popularTime;
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('Choose a valid Intelligent Timing fallback time.');
 const zone=String(profile.time_zone??profile.timezone??'UTC'),parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(at)).map(part=>[part.type,part.value]));
 const date=`${parts.year}-${parts.month}-${parts.day}`;let due=zonedDateTime(date,time,zone);
 if(due.getTime()<new Date(at).getTime()){const next=new Date(`${date}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+1);due=zonedDateTime(next.toISOString().slice(0,10),time,zone);}
 return due.toISOString();
}
export function popularCanvasSmsTime(profiles:Array<{id:string;attributes:Record<string,unknown>}>,events:Array<{userId:string;at:string}>){
 const hours=new Map<number,number>(),users=new Map(profiles.map(profile=>[profile.id,profile.attributes]));
 for(const event of events){const profile=users.get(event.userId);if(!profile||!Number.isFinite(Date.parse(event.at)))continue;try{const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:String(profile.time_zone??profile.timezone??'UTC'),hour:'2-digit',hourCycle:'h23'}).format(new Date(event.at)));hours.set(hour,(hours.get(hour)??0)+1);}catch{}}
 if(!hours.size)for(const {attributes}of profiles){const hour=attributes.best_send_hour;if(hour!==undefined&&hour!==null&&Number.isFinite(Number(hour))&&Number(hour)>=0&&Number(hour)<24)hours.set(Math.floor(Number(hour)),(hours.get(Math.floor(Number(hour)))??0)+1);}
 const hour=[...hours].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0]?.[0];return hour===undefined?'17:00':`${String(hour).padStart(2,'0')}:00`;
}
