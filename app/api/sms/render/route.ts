import {normalizeSmsSnapshot} from '@/lib/sms-composer-model';
import {renderWorkspaceSms,smsWorkspaceUsers} from '@/lib/sms-composer-store';
import {smsProfile} from '@/lib/sms-composer-model';
export const runtime='nodejs';
export async function POST(request:Request){try{
 const input=await request.json(),workspaceId=String(input.workspaceId??'local');
 if(input.profile!==undefined&&(!input.profile||typeof input.profile!=='object'||Array.isArray(input.profile)||JSON.stringify(input.profile).length>20000))throw new Error('Invalid preview attributes.');
 const user=input.userId?smsWorkspaceUsers(workspaceId).find(user=>user.id===input.userId):null;if(input.userId&&!user)throw new Error('Preview user not found in this workspace.');
 const snapshot=normalizeSmsSnapshot(input.snapshot),message=renderWorkspaceSms(snapshot,workspaceId,input.profile??smsProfile(user),String(input.ownerId??''),()=> 'https://brz.ai/XXXXXXXX');
 return Response.json({message});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Could not render SMS.'},{status:400});}}
