import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalRequest} from '../local/data.mjs';

const instant = 1792166400000;
const feed = () => new Response(JSON.stringify({now: instant, ac: [{hex:'a12345', flight:'AAL123', lat:40, lon:-75, seen_pos:1, alt_baro:28000}]}), {headers:{'Content-Type':'application/json'}});

test('local config and rejected routes never contact a server', async () => {
  const read = createLocalRequest({fetchImpl: () => assert.fail('unexpected network')});
  assert.deepEqual(await read('/api/config'), {airlineDetails:false, maptilerKey:null});
  await assert.rejects(read('https://example.com/api/aircraft?q=AA123'), /Unsupported/);
  await assert.rejects(read('/api/aircraft?q=../secret'), /valid flight/);
  await assert.rejects(read('/api/flight?ident=AA123'), /not included/);
});

test('browser adapter uses only public CORS requests without credentials and caches searches', async () => {
  const requests = [];
  const read = createLocalRequest({now: () => instant, fetchImpl: async (url, options) => {requests.push({url,options});return feed();}});
  const result = await read('/api/aircraft?q=AA123&kind=callsign');
  assert.equal(result.aircraft[0].callsign, 'AAL123');
  assert.equal(result.source, 'adsb.fi');
  await read('/api/aircraft?q=AA123&kind=callsign');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://opendata.adsb.fi/api/v2/callsign/AAL123');
  assert.equal(requests[0].options.mode, 'cors');
  assert.equal(requests[0].options.credentials, 'omit');
  assert.equal(requests[0].options.redirect, 'error');
  assert.equal(requests[0].options.referrerPolicy, 'no-referrer');
  assert.deepEqual(requests[0].options.headers, {Accept:'application/json'});
});

test('HTML and browser-denied requests produce readable errors and respect cooldowns', async () => {
  let requests=0;
  const read = createLocalRequest({now: () => instant, fetchImpl: async () => {
    requests++;
    if (requests === 1) return new Response('<!DOCTYPE html>Blocked', {status:429, headers:{'Content-Type':'text/html','Retry-After':'120'}});
    throw new TypeError('Failed to fetch');
  }});
  await assert.rejects(read('/api/aircraft?lat=40&lon=-75&radius=100'), e => {
    assert.match(e.message,/public flight feed could not be read/);
    assert.doesNotMatch(e.message,/Unexpected token|DOCTYPE/);
    assert.equal(e.retryAt, instant+60000);
    return true;
  });
  await assert.rejects(read('/api/aircraft?lat=41&lon=-75&radius=100'));
  assert.equal(requests, 2);
});

test('aborted requests do not start a public API call', async () => {
  const read = createLocalRequest({fetchImpl: () => assert.fail('unexpected network')});
  const controller = new AbortController();controller.abort();
  await assert.rejects(read('/api/aircraft?q=AAL123', controller.signal), {name:'AbortError'});
});

test('local fallback retains truthful source attribution', async () => {
  let calls=0;
  const read = createLocalRequest({now: () => instant, fetchImpl: async () => ++calls===1 ? new Response('Forbidden', {status:403}) : feed()});
  const result = await read('/api/aircraft?lat=40&lon=-75&radius=100');
  assert.equal(result.source,'ADSB.lol');
  assert.equal(result.aircraft[0].source,'ADSB.lol');
});
