import {sendSmsComposerTest} from '@/lib/sms-composer-store';
export const runtime='nodejs';
export async function POST(request:Request){try{return Response.json(await sendSmsComposerTest(await request.json()));}catch(error){return Response.json({error:error instanceof Error?error.message:'Could not send test.'},{status:400});}}
