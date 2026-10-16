import {build} from 'vite';
import {readFile, writeFile, mkdir, access, copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const extension = process.argv.includes('--extension');
try { await access(resolve(root, 'local-map-cache/manifest.json')); }
catch { execFileSync(process.platform === 'win32' ? 'python' : 'python3', [resolve(root, 'scripts/cache-local-map.py')], {stdio:'inherit'}); }
const manifest = JSON.parse(await readFile(resolve(root, 'local-map-cache/manifest.json'), 'utf8'));
const bundledTiles = {};
for (const [source,z,x,y] of manifest) {
  const bytes = await readFile(resolve(root, `local-map-cache/${source}-${z}-${x}-${y}.jpg`));
  if (bytes[0] !== 255 || bytes[1] !== 216) throw new Error('Invalid bundled map image');
  bundledTiles[`${source}/${z}/${x}/${y}`] = 'data:image/jpeg;base64,' + bytes.toString('base64');
}
if (Object.keys(bundledTiles).filter(k => k.startsWith('earth/2/')).length !== 16) throw new Error('Bundled global map is incomplete');
// Isolated from Sites/Vinext configuration: this build has no server or login.
const result = await build({
  configFile: false, root, publicDir: false, envFile: false,
  resolve: {alias: {'@': root, './FlightMap': resolve(root, 'local/SatelliteMap.tsx')}},
  define: {'process.env.NODE_ENV': JSON.stringify('production')},
  build: {
    write: false, target: 'chrome120', minify: true, cssCodeSplit: false,
    license: {fileName: 'licenses.txt'},
    lib: {entry: resolve(root, extension ? 'extension/main.tsx' : 'local/main.tsx'), name: 'SkylineLocal', formats: ['iife']},
    rolldownOptions: {output: {codeSplitting: false}},
  },
});
const outputs = (Array.isArray(result) ? result : [result]).flatMap(r => r.output);
const chunks = outputs.filter(o => o.type === 'chunk');
const assets = outputs.filter(o => o.type === 'asset');
if (chunks.length !== 1 || chunks[0].imports.length || chunks[0].dynamicImports.some(name => name !== chunks[0].fileName) || assets.some(o => !o.fileName.endsWith('.css') && o.fileName !== 'licenses.txt')) {
  throw new Error('Unexpected local output: '+JSON.stringify(outputs.map(o=>({type:o.type,fileName:o.fileName,imports:o.imports,dynamicImports:o.dynamicImports}))));
}
const script = chunks[0].code.replace(/<\/script/gi, '<\\/script');
const css = assets.filter(o => o.fileName.endsWith('.css')).map(o => String(o.source)).join('\n').replace(/<\/style/gi, '<\\/style');
const escape = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
// Preserve distribution licenses alongside bundled dependencies, inside the file.
const notices = [await readFile(resolve(root, 'LICENSE'), 'utf8'), ...assets.filter(o => o.fileName === 'licenses.txt').map(o => String(o.source))];
for (const [pkg, filename] of [['react','LICENSE'], ['react-dom','LICENSE'], ['maplibre-gl','LICENSE.txt'], ['lucide-react','LICENSE'], ['tailwindcss','LICENSE']]) {
  const folder = dirname(require.resolve(pkg + '/package.json'));
  notices.push(pkg + '\n' + await readFile(resolve(folder, filename), 'utf8'));
}
const icon = await readFile(resolve(root, 'public/favicon.svg'));
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><meta name="skyline-version" content="local-3"><title>Skyline Local 3 — Flight Tracker</title>
<link rel="icon" href="data:image/svg+xml;base64,${icon.toString('base64')}">
<style>${css}</style></head><body>
<div id="root"><p style="color:white;padding:32px;font:16px system-ui">Opening Skyline… Download this file and open it in Chrome if your preview does not run apps.</p></div>
<noscript>Skyline needs JavaScript enabled in your browser.</noscript>
<script>window.addEventListener('error',function(event){if(!event.message)return;var panel=document.getElementById('startup-error');if(!panel){panel=document.createElement('div');panel.id='startup-error';panel.style.cssText='position:fixed;bottom:16px;left:16px;right:16px;z-index:9999;background:#fff3e4;color:#542c10;border:1px solid #e1bb89;border-radius:10px;padding:18px;font:14px system-ui';document.body.appendChild(panel);}panel.textContent='Skyline could not finish starting: '+event.message+'. Please copy this message so the error can be fixed.';});</script>
<script>window.SKYLINE_MAP_TILES=${JSON.stringify(bundledTiles)};</script>
<script>${script}</script>
<template id="software-licenses"><pre>${escape(notices.join('\n\n'))}</pre></template>
</body></html>`;
const directory = resolve(root, 'local-dist');
await mkdir(directory, {recursive:true});
if (extension) {
  // Manifest V3 permits only packaged executable code, with no inline scripts.
  const folder = resolve(directory, 'Skyline-Chrome');
  await mkdir(folder, {recursive:true});
  const shell = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Skyline — Flight Tracker</title>
<link rel="icon" href="favicon.svg"><link rel="stylesheet" href="app.css">
<script src="startup.js" defer></script><script src="maps.js" defer></script><script src="app.js" defer></script>
</head><body><div id="root" style="min-height:100vh">Opening Skyline…</div>
<noscript>Skyline needs JavaScript enabled in Chrome.</noscript></body></html>`;
  await writeFile(resolve(folder, 'skyline.html'), shell);
  await writeFile(resolve(folder, 'app.js'), chunks[0].code);
  await writeFile(resolve(folder, 'maps.js'), `window.SKYLINE_MAP_TILES=${JSON.stringify(bundledTiles)};\n`);
  await writeFile(resolve(folder, 'app.css'), css);
  await writeFile(resolve(folder, 'licenses.txt'), notices.join('\n\n'));
  await writeFile(resolve(folder, 'favicon.svg'), icon);
  await copyFile(resolve(root, 'LICENSE'), resolve(folder, 'LICENSE'));
  for (const file of ['manifest.json', 'background.js', 'startup.js', 'START-HERE.txt']) {
    await copyFile(resolve(root, 'extension', file), resolve(folder, file));
  }
  console.log(`Chrome extension: ${folder}`);
} else {
  await writeFile(resolve(directory, 'Skyline-Local.html'), html);
  console.log(`Local app: ${resolve(directory, 'Skyline-Local.html')} (${Buffer.byteLength(html).toLocaleString()} bytes)`);
}
