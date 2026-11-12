export type AudienceCsv={headers:string[];rows:string[][];records:Array<Record<string,string>>;lineNumbers:number[]};
export class AudienceCsvError extends Error{constructor(message:string,public line?:number){super(line?`${message} (line ${line})`:message);}}
/** RFC-style CSV parsing preserves quoted commas/newlines and escaped quotes; it never splits records on raw newlines. */
export function parseAudienceCsv(input:string,maxRows=250,maxColumns=10):AudienceCsv {
 if(typeof input!=='string'||!input.trim())throw new AudienceCsvError('Choose a CSV file with a header and at least one user.');
 const source=input.charCodeAt(0)===0xfeff?input.slice(1):input,rows:string[][]=[],lineNumbers:number[]=[];let row:string[]=[],field='',quoted=false,closedQuote=false,line=1,rowLine=1;
 const finishField=()=>{row.push(field);field='';closedQuote=false;};
 const finishRow=()=>{finishField();if(row.some(value=>value.trim())){rows.push(row);lineNumbers.push(rowLine);if(rows.length>maxRows+1)throw new AudienceCsvError(`Import at most ${maxRows.toLocaleString()} users in one file.`,rowLine);}row=[];rowLine=line+1;};
 for(let index=0;index<source.length;index++){const char=source[index];if(quoted){if(char==='"'){if(source[index+1]==='"'){field+='"';index++;}else{quoted=false;closedQuote=true;}}else{field+=char;if(char==='\n')line++;else if(char==='\r'&&source[index+1]!=='\n')line++;}continue;}
  if(char==='"'){if(field.trim()||closedQuote)throw new AudienceCsvError('Unexpected quote in an unquoted field.',line);field='';quoted=true;continue;}
  if(char===','){finishField();continue;}
  if(char==='\n'||char==='\r'){finishRow();if(char==='\r'&&source[index+1]==='\n')index++;line++;rowLine=line;continue;}
  if(closedQuote){if(!/[ \t]/.test(char))throw new AudienceCsvError('Unexpected characters after a closing quote.',line);}else field+=char;
 }
 if(quoted)throw new AudienceCsvError('A quoted CSV field is not closed.',rowLine);
 if(field||row.length||closedQuote)finishRow();
 if(rows.length<2)throw new AudienceCsvError('Include a header and at least one user row.');
 const headers=rows.shift()!.map(value=>value.trim());lineNumbers.shift();if(headers.some(value=>!value))throw new AudienceCsvError('Every CSV column needs a header.',1);if(new Set(headers).size!==headers.length)throw new AudienceCsvError('CSV column headers must be unique.',1);if(headers.length>maxColumns)throw new AudienceCsvError(`Use at most ${maxColumns} columns.`,1);if(headers.some(header=>header.split('.').some(part=>['__proto__','prototype','constructor'].includes(part))))throw new AudienceCsvError('This CSV contains an unsupported column name.',1);
 for(let index=0;index<rows.length;index++)if(rows[index].length!==headers.length)throw new AudienceCsvError(`Expected ${headers.length} columns, found ${rows[index].length}.`,lineNumbers[index]);
 const records=rows.map(row=>Object.fromEntries(headers.map((header,index)=>[header,row[index]])));
 return{headers,rows,records,lineNumbers};
}
export function audienceCsvValue(value:string):unknown{const clean=value.trim();if(clean==='true')return true;if(clean==='false')return false;if(clean==='null')return null;if(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(clean)&&Number.isFinite(Number(clean)))return Number(clean);if(/^[\[{]/.test(clean)){try{const parsed=JSON.parse(clean);const unsafe=(value:unknown,depth=0):boolean=>depth>12||Boolean(value&&typeof value==='object'&&Object.entries(value).some(([key,item])=>['__proto__','prototype','constructor'].includes(key)||unsafe(item,depth+1)));if(unsafe(parsed))throw new Error();return parsed;}catch{throw new AudienceCsvError('Use valid JSON for object or array attribute values.');}}return value;}
export type AudienceImportKind='attributes'|'events'|'recommended';
export const audienceImportLimits={bytes:1024*1024,rows:250,columns:10,files:25,profiles:250} as const;
export const audienceImportKinds:Record<AudienceImportKind,{title:string;menu:string;description:string;sample:string;requirements:string}>={
 attributes:{title:'Attributes',menu:'User attributes',description:'Import default or custom user attributes with a user identifier.',sample:'attributes-csv-example.csv',requirements:'CSV files must contain either an external_id or braze_id, or user_alias_label and user_alias_name, or email or phone to help identify imported users.'},
 events:{title:'Custom events',menu:'Custom events',description:'Import custom events with a user identifier, event name, and time field.',sample:'events-csv-example.csv',requirements:'CSV files must contain columns for event name, time and an identifier.'},
 recommended:{title:'Recommended events',menu:'eCommerce recommended events',description:'Import eCommerce recommended events with a user identifier. The file can only contain one recommended event.',sample:'recommended-events-csv-example.csv',requirements:'CSV files must contain columns for event name, time and an identifier.'},
};
export type AudienceImportIdentity={externalId?:string;brazeId?:string;aliasName?:string;aliasLabel?:string;email?:string;phone?:string};
export type AudiencePreparedRow={identity:AudienceImportIdentity;profile:Record<string,unknown>;line:number;name?:string;time?:string;properties?:Record<string,unknown>;orderKey?:string};
export function audienceImportIdentity(record:Record<string,string>,line?:number):AudienceImportIdentity {
 const text=(key:string)=>record[key]?.trim()||undefined,identity={externalId:text('external_id')??text('id')??text('user_id'),brazeId:text('braze_id'),aliasName:text('user_alias_name'),aliasLabel:text('user_alias_label'),email:text('email'),phone:text('phone')};
 if(!identity.externalId&&!identity.brazeId&&!(identity.aliasName&&identity.aliasLabel)&&!identity.email&&!identity.phone)throw new AudienceCsvError('Every row needs a supported user identifier.',line);
 if(Boolean(identity.aliasName)!==Boolean(identity.aliasLabel))throw new AudienceCsvError('Include both user_alias_name and user_alias_label.',line);
 if(Object.values(identity).some(value=>value&&value.length>200))throw new AudienceCsvError('User identifiers must contain at most 200 characters.',line);
 if(identity.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email))throw new AudienceCsvError('Enter a valid email address.',line);if(identity.phone&&(!/^[+\d(). -]+$/.test(identity.phone)||identity.phone.replace(/\D/g,'').length<4||identity.phone.replace(/\D/g,'').length>15))throw new AudienceCsvError('Enter a valid phone number.',line);return identity;
}
const identityColumns=['external_id','id','user_id','braze_id','user_alias_name','user_alias_label'];
const ecommerceNames=['ecommerce.product_viewed','ecommerce.cart_updated','ecommerce.checkout_started','ecommerce.order_placed','ecommerce.order_cancelled','ecommerce.order_refunded'];
export function prepareAudienceRows(csv:AudienceCsv,kind:AudienceImportKind):AudiencePreparedRow[] {
 const output:AudiencePreparedRow[]=[],seenProfiles=new Set<string>();let eventName='';
 for(let index=0;index<csv.records.length;index++){
  const record=csv.records[index],line=csv.lineNumbers[index],identity=audienceImportIdentity(record,line),profile:Record<string,unknown>={};
  if(Object.keys(record).some(key=>['workspaceId','workspace_id'].includes(key)))throw new AudienceCsvError('Choose the workspace in the application instead of including workspace columns.',line);
  if(kind==='attributes'){
   const key=JSON.stringify(identity);if(seenProfiles.has(key))throw new AudienceCsvError('A user identifier appears more than once in this file.',line);seenProfiles.add(key);
   for(const [key,value] of Object.entries(record)){if(identityColumns.includes(key)||value==='')continue;if(['email_subscribe','email_subscription_status','push_subscribe'].includes(key)){const status=value.trim().replaceAll('-','_');if(!['opted_in','subscribed','unsubscribed'].includes(status))throw new AudienceCsvError('Subscription status must be opted_in, subscribed or unsubscribed.',line);profile[key==='push_subscribe'?'push_subscription_status':'email_subscription_status']=status;}else if(['email','first_name','last_name','country','phone','language','lifecycle','dob','gender','home_city'].includes(key))profile[key]=value.trim();else profile[key]=audienceCsvValue(value);}
   output.push({identity,profile,line});continue;
  }
  const name=record.name?.trim(),time=record.time?.trim();if(!name||name.length>250)throw new AudienceCsvError('Every event needs a name of 1–250 characters.',line);if(!time||!Number.isFinite(Date.parse(time)))throw new AudienceCsvError('Every event needs a valid time.',line);if(Date.parse(time)>Date.now())throw new AudienceCsvError('Event time must not be in the future.',line);
  if(kind==='recommended'){if(!ecommerceNames.includes(name))throw new AudienceCsvError('Choose a supported eCommerce recommended event name.',line);if(eventName&&eventName!==name)throw new AudienceCsvError('A recommended event file can contain only one event name.',line);eventName=name;}
  const properties:Record<string,unknown>={};
  for(const [key,value] of Object.entries(record)){if(identityColumns.includes(key)||['name','time','email','phone'].includes(key)||value==='')continue;const match=key.match(/^(.+)\.properties\.(.+)$/);if(match&&match[1]!==name)continue;const path=(match?match[2]:key.startsWith('properties.')?key.slice(11):key).split('.');let target=properties;for(const piece of path.slice(0,-1)){const existing=target[piece];if(existing!==undefined&&(!existing||typeof existing!=='object'||Array.isArray(existing)))throw new AudienceCsvError('Event property paths conflict.',line);target[piece]=(existing??{}) as Record<string,unknown>;target=target[piece] as Record<string,unknown>;}target[path.at(-1)!]=audienceCsvValue(value);}
  if(kind==='recommended'){for(const key of ['price','quantity','total_value','subtotal_value','tax','shipping','total_discounts'])if(properties[key]!==undefined&&(typeof properties[key]!=='number'||!Number.isFinite(properties[key])||key==='price'&&Number(properties[key])<0||key==='quantity'&&Number(properties[key])<=0))throw new AudienceCsvError(`Enter a valid numeric ${key}.`,line);if(properties.currency!==undefined&&!/^[A-Z]{3}$/.test(String(properties.currency)))throw new AudienceCsvError('Currency must use a three-letter uppercase code.',line);}
  output.push({identity,profile,line,name,time:new Date(time).toISOString(),properties});
 }
 return output;
}
