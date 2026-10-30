import { multichannelChannels, variantDraft, campaignVariants, type MessageDraft } from './campaign-shared.ts';

/** Resolve the selected embedded channel, preserving its own variant/config instead of stale parent mirrors. */
export function campaignPreviewDraft<T extends MessageDraft>(campaign:T):T {
  if(!['multichannel','operator'].includes(campaign.channel))return campaign;
  const values=(campaign.config?.channelValues??{}) as Record<string,unknown>;
  const labels=(Array.isArray(values.channels)?values.channels:[]) as string[];
  const channels:Record<string,string>={...multichannelChannels,SMS:'sms'};
  const selected=String(campaign.config?.previewChannel??values.activeChannel??'');
  const channel=labels.map(label=>channels[label]).find(key=>key===selected)??channels[labels[0]];
  if(!channel)return campaign;
  const messages=(campaign.config?.multichannelMessages??{}) as Record<string,MessageDraft>;
  const child=messages[channel];
  if(!child)return {...campaign,channel,subject:'',body:String((values.channelContent as Record<string,unknown>|undefined)?.[labels.find(label=>channels[label]===channel)??'']??''),config:{}};
  return {...campaign,...child,id:campaign.id,name:campaign.name,channel,subject:child.subject??"",body:child.body??"",config:{...child.config}};
}
export function selectedCampaignPreview<T extends MessageDraft>(campaign:T,variantId?:string):T {
  const current=campaignPreviewDraft(campaign);
  const selected=variantId??String(current.config?.previewVariantId??'');
  const index=Math.max(0,campaignVariants(current).findIndex(variant=>variant.id===selected));
  return variantDraft(current,index);
}
