import {createAircraftFeed} from './aircraft-provider.mjs';
import type {Aircraft} from './types';
type Feed = {aircraft:Aircraft[];timestamp:number;source:string};
const readFeed = createAircraftFeed();
export async function fetchAircraft(path:string,key:string):Promise<Feed> {
  return readFeed(path,key) as Promise<Feed>;
}
