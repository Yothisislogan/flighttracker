import {validateAircraftParams} from '@/lib/flight-data.mjs';
import {fetchAircraft} from '@/lib/providers';
export async function GET(request:Request) {
  let parsed;
  try {parsed=validateAircraftParams(new URL(request.url).searchParams);} catch(e) {return Response.json({error:(e as Error).message},{status:400});}
  try {return Response.json(await fetchAircraft(parsed.path,parsed.key),{headers:{'Cache-Control':'private, max-age=15'}});}
  catch(e) {return Response.json({error:(e as Error).name==='TimeoutError'?'The live feed took too long to respond. Try again shortly.':(e as Error).message},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'60'}});}
}
