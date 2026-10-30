import "server-only";
import type { MessageDraft } from "./campaign-shared";
export type DeliveryResult={mode:"preview"|"provider"|"sdk";status:"prepared"|"accepted"|"delivered"|"available";delivered:boolean;providerId?:string;reason?:string};
export function messageDeliveryCapability(channel:string){
 const native=channel==="email"?Boolean(process.env.RESEND_API_KEY):channel==="sms"?Boolean(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN):channel==="line"?Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN):false;
 const gateway=Boolean(process.env.MESSAGE_DELIVERY_ENDPOINT&&process.env.MESSAGE_DELIVERY_API_KEY);
 return{channel,configured:["iam","banner","content"].includes(channel)||native||gateway,enabled:process.env.MESSAGE_DELIVERY_ENABLED==="true",provider:native?channel==="email"?"Resend":channel==="sms"?"Twilio":"LINE":gateway?"Message delivery connector":["iam","banner","content"].includes(channel)?"SDK":"Unconfigured"};
}
const publicUrl=(url:string)=>url.startsWith("/")?`${process.env.BRAZE_PUBLIC_URL??(process.env.VERCEL_PROJECT_PRODUCTION_URL?`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`:"")}${url}`:url;
export async function dispatchPreparedMessage(campaign:MessageDraft,recipient:string,message:Record<string,unknown>,test=false):Promise<DeliveryResult>{
 if(["iam","banner","content"].includes(campaign.channel))return{mode:"sdk",status:"available",delivered:false,reason:"Available to an eligible SDK session. Delivery is confirmed by SDK receipts."};
 const capability=messageDeliveryCapability(campaign.channel);
 if(!capability.enabled||!capability.configured)return{mode:"preview",status:"prepared",delivered:false,reason:!capability.configured?`Connect a ${campaign.channel} delivery provider to send messages.`:"Live delivery is disabled for this workspace."};
 let response:Response;
 if(capability.provider==="Resend"){
  if(message.ipPool)throw new Error("This email selects an IP pool. Select a delivery connector that supports IP-pool routing.");
  if(message.extras && typeof message.extras === "object" && Object.keys(message.extras).length)throw new Error("This email uses Extras. Select a delivery connector that supports email metadata.");
  if(message.attachmentResolutionRequired)throw new Error("This email includes an attachment whose size has not been verified. Upload the attachment before sending through this provider.");
  const fromName=String(message.fromName??"").replace(/[\r\n]/g,"").trim();
  const from=fromName?`${JSON.stringify(fromName)} <${String(message.from??"")}>`:message.from;
  const attachments=Array.isArray(message.attachments)?message.attachments as Array<{name:string;content?:string;url?:string}>:[];
  response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[recipient],subject:message.subject,html:message.html,text:message.text,...(message.replyTo?{reply_to:message.replyTo}:{}),...(message.bcc?{bcc:[message.bcc]}:{}),headers:message.headers,attachments:attachments.map(a=>({filename:a.name,...(a.content?{content:a.content}:{path:publicUrl(a.url??"")})}))}),signal:AbortSignal.timeout(20000)});
 }else if(capability.provider==="Twilio"){
  if(!/^\+\d{8,15}$/.test(recipient))throw new Error("Enter an E.164 recipient phone number.");
  const values=(campaign.config?.channelValues??{}) as Record<string,unknown>,body=new URLSearchParams({To:recipient});
  const service=String(values.messagingServiceSid??process.env.TWILIO_MESSAGING_SERVICE_SID??"");if(service)body.set("MessagingServiceSid",service);else if(message.from)body.set("From",String(message.from));else throw new Error("Select a sending number or messaging service.");
  if(message.type==="RCS"&&values.contentSid){body.set("ContentSid",String(values.contentSid));if(values.contentVariables)body.set("ContentVariables",String(values.contentVariables));}
  else{if(message.type==="RCS"&&(message.richCard as {title?:string})?.title)throw new Error("Rich RCS requires a Twilio Content SID or the message delivery connector.");if(message.message)body.set("Body",String(message.message));if(message.mediaUrl)body.set("MediaUrl",publicUrl(String(message.mediaUrl)));}
  const sid=process.env.TWILIO_ACCOUNT_SID!;response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,{method:"POST",headers:{Authorization:`Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,"Content-Type":"application/x-www-form-urlencoded"},body,signal:AbortSignal.timeout(20000)});
 }else if(capability.provider==="LINE"){
  if(!/^U[a-f0-9]{32}$/i.test(recipient))throw new Error("Choose a user with a native_line_id for this Official Account.");
  const absolute=(value:unknown):unknown=>typeof value==="string"?value.startsWith("/api/message-assets/")?publicUrl(value):value:Array.isArray(value)?value.map(absolute):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,absolute(v)])):value;
  response=await fetch("https://api.line.me/v2/bot/message/push",{method:"POST",headers:{Authorization:`Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,"Content-Type":"application/json","X-Line-Retry-Key":crypto.randomUUID()},body:JSON.stringify({to:recipient,messages:absolute(message.messages)}),signal:AbortSignal.timeout(20000)});
 }else{
  const endpoint=new URL(process.env.MESSAGE_DELIVERY_ENDPOINT!);if(endpoint.protocol!=="https:"&&!(process.env.NODE_ENV!=="production"&&["localhost","127.0.0.1"].includes(endpoint.hostname)))throw new Error("The message delivery connector must use HTTPS.");
  response=await fetch(endpoint,{method:"POST",headers:{Authorization:`Bearer ${process.env.MESSAGE_DELIVERY_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({campaignId:campaign.id,channel:campaign.channel,recipient,message,test}),signal:AbortSignal.timeout(20000)});
 }
 const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(String(payload.message??payload.error?.message??payload.error??`Provider returned ${response.status}.`));
 const delivered=payload.status==="delivered"||payload.delivered===true;
 return{mode:"provider",status:delivered?"delivered":"accepted",delivered,providerId:String(payload.id??payload.sid??response.headers.get("x-line-request-id")??"")};
}
