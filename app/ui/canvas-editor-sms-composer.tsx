"use client";

import {campaignVariants} from '@/lib/campaign-shared';
import type {SmsValues} from '@/lib/channel-message-model';
import {canvasEditorSmsUpdate} from '@/lib/canvas-editor-model';
import {MessageVariants,type MessageEditorProps} from './message-controls';
import SmsMessageComposer from './sms-message-composer';
import styles from './campaign-editors.module.css';

export type SmsEditorContext={kind:'campaign'|'canvas';ownerId:string;nodeId?:string;workspaceId:string;testAvailable?:boolean};

export default function CanvasEditorSmsComposer({smsContext,...props}:MessageEditorProps&{smsContext?:SmsEditorContext}){
  const context=smsContext??{kind:'campaign' as const,ownerId:props.draft.id??'',workspaceId:String(props.draft.config?.workspaceId??'local')};
  return <section className={styles.workspace} aria-label="SMS/MMS/RCS Composer"><h2>SMS/MMS/RCS Composer</h2><MessageVariants {...props} update={patch=>props.update(canvasEditorSmsUpdate(props.draft,patch))}>{(draft,update)=>{
    const variantId=String(draft.config?.previewVariantId??''),variant=campaignVariants(props.draft).find(item=>item.id===variantId);
    return <SmsMessageComposer key={variantId} {...context} snapshot={{message:draft.body??'',subscriptionGroupId:String(props.draft.config?.subscriptionGroupId??''),values:{appendStop:false,...(draft.config?.channelValues??{}) as SmsValues},variantId,variantName:variant?.name}} onChange={snapshot=>update({body:snapshot.message,config:{subscriptionGroupId:snapshot.subscriptionGroupId,channelValues:snapshot.values}})}/>;
  }}</MessageVariants></section>;
}
