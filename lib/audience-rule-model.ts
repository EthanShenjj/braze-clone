/** Shared comparison semantics for profile, Campaign, Segment and Canvas audience rules. */
export const audienceOperators = ['equals','not_equals','contains','not_contains','greater_than','less_than','greater_or_equal','less_or_equal','between','not_between','is_any_of','is_none_of','starts_with','ends_with','matches_regex','exists','not_exists','less_than_ago','more_than_ago'] as const;
export type AudienceOperator = typeof audienceOperators[number];
export type AudienceTimeUnit = 'minutes'|'hours'|'days'|'weeks'|'months'|'years';
export type ComparableAudienceRule = {operator:string;value:string;value2?:string;timeUnit?:string};
export type AudienceValueKind = 'date'|'number'|'boolean'|'text'|'array';
export function audienceRelativeCutoff(amount:number,unit:string,at=Date.now()) {
 const date=new Date(at),factor=({minutes:60000,hours:3600000,days:86400000,weeks:604800000} as Record<string,number>)[unit];
 if(factor)return at-amount*factor;
 if(unit==='months'){date.setUTCMonth(date.getUTCMonth()-amount);return date.getTime();}
 if(unit==='years'){date.setUTCFullYear(date.getUTCFullYear()-amount);return date.getTime();}
 return NaN;
}
export function audienceDateValid(value:string){
 if(!Number.isFinite(Date.parse(value)))return false;
 if(/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value))return new Date(value.slice(0,10)).toISOString().slice(0,10)===value.slice(0,10);
 return true;
}
export function audienceComparisonIssues(rule:ComparableAudienceRule,kind:AudienceValueKind):string[]{
 if(!audienceOperators.includes(rule.operator as AudienceOperator))return ['Choose a supported audience filter operator.'];
 if(['exists','not_exists'].includes(rule.operator))return [];
 if(kind==='boolean'&&!['equals','not_equals','is_any_of','is_none_of'].includes(rule.operator)||['number','date'].includes(kind)&&['contains','not_contains','starts_with','ends_with','matches_regex'].includes(rule.operator))return ['Choose an operator supported by this audience field type.'];
 if(typeof rule.value!=='string'||!rule.value.trim())return ['Complete the audience filter value.'];
 if(['less_than_ago','more_than_ago'].includes(rule.operator))return kind!=='date'?['Relative time comparisons require a date audience filter.']:!['hours','days','weeks'].includes(rule.timeUnit??'')||!Number.isFinite(Number(rule.value))||Number(rule.value)<0||['months','years'].includes(rule.timeUnit??'')&&!Number.isInteger(Number(rule.value))?['Choose a valid time period in hours, days or weeks.']:[];
 if(['is_any_of','is_none_of'].includes(rule.operator)){try{const values=JSON.parse(rule.value);if(!Array.isArray(values)||!values.length||values.length>100||values.some(value=>!['string','number','boolean'].includes(typeof value)))return ['Choose one or more audience filter values.'];if(['number','date','boolean'].includes(kind)&&values.some(value=>audienceComparisonIssues({operator:'equals',value:String(value)},kind).length))return ['Choose audience filter values of the correct type.'];}catch{return ['Choose one or more audience filter values.'];}return [];}
 if(rule.operator==='matches_regex'){try{if(rule.value.length>300)throw new Error();new RegExp(rule.value,'i');}catch{return ['Enter a valid regular expression up to 300 characters.'];}}
 const numeric=['greater_than','less_than','greater_or_equal','less_or_equal','between','not_between'].includes(rule.operator);
 if(['between','not_between'].includes(rule.operator)&&(!rule.value2?.trim()))return ['Enter both audience filter bounds.'];
 const values=['between','not_between'].includes(rule.operator)?[rule.value,rule.value2!]:[rule.value];
 if(kind==='date'&&(numeric||['equals','not_equals'].includes(rule.operator))&&values.some(value=>!audienceDateValid(value)))return ['Enter a valid date for the audience filter.'];
 if((kind==='number'||numeric&&kind!=='date')&&values.some(value=>!value.trim()||!Number.isFinite(Number(value))))return ['Enter a numeric audience filter value.'];
 if(kind==='boolean'&&values.some(value=>!['true','false','0','1'].includes(value.toLowerCase())))return ['Use true or false for a boolean audience filter.'];
 if(['between','not_between'].includes(rule.operator)&&(kind==='date'?Date.parse(values[0])>Date.parse(values[1]):Number(values[0])>Number(values[1])))return ['The lower audience filter bound must not exceed the upper bound.'];
 return [];
}
export function compareAudienceValue(actual:unknown,rule:ComparableAudienceRule,kind:AudienceValueKind='text',at=Date.now()):boolean{
 const missing=actual===undefined||actual===null||actual==='';
 if(rule.operator==='exists')return !missing;
 if(rule.operator==='not_exists')return missing;
 if(audienceComparisonIssues(rule,kind).length)return false;
 if(missing&&['number','date','boolean'].includes(kind))return false;
 if(kind==='boolean'&&!['true','false','1','0','1.0','0.0'].includes(String(actual).toLowerCase()))return false;
 const normalize=(value:unknown):unknown=>kind==='number'?Number(value):kind==='boolean'?['true','1','1.0'].includes(String(value).toLowerCase()):kind==='date'?Date.parse(String(value)):String(value??'').toLowerCase();
 const eq=(a:unknown,b:unknown)=>kind==='date'?Number.isFinite(Date.parse(String(a)))&&new Date(String(a)).toISOString().slice(0,10)===new Date(String(b)).toISOString().slice(0,10):normalize(a)===normalize(b);
 if(['less_than_ago','more_than_ago'].includes(rule.operator)){if(missing)return false;const value=Date.parse(String(actual)),cutoff=audienceRelativeCutoff(Number(rule.value),rule.timeUnit!,at);return Number.isFinite(value)&&(rule.operator==='less_than_ago'?value>=cutoff&&value<=at:value<cutoff);}
 if(['is_any_of','is_none_of'].includes(rule.operator)){const choices=JSON.parse(rule.value) as unknown[],found=(Array.isArray(actual)?actual:[actual]).some(value=>choices.some(choice=>eq(value,choice)));return rule.operator==='is_any_of'?found:!found;}
 if(rule.operator==='equals'||rule.operator==='not_equals'){const matched=Array.isArray(actual)?actual.some(value=>eq(value,rule.value)):eq(actual,rule.value);return rule.operator==='equals'?matched:!matched;}
 if(['greater_than','less_than','greater_or_equal','less_or_equal','between','not_between'].includes(rule.operator)){if(missing)return false;const a=Number(normalize(actual)),b=Number(normalize(rule.value)),c=Number(normalize(rule.value2));if(!Number.isFinite(a))return false;return rule.operator==='greater_than'?a>b:rule.operator==='less_than'?a<b:rule.operator==='greater_or_equal'?a>=b:rule.operator==='less_or_equal'?a<=b:rule.operator==='between'?a>=b&&a<=c:a<b||a>c;}
 const a=String(actual??'').toLowerCase(),b=rule.value.toLowerCase();
 if(rule.operator==='matches_regex')return !missing&&new RegExp(rule.value,'i').test(String(actual));
 const found=Array.isArray(actual)?actual.some(value=>eq(value,rule.value)):a.includes(b);
 return rule.operator==='contains'?found:rule.operator==='not_contains'?!found:rule.operator==='starts_with'?a.startsWith(b):rule.operator==='ends_with'?a.endsWith(b):false;
}
