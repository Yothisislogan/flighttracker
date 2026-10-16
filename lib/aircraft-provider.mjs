import {normalizeFeed} from './flight-data.mjs';
import {readJSON, retryDelay} from './http-json.mjs';

const providers = [
  {name: 'adsb.fi', origin: 'https://opendata.adsb.fi/api', path: path => path
    .replace(/^\/v2\/point\/([^/]+)\/([^/]+)\/([^/]+)$/, '/v3/lat/$1/lon/$2/dist/$3')
    .replace(/^\/v2\/reg\//, '/v2/registration/')},
  {name: 'ADSB.lol', origin: 'https://api.adsb.lol', path: path => path},
];

export class FeedUnavailableError extends Error {
  constructor(seconds = 60) {
    super('Live flight data is temporarily unavailable. Skyline will retry automatically.');
    this.retryAfterSeconds = Math.max(1, Math.ceil(seconds));
  }
}

// Only the documented public APIs are used. This deployment is for personal,
// non-commercial use. Each provider has its own cooldown and request pacing.
export function createAircraftFeed({
  fetchImpl = (...args) => fetch(...args), now = () => Date.now(),
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  onFailure = event => console.warn('Aircraft provider unavailable', event),
  providerNames = providers.map(provider => provider.name),
  requestTimeoutMs = 7000,
} = {}) {
  const cache = new Map(), pending = new Map();
  const states = providers.map(() => ({blockedUntil: 0, nextStart: 0}));

  async function request(path) {
    for (const [index, provider] of providers.entries()) {
      if (!providerNames.includes(provider.name)) continue;
      const state = states[index];
      if (state.blockedUntil > now()) continue;
      const delay = Math.max(0, state.nextStart - now());
      // Bound the queue rather than allowing a burst or unbounded request wait.
      if (delay > 3300) continue;
      state.nextStart = now() + delay + 1100;
      if (delay) await wait(delay);
      if (state.blockedUntil > now()) continue;
      let status = 0, cooldown = 60000;
      try {
        const response = await fetchImpl(provider.origin + provider.path(path), {
          headers: {Accept: 'application/json', 'User-Agent': 'SkylineFlightTracker/0.1 (+https://github.com/Yothisislogan/flighttracker)'},
          cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(requestTimeoutMs),
        });
        status = response.status;
        cooldown = retryDelay(response.headers.get('Retry-After'), now());
        if ([401, 403, 404].includes(status)) cooldown = Math.max(cooldown, 3600000);
        if (!response.ok) throw new Error('http');
        return normalizeFeed(await readJSON(response), now(), provider.name);
      } catch (error) {
        state.blockedUntil = now() + cooldown;
        onFailure({provider: provider.name, status, reason: status && status !== 200 ? 'http' : error?.name === 'TimeoutError' ? 'timeout' : 'invalid-or-unavailable-feed',
          // Only the local exception is logged, never response bodies or headers.
          detail: status === 0 ? String(error?.message || 'Network error').slice(0,180) : undefined});
      }
    }
    const next = Math.min(...states.filter((_,index) => providerNames.includes(providers[index].name)).map(s => Math.max(s.blockedUntil, s.nextStart)));
    throw new FeedUnavailableError((next - now()) / 1000);
  }

  return async function fetchAircraft(path, key) {
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return cached.data;
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 16) throw new FeedUnavailableError(5);
    const task = request(path).then(data => {
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(key, {expires: now() + 20000, data});
      return data;
    });
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  };
}
