import {createAircraftFeed, FeedUnavailableError} from '../lib/aircraft-provider.mjs';
import {validateAircraftParams} from '../lib/flight-data.mjs';

// Direct, credential-free browser requests to documented public APIs only.
// No proxy, backend, scraped endpoints, or browser security changes are used.
export function createLocalRequest({fetchImpl = (...args) => fetch(...args), now = () => Date.now(), wait, launcher = false, extension = false} = {}) {
  const failures = new Map();
  const readFeed = createAircraftFeed({
    now, ...(wait ? {wait} : {}), onFailure: event => failures.set(event.provider, event),
    ...(launcher || extension ? {providerNames: ['ADSB.lol']} : {}),
    ...(extension ? {requestTimeoutMs: 15000} : {}),
    fetchImpl: (url, options) => fetchImpl(launcher ? '/api/feed?path=' + encodeURIComponent(new URL(url).pathname) : url, {
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
      const status = [...failures.values()].map(e => `${e.provider}: ${e.status === 429 ? 'rate limited (429)' : e.status === 401 || e.status === 403 ? `access denied (${e.status})` : e.reason === 'timeout' ? 'request timed out' : e.status === 200 ? 'unreadable or stale response' : e.status ? `HTTP ${e.status}` : 'connection failed (network or browser restriction)'}`).join('; ');
      const error = new Error(`The public flight feed could not be read. ${status}. ${extension ? 'Check your internet connection and Skyline’s access to api.adsb.lol in Chrome’s extension settings. Provider outages and access restrictions can still interrupt live flights.' : launcher ? 'Keep the launcher running and check your internet connection. Skyline respects provider rate limits and access restrictions.' : 'Use the Skyline Chrome extension or the downloaded desktop launcher. A standalone HTML file cannot read providers that do not allow browser access.'}`);
      error.retryAt = now() + cause.retryAfterSeconds * 1000;
      throw error;
    }
  };
}
