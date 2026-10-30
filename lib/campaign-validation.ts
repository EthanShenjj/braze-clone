import { conversionConfigurationIssues } from "./campaign-form-model.ts";
import {campaignAudienceFieldKind} from "./campaign-audience-model.ts";
import { deliveryScheduleIssues } from "./campaign-scheduling.ts";
import { variantsFor as inAppVariants, validateInAppVariant } from "./in-app-model.ts";
import { normalizeWebhookVariants, validateWebhookVariant } from "./webhook-model.ts";
import { validateWhatsAppCampaign } from "./whatsapp-model.ts";
import { validateLineCampaign } from "./line-model.ts";
import { scheduleValidationIssues } from "./in-app-schedule.ts";
import { allocationIssues, audienceConfigurationIssues, campaignVariants, variantDraft, multichannelChannels } from "./campaign-shared.ts";
import { channelConfigurationIssues } from "./channel-message-model.ts";

export type CampaignForValidation = {
  name: string;
  channel: string;
  subject?: string;
  body?: string;
  config?: Record<string, unknown>;
  schedule?: string;
  conversion?: string;
};

export function campaignValidationIssues(campaign: CampaignForValidation): string[] {
  const issues: string[] = [];
  if (!campaign.name.trim()) issues.push("Enter a campaign name.");
  issues.push(...(["feature","api"].includes(campaign.channel)?[]:deliveryScheduleIssues(campaign)), ...allocationIssues(campaign), ...campaignAudienceIssues(campaign), ...conversionConfigurationIssues(campaign));
  if (campaign.channel === "feature") {
    const experiment=campaign.config?.featureExperiment as {flagId?:string;variants?:Array<{id:string;name:string;percentage:number;properties:unknown}>}|undefined;
    if(experiment){if(experiment.flagId!==campaign.subject)issues.push("Choose the same Feature Flag in the experiment and Campaign.");const variants=experiment.variants;if(!Array.isArray(variants)||variants.length<2||variants.length>8)issues.push("Feature experiments require between 2 and 8 variants.");else{if(new Set(variants.map(v=>v.id)).size!==variants.length)issues.push("Feature experiment variant IDs must be unique.");if(variants.some(v=>!v.id||!v.name?.trim()||!Number.isFinite(v.percentage)||v.percentage<0||v.percentage>100)||Math.abs(variants.reduce((sum,v)=>sum+v.percentage,0)-100)>.01)issues.push("Feature experiment variant percentages must total 100%.");if(variants.some(v=>!v.properties||typeof v.properties!=="object"||Array.isArray(v.properties)||JSON.stringify(v.properties).length>10000))issues.push("Feature variant properties must be JSON objects up to 10,000 characters.");}}

    if (!campaign.subject?.trim()) issues.push("Select a Feature Flag.");
    const rollout = Number((campaign.config?.channelValues as Record<string, unknown> | undefined)?.rollout ?? 50);
    if (!Number.isFinite(rollout) || rollout < 0 || rollout > 100) issues.push("Feature rollout must be between 0 and 100.");
    try { const properties = JSON.parse(campaign.body || "{}"); if (!properties || typeof properties !== "object" || Array.isArray(properties)) issues.push("Feature properties must be a JSON object."); } catch { issues.push("Feature properties must be valid JSON."); }
  }
  if (["multichannel", "operator"].includes(campaign.channel)) {
    const values = (campaign.config?.channelValues ?? {}) as Record<string, unknown>;
    const channels = Array.isArray(values.channels) ? values.channels as string[] : [];
    const content = (values.channelContent ?? {}) as Record<string, string>; const linked = (values.childCampaignIds ?? {}) as Record<string, string>;
    if (!channels.length) issues.push("Select at least one delivery channel.");
    if (new Set(channels).size !== channels.length) issues.push("Choose each delivery channel only once.");
    const messages = (campaign.config?.multichannelMessages ?? {}) as Record<string, CampaignForValidation>;
    const allowed: Record<string, string> = { ...multichannelChannels, SMS: "sms" };
    for (const channel of channels) {
      if (!allowed[channel]) { issues.push(`${channel} is not available in multichannel Campaigns.`); continue; }
      if (messages[allowed[channel]]) issues.push(...campaignComposeIssues({ ...messages[allowed[channel]], name: campaign.name, channel: allowed[channel] }).map(issue => `${channel}: ${issue}`));
      else if (!content[channel]?.trim() && !linked[channel]) issues.push(`Add content or select a saved Campaign for ${channel}.`);
    }
    if (values.rule && values.rule !== "Send all channels at once") issues.push("Delayed engagement-based fallback requires a scheduled Canvas journey.");
    return issues;
  }
  if (campaign.channel === "email" && !campaign.subject?.trim()) issues.push("Add an email subject line in Sending info.");
  const rows = campaign.config?.emailRows;
  const hasRows = Array.isArray(rows) && rows.some((row: { cells?: { blocks?: unknown[] }[] }) => Array.isArray(row?.cells) && row.cells.some(cell => Array.isArray(cell?.blocks) && cell.blocks.length > 0));
  const blocks = campaign.config?.emailBlocks;
  const hasBlocks = Array.isArray(blocks) && blocks.length > 0;
  const variants = campaignVariants(campaign);
  for (let i = 0; i < variants.length; i++) issues.push(...channelConfigurationIssues(variantDraft(campaign, i)).map(issue => variants.length > 1 ? `${variants[i].name}: ${issue}` : issue));
  if(campaign.channel==="email")for(const [index,variant] of variants.entries()){
    const message=variantDraft(campaign,index),prefix=variants.length>1?`${variant.name}: `:"",rows=message.config?.emailRows,blocks=message.config?.emailBlocks;
    const design=Array.isArray(rows)&&rows.some(row=>Array.isArray(row?.cells)&&row.cells.some((cell:{blocks?:unknown[]})=>Array.isArray(cell?.blocks)&&cell.blocks.length>0))||Array.isArray(blocks)&&blocks.length>0;
    if(!message.subject?.trim())issues.push(`${prefix}Add an email subject line in Sending info.`);
    if(!message.body?.trim()&&!design)issues.push(`${prefix}Add message content before launching.`);
  }

  if (campaign.channel === "line") {
    issues.push(...variants.flatMap((variant,index) => validateLineCampaign(variantDraft(campaign,index)).map(issue => variants.length > 1 ? `${variant.name}: ${issue}` : issue)));
  } else if (campaign.channel === "iam") {
    try { issues.push(...inAppVariants(campaign).flatMap(validateInAppVariant)); } catch { issues.push("Invalid in-app message configuration."); }
    const delivery = campaign.config?.delivery as Record<string, unknown> | undefined;
    if (delivery?.schemaVersion === 2) issues.push(...scheduleValidationIssues(delivery));
  } else if (campaign.channel === "whatsapp") {
    issues.push(...validateWhatsAppCampaign(campaign));
  } else if (campaign.channel === "webhook") {
    issues.push(...normalizeWebhookVariants(campaign).flatMap(variant => validateWebhookVariant(variant)));
  } else if (!campaign.body?.trim() && !(campaign.channel === "email" && (hasRows || hasBlocks)) && !["feature", "api", "sms", "banner", "content", "push"].includes(campaign.channel)) {
    issues.push("Add message content before launching.");
  }
  return [...new Set(issues)];
}

export function subscriptionCapabilityIssues(campaign:{channel:string;config?:Record<string,unknown>},capabilities?:{sms:boolean;mms:boolean;rcs:boolean}){
 if(campaign.channel!=="sms")return [];
 const available=capabilities??{sms:true,mms:false,rcs:false},values=(campaign.config?.channelValues??{}) as Record<string,unknown>,variants=campaign.config?.smsVariants;
 const kinds=Array.isArray(variants)&&variants.length?variants.map(v=>String(v.values?.messageType??v.config?.channelValues?.messageType??values.messageType??"SMS")):[String(values.messageType??"SMS")];
 return [...new Set(kinds.filter(kind=>!["SMS","MMS","RCS"].includes(kind)||!available[kind.toLowerCase() as keyof typeof available]).map(kind=>`The selected subscription group does not support ${kind}.`))];
}

/** Validate channel composition without letting unrelated later-step state mark Compose incomplete. */
export function campaignComposeIssues(campaign:CampaignForValidation):string[]{
 const normalized=(draft:CampaignForValidation):CampaignForValidation=>{
  const config={...draft.config};
  for(const field of ["audienceGroups","audienceSegments","audienceSegmentOperator","conversionEvents","limitVolume","maxUsers","rateLimitEnabled","rateLimit"])delete config[field];
  if(config.multichannelMessages&&typeof config.multichannelMessages==="object")config.multichannelMessages=Object.fromEntries(Object.entries(config.multichannelMessages as Record<string,CampaignForValidation>).map(([channel,child])=>[channel,normalized({...child,name:draft.name,channel})]));
  return {...draft,conversion:"Start Session",schedule:"One time",config:{...config,delivery:{timing:"now",schemaVersion:3},controlGroup:0,variantSplits:undefined}};
 };
 return campaignValidationIssues(normalized(campaign));
}
export function campaignAudienceIssues(campaign:{channel:string;config?:Record<string,unknown>}):string[]{
 const issues=audienceConfigurationIssues(campaign),config=campaign.config??{};
 if(config.audienceSegmentOperator!==undefined&&!["AND","OR"].includes(String(config.audienceSegmentOperator)))issues.push("Choose AND or OR for the selected segments.");
 if(config.audienceSegments!==undefined&&(!Array.isArray(config.audienceSegments)||config.audienceSegments.some(value=>typeof value!=="string"||!value.trim())))issues.push("Choose valid audience segments.");
 if(config.limitVolume===true&&(!Number.isSafeInteger(Number(config.maxUsers??100))||Number(config.maxUsers??100)<=0))issues.push("Enter a maximum audience size greater than zero.");
 if(config.rateLimitEnabled===true&&(!Number.isSafeInteger(Number(config.rateLimit??100))||Number(config.rateLimit??100)<=0))issues.push("Enter a message rate greater than zero.");
 if(Array.isArray(config.audienceGroups))for(const group of config.audienceGroups){if(!Array.isArray(group?.rules))continue;for(const rule of group.rules){
  if(!rule||typeof rule.field!=="string"||typeof rule.value!=="string"||["exists","not_exists"].includes(rule.operator))continue;
  const kind=campaignAudienceFieldKind(rule.field),comparison=["greater_than","less_than"].includes(rule.operator);
  if(kind==="date"&&(comparison||["equals","not_equals"].includes(rule.operator))&&rule.value.trim()&&!Number.isFinite(Date.parse(rule.value)))issues.push("Enter a valid date for the audience filter.");
  if((kind==="number"||comparison&&kind!=="date")&&rule.value.trim()&&!Number.isFinite(Number(rule.value)))issues.push("Enter a numeric audience filter value.");
  if(kind==="boolean"&&rule.value.trim()&&!["true","false","0","1"].includes(rule.value.toLowerCase()))issues.push("Use true or false for a boolean audience filter.");
 }}
 return [...new Set(issues)];
}
