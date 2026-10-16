import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
let serial=0;
async function moduleFrom(path,replacements={}) {
 let source=readFileSync(new URL(path,import.meta.url),'utf8');
 for(const [from,to] of Object.entries(replacements)) source=source.replaceAll(from,to);
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const url='data:text/javascript;base64,'+Buffer.from(js+'\n// instance '+(++serial)).toString('base64');
 return {url,module:await import(url)};
}
async function aircraftAPI(){const {url}=await moduleFrom('../lib/providers.ts',{'./aircraft-provider.mjs':new URL('../lib/aircraft-provider.mjs',import.meta.url).href});return (await moduleFrom('../app/api/aircraft/route.ts',{'@/lib/flight-data.mjs':new URL('../lib/flight-data.mjs',import.meta.url).href,'@/lib/providers':url,'@/lib/aircraft-provider.mjs':new URL('../lib/aircraft-provider.mjs',import.meta.url).href})).module;}
const raw={hex:'abc123',flight:'AAL123',lat:40,lon:-75,seen_pos:0,alt_baro:10000,gs:250};
test('API validates before fetching and coalesces/cache identical live requests',async()=>{
 const old=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async(url)=>{calls++;assert.ok(String(url).startsWith('https://opendata.adsb.fi/api/v3/lat/'));return Response.json({now:Date.now(),ac:[raw]});};
 const api=await aircraftAPI();assert.equal((await api.GET(new Request('https://app/api/aircraft?lat=95&lon=0'))).status,400);assert.equal(calls,0);
 const req=()=>new Request('https://app/api/aircraft?lat=40&lon=-75&radius=150');
 const responses=await Promise.all([api.GET(req()),api.GET(req())]);assert.equal(calls,1);assert.equal((await responses[0].json()).aircraft.length,1);assert.equal((await api.GET(req())).status,200);assert.equal(calls,1);
 }finally{globalThis.fetch=old;}
});
test('API reports stale upstream failures and backs off after rate limits',async()=>{
 const old=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>{calls++;return new Response('',{status:429});};const api=await aircraftAPI();const req=()=>new Request('https://app/api/aircraft?lat=40&lon=-75');
 assert.equal((await api.GET(req())).status,503);assert.equal((await api.GET(req())).status,503);assert.equal(calls,2);
 globalThis.fetch=async()=>Response.json({now:Date.now()-300000,ac:[raw]});const freshAPI=await aircraftAPI();const r=await freshAPI.GET(req());assert.equal(r.status,503);assert.equal((await r.json()).code,'FEED_UNAVAILABLE');
 }finally{globalThis.fetch=old;}
});
test('paid airline endpoint is disabled by default and exposes no secret',async()=>{
 const old=process.env.ENABLE_FLIGHTAWARE;delete process.env.ENABLE_FLIGHTAWARE;
 try{const {module:api}=await moduleFrom('../app/api/flight/route.ts',{'@/lib/flight-data.mjs':new URL('../lib/flight-data.mjs',import.meta.url).href});const r=await api.GET(new Request('https://app/api/flight?ident=AA123'));assert.equal(r.status,503);assert.equal((await r.json()).configured,false);}finally{if(old===undefined)delete process.env.ENABLE_FLIGHTAWARE;else process.env.ENABLE_FLIGHTAWARE=old;}
});
test('airline adapter limits paging, uses server-side key, preserves unknowns, and caches results',async()=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.FLIGHTAWARE_API_KEY,oldEnabled=process.env.ENABLE_FLIGHTAWARE;let calls=0;
 process.env.FLIGHTAWARE_API_KEY='unit-test-secret';process.env.ENABLE_FLIGHTAWARE='true';
 try{globalThis.fetch=async(url,options)=>{calls++;assert.equal(options.headers['x-apikey'],'unit-test-secret');assert.equal(url.searchParams.get('max_pages'),'1');assert.equal(url.pathname,'/aeroapi/flights/AAL123');return Response.json({flights:[{ident:'AAL123',scheduled_out:new Date().toISOString(),actual_off:new Date().toISOString(),status:'En Route',origin:{code_iata:'PHL',city:'Philadelphia',timezone:'America/New_York'},destination:{code_iata:'LAS',city:'Las Vegas',timezone:'America/Los_Angeles'}}]});};
 const {module:api}=await moduleFrom('../app/api/flight/route.ts',{'@/lib/flight-data.mjs':new URL('../lib/flight-data.mjs',import.meta.url).href});const req=()=>new Request('https://app/api/flight?ident=AA123');const d=await (await api.GET(req())).json();assert.equal(d.flight.gateOrigin,null);assert.equal(d.flight.origin.code,'PHL');assert.equal(d.flight.source,'FlightAware');assert.ok(!JSON.stringify(d).includes('unit-test-secret'));await api.GET(req());assert.equal(calls,1);
 }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.FLIGHTAWARE_API_KEY;else process.env.FLIGHTAWARE_API_KEY=oldKey;if(oldEnabled===undefined)delete process.env.ENABLE_FLIGHTAWARE;else process.env.ENABLE_FLIGHTAWARE=oldEnabled;}
});
