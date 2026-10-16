import {normalizeQuery,chooseFlight,toCallsign} from '@/lib/flight-data.mjs';
import type {AirlineDetails} from '@/lib/types';
const cache=new Map<string,{expires:number;data:AirlineDetails|null}>();
const pending=new Map<string,Promise<AirlineDetails|null>>();
let lastProviderCall=0;
const airport=(a:any)=>a?{code:a.code_iata||a.code||'',city:a.city||'',name:a.name||'',timezone:a.timezone||'UTC',latitude:a.latitude,longitude:a.longitude}:null;
export async function GET(request:Request) {
  const ident=normalizeQuery(new URL(request.url).searchParams.get('ident'));
  if (!/^[A-Z0-9]{2,12}$/.test(ident)) return Response.json({error:'Enter a valid flight number.'},{status:400});
  const key=process.env.FLIGHTAWARE_API_KEY;
  if (!key || process.env.ENABLE_FLIGHTAWARE!=='true') return Response.json({error:'Airline schedules are not connected yet. Aircraft positions are available on the live map.',configured:false},{status:503});
  const canonical=toCallsign(ident);
  const cached=cache.get(canonical);if(cached&&cached.expires>Date.now())return Response.json({flight:cached.data});
  try {
    if (!pending.has(canonical)) {
      // Private personal app: explicit lookup only, at most one new billed lookup per ten seconds per isolate.
      if (Date.now()-lastProviderCall<10000) return Response.json({error:'Please wait ten seconds between airline lookups.'},{status:429});
      lastProviderCall=Date.now();
      const task=(async()=>{
        const now=Date.now();
        const url=new URL('https://aeroapi.flightaware.com/aeroapi/flights/'+canonical);
        url.searchParams.set('start',new Date(now-18*3600000).toISOString());
        url.searchParams.set('end',new Date(now+18*3600000).toISOString());url.searchParams.set('max_pages','1');
        const response=await fetch(url,{headers:{'x-apikey':key,Accept:'application/json'},signal:AbortSignal.timeout(12000)});
        if(!response.ok)throw new Error('Airline details are unavailable from FlightAware.');
        const body=await response.json() as any;
        if(!Array.isArray(body.flights))throw new Error('Unexpected airline data response.');
        const f=chooseFlight(body.flights,now) as any;
        const data:AirlineDetails|null=f?{ident:f.ident_iata||f.ident,date:f.scheduled_out||null,status:f.status||null,origin:airport(f.origin),destination:airport(f.destination),departure:f.actual_out||f.estimated_out||f.scheduled_out||null,arrival:f.actual_in||f.estimated_in||f.scheduled_in||null,scheduledDeparture:f.scheduled_out||null,scheduledArrival:f.scheduled_in||null,gateOrigin:f.gate_origin||null,gateDestination:f.gate_destination||null,terminalOrigin:f.terminal_origin||null,terminalDestination:f.terminal_destination||null,registration:f.registration||null,aircraftType:f.aircraft_type||null,progress:typeof f.progress_percent==='number'?f.progress_percent:null,updatedAt:now,source:'FlightAware'}:null;
        if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(canonical,{expires:Date.now()+300000,data});return data;
      })();pending.set(canonical,task);
    }
    return Response.json({flight:await pending.get(canonical)},{headers:{'Cache-Control':'private, max-age=60'}});
  } catch {return Response.json({error:'Could not load airline details. Check the provider connection and try again.'},{status:502});}
  finally {pending.delete(canonical);}
}
