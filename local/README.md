# Skyline local edition

The generated `Skyline-Local.html` is a standalone app. Download it, keep it in
Downloads, and open it in Chrome. On a Chromebook, use the Files app's **Open
with Chrome** action if necessary. There is no Node installation, account,
hosting service, web server, or command to run on the user's computer.

Local 3 bundles the interface, React, styles, airport directory, icons,
licenses, a coarse global NASA map, and 42 regional USDA/USGS tiles around
Philadelphia, New York and Washington. These images display without network
requests. Online tiles add detail; bundled imagery blurs when zoomed in.
Current aircraft positions always require an internet connection.

The local edition displays satellite imagery using ordinary image tiles without
WebGL, web workers, or external JavaScript. Aircraft search, filters, follow mode,
trails and favorites remain available. The local map is 2D; 3D terrain is available
only in the hosted version. Drag to pan; use the wheel or +/− to zoom. Arrow keys
also pan the focused map. A failed imagery request does not stop the flight feed. Favorites
use browser storage when available; file storage can vary by browser or file
location. Sharing copies the aircraft identifier, not a private file path.
Airline schedules, gates and arrival estimates are not connected.

## Chrome option without a local server

See the [Chrome extension installation guide](../extension/START-HERE.txt).
It uses the same map and interface, plus Chrome host permission for the public
ADSB.lol API. It requires loading an unpacked extension once, but no account,
Python, or Linux environment. Build it with `pnpm build:extension`.

## Run the desktop package for live flights

Extract `Skyline-Desktop.zip` and use the included launcher. Windows:
`Start-Skyline.bat`; macOS: `Start-Skyline.command`; Linux: `python3 skyline.py`.
Python 3.10+ is required, with no third-party Python packages. Chromebook users
need the Linux development environment. Keep the launcher window open.

The launcher serves only this app on an automatically chosen `127.0.0.1` port.
It is not published online and requires no account or API key. It requests the
documented ADSB.lol API using standard server HTTP, with bounded queries,
20-second caching, request pacing, and provider cooldowns. Access denials are
honored; redirects are rejected. The launcher does not contact adsb.fi.

A direct request during implementation returned real ADSB.lol data but no
`Access-Control-Allow-Origin` header for a local-file origin. Such a response
cannot be read by JavaScript in a standalone HTML file. The launcher supplies
a same-origin interface for this documented public API. This is one
local option for automatic updates. Provider availability still varies.

## Standalone HTML limits

Only the documented public APIs from adsb.fi and ADSB.lol are contacted, using
ordinary CORS requests without cookies, keys or an intermediary. The browser
and providers decide whether access is allowed. Packaging as HTML does not
guarantee that a previously unavailable feed will work. Do not disable browser
security, add a proxy to bypass denied access, or change network paths to evade
provider limits. If a provider does not permit local-file requests, it must
authorize a supported access method before live tracking can work.

Regional positions refresh once a minute while the app is visible. Searches
also use requests, cached for 20 seconds and paced by the shared feed adapter.
HTTP 429 responses honor Retry-After; access denials pause the provider for at
least an hour. Feed errors show each provider’s HTTP status or a network/browser connection
failure, and last-known data ages visibly. Map loading errors and JavaScript
startup errors are displayed on screen instead of leaving a blank page.
Use one copy/tab at a time: separate copies do not share a rate-limit budget.
No example aircraft are substituted for live data.

Personal, non-commercial use only under the existing provider terms. Data
attribution remains visible. U.S. imagery is detailed; worldwide NASA imagery
has a lower resolution. Imagery is historical photography, not live video.

## Rebuild from source

With repository dependencies and Python installed, run `pnpm build:local`.
The first build downloads 58 imagery tiles using `scripts/cache-local-map.py`;
subsequent builds reuse `local-map-cache/`. No flight data is bundled.
Output: `local-dist/Skyline-Local.html`. The build uses the existing Vite
dependency and explicitly skips hosting configuration and environment files.
No server code, connector credentials, or runtime API secrets are required.

Validation in the managed development environment covers the bundle,
TypeScript, the local request adapter, and launcher HTTP/security behavior.
Run launcher tests with `python3 -m unittest discover -s tests -p "*_test.py"`. Actual local-file rendering and
live data access must be checked in the user's Chrome browser.
