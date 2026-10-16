import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createLocalRequest} from '../local/data.mjs';

const instant = 1792166400000;
const region = '/api/aircraft?lat=40&lon=-75&radius=100';

test('extension requests the one permitted public origin and normalizes real positions', async () => {
  const calls = [];
  const read = createLocalRequest({extension:true, now:()=>instant, fetchImpl:async (url, options)=>{
    calls.push({url,options});
    return new Response(JSON.stringify({now:instant,ac:[{hex:'a12345',lat:40,lon:-75,seen_pos:2,flight:'AAL123',alt_baro:28000,gs:300}]}), {headers:{'Content-Type':'application/json'}});
  }});
  const result = await read(region);
  assert.equal(result.source, 'ADSB.lol');
  assert.equal(result.aircraft[0].callsign, 'AAL123');
  assert.equal(result.aircraft[0].altitude, 28000);
  assert.equal(result.aircraft[0].positionAt, instant-2000);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.adsb.lol/v2/point/40.00/-75.00/100');
  assert.deepEqual(calls[0].options.headers, {Accept:'application/json'});
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.redirect, 'error');
});

test('extension honors an access denial, never rotates providers, and explains the correct edition', async () => {
  let calls = 0;
  const read = createLocalRequest({extension:true, now:()=>instant, fetchImpl:async()=>{
    calls++;
    return new Response('<!DOCTYPE html>Denied', {status:403,headers:{'Content-Type':'text/html'}});
  }});
  await assert.rejects(read(region), e=>{
    assert.match(e.message, /ADSB.lol: access denied \(403\)/);
    assert.match(e.message, /Chrome’s extension settings/);
    assert.doesNotMatch(e.message, /Unexpected token|DOCTYPE|Python|Start-Skyline/);
    assert.equal(e.retryAt, instant+3600000);
    return true;
  });
  await assert.rejects(read('/api/aircraft?lat=41&lon=-75&radius=100'));
  assert.equal(calls, 1);
});

test('extension cannot be used to request arbitrary URLs or malformed regional paths', async () => {
  const read = createLocalRequest({extension:true, fetchImpl:()=>assert.fail('unexpected request')});
  await assert.rejects(read('https://example.com/api/aircraft?lat=40&lon=-75&radius=100'), /Unsupported/);
  await assert.rejects(read('/api/aircraft?lat=100&lon=-75&radius=100'));
  await assert.rejects(read('/api/aircraft?q=../private'));
});

test('manifest keeps remote access narrow and prohibits remotely supplied executable code', async () => {
  const manifest = JSON.parse(await readFile(new URL('../extension/manifest.json',import.meta.url),'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.host_permissions, ['https://api.adsb.lol/*']);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.permissions, undefined);
  assert.equal(manifest.web_accessible_resources, undefined);
  const policy = manifest.content_security_policy.extension_pages;
  assert.match(policy, /script-src 'self';/);
  assert.match(policy, /connect-src https:\/\/api.adsb.lol;/);
  assert.doesNotMatch(policy, /unsafe-eval|<all_urls>/);
});

test('toolbar action opens only the packaged app', async () => {
  let onClick;
  const tabs=[];
  const code=await readFile(new URL('../extension/background.js',import.meta.url),'utf8');
  vm.runInNewContext(code, {chrome:{action:{onClicked:{addListener(fn){onClick=fn;}}},runtime:{getURL:p=>'chrome-extension://test/'+p},tabs:{create:opts=>tabs.push(opts)}}});
  assert.equal(typeof onClick,'function');
  onClick();
  assert.equal(tabs.length,1);
  assert.equal(tabs[0].url,'chrome-extension://test/skyline.html');
});
