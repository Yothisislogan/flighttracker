// ADS-B telemetry is observed data. Unknown values stay null.
export const AIRLINES = {
  AAL: ['American', 'AA', '#276a9a'], DAL: ['Delta', 'DL', '#a92c43'], UAL: ['United', 'UA', '#3066aa'],
  SWA: ['Southwest', 'WN', '#c78517'], JBU: ['JetBlue', 'B6', '#235888'], ASA: ['Alaska', 'AS', '#287a79'],
  FFT: ['Frontier', 'F9', '#39744a'], NKS: ['Spirit', 'NK', '#806b16'], RPA: ['Republic', 'YX', '#687798'],
  SKW: ['SkyWest', 'OO', '#687798'], ENY: ['Envoy', 'MQ', '#687798'], PDT: ['Piedmont', 'PT', '#687798'],
  JIA: ['PSA', 'OH', '#687798'], BAW: ['British Airways', 'BA', '#344983'], AFR: ['Air France', 'AF', '#345a80'],
  DLH: ['Lufthansa', 'LH', '#82701d'], KLM: ['KLM', 'KL', '#2694b8'], ACA: ['Air Canada', 'AC', '#a84d51'],
  WJA: ['WestJet', 'WS', '#377779'], UAE: ['Emirates', 'EK', '#a24343'], QTR: ['Qatar Airways', 'QR', '#8a3c61'],
  FDX: ['FedEx', 'FX', '#7953a2'], UPS: ['UPS', '5X', '#826447'], GJS: ['GoJet', 'G7', '#687798'],
  EDV: ['Endeavor', '9E', '#687798'], ASH: ['Mesa', 'YV', '#687798'], LXJ: ['Flexjet', '', '#687798'],
};
export function normalizeQuery(value) {
  return String(value || '').toUpperCase().replace(/[\s-]/g, '').slice(0, 12);
}
export function toCallsign(value) {
  const q = normalizeQuery(value);
  const match = q.match(/^([A-Z0-9]{2})(\d+[A-Z]?)$/);
  if (match) { const entry = Object.entries(AIRLINES).find(([,v]) => v[1] === match[1]); if (entry) return entry[0] + match[2]; }
  return q;
}
export function airlineFor(callsign) {
  return AIRLINES[String(callsign).slice(0,3)] || ['Private / other', '', '#778294'];
}
const numberOrNull = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
export function normalizeAircraft(raw, timestamp) {
  if (!raw || typeof raw.hex !== 'string' || numberOrNull(raw.lat) === null || numberOrNull(raw.lon) === null || Math.abs(raw.lat) > 90 || Math.abs(raw.lon) > 180) return null;
  const seen = numberOrNull(raw.seen_pos);
  // Exclude old/unknown position ages rather than calling them live.
  if (seen === null || seen > 120 || seen < 0) return null;
  const callsign = String(raw.flight || raw.r || raw.hex).trim().toUpperCase().slice(0,20);
  const airline = airlineFor(callsign);
  const ground = raw.alt_baro === 'ground';
  return {
    id: raw.hex.toLowerCase(), callsign, displayFlight: airline[1] && callsign.length > 3 ? airline[1] + ' ' + callsign.slice(3) : callsign,
    airline: airline[0], color: airline[2], registration: String(raw.r || '').slice(0,20), aircraft: String(raw.t || '').slice(0,16),
    lat: raw.lat, lon: raw.lon, altitude: ground ? 0 : numberOrNull(raw.alt_baro), speed: numberOrNull(raw.gs),
    heading: numberOrNull(raw.track), verticalRate: numberOrNull(raw.baro_rate), ground,
    positionAt: timestamp - seen * 1000, source: 'ADSB.lol', squawk: String(raw.squawk || '').slice(0,4),
  };
}
export function normalizeFeed(data, receivedAt = Date.now()) {
  if (!data || !Array.isArray(data.ac)) throw new Error('Invalid flight feed');
  let time = Number(data.now);
  if (time > 0 && time < 1e12) time *= 1000;
  if (!Number.isFinite(time) || time <= 0 || time > receivedAt + 60000) throw new Error('Invalid feed time');
  if (receivedAt - time > 180000) throw new Error('Flight feed is stale');
  return { aircraft: data.ac.map(raw => normalizeAircraft(raw, time)).filter(Boolean).slice(0,2000), timestamp: time, source: 'ADSB.lol' };
}
export function distanceNm(lat1,lon1,lat2,lon2) {
  const rad = Math.PI/180;
  const a = Math.sin((lat2-lat1)*rad/2)**2 + Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin((lon2-lon1)*rad/2)**2;
  return 3440.065*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)));
}
export function validateAircraftParams(params) {
  const query = params.get('q'); const kind = params.get('kind') || 'callsign';
  if (query !== null) {
    const q = normalizeQuery(query);
    if (!/^[A-Z0-9]{2,12}$/.test(q) || !['callsign','reg','hex'].includes(kind)) throw new Error('Enter a valid flight number, registration, or hex code.');
    if (kind === 'hex' && !/^[A-F0-9]{6}$/.test(q)) throw new Error('Aircraft hex codes have six hexadecimal characters.');
    return { path: `/v2/${kind}/${encodeURIComponent(kind === 'callsign' ? toCallsign(q) : q)}`, key: `${kind}:${q}` };
  }
  const lat = Number(params.get('lat')), lon = Number(params.get('lon')), radius = Number(params.get('radius') || 150);
  if (!params.has('lat') || !params.has('lon') || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>85 || Math.abs(lon)>180 || !Number.isFinite(radius) || radius<1 || radius>250) throw new Error('Choose a valid map area (1–250 nautical miles).');
  const la = lat.toFixed(2), lo = lon.toFixed(2), r = Math.ceil(radius);
  return {path:`/v2/point/${la}/${lo}/${r}`,key:`${la}:${lo}:${r}`};
}
export function chooseFlight(flights, now=Date.now()) {
  const t = (s) => s ? new Date(s).getTime() : NaN;
  const active = flights.find(f => f.actual_off && !f.actual_on && !f.cancelled);
  if (active) return active;
  return [...flights].sort((a,b) => Math.abs(t(a.scheduled_out)-now)-Math.abs(t(b.scheduled_out)-now))[0] || null;
}
