import {canvasWorkspaceQuietHours,saveCanvasWorkspaceQuietHours} from '@/lib/braze-store';
export const runtime='nodejs';
export function GET(request:Request){return Response.json(canvasWorkspaceQuietHours(new URL(request.url).searchParams.get('workspaceId')??'local'));}
export async function POST(request:Request){try{const input=await request.json();if(typeof input.start!=='string'||typeof input.end!=='string'||input.updatedAt!==null&&typeof input.updatedAt!=='string')throw new Error('Choose start and end times.');return Response.json(saveCanvasWorkspaceQuietHours(typeof input.workspaceId==='string'?input.workspaceId:'local',input));}catch(error){return Response.json({error:error instanceof Error?error.message:'Could not save workspace quiet hours.'},{status:409});}}
