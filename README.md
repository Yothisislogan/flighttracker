# Skyline — Flight Tracker

A map-first personal flight tracker with real satellite/aerial imagery, 3D terrain, live ADS-B aircraft positions, airport search, local favorites, and optional FlightAware airline details.

## Run without hosting

The [local edition](local/README.md) packages the app as one downloadable
`Skyline-Local.html` file that opens directly in Chrome. No account, installation,
or local server is required. Maps and live data still need internet access and
provider permission. Build it with `pnpm build:local`; the generated file is in
`local-dist/`. This separate build does not deploy or change the hosted Site.

## What works now

- Actual USDA/USGS imagery over the contiguous U.S.; NASA Blue Marble global satellite mosaic elsewhere. This is historical imagery, not a live overhead camera.
- MapLibre WebGL map with pan, zoom, rotation, 3D terrain, north reset, fullscreen, airport labels, and browser location.
- Live aircraft from adsb.fi, with ADSB.lol as an independent fallback, around a selected region, refreshed every 30 seconds while the tab is visible. Each query covers 1–250 nautical miles. **This is not a worldwide aircraft firehose.**
- Search the live network by broadcast callsign, common airline flight number (e.g. AA123 → AAL123), registration, or six-character ICAO hex.
- Operator/altitude/ground filters, aircraft details, browser-local saved aircraft, share links, and follow mode.
- Observed trails collected while the app is open. No fabricated historical paths or inferred destinations.
- Curated airport directory including PHL, LAS, RIC, ORF and major international airports. It is not a complete worldwide directory.
- Install metadata for adding to a phone/Chromebook home screen. A network connection is required; there is no offline data service.

## Airline information

Route, gate, delay/status, departure and arrival times need an airline data provider. The server contains a FlightAware AeroAPI v4 adapter, disabled by default. No paid service was purchased or activated.

To enable it, set both runtime values securely:

- `FLIGHTAWARE_API_KEY` — server secret; never put it in client code, GitHub, or `NEXT_PUBLIC_*`.
- `ENABLE_FLIGHTAWARE=true` — explicit opt-in.

The UI requests airline details only when **Load airline details** is pressed. Results cache for five minutes, each call is bounded to one result page, and new provider requests are spaced by at least ten seconds per Worker isolate. These are request reductions, **not a global spend cap**. Set spending limits with your FlightAware account before enabling. Current-flight matching prefers an active occurrence, otherwise the nearest scheduled departure within the queried 36-hour window. Dates and airport-local times are shown. Schedules cannot be verified until a key is connected. A flight with no live aircraft position cannot yet be opened as a standalone scheduled itinerary.

For worldwide high-resolution imagery set `MAPTILER_PUBLIC_KEY`. This is intentionally browser-visible; restrict it to the app's domain in MapTiler. Without it, detailed imagery covers the contiguous U.S.; global imagery is a lower-resolution NASA mosaic. High-resolution imagery does not imply photogrammetric 3D buildings.

## Develop

Requires Node 22.13+ and the pnpm version pinned in `package.json`.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm typecheck
pnpm build
```

The project uses React, Vinext/Vite, MapLibre GL JS, and the retained Sites Cloudflare build integration. Production server code uses HTTP APIs only. `.openai/hosting.json` identifies the existing private deployment; preserve its ID when updating this Site. Runtime environment values are configured through the hosting service, never committed.

## Data handling

- Upstream requests are allowlisted in server code. No arbitrary URL proxy exists.
- Unknown telemetry remains null. Invalid coordinates and positions over 120 seconds old are discarded. Stale overall feed responses are rejected.
- UI marks positions over 90 seconds old and shows feed interruptions. Previously received points may remain visible as last-known positions; no simulated aircraft are substituted.
- Request cache and in-flight coalescing reduce feed calls; cache is bounded. Provider requests are paced at least 1.1 seconds apart per Worker isolate. Rate limits honor Retry-After (one minute by default); access denials pause that provider for at least an hour. HTML, malformed JSON, stale data, and network failures trigger fallback without exposing raw response bodies. Both providers failing produces a JSON 503 with a retry countdown; last-known positions stay visibly stale. Hidden tabs stop polling.
- Saved aircraft are local to this browser. There are no analytics, recording, or tracking cookies added by the app.
- Aircraft coordinates necessarily go to mapping/flight services as needed. Browser location is used only after the user presses the location button.
- The current deployment is owner-private. adsb.fi allows personal, non-commercial use only. Before commercial use or opening this to a larger audience, obtain appropriate provider permission and add shared rate limiting/budget enforcement; current pacing is per isolate, not a global guarantee.

## Sources and licenses

- App source retains this repository's **Mozilla Public License 2.0** (`LICENSE`). Third-party package licenses remain their own.
- [adsb.fi](https://adsb.fi/): primary live feed, used under its [personal, non-commercial API terms](https://github.com/adsbfi/opendata). Public endpoints allow one request per second. No feeder-only endpoints are used.
- [ADSB.lol API](https://api.adsb.lol/docs): flight data under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Provider asks production users to contact them; this personal first release has no uptime guarantee. Coverage is receiver-dependent.
- [USDA / USGS imagery](https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer): detailed contiguous-U.S. basemap; service imagery dates vary.
- [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/access-basics/): Blue Marble global imagery.
- [Mapzen terrain / Tilezen](https://github.com/tilezen/joerd/blob/master/docs/attribution.md): elevation tiles; original data-provider attribution linked on map.
- [FlightAware AeroAPI](https://www.flightaware.com/commercial/aeroapi/): optional, separately licensed and metered airline details. Attribution shown only when used.
- [MapTiler](https://docs.maptiler.com/cloud/api/tiles/): optional global detailed satellite imagery, subject to account terms.

Independent product; not affiliated with FlightAware. For exploration, not flight navigation or operational decision-making.

## Validation

`pnpm test` covers HTML/non-JSON error responses, provider failover and cooldowns, retry headers, request pacing, source attribution, units, missing data, stale data, invalid coordinates, query boundaries, input validation, date-line distance, flight identifier conversion, and occurrence selection. `pnpm typecheck` and `pnpm build` check the complete application. Live feed availability and imagery endpoints were checked during implementation. Browser-level visual QA requires a browser-capable environment.
