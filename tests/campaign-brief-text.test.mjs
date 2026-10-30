import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile,mkdtemp,mkdir,cp,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync,deflateSync,crc32 } from 'node:zlib';
import { extractCampaignBriefText,campaignBriefTextLimits as limits } from '../lib/campaign-brief-text.ts';
import { createCampaignOperatorEndpoint } from '../lib/campaign-operator-model.ts';
import nextConfig from '../next.config.ts';
const fixture=name=>readFile(new URL(`./fixtures/campaign-briefs/${name}`,import.meta.url));

function zip(entries){
 const local=[],central=[];let offset=0;
 for(const [name,content] of Object.entries(entries)){
  const data=Buffer.from(content),packed=deflateRawSync(data),filename=Buffer.from(name),head=Buffer.alloc(30),directory=Buffer.alloc(46);
  head.writeUInt32LE(0x04034b50);head.writeUInt16LE(20,4);head.writeUInt16LE(8,8);head.writeUInt32LE(crc32(data),14);head.writeUInt32LE(packed.length,18);head.writeUInt32LE(data.length,22);head.writeUInt16LE(filename.length,26);
  directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(8,10);directory.writeUInt32LE(crc32(data),16);directory.writeUInt32LE(packed.length,20);directory.writeUInt32LE(data.length,24);directory.writeUInt16LE(filename.length,28);directory.writeUInt32LE(offset,42);
  const item=Buffer.concat([head,filename,packed]);local.push(item);central.push(directory,filename);offset+=item.length;
 }
 const table=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(local.length,8);end.writeUInt16LE(local.length,10);end.writeUInt32LE(table.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,table,end]);
}
function pdf(text){
 const stream=deflateSync(Buffer.from(`BT /F1 12 Tf ${text.match(/.{1,65}/g).map(line=>`1 0 0 1 30 750 Tm (${line}) Tj`).join("\n")} ET`));
 const objects=[Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>'),Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),Buffer.concat([Buffer.from(`<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`),stream,Buffer.from('\nendstream')])];
 let output=Buffer.from('%PDF-1.4\n');const offsets=[0];objects.forEach((object,index)=>{offsets.push(output.length);output=Buffer.concat([output,Buffer.from(`${index+1} 0 obj\n`),object,Buffer.from('\nendobj\n')]);});const start=output.length;return Buffer.concat([output,Buffer.from(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`)]);
}

test('actual compressed PDF text is extracted locally and the source bytes remain intact',async()=>{
 const bytes=await fixture('launch.pdf'),original=Buffer.from(bytes),result=await extractCampaignBriefText('launch.pdf',bytes);
 assert.match(result.text,/Launch Autumn Sale to loyal customers/);assert.match(result.text,/SAVE20/);assert.match(result.text,/500 purchases/);assert.equal(result.notice,undefined);assert.deepEqual(bytes,original);
});
test('actual Word OOXML DOCX extracts paragraph text and non-Latin requirements',async()=>{
 const bytes=await fixture('launch.docx'),original=Buffer.from(bytes),result=await extractCampaignBriefText('launch.docx',bytes);
 assert.match(result.text,/loyal customers\.\n\nOffer SAVE20/);assert.match(result.text,/日本語の目標/);assert.equal(result.notice,undefined);assert.deepEqual(bytes,original);
});
test('image-only and password-protected PDFs retain their attachment and report honest limitations',async()=>{
 const empty=await extractCampaignBriefText('scanned.pdf',await fixture('image-only.pdf'));assert.equal(empty.text,undefined);assert.match(empty.notice,/No readable text.*OCR.*retained/);
 const encrypted=await extractCampaignBriefText('secret.pdf',await fixture('encrypted.pdf'));assert.equal(encrypted.text,undefined);assert.match(encrypted.notice,/encrypted|password/i);assert.match(encrypted.notice,/retained/);
});
test('PDF page and real Flate stream expansion limits are enforced before returning text',async()=>{
 const pages=await extractCampaignBriefText('long.pdf',await fixture('too-many-pages.pdf'));assert.equal(pages.text,undefined);assert.match(pages.notice,/100-page/);
 const compressed=deflateSync(Buffer.alloc(limits.entryBytes+1,32));
 const bytes=Buffer.concat([Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`),compressed,Buffer.from('\nendstream\nendobj\n%%EOF')]);
 const bomb=await extractCampaignBriefText('expansion.pdf',bytes);assert.equal(bomb.text,undefined);assert.match(bomb.notice,/not extracted/);assert.match(bomb.notice,/retained/);
});
test('large real PDF text is clipped to the same prompt bound as text briefs',async()=>{
 const result=await extractCampaignBriefText('large.pdf',pdf('Campaign audience '.repeat(6500)));assert.equal(result.text.length,limits.textCharacters);assert.match(result.notice,/first 100,000/);
});
test('DOCX decompression bombs, XML entities, traversal and CRC corruption are rejected',async()=>{
 const bomb=zip({'[Content_Types].xml':'<Types/>','word/document.xml':Buffer.alloc(limits.entryBytes+1,65)});
 const expanded=await extractCampaignBriefText('expansion.docx',bomb);assert.equal(expanded.text,undefined);assert.match(expanded.notice,/decompression limit/);
 const entity=await extractCampaignBriefText('entity.docx',zip({'[Content_Types].xml':'<Types/>','word/document.xml':'<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><x>&x;</x>'}));assert.equal(entity.text,undefined);assert.match(entity.notice,/entities/);
 const traversal=await extractCampaignBriefText('traversal.docx',zip({'../word/document.xml':'<x/>','[Content_Types].xml':'<Types/>'}));assert.equal(traversal.text,undefined);assert.match(traversal.notice,/ambiguous ZIP/);
 const corrupt=await fixture('launch.docx');const central=corrupt.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));corrupt[central+16]^=1;
 const checksum=await extractCampaignBriefText('corrupt.docx',corrupt);assert.equal(checksum.text,undefined);assert.match(checksum.notice,/corrupt/);
});
test('TXT, Markdown, CSV and BOM-marked UTF16 are decoded with a visible truncation notice',async()=>{
 for(const name of ['brief.TXT','brief.md','brief.csv']){const result=await extractCampaignBriefText(name,Buffer.from('Audience: loyal customers.\nOffer: SAVE20.'));assert.match(result.text,/Offer: SAVE20/);}
 const utf16=await extractCampaignBriefText('brief.txt',Buffer.concat([Buffer.from([255,254]),Buffer.from('日本語の目標','utf16le')]));assert.equal(utf16.text,'日本語の目標');
 const clipped=await extractCampaignBriefText('brief.md',Buffer.from('x'.repeat(limits.textCharacters+50)));assert.equal(clipped.text.length,limits.textCharacters);assert.match(clipped.notice,/first 100,000/);
});
test('invalid, unsupported, empty and oversized inputs return a notice without replacing the upload',async()=>{
 for(const [name,bytes,pattern] of [['brief.pdf',Buffer.from('not a PDF'),/not a PDF/],['brief.docx',Buffer.from('not a zip'),/malformed/],['brief.txt',Buffer.from([255,255]),/valid UTF/],['brief.exe',Buffer.from('text'),/not supported/],['empty.txt',Buffer.alloc(0),/empty/],['large.txt',Buffer.alloc(limits.inputBytes+1),/15MB/]]){
  const result=await extractCampaignBriefText(name,bytes);assert.equal(result.text,undefined);assert.match(result.notice,pattern);assert.match(result.notice,/retained/);
 }
});
test('Operator awaits real binary extraction before providing requirements to the configured service',async()=>{
 const bytes=await fixture('launch.docx'),brief={id:'brief_docx',name:'launch.docx',type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',size:bytes.length,url:'/api/campaign-briefs/brief_docx'};let sent;
 const plan={goal:'Autumn campaign',channels:['Email'],audience:'Loyal customers',schedule:'One time',messages:{email:{subject:'SAVE20',body:'<p>Autumn sale</p>'}}};
 const handle=createCampaignOperatorEndpoint({settings:()=>({endpoint:'https://configured.example.test/chat',apiKey:'test-key'}),fetch:async(_url,init)=>{sent=JSON.parse(init.body);return Response.json(plan);},getConversation:()=>null,listConversations:()=>[],saveConversation:input=>({id:'history_docx',name:input.name,updatedAt:'2026-10-30T00:00:00Z',data:input}),deleteConversation:()=>{},resolveBrief:async()=>({brief,...await extractCampaignBriefText(brief.name,bytes)})});
 const response=await handle(new Request('https://local.test/api/campaign-operator',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:'Prepare a plan',briefId:brief.id})}));assert.equal(response.status,200);assert.match(sent.messages.at(-1).content,/SAVE20/);assert.match(sent.messages.at(-1).content,/日本語の目標/);assert.deepEqual((await response.json()).plan.brief,brief);
});
test('the exact route trace can be relocated and run both native parsers without the project node_modules',async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),temporary=await mkdtemp(join(tmpdir(),'campaign-brief-trace-')),previous=process.cwd(),pdfBytes=await fixture('launch.pdf'),docxBytes=await fixture('launch.docx');
 try{
  await writeFile(join(temporary,'package.json'),'{}');
  for(const pattern of nextConfig.outputFileTracingIncludes['/api/campaign-operator']){assert.match(pattern,/^\.\/node_modules\/[^*]+\/\*\*\/\*$/);const relative=pattern.slice(2,-5);await mkdir(dirname(join(temporary,relative)),{recursive:true});await cp(join(root,relative),join(temporary,relative),{recursive:true});}
  process.chdir(temporary);
  assert.match((await extractCampaignBriefText('launch.pdf',pdfBytes)).text,/500 purchases/);
  assert.match((await extractCampaignBriefText('launch.docx',docxBytes)).text,/日本語の目標/);
 }finally{process.chdir(previous);await rm(temporary,{recursive:true,force:true});}
});
