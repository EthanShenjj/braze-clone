export const runtime="nodejs";
export async function POST(request:Request){
 const endpoint=process.env.WORKSPACE_AI_ENDPOINT,key=process.env.WORKSPACE_AI_API_KEY;
 if(!endpoint||!key)return Response.json({error:"Connect an AI service to generate content. Contact your workspace administrator."},{status:503});
 try{
  if(new URL(endpoint).protocol!=="https:")throw new Error("The AI endpoint must use HTTPS.");
  const input=await request.json();
  if(typeof input.prompt!=="string"||!input.prompt.trim()||input.prompt.length>10000)throw new Error("Enter a prompt up to 10,000 characters.");
  const plain=["line","banner","sms","push","content","whatsapp"].includes(input.channel);
  const instructions=plain?`Write message copy for ${input.channel}. Return only JSON with a text string field. Preserve Liquid expressions and do not use HTML.`:"Write an email. Return only JSON with subject and html string fields.";
  const r=await fetch(endpoint,{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.WORKSPACE_AI_MODEL,messages:[{role:"system",content:instructions},{role:"user",content:input.prompt}]}),signal:AbortSignal.timeout(45000)});
  if(!r.ok)throw new Error(`AI service returned ${r.status}.`);
  const raw=await r.json(),p=raw.choices?.[0]?.message?.content?JSON.parse(String(raw.choices[0].message.content).replace(/^```(?:json)?\s*|\s*```$/g,"")):raw;
  if(plain){if(typeof p.text!=="string"||!p.text.trim())throw new Error("AI service must return message text.");return Response.json({text:p.text});}
  if(typeof p.subject!=="string"||typeof p.html!=="string"||!p.html.trim())throw new Error("AI service must return a subject and HTML body.");
  return Response.json({subject:p.subject,html:p.html});
 }catch(e){return Response.json({error:e instanceof Error?e.message:"Generation failed."},{status:502});}
}
