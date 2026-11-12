import type { AudienceRule } from './campaign-shared.ts';
import { audienceFilterCatalog, otherAudienceFilters, type CampaignFilterChoice } from './campaign-filter-catalog.ts';

export type AudienceValueKind='text'|'number'|'date'|'boolean'|'enum'|'geo';
export type AudienceOption={id:string;label:string};
export type AudienceRuleDefinition={label:string;description?:string;kind:AudienceValueKind;valueLabel?:string;options?:AudienceOption[];operators:AudienceOption[]};
const option=(id:string,label=id):AudienceOption=>({id,label});
export const audienceKeywordCategories:AudienceOption[]=[option('opt_in','Opt-in'),option('opt_out','Opt-out'),option('help','Help')];
const existence=[option('exists','is not blank'),option('not_exists','is blank')];
const comparisons=[option('equals','equals'),option('not_equals','does not equal'),option('greater_than','more than'),option('less_than','less than'),option('greater_or_equal','at least'),option('less_or_equal','at most'),option('between','between'),option('not_between','not between')];
const stringOperators=[option('equals','is'),option('not_equals','is not'),option('is_any_of','is any of'),option('is_none_of','is none of'),option('contains','contains'),option('not_contains','does not contain'),option('starts_with','starts with'),option('ends_with','ends with'),option('matches_regex','matches regex'),...existence];
const enumOperators=[option('equals','is'),option('not_equals','is not'),...existence,option('is_any_of','is any of'),option('is_none_of','is none of')];
const dateOperators=[option('greater_than','after'),option('less_than_ago','less than'),option('less_than','before'),option('more_than_ago','more than')];
const boolFields=new Set(['subscribed','reachable','pending_deletion','email_available','location_available','never_received_message','canvas_entered','landing_form','push_app_enabled','attr:uninstalled','attr:connected_facebook','attr:connected_twitter','attr:ad_tracking_enabled','attr:invalid_phone_number','attr:foreground_push_enabled','attr:push_enabled','attr:provisionally_authorized','attr:live_activity_push_to_start','attr:email_hard_bounced','attr:email_marked_spam','attr:email_soft_bounced']);
const numberFields=new Set(['age','random_bucket','session_count','median_session_duration_seconds','purchase_count','purchase_total','ecommerce_order_count','ecommerce_revenue','ecommerce_refund_total','attr:device_count','attr:facebook_friends_count','attr:twitter_followers_count']);
const dateFields=new Set(['inbound_sms_keyword_last','created_at','first_session_at','last_session_at','last_received_message_at','last_engaged_message_at','last_control_at','attr:dob','attr:uninstall_date','attr:email_opt_in_date','attr:email_unsubscribed_date','attr:push_opt_in_date','attr:push_unsubscribed_date']);
const enumValues:Record<string,AudienceOption[]>={
 emailSubscriptionStatus:[option('opted_in','Opted In'),option('subscribed','Subscribed'),option('unsubscribed','Unsubscribed')],
 'attr:push_subscription_status':[option('opted_in','Opted In'),option('subscribed','Subscribed'),option('unsubscribed','Unsubscribed')],
 'attr:gender':[option('m','Male'),option('f','Female'),option('o','Other'),option('n','Not Applicable'),option('p','Prefer Not to Say'),option('u','Unknown')],
 'attr:os':['Android','iOS','Windows','macOS','Linux','Roku','tvOS','Web'].map(id=>option(id)),
 'attr:web_browser':['Chrome','Safari','Firefox','Edge','Opera','Internet Explorer','Samsung Internet'].map(id=>option(id)),
 created_from:['SDK','REST API','CSV Import','Dashboard','Shopify'].map(id=>option(id)),
 intelligent_channel:[option('email','Email'),option('push','Push'),option('sms','SMS'),option('whatsapp','WhatsApp'),option('none','No channel')],
 message_open_likelihood:[option('high','High'),option('medium','Medium'),option('low','Low')],
};
// ISO codes remain the stored value; localized display names are presentation only.
const countryCodes='AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW XK'.split(' ');
const languageCodes='aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fil fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu'.split(' ');
export function audienceLocaleOptions(kind:'country'|'language'):AudienceOption[]{
 const codes=kind==='country'?countryCodes:languageCodes;
 const names=new Intl.DisplayNames(['en'],{type:kind==='country'?'region':'language'});
 return codes.map(id=>option(id,id==='AX'?'Aland Islands':id==='XK'?'Kosovo':names.of(id)??id)).sort((a,b)=>a.label.localeCompare(b.label));
}
function catalogChoice(field:string):CampaignFilterChoice|undefined{
 const flatten=(rows:CampaignFilterChoice[]):CampaignFilterChoice[]=>rows.flatMap(row=>row.children?.length?flatten(row.children):[row]);
 const leaves=flatten([...audienceFilterCatalog.flatMap(category=>category.fields),...otherAudienceFilters]);
 const exact=leaves.find(row=>row.field===field);
 if(exact)return exact;
 if(/^(receipt_count|receipt_last):/.test(field))return leaves.find(row=>row.field===field.split(':').slice(0,2).join(':')+':');
 if(/^(receipt_variant|feature_variant|session_app_count|session_app_first|session_app_last|subscription_group|feature_enabled|receipt_alias|receipt_alias_any):/.test(field))return leaves.find(row=>row.field?.startsWith(field.split(':')[0]+':'));
 if(field.startsWith('session_recent:'))return leaves.find(row=>row.field==='session_recent:7');
 return undefined;
}

export function audienceReceivedField(field:string):boolean{return field.startsWith('receipt_count:delivered:');}
export function audienceMembershipField(field:string):boolean{return /^(membership:|segment:|cohort:)/.test(field);}
export function audienceRuleDefinition(field:string,attributeType?:string):AudienceRuleDefinition{
 const choice=catalogChoice(field),label=choice?.label??(field.startsWith('attr:')?field.slice(5):field.startsWith('event_count:')?`Custom event: ${field.slice(12)}`:field.startsWith('segment:')?'Segment Membership':field);
 let kind:AudienceValueKind='text',options=enumValues[field];
 if(field==='country')options=audienceLocaleOptions('country');
 if(field==='attr:language')options=audienceLocaleOptions('language');
 if(field.startsWith('subscription_group:'))options=[option('subscribed','Subscribed'),option('unsubscribed','Unsubscribed')];
 if(options)kind='enum';
 else if(boolFields.has(field)||/^(membership:|cohort:|segment:|feature_enabled:)/.test(field))kind='boolean';
 else if(dateFields.has(field)||/^(receipt_tag_last:|receipt_last:|receipt_channel_last:|session_app_first:|session_app_last:|canvas_receipt_last:)/.test(field))kind='date';
 else if(numberFields.has(field)||/^(event_count:|campaign_interaction:|receipt_tag_count:|receipt_count:|receipt_variant:|feature_variant:|receipt_alias:|receipt_alias_any:|session_app_count:|session_recent:|canvas_receipt_count:|canvas_alias|survey_submitted:)/.test(field))kind='number';
 else if(field==='location_recent')kind='geo';
 if(attributeType&&field.startsWith('attr:')&&!options){if(['number','integer','float'].includes(attributeType))kind='number';else if(['time','date','datetime'].includes(attributeType))kind='date';else if(attributeType==='boolean')kind='boolean';}
 return {label,description:choice?.description,kind,valueLabel:field==='session_count'?'Session Count':undefined,options,operators:audienceReceivedField(field)?[option('greater_than','true'),option('equals','false')]:field==='session_count'?[option('equals','exactly'),option('greater_than','more than'),option('less_than','less than')]:audienceMembershipField(field)?[option('equals','Included'),option('not_equals','Not included')]:field==='age'?[option('equals','exactly'),option('greater_than','older than'),option('less_than','younger than')]:kind==='boolean'?[option('equals','is'),option('not_equals','is not'),...existence]:kind==='date'?dateOperators:kind==='number'?[...comparisons,...existence]:kind==='enum'?enumOperators:kind==='geo'?[option('equals','within'),option('not_equals','outside')]:stringOperators};
}
export function createAudienceRule(field:string,id=crypto.randomUUID()):AudienceRule{
 const at=new Date(),today=`${at.getFullYear()}-${String(at.getMonth()+1).padStart(2,'0')}-${String(at.getDate()).padStart(2,'0')}`;
 const definition=audienceRuleDefinition(field),count=/^(receipt_tag_count:|receipt_count:|receipt_variant:|feature_variant:|receipt_alias:|receipt_alias_any:|event_count:|canvas_receipt_count:|canvas_alias)/.test(field);
 return {id,field,operator:count?'greater_than':definition.kind==='date'?'greater_than':'equals',value:definition.kind==='boolean'?'true':field==='age'?'18':field==='session_count'?'1':field==='inbound_sms_keyword_last'?'':definition.kind==='date'?today:definition.kind==='number'?'0':field.startsWith('subscription_group:')?'subscribed':'',...((field.startsWith('receipt_count:engaged:')||field==='canvas_receipt_count:engaged')?{tagInteraction:''}:{}),...(field==='location_recent'?{value:'true',params:{radius:1,unit:'miles'}}:{})};
}
export function audienceMultiValues(value:string):string[]{try{const parsed=JSON.parse(value);if(Array.isArray(parsed))return parsed.map(String);}catch{}return value?[value]:[];}
