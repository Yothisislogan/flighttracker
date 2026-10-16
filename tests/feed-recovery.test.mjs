import test from 'node:test';
import assert from 'node:assert/strict';
import {createAircraftFeed} from '../lib/aircraft-provider.mjs';
import {fetchJSON, readJSON, retryDelay} from '../lib/http-json.mjs';

const time = Date.now();
const raw = {hex:'abc123',flight:'AAL123',r:'N123AA',lat:40,lon:-75,seen_pos:0,alt_baro:10000};
const payload = () => Response.json({now:time,ac:[raw]});
const path = '/v2/point/40.00/-75.00/150';

test('HTML success, HTML gateway errors and malformed JSON fail over to valid live data',async()=>{
  for (const bad of [
    () => new Response('<!DOCTYPE html><title>Unavailable</title>',{headers:{'Content-Type':'text/html'}}),
    () => new Response('<!DOCTYPE html>',{status:502,headers:{'Content-Type':'text/html'}}),
    () => new Response('<!DOCTYPE html>',{headers:{'Content-Type':'application/json'}}),
    () => Response.json({now:time-300000,ac:[raw]}),
  ]) {
    const urls=[];
    const feed=createAircraftFeed({now:()=>time,onFailure:()=>{},fetchImpl:async url=>{urls.push(url);return urls.length===1?bad():payload();}});
    const data=await feed(path,'area');
    assert.equal(urls.length,2);assert.ok(urls[1].startsWith('https://api.adsb.lol/'));
    assert.equal(data.aircraft.length,1);assert.equal(data.source,'ADSB.lol');assert.equal(data.aircraft[0].source,'ADSB.lol');
  }
});

test('primary source attribution and documented search/region endpoints are correct',async()=>{
  const urls=[];let clock=time;
  const feed=createAircraftFeed({now:()=>clock,wait:async ms=>{clock+=ms;},onFailure:()=>{},fetchImpl:async url=>{urls.push(url);return payload();}});
  const data=await feed(path,'area');await feed('/v2/reg/N123AA','reg');await feed('/v2/callsign/AAL123','callsign');await feed('/v2/hex/ABC123','hex');
  assert.deepEqual(urls,[
    'https://opendata.adsb.fi/api/v3/lat/40.00/lon/-75.00/dist/150',
    'https://opendata.adsb.fi/api/v2/registration/N123AA',
    'https://opendata.adsb.fi/api/v2/callsign/AAL123',
    'https://opendata.adsb.fi/api/v2/hex/ABC123',
  ]);
  assert.equal(data.source,'adsb.fi');assert.equal(data.aircraft[0].source,'adsb.fi');
});

test('rate limited providers are not retried before Retry-After; valid data recovers afterward',async()=>{
  let clock=time, calls=0;
  const feed=createAircraftFeed({now:()=>clock,onFailure:()=>{},fetchImpl:async()=>{calls++;return calls<=2?new Response('',{status:429,headers:{'Retry-After':'120'}}):payload();}});
  await assert.rejects(feed(path,'a'),error=>error.retryAfterSeconds===120);
  clock+=90000;
  await assert.rejects(feed(path,'b'),error=>error.retryAfterSeconds===30);
  assert.equal(calls,2);
  clock+=30001;
  assert.equal((await feed(path,'c')).source,'adsb.fi');assert.equal(calls,3);
});

test('access denial backs off for an hour instead of hammering the provider',async()=>{
  let clock=time, primaryCalls=0;
  const feed=createAircraftFeed({now:()=>clock,onFailure:()=>{},fetchImpl:async url=>{
    if(url.includes('opendata.adsb.fi')){primaryCalls++;return new Response('',{status:403});}return payload();
  }});
  await feed(path,'a');clock+=61000;await feed(path,'b');assert.equal(primaryCalls,1);
});

test('concurrent identical requests coalesce; different requests are paced',async()=>{
  let clock=time;const starts=[];
  const feed=createAircraftFeed({now:()=>clock,wait:async ms=>{clock+=ms;},onFailure:()=>{},fetchImpl:async()=>{starts.push(clock);return payload();}});
  await Promise.all([feed(path,'a'),feed(path,'a')]);await feed(path,'a');assert.equal(starts.length,1);
  await feed('/v2/hex/ABC123','b');assert.equal(starts[1]-starts[0],1100);
});

test('client never displays raw HTML or JSON parse errors, including an expired login',async()=>{
  const original=globalThis.fetch;
  try{
    for(const status of [200,502,503,401]){
      globalThis.fetch=async()=>new Response('<!DOCTYPE html><title>Proxy error</title>',{status,headers:{'Content-Type':'text/html'}});
      await assert.rejects(fetchJSON('/api/aircraft'),error=>!/<|DOCTYPE|Unexpected token|JSON/.test(error.message));
    }
    globalThis.fetch=async()=>Response.json({error:'Live flight data is temporarily unavailable.'},{status:503,headers:{'Retry-After':'90'}});
    await assert.rejects(fetchJSON('/api/aircraft'),error=>error.retryAt>=Date.now()+89000);
    await assert.rejects(readJSON(new Response('not json',{headers:{'Content-Type':'application/json'}})),/unreadable response/);
  }finally{globalThis.fetch=original;}
});

test('polling timeout stays active even when a caller provides a cancellation signal',async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async(_url,{signal})=>new Promise((resolve,reject)=>{
      const keepAlive=setTimeout(resolve,1000);
      signal.addEventListener('abort',()=>{clearTimeout(keepAlive);reject(signal.reason);},{once:true});
    });
    await assert.rejects(fetchJSON('/api/aircraft',{signal:new AbortController().signal,timeout:5}),/took too long/);
  }finally{globalThis.fetch=original;}
});

test('Retry-After accepts both seconds and HTTP dates without shortening a long cooldown',()=>{
  assert.equal(retryDelay('120',time),120000);
  assert.equal(retryDelay(new Date(time+120000).toUTCString(),time),Math.floor((time+120000)/1000)*1000-time);
  assert.equal(retryDelay(null,time),60000);assert.equal(retryDelay('7200',time),7200000);
});
