import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';

export const campaignBriefTextLimits = Object.freeze({ inputBytes:15*1024*1024, textCharacters:100000, expandedBytes:32*1024*1024, entryBytes:8*1024*1024, zipEntries:2000, pdfPages:100, timeoutMs:10000 });
export type CampaignBriefText = { text?:string; notice?:string };
const retained='The original brief is attached and retained.';
const workerSource=String.raw`
const {parentPort,workerData}=require('node:worker_threads');
const {inflateRawSync,inflateSync,crc32}=require('node:zlib');
const bytes=Buffer.from(workerData.bytes),limits=workerData.limits;
function fail(message){throw Error(message);}
function docxCheck(){
 let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break;}
 if(end<0)fail('The DOCX ZIP directory is malformed.');
 const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),offset=bytes.readUInt32LE(end+16);
 if(bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6)||count!==bytes.readUInt16LE(end+8)||count===65535||offset===0xffffffff||size===0xffffffff)fail('Multipart or ZIP64 DOCX files are not supported.');
 if(!count||count>limits.zipEntries||offset+size!==end)fail('The DOCX archive exceeds the entry limit or has an invalid directory.');
 let cursor=offset,total=0;const names=new Set(),ranges=[];
 for(let i=0;i<count;i++){
  if(cursor+46>end||bytes.readUInt32LE(cursor)!==0x02014b50)fail('The DOCX ZIP directory is malformed.');
  const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),checksum=bytes.readUInt32LE(cursor+16),packed=bytes.readUInt32LE(cursor+20),expanded=bytes.readUInt32LE(cursor+24),nameLength=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32),local=bytes.readUInt32LE(cursor+42);
  if(cursor+46+nameLength+extra+comment>end)fail('The DOCX ZIP entry is malformed.');
  const name=bytes.subarray(cursor+46,cursor+46+nameLength).toString('utf8');
  if(flags&1)fail('This DOCX is encrypted; upload an unencrypted copy.');
  if(![0,8].includes(method)||names.has(name)||name.includes('\\')||name.split('/').includes('..')||name.startsWith('/'))fail('The DOCX contains unsupported or ambiguous ZIP entries.');
  names.add(name);total+=expanded;
  if(expanded>limits.entryBytes||total>limits.expandedBytes||expanded>Math.max(packed*200,1024*1024))fail('The DOCX exceeds the safe decompression limit.');
  if(local+30>offset||bytes.readUInt32LE(local)!==0x04034b50||bytes.readUInt16LE(local+6)!==flags||bytes.readUInt16LE(local+8)!==method)fail('The DOCX local ZIP header is malformed.');
  const localName=bytes.readUInt16LE(local+26),localExtra=bytes.readUInt16LE(local+28),start=local+30+localName+localExtra;
  if(start+packed>offset||!bytes.subarray(local+30,local+30+localName).equals(bytes.subarray(cursor+46,cursor+46+nameLength)))fail('The DOCX ZIP data is malformed.');
  ranges.push([local,start+packed]);
  const compressed=bytes.subarray(start,start+packed),data=method===8?inflateRawSync(compressed,{maxOutputLength:Math.max(1,Math.min(limits.entryBytes,expanded+1))}):compressed;
  if(data.length!==expanded||crc32(data)!==checksum)fail('The DOCX ZIP data is corrupt.');
  if(/\.(xml|rels)$/i.test(name)&&/<!\s*(DOCTYPE|ENTITY)\b/i.test(data.toString('utf8')))fail('DOCX XML declarations with entities are not supported.');
  cursor+=46+nameLength+extra+comment;
 }
 ranges.sort((a,b)=>a[0]-b[0]);if(ranges.some((range,i)=>i&&range[0]<ranges[i-1][1])||cursor!==end)fail('The DOCX ZIP entries overlap or are malformed.');
 if(!names.has('[Content_Types].xml')||!names.has('word/document.xml'))fail('The file is not a Word DOCX document.');
}
function ascii85(input){
 const value=input.toString('ascii').replace(/\s/g,'').replace(/^<~/,'').replace(/~>$/,'');const out=[];let group=[];
 const emit=digits=>{let sum=0;for(const digit of digits)sum=sum*85+digit;if(sum>0xffffffff)fail('The PDF ASCII85 stream is invalid.');return [sum>>>24,(sum>>>16)&255,(sum>>>8)&255,sum&255];};
 for(const character of value){if(character==='z'){if(group.length)fail('The PDF ASCII85 stream is invalid.');out.push(0,0,0,0);}else{const digit=character.charCodeAt(0)-33;if(digit<0||digit>84)fail('The PDF ASCII85 stream is invalid.');group.push(digit);if(group.length===5){out.push(...emit(group));group=[];}}if(out.length>limits.entryBytes)fail('The PDF exceeds the safe decompression limit.');}
 if(group.length===1)fail('The PDF ASCII85 stream is invalid.');if(group.length){const count=group.length;while(group.length<5)group.push(84);out.push(...emit(group).slice(0,count-1));}return Buffer.from(out);
}
function pdfCheck(){
 if(bytes.subarray(0,1024).indexOf('%PDF-')<0)fail('The file is not a PDF document.');
 const raw=bytes.toString('latin1');let total=0,count=0,match;const streams=/\bstream(?:\r\n|\n|\r)/g;
 if(/\/Encrypt\s+(?:\d+\s+\d+\s+R|<<)/.test(raw))fail('This PDF is encrypted or requires a password; upload an unencrypted copy.');
 while((match=streams.exec(raw))){
  if(++count>limits.zipEntries)fail('The PDF exceeds the stream limit.');
  const end=raw.indexOf('endstream',streams.lastIndex);if(end<0)fail('The PDF stream is malformed.');
  const dict=raw.slice(Math.max(raw.lastIndexOf('endobj',match.index),raw.lastIndexOf('obj',match.index))+3,match.index).replace(/#([a-f\d]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
  if(/\/Filter\s+\d+\s+\d+\s+R/.test(dict))fail('The PDF uses an indirect stream filter that cannot be bounded safely.');
  const filter=/\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dict)?.[1]??'';
  if((dict.match(/\/Filter\b/g)??[]).length>1||(filter.startsWith('[')&&!/^\[\s*(?:\/\w+\s*)*\]$/.test(filter)))fail('The PDF uses ambiguous or indirect compression filters.');
  let decoded=bytes.subarray(streams.lastIndex,end);
  for(const name of filter.match(/\/\w+/g)??[]){
   if(['/FlateDecode','/Fl'].includes(name))decoded=inflateSync(decoded,{maxOutputLength:limits.entryBytes});
   else if(['/ASCII85Decode','/A85'].includes(name))decoded=ascii85(decoded);
   else if(['/ASCIIHexDecode','/AHx'].includes(name)){let value=decoded.toString('ascii').replace(/\s/g,'').replace(/>$/,'');if(!/^[a-f\d]*$/i.test(value))fail('The PDF ASCIIHex stream is invalid.');if(value.length%2)value+='0';decoded=Buffer.from(value,'hex');}
   else if(['/DCTDecode','/DCT','/JPXDecode','/CCITTFaxDecode','/CCF','/JBIG2Decode'].includes(name))break;
   else fail('The PDF uses a compression format not supported by bounded extraction.');
   total+=decoded.length;if(decoded.length>limits.entryBytes||total>limits.expandedBytes)fail('The PDF exceeds the safe decompression limit.');
  }
  streams.lastIndex=end+9;
 }
}
async function extract(){
 if(workerData.kind==='docx'){
  docxCheck();const result=await require(workerData.mammoth).extractRawText({buffer:bytes});
  if(result.messages.some(message=>message.type==='error'))fail('The DOCX could not be read completely.');
  return {text:result.value,warnings:result.messages.length?'Some DOCX features could not be interpreted; review the extracted requirements.':undefined};
 }
 pdfCheck();const {getDocumentProxy}=require(workerData.unpdf);let document;
 try{
  document=await getDocumentProxy(new Uint8Array(bytes),{verbosity:0,isEvalSupported:false,useSystemFonts:false,useWorkerFetch:false,disableFontFace:true,maxImageSize:0,stopAtErrors:true});
  if(document.numPages>limits.pdfPages)fail('The PDF exceeds the 100-page extraction limit.');
  let text='',empty=0,truncated=false;
  for(let index=1;index<=document.numPages;index++){
   const page=await document.getPage(index),content=await page.getTextContent();
   const value=content.items.filter(item=>typeof item.str==='string').map(item=>item.str+(item.hasEOL?'\n':' ')).join('');
   if(!value.trim())empty++;text+=value+'\n\n';page.cleanup();
   if(text.length>limits.textCharacters){truncated=true;break;}
  }
  return {text,truncated,warnings:empty?'Some PDF pages contain no extractable text. Scanned images and text in images are not OCRed.':undefined};
 }finally{if(document)await document.destroy();}
}
extract().then(value=>parentPort.postMessage({ok:true,...value})).catch(error=>parentPort.postMessage({ok:false,error:error?.name==='PasswordException'?'This PDF is encrypted or requires a password; upload an unencrypted copy.':String(error?.message??'The document could not be read.')}));
`;

function boundedText(text:string,notice?:string,truncated=false):CampaignBriefText {
  const clean=text.replace(/\u0000/g,'').trim();
  if(!clean)return {notice:`No readable text was found. Scanned PDFs and image-only documents need OCR or a text brief. ${retained}`};
  const clipped=clean.length>campaignBriefTextLimits.textCharacters||truncated;
  return {text:clean.slice(0,campaignBriefTextLimits.textCharacters),notice:[notice,clipped?'Only the first 100,000 characters of this brief are available to Operator.':undefined].filter(Boolean).join(' ')||undefined};
}

/** Local-only extraction. The upload remains stored even if parsing fails or is stopped. */
export async function extractCampaignBriefText(name:string,bytes:Uint8Array):Promise<CampaignBriefText> {
  if(!bytes.length||bytes.byteLength>campaignBriefTextLimits.inputBytes)return {notice:`Brief text was not extracted: the file is empty or exceeds 15MB. ${retained}`};
  const extension=/\.([^.]+)$/.exec(name)?.[1].toLowerCase();
  if(['txt','md','csv'].includes(extension??'')){
    try{const encoding=bytes[0]===0xff&&bytes[1]===0xfe?'utf-16le':bytes[0]===0xfe&&bytes[1]===0xff?'utf-16be':'utf-8';return boundedText(new TextDecoder(encoding,{fatal:true}).decode(bytes));}
    catch{return {notice:`The text brief is not valid UTF-8 or BOM-marked UTF-16. ${retained}`};}
  }
  if(extension!=='pdf'&&extension!=='docx')return {notice:`This brief format is not supported for text extraction. ${retained}`};
  try {
    const require=createRequire(`${process.cwd()}/package.json`);
    return await new Promise<CampaignBriefText>((resolve)=>{
      let settled=false;
      const worker=new Worker(workerSource,{eval:true,execArgv:[],workerData:{bytes,kind:extension,limits:campaignBriefTextLimits,unpdf:require.resolve('unpdf'),mammoth:require.resolve('mammoth')},resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:16,stackSizeMb:4}});
      const finish=(result:CampaignBriefText)=>{if(settled)return;settled=true;clearTimeout(timer);void worker.terminate();resolve(result);};
      const timer=setTimeout(()=>finish({notice:`Brief text extraction exceeded the 10-second processing limit. ${retained}`}),campaignBriefTextLimits.timeoutMs);
      worker.once('message',result=>finish(result.ok?boundedText(String(result.text??''),result.warnings,result.truncated):{notice:`Brief text was not extracted: ${String(result.error).slice(0,300)} ${retained}`}));
      worker.once('error',()=>finish({notice:`Brief text extraction stopped because the document exceeded processing limits or could not be read. ${retained}`}));
      worker.once('exit',()=>finish({notice:`Brief text extraction stopped before completion. ${retained}`}));
    });
  }catch{return {notice:`Local document extraction is unavailable. ${retained}`};}
}
