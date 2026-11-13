import type {MessageDraft,MessageVariant} from './campaign-shared.ts';

/** Keep the SMS composer's legacy `values` and shared variant config in sync. */
export function canvasEditorSmsUpdate(draft:MessageDraft,patch:Partial<MessageDraft>):Partial<MessageDraft>{
  if(!Array.isArray(patch.config?.smsVariants))return patch;
  const base=(draft.config?.channelValues??{}) as Record<string,unknown>;
  const variants=(patch.config.smsVariants as MessageVariant[]).map(variant=>{
    const config={...variant.config};
    // Subscription is shared by this SMS message; variants contain content only.
    delete config.subscriptionGroupId;
    delete config.smsVariants;
    delete config.previewVariantId;
    const values={...base,...(variant.values as object??{}),...(config.channelValues as object??{})};
    return {...variant,values,config:{...config,channelValues:values}};
  });
  return {...patch,body:variants[0]?.body??draft.body,config:{...draft.config,...patch.config,smsVariants:variants,channelValues:{...(draft.config?.channelValues as object??{}),...variants[0]?.values}}};
}
