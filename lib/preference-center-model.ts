import { Liquid } from "liquidjs";
import { brazeLiquidSource, renderBrazeLiquid } from "./email-liquid.ts";
export type PreferenceBlockType = "title" | "paragraph" | "preference" | "button" | "divider" | "spacer" | "image" | "link";

export type PreferenceBlockStyle = {
  align?: "left" | "center" | "right";
  fontSize?: number;
  color?: string;
  background?: string;
  paddingY?: number;
  fontFamily?:string; width?:number; height?:number; borderRadius?:number; opacity?:number;
};

export type PreferenceBlockConfig = {
  id: string;
  type: PreferenceBlockType;
  content: string;
  style?: PreferenceBlockStyle;
  src?:string; alt?:string; href?:string; action?:'submit_preferences'|'unsubscribe_all'|'back'|'url';
};

export type PreferenceCenterCopy = {
  preferenceTitle: string;
  preferenceHelp: string;
  subscribeAllLabel: string;
  unsubscribeAllLabel: string;
  submitLabel: string;
  successTitle: string;
  successBody: string;
  errorTitle: string;
  errorBody: string;
};

export type PreferenceCenterDesign = {
  pageBackground: string;
  surfaceBackground: string;
  accentColor: string;
  textColor: string;
  contentWidth: number;
  fontFamily: string;
};
export type PreferencePageStyles={maxWidth:number;widthUnit:'px'|'%';background:string;backgroundOpacity:number;fontFamily:string;align:'left'|'center'|'right';textColor:string;textOpacity:number;buttonColor:string;buttonOpacity:number;buttonTextColor:string;buttonTextOpacity:number;linkColor:string;linkOpacity:number};
export type PreferenceColumn={id:string;blocks:PreferenceBlockConfig[]};
export type PreferenceRow={id:string;columns:PreferenceColumn[]};
export type PreferencePage={id:'preferences'|'confirmation';name:string;rows:PreferenceRow[];styles:PreferencePageStyles};

export type PreferenceCenterConfig = {
  blocks: PreferenceBlockConfig[];
  showDescriptions: boolean;
  showGlobalControls: boolean;
  copy: PreferenceCenterCopy;
  design: PreferenceCenterDesign;
  locales: Record<string, Partial<PreferenceCenterCopy>>;
  workspaceId?:string; createdBy?:string; createdAt?:string;
  editorReady?:boolean;
  pages?:PreferencePage[];
  accessibility?:{language:string;languageLiquid:string};
  customFonts?:Array<{name:string;url:string}>;
};

export const preferenceCenterDefaultCopy: PreferenceCenterCopy = {
  preferenceTitle: "Email preferences",
  preferenceHelp: "Select the messages you want to receive.",
  subscribeAllLabel: "Select all listed groups",
  unsubscribeAllLabel: "Clear all listed groups",
  submitLabel: "Save my preferences",
  successTitle: "Your preferences have been saved",
  successBody: "Your email subscription choices are up to date.",
  errorTitle: "We couldn't save your preferences",
  errorBody: "Please try again, or return to the email and use its preference link.",
};

export const preferenceCenterDefaultConfig: PreferenceCenterConfig = {
  blocks: [
    { id: "logo", type: "image", content: "Thinkingai", style: { align: "center" } },
    { id: "title", type: "title", content: "Update your email preferences", style: { align: "center", fontSize: 28 } },
    { id: "copy", type: "paragraph", content: "Choose the email updates that are most useful to you.", style: { align: "center", fontSize: 14 } },
    { id: "preferences", type: "preference", content: "" },
    { id: "save", type: "button", content: "Save my preferences", style: { align: "center" } },
  ],
  showDescriptions: true,
  showGlobalControls: true,
  copy: preferenceCenterDefaultCopy,
  design: {
    pageBackground: "#f6f6f8",
    surfaceBackground: "#ffffff",
    accentColor: "#5b2bbd",
    textColor: "#24212b",
    contentWidth: 600,
    fontFamily: "Arial",
  },
  locales: {
    "zh-CN": {
      preferenceTitle: "邮件订阅偏好",
      preferenceHelp: "选择您希望接收的邮件内容。",
      subscribeAllLabel: "选择所有列出的订阅组",
      unsubscribeAllLabel: "取消所有列出的订阅组",
      submitLabel: "保存我的偏好",
      successTitle: "您的偏好已保存",
      successBody: "您的邮件订阅选择已经更新。",
    },
  },
};

function validBlock(value: unknown): value is PreferenceBlockConfig {
  if (!value || typeof value !== "object") return false;
  const block = value as Partial<PreferenceBlockConfig>;
  return typeof block.id === "string" && typeof block.content === "string" && ["title", "paragraph", "preference", "button", "divider", "spacer", "image", "link"].includes(String(block.type));
}

export function normalizePreferenceCenterConfig(value: unknown): PreferenceCenterConfig {
  const source = value && typeof value === "object" ? value as Partial<PreferenceCenterConfig> : {};
  const designSource: Partial<PreferenceCenterDesign> = source.design && typeof source.design === "object" ? source.design : {};
  const copySource: Partial<PreferenceCenterCopy> = source.copy && typeof source.copy === "object" ? source.copy : {};
  const blocks = Array.isArray(source.blocks) && source.blocks.filter(validBlock).length ? source.blocks.filter(validBlock) : preferenceCenterDefaultConfig.blocks;
  const localeSource = source.locales && typeof source.locales === "object" ? source.locales : {};
  const pages=Array.isArray(source.pages)?source.pages.filter(page=>page&&['preferences','confirmation'].includes(page.id)).slice(0,2).map(page=>({id:page.id,name:page.id==='preferences'?'Preference Center':'Confirmation Page',styles:normalizePreferencePageStyles(page.styles),rows:Array.isArray(page.rows)?page.rows.slice(0,100).map(row=>({id:String(row.id),columns:Array.isArray(row.columns)?row.columns.slice(0,3).map(column=>({id:String(column.id),blocks:Array.isArray(column.blocks)?column.blocks.filter(validBlock).slice(0,100).map(normalizePreferenceBlock):[]})):[]})):[]})):undefined;
  return {
    blocks: pages?.find(page=>page.id==='preferences')?.rows.flatMap(row=>row.columns.flatMap(column=>column.blocks))??blocks.map(normalizePreferenceBlock),
    showDescriptions: source.showDescriptions ?? preferenceCenterDefaultConfig.showDescriptions,
    showGlobalControls: source.showGlobalControls ?? preferenceCenterDefaultConfig.showGlobalControls,
    copy: { ...preferenceCenterDefaultCopy, ...copySource, subscribeAllLabel: copySource.subscribeAllLabel === "Subscribe to all email" ? preferenceCenterDefaultCopy.subscribeAllLabel : copySource.subscribeAllLabel ?? preferenceCenterDefaultCopy.subscribeAllLabel, unsubscribeAllLabel: copySource.unsubscribeAllLabel === "Unsubscribe from all email" ? preferenceCenterDefaultCopy.unsubscribeAllLabel : copySource.unsubscribeAllLabel ?? preferenceCenterDefaultCopy.unsubscribeAllLabel },
    design: {
      ...preferenceCenterDefaultConfig.design,
      ...designSource,
      contentWidth: Number.isFinite(Number(designSource.contentWidth)) ? Math.max(100,Math.min(1600,Number(designSource.contentWidth))) : preferenceCenterDefaultConfig.design.contentWidth,
      fontFamily: typeof designSource.fontFamily==='string'?designSource.fontFamily.slice(0,200):preferenceCenterDefaultConfig.design.fontFamily,
    },
    locales: Object.fromEntries(Object.entries(localeSource).filter(([, translation]) => translation && typeof translation === "object").map(([locale, translation]) => {
      const copy = { ...translation } as Partial<PreferenceCenterCopy>;
      if (copy.subscribeAllLabel === "订阅全部邮件") copy.subscribeAllLabel = "选择所有列出的订阅组";
      if (copy.unsubscribeAllLabel === "退订全部邮件") copy.unsubscribeAllLabel = "取消所有列出的订阅组";
      return [locale, copy];
    })),
    workspaceId:typeof source.workspaceId==='string'?source.workspaceId:'local',createdBy:typeof source.createdBy==='string'?source.createdBy:undefined,createdAt:typeof source.createdAt==='string'?source.createdAt:undefined,editorReady:source.editorReady===undefined?undefined:source.editorReady===true,
    ...(pages?.length?{pages}:{}),accessibility:{language:typeof source.accessibility?.language==='string'?source.accessibility.language.slice(0,40):'',languageLiquid:typeof source.accessibility?.languageLiquid==='string'?source.accessibility.languageLiquid.slice(0,1000):''},
    customFonts:Array.isArray(source.customFonts)?source.customFonts.filter(font=>font&&typeof font.name==='string'&&typeof font.url==='string'&&safePreferenceUrl(font.url)).slice(0,20).map(font=>({name:font.name.slice(0,100),url:safePreferenceUrl(font.url)})):[],
  };
}

const bounded=(value:unknown,fallback:number,min:number,max:number)=>typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
const safeColor=(value:unknown,fallback:string)=>typeof value==='string'&&/^#[0-9a-f]{3,8}$/i.test(value)?value:fallback;
export const preferencePageDefaultStyles:PreferencePageStyles={maxWidth:500,widthUnit:'px',background:'#ffffff',backgroundOpacity:100,fontFamily:'system-ui, sans-serif',align:'left',textColor:'#000000',textOpacity:100,buttonColor:'#008294',buttonOpacity:100,buttonTextColor:'#ffffff',buttonTextOpacity:100,linkColor:'#1b78cf',linkOpacity:100};
export function normalizePreferencePageStyles(input:unknown):PreferencePageStyles{const value=(input&&typeof input==='object'?input:{}) as Partial<PreferencePageStyles>;return {...preferencePageDefaultStyles,maxWidth:bounded(value.maxWidth,500,1,value.widthUnit==='%'?100:1600),widthUnit:value.widthUnit==='%'?'%':'px',background:safeColor(value.background,'#ffffff'),backgroundOpacity:bounded(value.backgroundOpacity,100,0,100),fontFamily:typeof value.fontFamily==='string'?value.fontFamily.slice(0,200):preferencePageDefaultStyles.fontFamily,align:['left','center','right'].includes(String(value.align))?value.align!:'left',...Object.fromEntries(['textColor','buttonColor','buttonTextColor','linkColor'].map(key=>[key,safeColor(value[key as keyof PreferencePageStyles],preferencePageDefaultStyles[key as keyof PreferencePageStyles] as string)])),...Object.fromEntries(['textOpacity','buttonOpacity','buttonTextOpacity','linkOpacity'].map(key=>[key,bounded(value[key as keyof PreferencePageStyles],100,0,100)]))} as PreferencePageStyles;}
export function safePreferenceUrl(value:unknown):string{if(typeof value!=='string')return '';const url=value.trim();return /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(url)?url:'';}
export function normalizePreferenceBlock(block:PreferenceBlockConfig):PreferenceBlockConfig{const style=block.style??{};return {id:block.id,type:block.type,content:block.content.slice(0,20000),src:safePreferenceUrl(block.src),alt:typeof block.alt==='string'?block.alt.slice(0,1000):'',href:safePreferenceUrl(block.href),action:['submit_preferences','unsubscribe_all','back','url'].includes(String(block.action))?block.action:undefined,style:{align:['left','center','right'].includes(String(style.align))?style.align:undefined,fontSize:style.fontSize===undefined?undefined:bounded(style.fontSize,16,8,100),color:style.color?safeColor(style.color,'#000000'):undefined,background:style.background?safeColor(style.background,'#ffffff'):undefined,paddingY:style.paddingY===undefined?undefined:bounded(style.paddingY,0,0,150),fontFamily:typeof style.fontFamily==='string'?style.fontFamily.slice(0,200):undefined,width:style.width===undefined?undefined:bounded(style.width,100,1,1600),height:style.height===undefined?undefined:bounded(style.height,20,1,1000),borderRadius:style.borderRadius===undefined?undefined:bounded(style.borderRadius,0,0,100),opacity:style.opacity===undefined?undefined:bounded(style.opacity,100,0,100)}};}
export function newPreferenceBlock(type:PreferenceBlockType):PreferenceBlockConfig{return{id:crypto.randomUUID(),type,content:({title:'Title',paragraph:'Add your text here',button:'Button',link:'Link',image:'',spacer:'',preference:'',divider:''})[type],...(type==='button'?{action:'url' as const}:{}),...(type==='image'?{src:'',alt:''}:{})};}
export function newPreferenceRow(columns=1):PreferenceRow{return{id:crypto.randomUUID(),columns:Array.from({length:Math.max(1,Math.min(3,columns))},()=>({id:crypto.randomUUID(),blocks:[]}))};}
export function preferencePages(config:PreferenceCenterConfig):PreferencePage[]{if(config.pages?.length===2)return config.pages;return[{id:'preferences',name:'Preference Center',rows:config.blocks.map(block=>({id:`row-${block.id}`,columns:[{id:`column-${block.id}`,blocks:[block]}]})),styles:{...preferencePageDefaultStyles,maxWidth:config.design.contentWidth,fontFamily:config.design.fontFamily,textColor:config.design.textColor,background:config.design.surfaceBackground,buttonColor:config.design.accentColor}},{id:'confirmation',name:'Confirmation Page',rows:[{id:'confirmation-row',columns:[{id:'confirmation-column',blocks:[{id:'confirmation-title',type:'title',content:config.copy.successTitle},{id:'confirmation-body',type:'paragraph',content:config.copy.successBody},{id:'confirmation-back',type:'button',content:'Back to preference center',action:'back'}]}]}],styles:{...preferencePageDefaultStyles}}];}
export function newPreferenceComposerConfig(workspaceId='local'):PreferenceCenterConfig{const config=normalizePreferenceCenterConfig({workspaceId,blocks:[{id:'title',type:'title',content:'Update your email preferences',style:{fontSize:20}},{id:'preferences',type:'preference',content:''},{id:'save',type:'button',content:'Save my preferences',action:'submit_preferences'},{id:'unsubscribe',type:'link',content:'Unsubscribe from all emails',action:'unsubscribe_all'}],showGlobalControls:false,design:{...preferenceCenterDefaultConfig.design,contentWidth:500,pageBackground:'#ffffff',surfaceBackground:'#ffffff',accentColor:'#008294',textColor:'#000000',fontFamily:'system-ui, sans-serif'}});config.pages=preferencePages(config).map(page=>page.id==='confirmation'?{...page,rows:[{id:'confirmation-row',columns:[{id:'confirmation-column',blocks:[{id:'confirmation-title',type:'title',content:'Thank you, your preferences have been updated'},{id:'confirmation-back',type:'button',content:'Back to preference center',action:'back'}]}]}]}:{...page,styles:{...preferencePageDefaultStyles}});return normalizePreferenceCenterConfig(config);}
export function preferencePersonalize(text:string,user:Record<string,unknown>):string{try{return renderBrazeLiquid(text,user);}catch{return text;}}
export function preferenceAccessibilityLanguage(config:PreferenceCenterConfig,user:Record<string,unknown>={}):string{const value=config.accessibility?.languageLiquid?preferencePersonalize(config.accessibility.languageLiquid,user):config.accessibility?.language;return typeof value==='string'&&/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value)?value:'en';}

export function localizedPreferenceCenterCopy(config: PreferenceCenterConfig, locale?: string | null): PreferenceCenterCopy {
  const translation = locale ? config.locales[locale] : undefined;
  return { ...config.copy, ...translation };
}

export function renderPreferenceCenterForUser(config:PreferenceCenterConfig,user:Record<string,unknown>):PreferenceCenterConfig {
 const resolved=structuredClone(config),render=(value:string)=>renderBrazeLiquid(value,user);
 const block=(item:PreferenceBlockConfig):PreferenceBlockConfig=>({...item,content:render(item.content),alt:item.alt?render(item.alt):item.alt,src:item.src?safePreferenceUrl(render(item.src)):item.src,href:item.href?safePreferenceUrl(render(item.href)):item.href});
 resolved.blocks=resolved.blocks.map(block);if(resolved.pages)resolved.pages=resolved.pages.map(page=>({...page,rows:page.rows.map(row=>({...row,columns:row.columns.map(column=>({...column,blocks:column.blocks.map(block)}))}))}));
 resolved.copy=Object.fromEntries(Object.entries(resolved.copy).map(([key,value])=>[key,render(value)])) as PreferenceCenterCopy;
 resolved.accessibility={language:preferenceAccessibilityLanguage(config,user),languageLiquid:''};return resolved;
}

/** Publish checks allow draft documents to retain unfinished editor blocks. */
export function preferenceConfigIssues(config:PreferenceCenterConfig):string[] {
 const issues:string[]=[];const engine=new Liquid({strictVariables:false,ownPropertyOnly:true});
 const validateLiquid=(value:string)=>{try{engine.parse(brazeLiquidSource(value));}catch{issues.push('Correct the invalid Liquid expression before launching the preference center.');}};
 if(config.accessibility?.languageLiquid)validateLiquid(config.accessibility.languageLiquid);
 if(!config.pages?.length)return [...new Set(issues)];
 if(config.pages.length!==2||!config.pages.some(page=>page.id==='preferences')||!config.pages.some(page=>page.id==='confirmation'))issues.push('Add both the Preference Center and Confirmation Page.');
 const blocks=config.pages.flatMap(page=>page.rows.flatMap(row=>row.columns.flatMap(column=>column.blocks)));
 const preference=config.pages.find(page=>page.id==='preferences'),preferenceBlocks=preference?.rows.flatMap(row=>row.columns.flatMap(column=>column.blocks))??[];
 if(!preferenceBlocks.some(block=>block.type==='preference'))issues.push('Add subscription preferences to the Preference Center page.');
 if(!preferenceBlocks.some(block=>block.type==='button'&&(block.action==='submit_preferences'||!block.action)))issues.push('Add a Save preferences action to the Preference Center page.');
 const ids=new Set<string>();for(const block of blocks){if(ids.has(block.id))issues.push('Each page block must have a unique identifier.');ids.add(block.id);for(const value of [block.content,block.alt??'',block.src??'',block.href??''])validateLiquid(value);if(block.type==='image'&&!safePreferenceUrl(block.src))issues.push('Add an image URL or remove the unfinished Image block.');if((block.action==='url'||block.type==='link'&&!block.action)&&!safePreferenceUrl(block.href))issues.push('Add a destination URL for every link and URL button.');}
 return [...new Set(issues)];
}
