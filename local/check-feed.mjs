const endpoint = 'https://pocketworld.org/api/flights?wire=1&bbox=-78.6,37.3,-71.9,42.4';
const run = document.getElementById('run');
const status = document.getElementById('status');
const output = document.getElementById('output');
const copy = document.getElementById('copy');
const download = document.getElementById('download');
let report = null;

// Retain schema and a small sample, not a complete aircraft database.
function summarize(value, depth = 0) {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.slice(0, 300);
  if (depth > 5) return '[nested value]';
  if (Array.isArray(value)) {
    if (value.length <= 100 && value.every(v => v === null || ['string','number','boolean'].includes(typeof v))) return value;
    return {length: value.length, sample: value.slice(0, 3).map(v => summarize(v, depth + 1))};
  }
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 100).map(([k,v]) => [k, summarize(v, depth + 1)]));
  return String(value);
}

run.addEventListener('click', async () => {
  run.disabled = true;
  run.textContent = 'Checking…';
  status.className = 'status waiting';
  status.textContent = 'Requesting the documented Philadelphia-area feed…';
  report = {check:'Skyline browser feed check 1',checkedAt:new Date().toISOString(),pageProtocol:location.protocol,provider:'PocketWorld',endpoint};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  const start = performance.now();
  try {
    const response = await fetch(endpoint, {method:'GET',headers:{Accept:'application/json'},mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
    report.httpStatus = response.status;
    report.contentType = response.headers.get('Content-Type');
    report.retryAfter = response.headers.get('Retry-After');
    report.finalURL = response.url;
    const type = report.contentType || '';
    if (!response.ok) {
      report.result = 'The browser could read the response, but the provider did not return a successful feed.';
      if (type.includes('application/json')) report.response = summarize(await response.json());
      status.className = 'status failed';
      status.textContent = `Provider returned HTTP ${response.status}. Copy the results below.`;
    } else if (!type.toLowerCase().includes('application/json')) {
      report.result = 'The provider returned a page instead of JSON. No live feed was verified.';
      status.className = 'status failed';
      status.textContent = 'Received a page instead of flight data. Copy the results below.';
    } else {
      const data = await response.json();
      report.result = 'Browser access confirmed: JSON was readable. Aircraft freshness and coverage still need validation.';
      report.response = summarize(data);
      status.className = 'status success';
      status.textContent = 'Browser access works. Copy results so the aircraft data can be checked and connected.';
    }
  } catch (error) {
    report.result = controller.signal.aborted ? 'Request timed out after 20 seconds.' : 'The browser could not read the request. This can be a CORS restriction, network failure, browser rule, or provider security filter; JavaScript cannot distinguish these cases.';
    report.error = {name:error.name,message:error.message};
    status.className = 'status failed';
    status.textContent = controller.signal.aborted ? 'The request timed out. Copy the results below.' : 'Browser access failed. Copy the results below.';
  } finally {
    clearTimeout(timer);
    report.elapsedSeconds = Math.round((performance.now() - start) / 10) / 100;
    output.value = JSON.stringify(report, null, 2);
    output.hidden = false;
    copy.hidden = false;
    download.hidden = false;
    run.textContent = 'Check complete';
  }
});

copy.addEventListener('click', async () => {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(output.value);
    copy.textContent = 'Copied — paste into this chat';
  } catch {
    output.focus(); output.select();
    copy.textContent = 'Results selected — press Ctrl+C / ⌘C';
  }
});
download.addEventListener('click', () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([output.value],{type:'application/json'}));
  const a = document.createElement('a');a.href=url;a.download='Skyline-Feed-Result.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
