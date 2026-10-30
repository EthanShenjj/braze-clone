export const runtime="nodejs";
export async function POST(request:Request){
 const endpoint=process.env.INBOX_VISION_API_ENDPOINT,key=process.env.INBOX_VISION_API_KEY;
 if(!endpoint||!key)return Response.json({error:"Connect an email rendering service by configuring INBOX_VISION_API_ENDPOINT and INBOX_VISION_API_KEY."},{status:503});
 try{const input=await request.json();if(typeof input.html!=="string"||input.html.length>1000000)throw new Error("Provide an email up to 1 MB.");const r=await fetch(endpoint,{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({html:input.html,subject:input.subject,clients:["gmail","outlook","apple-mail"]}),signal:AbortSignal.timeout(45000)});if(!r.ok)throw new Error(`Rendering service returned ${r.status}.`);const result=await r.json();return Response.json({results:Array.isArray(result.results)?result.results.filter((v:{client?:unknown;imageUrl?:unknown})=>typeof v.client==="string"&&/^https:\/\//.test(String(v.imageUrl))):[]});}catch(e){return Response.json({error:e instanceof Error?e.message:"Render failed."},{status:502});}
}
