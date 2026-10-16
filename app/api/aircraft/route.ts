import {validateAircraftParams} from '@/lib/flight-data.mjs';
import {fetchAircraft} from '@/lib/providers';
import {FeedUnavailableError} from '@/lib/aircraft-provider.mjs';
export async function GET(request:Request) {
  let parsed;
  try {parsed=validateAircraftParams(new URL(request.url).searchParams);} catch(e) {return Response.json({error:(e as Error).message},{status:400});}
  try {return Response.json(await fetchAircraft(parsed.path,parsed.key),{headers:{'Cache-Control':'private, max-age=15'}});}
  catch(e) {
    const seconds=e instanceof FeedUnavailableError?e.retryAfterSeconds:60;
    return Response.json({error:'Live flight data is temporarily unavailable. Skyline will retry automatically.',code:'FEED_UNAVAILABLE'},
      {status:503,headers:{'Cache-Control':'no-store','Retry-After':String(seconds)}});
  }
}
