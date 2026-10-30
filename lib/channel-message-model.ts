import { renderBrazeLiquid } from "./email-liquid.ts";
import { validDestination, type MessageDraft } from "./campaign-shared.ts";
import { smsMetrics } from "./sms-model.ts";

export type SmsValues = { messageType?: string; mediaUrl?: string; mediaType?: string; mediaCaption?: string; appendStop?: boolean; stopText?: string; linkShortening?: boolean; sendingNumber?: string; translations?: Record<string, string>; rcsTitle?: string; rcsDescription?: string; rcsButtons?: Array<{ label: string; url: string }>; rcsCards?: Array<{ title: string; description: string; mediaUrl: string; url: string }>; [key: string]: unknown };
export function channelValues(campaign: MessageDraft) { return (campaign.config?.channelValues ?? {}) as Record<string, unknown>; }
export function compileSms(campaign: MessageDraft, profile: Record<string, unknown> = {}, shorten?: (url: string) => string) {
  const v = channelValues(campaign) as SmsValues;
  const source = v.translations?.[String(profile.language)] ?? campaign.body ?? "";
  const render = (value: string) => renderBrazeLiquid(value, profile);
  let message = render(source);
  if (v.appendStop !== false && !/\bSTOP\b/i.test(message)) message += `${message ? "\n\n" : ""}${v.stopText || "Reply STOP to opt-out."}`;
  if (v.linkShortening !== false && shorten) message = message.replace(/https?:\/\/[^\s<>"']+/g, raw => { const suffix = raw.match(/[.,!?;:)\]]+$/)?.[0] ?? ""; return shorten(suffix ? raw.slice(0, -suffix.length) : raw) + suffix; });
  const mediaUrl = v.mediaUrl ? render(v.mediaUrl) : "";
  const kind = String(v.messageType ?? "SMS");
  if (kind !== "RCS" && message.length > 1600) throw new Error("SMS/MMS message must be 1,600 characters or fewer after personalization.");
  return { type: kind, to: String(profile.phone ?? profile.phone_number ?? ""), from: String(v.sendingNumber ?? ""), message, mediaUrl, mediaType: String(v.mediaType ?? "image"), caption: String(v.mediaCaption ?? ""), metrics: smsMetrics(message), ...(kind === "RCS" ? { richCard: { title: render(String(v.rcsTitle ?? "")), description: render(String(v.rcsDescription ?? "")), mediaUrl, buttons: (v.rcsButtons ?? []).map(b => ({ label: render(b.label), url: render(b.url) })) }, cards: (v.rcsCards ?? []).map(c => ({ ...c, title: render(c.title), description: render(c.description), mediaUrl: render(c.mediaUrl), url: render(c.url) })), fallbackText: message } : {}) };
}
export type ContactCard = { firstName: string; lastName: string; organization: string; phone: string; email: string };
export function contactVcard(contact: ContactCard) {
  const escape = (value: string) => value.replaceAll("\\", "\\\\").replace(/\r?\n/g, "\\n").replaceAll(";", "\\;").replaceAll(",", "\\,");
  return ["BEGIN:VCARD", "VERSION:3.0", `N:${escape(contact.lastName)};${escape(contact.firstName)};;;`, `FN:${escape(`${contact.firstName} ${contact.lastName}`.trim() || contact.organization)}`, `ORG:${escape(contact.organization)}`, `TEL;TYPE=WORK,VOICE:${escape(contact.phone)}`, `EMAIL;TYPE=WORK:${escape(contact.email)}`, "END:VCARD", ""].join("\r\n");
}
export function channelConfigurationIssues(campaign: MessageDraft): string[] {
  const v = channelValues(campaign), issues: string[] = [];
  const http = (value: unknown) => hasTemplate(value) || /^https?:\/\//i.test(String(value)) && validDestination(value);
  if (campaign.channel === "sms") {
    const kind = String(v.messageType ?? "SMS");
    if (!["SMS", "MMS", "RCS"].includes(kind)) issues.push("Choose SMS, MMS or RCS.");
    if (!campaign.config?.subscriptionGroupId) issues.push("Select an SMS subscription group.");
    if (kind !== "RCS" && !hasTemplate(campaign.body) && (campaign.body ?? "").length > 1600) issues.push("SMS/MMS message must be 1,600 characters or fewer.");
    if (kind === "SMS" && !campaign.body?.trim()) issues.push("Add SMS message content.");
    if (kind === "MMS" && !v.mediaUrl) issues.push("Add MMS media.");
    if (v.mediaUrl && !validDestination(v.mediaUrl, true) && !String(v.mediaUrl).startsWith("/api/message-assets/")) issues.push("Media must use an HTTPS URL or an uploaded asset.");
    if (kind === "RCS" && v.rcsTitle && !String(v.rcsDescription ?? "").trim()) issues.push("Add a rich card description.");
    if (kind === "RCS" && !campaign.body?.trim() && !v.rcsTitle && !(Array.isArray(v.rcsCards) && v.rcsCards.length)) issues.push("Add RCS text, media or cards.");
  }
  if (campaign.channel === "push") {
    if (!campaign.subject?.trim() && !v.silent) issues.push("Add a push title.");
    if (!campaign.body?.trim() && !v.silent) issues.push("Add push message content.");
    if (v.destination && !validDestination(v.destination)) issues.push("Enter a valid push destination.");
    if (v.ttl !== undefined && (!Number.isFinite(Number(v.ttl)) || Number(v.ttl) < 0 || Number(v.ttl) > 2419200)) issues.push("Push TTL must be between 0 and 2,419,200 seconds.");
    if (Array.isArray(v.platforms) && !v.platforms.length) issues.push("Select a push platform.");
    if(v.relevanceScoreEnabled!==false&&v.relevanceScore!==undefined&&(!Number.isFinite(Number(v.relevanceScore))||Number(v.relevanceScore)<0||Number(v.relevanceScore)>1))issues.push("Push relevance score must be between 0 and 1.");
    if(v.expirationEnabled===true&&!Number.isFinite(Date.parse(String(v.expiration??""))))issues.push("Choose a valid iOS expiration date and time.");
    if (v.notificationType === "Push stories" && (!Array.isArray(v.stories) || !v.stories.length)) issues.push("Add at least one Push Stories page.");
    if (v.notificationType === "Inline image" && !v.imageAndroid) issues.push("Add the Android inline image.");
  }
  if (campaign.channel === "banner") {
    if (!String(v.placement ?? "").trim()) issues.push("Select a Banner placement.");
    if (v.destinationUrl && !http(v.destinationUrl)) issues.push("Enter an HTTP or HTTPS Banner destination.");
    if (campaign.schedule && ["Action-based", "API-triggered"].includes(campaign.schedule)) issues.push("Banners only support scheduled delivery.");
    if (v.priority && !["High", "Medium", "Low", "Normal"].includes(String(v.priority))) issues.push("Choose a Banner priority.");
    if (v.editorMode === "html" && !String(v.html ?? "").trim()) issues.push("Add Banner HTML.");
    if (v.editorMode !== "html" && Array.isArray(v.rows)) {
      for (const row of v.rows) for (const cell of Array.isArray(row?.cells) ? row.cells : []) for (const block of Array.isArray(cell) ? cell : []) {
        const action = block?.action;
        if (action?.type === "url" && (!String(action.url ?? "").trim() || !validDestination(action.url))) issues.push("Enter a valid Banner block destination URL.");
        if (["log_event", "set_attribute"].includes(action?.type) && !String(action.name ?? "").trim()) issues.push("Add a name for the Banner block action.");
      }
    }
  }
  if (campaign.channel === "content") {
    if(v.separatePlatformActions===true){for(const [platform,action] of Object.entries((v.platformActions??{}) as Record<string,{behavior?:string;url?:string}>)){if(!["None","No action","Open web URL","Deep link into app"].includes(action.behavior??"None"))issues.push(`Choose a valid ${platform} card action.`);if(!["None","No action"].includes(action.behavior??"None")&&!hasTemplate(action.url)&&!validDestination(action.url))issues.push(`Enter a valid ${platform} card destination.`);}}
    if (v.imageUrl && !validDestination(v.imageUrl, true) && !String(v.imageUrl).startsWith("/api/message-assets/")) issues.push("Enter an HTTPS card image.");
    if (v.destinationUrl && !http(v.destinationUrl)) issues.push("Enter an HTTP or HTTPS card destination.");
    if (["Image only", "Captioned image"].includes(String(v.cardType)) && !v.imageUrl) issues.push("Add a card image.");
    if (v.expires === true && !v.expireDate) issues.push("Choose a card expiration date.");
    if (v.expirationDays !== undefined && (Number(v.expirationDays) <= 0 || Number(v.expirationDays) > 30)) issues.push("Card expiration must be greater than 0 and at most 30 days.");
    if (v.creationMode && !["launch", "first_impression"].includes(String(v.creationMode))) issues.push("Choose when to create the card.");
    if (v.removalEvent === "custom_event" && !String(v.removalEventName ?? "").trim()) issues.push("Choose a card removal event.");
  }
  if (campaign.channel === "line" && !campaign.config?.subscriptionGroupId) issues.push("Select a LINE subscription group.");
  return issues;
}
function hasTemplate(value: unknown) { return /\{[{%]/.test(String(value ?? "")); }
export function compilePush(campaign:MessageDraft,profile:Record<string,unknown>={}){
 const v=channelValues(campaign),translations=(v.contentByLanguage??{}) as Record<string,{title?:string;message?:string}>,localized=translations[String(profile.language??"en")]??translations[({en:"English",zh:"Chinese (Simplified)",ja:"Japanese",ko:"Korean",es:"Spanish"} as Record<string,string>)[String(profile.language??"en")]],platformContent=(v.platformContent??{}) as Record<string,{title?:string;message?:string}>,render=(source:unknown)=>renderBrazeLiquid(String(source??""),profile);
 return{platforms:(Array.isArray(v.platforms)?v.platforms:["iOS","Android"]).map((platform:string)=>({platform,title:render(localized?.title??(v.sameForAll===false?platformContent[platform]?.title:undefined)??campaign.subject),body:render(localized?.message??(v.sameForAll===false?platformContent[platform]?.message:undefined)??campaign.body),settings:v,payload:pushPlatformPayload(platform,v,render)})),settings:v};
}
export function compileContentCard(campaign:MessageDraft,profile:Record<string,unknown>={}){
 const v=channelValues(campaign),render=(value:unknown)=>renderBrazeLiquid(String(value??""),profile),translations=(v.contentByLanguage??{}) as Record<string,{title?:string;message?:string}>,localized=translations[String(profile.language??"en")]??{},platform=String(profile.platform??"iOS"),actions=(v.platformActions??{}) as Record<string,{behavior?:string;url?:string}>,action=v.separatePlatformActions===true?actions[platform]:undefined,behavior=String(action?.behavior??v.clickAction??(v.destinationUrl?"Open web URL":"None"));
 return{title:render(localized.title??campaign.subject),description:render(localized.message??campaign.body),type:String(v.cardType??"Classic"),imageUrl:render(v.imageUrl),destinationUrl:["None","No action"].includes(behavior)?"":render(action?.url??v.destinationUrl),clickAction:behavior,platformActions:v.platformActions??{},accessibilityLanguage:render(v.accessibilityLanguageLiquid||v.accessibilityLanguage||"en"),alt:render(v.alt),linkText:render(v.linkText),pinned:v.pinned===true,clickTracking:v.clickTracking!==false,keyValuePairs:v.keyValuePairs??[],creationMode:v.creationMode??"first_impression",removalEvent:v.removalEvent,removalEventName:v.removalEventName,removalProperties:v.removalProperties??[],expirationDays:Number(v.expirationDays??30)};
}

export function pushPlatformPayload(platform:string,v:Record<string,unknown>,render:(value:unknown)=>string=String){
 const pairs=Array.isArray(v.keyValuePairs)?Object.fromEntries(v.keyValuePairs.map((p:{key:string;value:string})=>[p.key,render(p.value)])):{};
 if(platform==="iOS")return {...pairs,aps:{sound:v.sound||undefined,badge:v.badgeEnabled===false?undefined:v.badge,"interruption-level":String(v.interruptionLevel??"Active").toLowerCase().replace(" ","-"),"relevance-score":v.relevanceScoreEnabled===false?undefined:v.relevanceScore,"thread-id":v.threadId,"summary-arg":v.summaryArgument,"summary-arg-count":v.summaryArgumentCount,category:v.notificationGroup||v.category,"content-available":v.contentAvailable===true||v.silent===true?1:undefined,"mutable-content":v.mutableContent!==false?1:undefined},headers:{"apns-collapse-id":v.collapseId,"apns-expiration":v.expirationEnabled===true&&v.expiration?Math.floor(new Date(String(v.expiration)).getTime()/1000):undefined}};
 if(platform==="Android")return {...pairs,ttl:Number(v.ttl??2419200),notification:{channel_id:v.androidChannel,tag:v.androidNotificationId?render(v.androidNotificationId):undefined,color:v.androidIconColorEnabled===true?v.androidIconColor:undefined,visibility:String(v.androidVisibility??"Private").toUpperCase(),notification_priority:String(v.androidPriority??"Default").toUpperCase(),sound:v.androidSound||undefined,category:v.androidCategory}};
 return {...pairs,ttl:Number(v.ttl??86400)};
}
