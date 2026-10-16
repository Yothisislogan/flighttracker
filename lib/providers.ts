import {normalizeFeed} from './flight-data.mjs';
import type {Aircraft} from './types';
type Feed = {aircraft:Aircraft[];timestamp:number;source:string};
const cache = new Map<string,{expires:number;data:Feed}>();
const pending = new Map<string,Promise<Feed>>();
let retryAfter = 0;
export async function fetchAircraft(path:string,key:string):Promise<Feed> {
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;
  if (pending.has(key)) return pending.get(key)!;
  if (Date.now()<retryAfter) throw new Error('The aircraft provider is busy. Please retry in a minute.');
  const task = (async()=>{
    const response=await fetch('https://api.adsb.lol'+path,{headers:{Accept:'application/json','User-Agent':'SkylineFlightTracker/0.1 (+https://github.com/Yothisislogan/flighttracker)'},signal:AbortSignal.timeout(12000)});
    if (response.status === 429) {retryAfter = Date.now()+60000;throw new Error('The aircraft provider is busy. Please retry in a minute.');}
    if (!response.ok) throw new Error('The live aircraft feed is temporarily unavailable.');
    const data=normalizeFeed(await response.json()) as Feed;
    if (cache.size>=100) cache.delete(cache.keys().next().value!);
    cache.set(key,{expires:Date.now()+20000,data});return data;
  })();
  pending.set(key,task);
  try {return await task;} finally {pending.delete(key);}
}
