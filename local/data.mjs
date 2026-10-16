import {createAircraftFeed, FeedUnavailableError} from '../lib/aircraft-provider.mjs';
import {validateAircraftParams} from '../lib/flight-data.mjs';

// Direct, credential-free browser requests to documented public APIs only.
// No proxy, backend, scraped endpoints, or browser security changes are used.
export function createLocalRequest({fetchImpl = (...args) => fetch(...args), now = () => Date.now(), wait} = {}) {
  const readFeed = createAircraftFeed({
    now, ...(wait ? {wait} : {}), onFailure: () => {},
    fetchImpl: (url, options) => fetchImpl(url, {
      ...options, headers: {Accept: 'application/json'},
      credentials: 'omit', mode: 'cors', redirect: 'error', referrerPolicy: 'no-referrer',
    }),
  });
  return async function localRequest(path, signal) {
    signal?.throwIfAborted();
    const url = new URL(path, 'https://skyline.invalid');
    if (url.origin !== 'https://skyline.invalid') throw new Error('Unsupported local request.');
    if (url.pathname === '/api/config') return {airlineDetails: false, maptilerKey: null};
    if (url.pathname !== '/api/aircraft') throw new Error('Airline schedules are not included in the local edition.');
    const {path: providerPath, key} = validateAircraftParams(url.searchParams);
    try {
      const data = await readFeed(providerPath, key);
      signal?.throwIfAborted();
      return data;
    } catch (cause) {
      if (signal?.aborted) throw cause;
      if (!(cause instanceof FeedUnavailableError)) throw cause;
      const error = new Error('The public flight feed could not be read. Check your internet connection. The provider may be unavailable, limiting requests, or not allowing access from this browser.');
      error.retryAt = now() + cause.retryAfterSeconds * 1000;
      throw error;
    }
  };
}
