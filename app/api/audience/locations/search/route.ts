export const runtime='nodejs';
/** Provider is configured explicitly; no shared public geocoder is called by default. */
export async function GET(request:Request){
 const query=new URL(request.url).searchParams.get('q')?.trim()??'';
 if(!query||query.length>200)return Response.json({error:'Enter a place name (up to 200 characters).'},{status:400});
 const endpoint=process.env.MAP_GEOCODING_URL;
 if(!endpoint)return Response.json({error:'Place search is unavailable. Enter latitude, longitude to locate a point.'},{status:503});
 try{
  const url=new URL(endpoint);if(url.protocol!=='https:')throw new Error('Place search provider requires HTTPS.');url.searchParams.set('q',query);url.searchParams.set('format','json');url.searchParams.set('limit','5');
  const response=await fetch(url,{headers:{Accept:'application/json',...(process.env.MAP_GEOCODING_API_KEY?{Authorization:`Bearer ${process.env.MAP_GEOCODING_API_KEY}`}:{})},signal:AbortSignal.timeout(10000),redirect:'error',next:{revalidate:3600}});
  if(!response.ok)throw new Error('Place search provider is unavailable.');const result=await response.json();
  if(!Array.isArray(result))throw new Error('Place search provider returned an unsupported response.');
  return Response.json({data:result.map(row=>({name:String(row.display_name??row.name??''),latitude:Number(row.lat??row.latitude),longitude:Number(row.lon??row.longitude)})).filter(row=>Number.isFinite(row.latitude)&&Math.abs(row.latitude)<=90&&Number.isFinite(row.longitude)&&Math.abs(row.longitude)<=180).slice(0,5)});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Place search is unavailable.'},{status:502});}
}
